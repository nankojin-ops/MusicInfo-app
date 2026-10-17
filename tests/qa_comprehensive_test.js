/**
 * QAエンジニア 包括的障害・境界値・セキュリティ検証スイート
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DriveService = require('../src/DriveService.js');
const MusicService = require('../src/MusicService.js');
const SheetService = require('../src/SheetService.js');

// ScriptsUtils.html のロード
const utilsContent = fs.readFileSync(path.join(__dirname, '../src/ScriptsUtils.html'), 'utf8');
const scriptTagRegex = /<script>([\s\S]*?)<\/script>/;
const utilsJs = (utilsContent.match(scriptTagRegex) || [])[1];
const utilsSandbox = {};
vm.createContext(utilsSandbox);
vm.runInContext(utilsJs + '\nthis.Utils = Utils;', utilsSandbox);
const Utils = utilsSandbox.Utils;

console.log('===============================================================');
console.log('QAエンジニア 包括的障害・境界値・セキュリティ検証スイート開始');
console.log('===============================================================');

let passCount = 0;
let failCount = 0;
const issues = [];

const pendingPromises = [];

function test(name, fn) {
  try {
    const ret = fn();
    if (ret && typeof ret.then === 'function') {
      const p = ret.then(() => {
        passCount++;
        console.log(`  [PASS] ${name}`);
      }).catch((err) => {
        failCount++;
        console.error(`  [FAIL] ${name}: ${err.message}`);
        issues.push({ name, error: err });
      });
      pendingPromises.push(p);
    } else {
      passCount++;
      console.log(`  [PASS] ${name}`);
    }
  } catch (err) {
    failCount++;
    console.error(`  [FAIL] ${name}: ${err.message}`);
    issues.push({ name, error: err });
  }
}

// -------------------------------------------------------------
// セクション 1: スプレッドシート式インジェクション検証 (NFR-SEC-002)
// -------------------------------------------------------------
console.log('\n>>> [1] スプレッドシート式インジェクション検証 (artworkUrl)');

test('MusicService.saveSingleTrack: artworkUrl に = で始まる数式が指定された場合にエスケープされるか', () => {
  let savedPayload = null;
  const mockSheet = {
    appendSingleTrack: (p) => { savedPayload = p; return p; }
  };
  const mockDrive = {
    ensurePublicArtwork: (url) => url // 未変更で返す
  };
  const ms = new MusicService({}, mockSheet, mockDrive, {});
  
  ms.saveSingleTrack({
    albumArtist: 'Test Artist',
    albumName: 'Test Album',
    trackArtist: 'Test Artist',
    trackName: 'Test Track',
    artworkUrl: '=SUM(1,2)'
  });
  
  assert.strictEqual(
    savedPayload.artworkUrl.startsWith("'="),
    true,
    `artworkUrl はシングルクォートで無害化されているべきだが、実際は: "${savedPayload.artworkUrl}"`
  );
});

test('SheetService.appendSingleTrack: artworkUrl に @, +, - で始まる文字列が渡された場合にエスケープされるか', () => {
  let sheetRow = null;
  global.SpreadsheetApp = {
    openById: () => ({
      getSheetByName: () => ({
        getLastRow: () => 1,
        appendRow: (row) => { sheetRow = row; }
      })
    })
  };
  const ss = new SheetService({ getSpreadsheetId: () => 'dummy', getSheetName: () => 'MusicTracks' });

  const maliciousUrls = ['@SUM(1,2)', '+cmd|calc', '-1+2', '=cmd'];
  for (const url of maliciousUrls) {
    ss.appendSingleTrack({
      albumArtist: 'Artist',
      albumName: 'Album',
      trackArtist: 'Artist',
      trackName: 'Track',
      artworkUrl: url
    });
    assert.strictEqual(
      sheetRow[7].startsWith("'"),
      true,
      `SheetService.appendSingleTrack の H列 (${url}) は無害化されるべきだが、実際は: "${sheetRow[7]}"`
    );
  }
});

test('SheetService.insertTracksBatch: driveArtworkUrl に = で始まる文字列が渡された場合にエスケープされるか', () => {
  let sheetValues = null;
  global.SpreadsheetApp = {
    openById: () => ({
      getSheetByName: () => ({
        getLastRow: () => 1,
        getRange: () => ({
          setValues: (vals) => { sheetValues = vals; }
        })
      })
    })
  };
  const ss = new SheetService({ getSpreadsheetId: () => 'dummy', getSheetName: () => 'MusicTracks' });

  ss.insertTracksBatch(
    [{ cdNumber: 1, trackNumber: 1, trackName: 'T1' }],
    { albumName: 'Alb', albumArtist: 'Art', releaseDate: '2026-01-01' },
    '=IMPORTXML("http://evil.com","//a")'
  );

  assert.strictEqual(
    sheetValues[0][7].startsWith("'="),
    true,
    `SheetService.insertTracksBatch の H列 は無害化されるべきだが、実際は: "${sheetValues[0][7]}"`
  );
});

// -------------------------------------------------------------
// セクション 2: DriveService.ensurePublicArtwork の極限値・異常系検証
// -------------------------------------------------------------
console.log('\n>>> [2] DriveService.ensurePublicArtwork の極限値・異常系検証');

const driveService = new DriveService({ getDriveFolderId: () => 'folder_123' });

test('ensurePublicArtwork: rawUrl が null / undefined / 空文字 / 空白のみ', () => {
  assert.strictEqual(driveService.ensurePublicArtwork(null, 'Album'), '');
  assert.strictEqual(driveService.ensurePublicArtwork(undefined, 'Album'), '');
  assert.strictEqual(driveService.ensurePublicArtwork('', 'Album'), '');
  assert.strictEqual(driveService.ensurePublicArtwork('   ', 'Album'), '');
});

test('ensurePublicArtwork: rawUrl が非文字列型 (数値, オブジェクト, 配列, boolean)', () => {
  assert.strictEqual(driveService.ensurePublicArtwork(12345, 'Album'), '');
  assert.strictEqual(driveService.ensurePublicArtwork({}, 'Album'), '');
  assert.strictEqual(driveService.ensurePublicArtwork([], 'Album'), '');
  assert.strictEqual(driveService.ensurePublicArtwork(true, 'Album'), '');
});

test('ensurePublicArtwork: 各種 Google Drive URL 形式から正規化公開URLが生成されるか', () => {
  const fileId = '1a2b3c4d5e6f7g8h9i0j1k2l3m4n';
  const patterns = [
    `https://drive.google.com/file/d/${fileId}/view?usp=sharing`,
    `https://drive.google.com/open?id=${fileId}`,
    `https://drive.google.com/uc?id=${fileId}&export=download`,
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`,
    `https://lh3.googleusercontent.com/d/${fileId}`,
    fileId
  ];

  for (const p of patterns) {
    const res = driveService.ensurePublicArtwork(p, 'Album');
    assert.strictEqual(res, `https://lh3.googleusercontent.com/d/${fileId}`);
  }
});

test('ensurePublicArtwork: DriveApp が存在し getFileById で例外が発生した場合でも処理が中断しないか (Graceful Degradation)', () => {
  global.DriveApp = {
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
    Permission: { VIEW: 'VIEW' },
    getFileById: (id) => {
      throw new Error('Access denied (403): User does not have permission');
    }
  };

  const fileId = '1a2b3c4d5e6f7g8h9i0j1k2l3m4n';
  const res = driveService.ensurePublicArtwork(fileId, 'Album');
  assert.strictEqual(res, `https://lh3.googleusercontent.com/d/${fileId}`);
  delete global.DriveApp;
});

test('ensurePublicArtwork: DriveApp が存在し setSharing で例外が発生した場合でも処理が中断しないか', () => {
  global.DriveApp = {
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
    Permission: { VIEW: 'VIEW' },
    getFileById: (id) => ({
      setSharing: () => {
        throw new Error('Cannot share outside domain');
      }
    })
  };

  const fileId = '1a2b3c4d5e6f7g8h9i0j1k2l3m4n';
  const res = driveService.ensurePublicArtwork(fileId, 'Album');
  assert.strictEqual(res, `https://lh3.googleusercontent.com/d/${fileId}`);
  delete global.DriveApp;
});

test('downloadAndSaveArtwork: UrlFetchApp が HTTP 404 / 500 を返した場合は空文字を返却しクラッシュしないこと', () => {
  global.DriveApp = {
    getFolderById: () => ({
      createFile: () => {}
    })
  };
  global.UrlFetchApp = {
    fetch: () => ({
      getResponseCode: () => 404
    })
  };

  const res = driveService.downloadAndSaveArtwork('https://example.com/notfound.jpg', 'Album');
  assert.strictEqual(res, '');
  delete global.DriveApp;
  delete global.UrlFetchApp;
});

test('downloadAndSaveArtwork: UrlFetchApp.fetch が例外（タイムアウト・DNSエラー）を起こした場合に空文字を返却しクラッシュしないこと', () => {
  global.DriveApp = {
    getFolderById: () => ({
      createFile: () => {}
    })
  };
  global.UrlFetchApp = {
    fetch: () => {
      throw new Error('DNS failure or connection timeout');
    }
  };

  const res = driveService.downloadAndSaveArtwork('https://invalid-host-name-123.com/art.jpg', 'Album');
  assert.strictEqual(res, '');
  delete global.DriveApp;
  delete global.UrlFetchApp;
});

test('sanitizeFileName: ディレクトリトラバーサル・危険文字・NULLバイトの完全無害化', () => {
  assert.strictEqual(driveService.sanitizeFileName('../../../etc/passwd'), 'etc_passwd');
  assert.strictEqual(driveService.sanitizeFileName('album\0name'), 'albumname');
  assert.strictEqual(driveService.sanitizeFileName('foo/bar\\baz:qux*?<>|'), 'foo_bar_baz_qux');
  assert.strictEqual(driveService.sanitizeFileName(''), 'album');
  assert.strictEqual(driveService.sanitizeFileName(null), 'album');
  assert.strictEqual(driveService.sanitizeFileName('   '), 'album');
});

// -------------------------------------------------------------
// セクション 3: フロントエンド ScriptsUtils / handleImageError 多重フォールバック検証
// -------------------------------------------------------------
console.log('\n>>> [3] フロントエンド ScriptsUtils / handleImageError 検証');

test('Utils.resolveArtworkUrl: XSS 攻撃文字列がそのまま混入しないか (抽出されない場合)', () => {
  const xssUrl = '"><script>alert(1)</script>';
  const res = Utils.resolveArtworkUrl(xssUrl);
  assert.strictEqual(res, xssUrl);
});

test('Utils.handleImageError: 偽造されたDOM要素や不正プロパティへの耐性', () => {
  assert.doesNotThrow(() => Utils.handleImageError(null));
  
  const dummyEl = {
    attributes: {},
    getAttribute(k) { return this.attributes[k] || null; },
    setAttribute(k, v) { this.attributes[k] = v; },
    removeAttribute(k) { delete this.attributes[k]; },
    src: '',
    onerror: () => {}
  };
  
  Utils.handleImageError(dummyEl);
  assert.strictEqual(dummyEl.attributes['data-error-step'], '2');
  assert.strictEqual(dummyEl.onerror, null);
  assert.strictEqual(dummyEl.src.startsWith('data:image/svg+xml'), true);
});

test('Utils.handleImageError: Drive画像の場合 Step 0 -> Step 1 -> Step 2 の完全ライフサイクル遷移', () => {
  const fileId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
  const imgEl = {
    attributes: {
      'data-artwork': `https://drive.google.com/file/d/${fileId}/view`,
      'data-error-step': '0'
    },
    getAttribute(k) { return this.attributes[k] || null; },
    setAttribute(k, v) { this.attributes[k] = v; },
    removeAttribute(k) { delete this.attributes[k]; },
    src: `https://lh3.googleusercontent.com/d/${fileId}`,
    onerror: () => {}
  };

  // 1回目のエラー (Step 0 -> Step 1: thumbnailへ)
  Utils.handleImageError(imgEl);
  assert.strictEqual(imgEl.attributes['data-error-step'], '1');
  assert.strictEqual(imgEl.src, `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`);
  assert.notStrictEqual(imgEl.onerror, null);

  // 2回目のエラー (Step 1 -> Step 2: SVGへ & onerror解除)
  Utils.handleImageError(imgEl);
  assert.strictEqual(imgEl.attributes['data-error-step'], '2');
  assert.strictEqual(imgEl.onerror, null);
  assert.strictEqual(imgEl.attributes['data-artwork'], undefined);
  assert.strictEqual(imgEl.src.startsWith('data:image/svg+xml'), true);

  // 3回目の呼び出し (万一発火しても onerror=null で守られ、Step 2維持)
  Utils.handleImageError(imgEl);
  assert.strictEqual(imgEl.attributes['data-error-step'], '2');
});

// -------------------------------------------------------------
// セクション 4: 既存機能・回帰検証 (AC-007)
// -------------------------------------------------------------
console.log('\n>>> [4] 既存機能・回帰検証 (AC-007)');

test('MusicService.saveAlbumFromItunes: 正常なペイロードで登録が成功すること', () => {
  let batchInserted = false;
  const mockSheet = {
    insertTracksBatch: (tracks, meta, artUrl) => {
      batchInserted = true;
      return tracks.length;
    }
  };
  const mockDrive = {
    downloadAndSaveArtwork: () => 'https://drive.google.com/thumbnail?id=test12345&sz=w800'
  };
  const ms = new MusicService({}, mockSheet, mockDrive, {});

  const res = ms.saveAlbumFromItunes({
    albumName: 'Test Album',
    albumArtist: 'Test Artist',
    releaseDate: '2026-01-01',
    artworkUrl500: 'https://is1-ssl.mzstatic.com/image/thumb/art.jpg/500x500bb.jpg',
    tracks: [
      { cdNumber: 1, trackNumber: 1, trackName: 'Song 1', trackArtist: 'Test Artist' }
    ]
  });

  assert.strictEqual(batchInserted, true);
  assert.strictEqual(res.count, 1);
  assert.strictEqual(res.savedAlbum, 'Test Album');
});

// -------------------------------------------------------------
// セクション 5: MusicBrainzService 境界値・異常系・レート制限・リトライ検証 (AC-6, AC-7, AC-8, AC-12, AC-13)
// -------------------------------------------------------------
console.log('\n>>> [5] MusicBrainzService 境界値・異常系・レート制限・リトライ検証');

const Config = require('../src/Config.js');
const ItunesService = require('../src/ItunesService.js');
const MusicBrainzService = require('../src/MusicBrainzService.js');
const Code = require('../src/Code.js');

const qaConfig = new Config();
const qaMbService = new MusicBrainzService(qaConfig);
const SAMPLE_MBID = 'a1b2c3d4-e5f6-4789-abcd-ef0123456789';

test('MusicBrainzService.isValidMbid: 境界値・非文字列・前後空白・不正文字の厳密判定 (AC-8, NFR-SEC-002)', () => {
  assert.strictEqual(qaMbService.isValidMbid(SAMPLE_MBID), true);
  assert.strictEqual(qaMbService.isValidMbid(`  ${SAMPLE_MBID.toUpperCase()}  `), true);
  assert.strictEqual(qaMbService.isValidMbid('a1b2c3d4-e5f6-4789-abcd-ef012345678'), false); // 1文字短い
  assert.strictEqual(qaMbService.isValidMbid('a1b2c3d4-e5f6-4789-abcd-ef01234567890'), false); // 1文字長い
  assert.strictEqual(qaMbService.isValidMbid('a1b2c3d4_e5f6_4789_abcd_ef0123456789'), false); // アンダースコア
  assert.strictEqual(qaMbService.isValidMbid(null), false);
  assert.strictEqual(qaMbService.isValidMbid(undefined), false);
  assert.strictEqual(qaMbService.isValidMbid(12345), false);
  assert.strictEqual(qaMbService.isValidMbid({}), false);
});

test('MusicBrainzService.sanitizeSearchQuery: 制御文字・空白のみ・非文字列への耐性 (NFR-SEC-003)', () => {
  assert.strictEqual(qaMbService.sanitizeSearchQuery(null), '');
  assert.strictEqual(qaMbService.sanitizeSearchQuery(undefined), '');
  assert.strictEqual(qaMbService.sanitizeSearchQuery('   \t\r\n\x00\x1F\x7F   '), '');
  assert.strictEqual(qaMbService.buildSearchRequest('   \x00   '), null);
  const sanitized = qaMbService.sanitizeSearchQuery('King Gnu: "THE GREATEST UNKNOWN" [2023] +1');
  assert.strictEqual(sanitized.includes('\\:'), true);
  assert.strictEqual(sanitized.includes('\\"'), true);
  assert.strictEqual(sanitized.includes('\\['), true);
  assert.strictEqual(sanitized.includes('\\+'), true);
});

test('MusicBrainzService.lookupRelease: HTTP 404 / 500 / 503(リトライ成功・再失敗) / 不正JSON のエラーステータス検証 (AC-12)', () => {
  // 1) HTTP 404 -> ALBUM_NOT_FOUND
  global.UrlFetchApp = {
    fetch: () => ({ getResponseCode: () => 404, getContentText: () => 'Not Found' })
  };
  assert.throws(
    () => qaMbService.lookupRelease(SAMPLE_MBID),
    (err) => err.code === 'ALBUM_NOT_FOUND'
  );

  // 2) HTTP 500 -> MUSICBRAINZ_API_NETWORK_ERROR
  global.UrlFetchApp = {
    fetch: () => ({ getResponseCode: () => 500, getContentText: () => 'Internal Error' })
  };
  assert.throws(
    () => qaMbService.lookupRelease(SAMPLE_MBID),
    (err) => err.code === 'MUSICBRAINZ_API_NETWORK_ERROR'
  );

  // 3) HTTP 503 -> 1回リトライして2回目200で成功
  let lookupAttempts = 0;
  global.UrlFetchApp = {
    fetch: () => {
      lookupAttempts++;
      if (lookupAttempts === 1) {
        return { getResponseCode: () => 503, getContentText: () => 'Rate Limited' };
      }
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          id: SAMPLE_MBID,
          title: 'Recovered Album',
          'artist-credit': [{ name: 'Artist' }],
          media: [{ position: 1, format: 'CD', tracks: [{ position: 1, title: 'Track 1' }] }]
        })
      };
    }
  };
  const recovered = qaMbService.lookupRelease(SAMPLE_MBID);
  assert.strictEqual(lookupAttempts, 2);
  assert.strictEqual(recovered.albumName, 'Recovered Album');

  // 4) HTTP 503 -> 2回連続503で MUSICBRAINZ_RATE_LIMITED
  let lookupFailAttempts = 0;
  global.UrlFetchApp = {
    fetch: () => {
      lookupFailAttempts++;
      return { getResponseCode: () => 503, getContentText: () => 'Rate Limited' };
    }
  };
  assert.throws(
    () => qaMbService.lookupRelease(SAMPLE_MBID),
    (err) => err.code === 'MUSICBRAINZ_RATE_LIMITED'
  );
  assert.strictEqual(lookupFailAttempts, 2);

  // 5) 不正JSON -> MUSICBRAINZ_API_PARSE_ERROR
  global.UrlFetchApp = {
    fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{broken_json' })
  };
  assert.throws(
    () => qaMbService.lookupRelease(SAMPLE_MBID),
    (err) => err.code === 'MUSICBRAINZ_API_PARSE_ERROR'
  );

  delete global.UrlFetchApp;
});

test('MusicBrainzService.lookupRelease: recordingフォールバック・truncated検知・position欠損補完の検証 (AC-6, U-1)', () => {
  global.UrlFetchApp = {
    fetch: () => ({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({
        id: SAMPLE_MBID,
        title: '', // 空タイトル -> 不明なアルバム
        'artist-credit': [], // 空クレジット -> 不明なアーティスト
        media: [
          {
            position: null, // 欠損 -> 1
            format: 'Blu-ray',
            'track-count': 50, // 実配列(2件)より大きい -> truncated: true
            tracks: [
              {
                position: 'invalid', // 非数値 -> 1
                number: 'BD-1',
                title: '', // 空 -> recording.title へフォールバック
                recording: {
                  title: 'Recording Fallback Title',
                  'artist-credit': [{ name: 'Recording Artist' }]
                }
              },
              {
                position: 2,
                title: '', // recordingも空 -> Track 2 へフォールバック
                recording: {}
              }
            ]
          }
        ]
      })
    })
  };

  const detail = qaMbService.lookupRelease(SAMPLE_MBID);
  assert.strictEqual(detail.albumName, '不明なアルバム');
  assert.strictEqual(detail.albumArtist, '不明なアーティスト');
  assert.strictEqual(detail.truncated, true);
  assert.strictEqual(detail.expectedTrackCount, 50);
  assert.strictEqual(detail.tracks.length, 2);
  assert.strictEqual(detail.tracks[0].cdNumber, 1);
  assert.strictEqual(detail.tracks[0].trackNumber, 1);
  assert.strictEqual(detail.tracks[0].trackName, 'Recording Fallback Title');
  assert.strictEqual(detail.tracks[0].trackArtist, 'Recording Artist');
  assert.strictEqual(detail.tracks[0].mediumFormat, 'Blu-ray');
  assert.strictEqual(detail.tracks[1].trackName, 'Track 2');
  assert.strictEqual(detail.tracks[1].trackArtist, '不明なアーティスト');

  delete global.UrlFetchApp;
});

// -------------------------------------------------------------
// セクション 6: MusicService.searchAlbums 並列取得 (fetchAll) & 重複判定コーナーケース検証 (AC-1〜AC-5)
// -------------------------------------------------------------
console.log('\n>>> [6] MusicService.searchAlbums 並列取得 (fetchAll) & 重複判定コーナーケース検証');

test('MusicService.searchAlbums: UrlFetchApp.fetchAll による並列取得とMB側503時の単発リトライ成功検証', () => {
  let fetchAllCalled = false;
  let retryFetchCalled = false;

  global.UrlFetchApp = {
    fetchAll: (reqs) => {
      fetchAllCalled = true;
      assert.strictEqual(reqs.length, 2);
      return [
        // [0] iTunes 200 OK
        {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            results: [{
              wrapperType: 'collection',
              collectionId: 999,
              collectionName: 'Parallel Album',
              artistName: 'Parallel Artist',
              releaseDate: '2024-04-01T00:00:00Z',
              trackCount: 10
            }]
          })
        },
        // [1] MusicBrainz 初回 503
        {
          getResponseCode: () => 503,
          getContentText: () => 'Service Unavailable'
        }
      ];
    },
    fetch: (url, opts) => {
      retryFetchCalled = true;
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          releases: [{
            id: SAMPLE_MBID,
            score: 90,
            title: 'MB Recovered Album',
            date: '2024-04',
            'track-count': 12,
            'artist-credit': [{ name: 'Parallel Artist' }]
          }]
        })
      };
    }
  };

  const ms = new MusicService(qaConfig, {}, driveService, new ItunesService(), new MusicBrainzService(qaConfig));
  const res = ms.searchAlbums('Parallel');

  assert.strictEqual(fetchAllCalled, true);
  assert.strictEqual(retryFetchCalled, true);
  assert.strictEqual(res.sources.itunes.ok, true);
  assert.strictEqual(res.sources.musicbrainz.ok, true);
  assert.strictEqual(res.albums.length, 2);
  assert.strictEqual(res.albums[0].source, 'itunes');
  assert.strictEqual(res.albums[1].source, 'musicbrainz');

  delete global.UrlFetchApp;
});

test('MusicService.searchAlbums: UrlFetchApp.fetchAll 自体が例外を投げた場合に個別呼び出しへフォールバックすること', () => {
  let individualFetchCount = 0;
  global.UrlFetchApp = {
    fetchAll: () => {
      throw new Error('fetchAll unsupported or failed');
    },
    fetch: (url) => {
      individualFetchCount++;
      if (url.includes('itunes.apple.com')) {
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            results: [{
              wrapperType: 'collection',
              collectionId: 777,
              collectionName: 'Fallback Album',
              artistName: 'Fallback Artist',
              releaseDate: '2022-01-01',
              trackCount: 8
            }]
          })
        };
      }
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ releases: [] })
      };
    }
  };

  const ms = new MusicService(qaConfig, {}, driveService, new ItunesService(), new MusicBrainzService(qaConfig));
  const res = ms.searchAlbums('Fallback');

  assert.strictEqual(individualFetchCount, 2);
  assert.strictEqual(res.albums.length, 1);
  assert.strictEqual(res.albums[0].albumName, 'Fallback Album');

  delete global.UrlFetchApp;
});

test('MusicService.mergeAlbumSearchResults: 記号のみタイトル・MB内複数版保持・trackCount<=0境界の検証 (AC-3)', () => {
  const ms = new MusicService(qaConfig, {}, driveService, new ItunesService(), new MusicBrainzService(qaConfig));

  // 1) 同じ記号タイトル ("+" と "+") かつ他3条件一致なら重複排除される
  const sameSymbol = ms.mergeAlbumSearchResults(
    [{ collectionId: 1, albumName: '+', albumArtist: 'Ed Sheeran', releaseDate: '2011-09-09', trackCount: 12 }],
    [{ sourceId: SAMPLE_MBID, albumName: '＋', albumArtist: 'Ed Sheeran', releaseDate: '2011', trackCount: 12, extra: { score: 100 } }]
  );
  assert.strictEqual(sameSymbol.length, 1);
  assert.strictEqual(sameSymbol[0].source, 'itunes');

  // 2) MB結果同士の版違い（JP盤とUS盤）はiTunesに同一がなければ両方とも保持される (ADR-004)
  const mbEditions = ms.mergeAlbumSearchResults(
    [],
    [
      { sourceId: '11111111-1111-1111-1111-111111111111', albumName: 'Same MB Album', albumArtist: 'Artist', releaseDate: '2021', trackCount: 10, extra: { country: 'JP', score: 100 } },
      { sourceId: '22222222-2222-2222-2222-222222222222', albumName: 'Same MB Album', albumArtist: 'Artist', releaseDate: '2021', trackCount: 10, extra: { country: 'US', score: 100 } }
    ]
  );
  assert.strictEqual(mbEditions.length, 2);

  // 3) trackCount が 0 の場合はタイトル・アーティスト・年が一致しても誤統合しない
  const zeroTracks = ms.mergeAlbumSearchResults(
    [{ collectionId: 2, albumName: 'Zero Track Album', albumArtist: 'Artist', releaseDate: '2021-01-01', trackCount: 0 }],
    [{ sourceId: SAMPLE_MBID, albumName: 'Zero Track Album', albumArtist: 'Artist', releaseDate: '2021-01-01', trackCount: 0, extra: { score: 90 } }]
  );
  assert.strictEqual(zeroTracks.length, 2);
});

// -------------------------------------------------------------
// セクション 7: フロントエンド App 動的統合テスト（統合検索・警告トースト・MBプレビュー・部分日付保護）
// -------------------------------------------------------------
console.log('\n>>> [7] フロントエンド App 動的統合テスト（検索・プレビュー・部分日付編集保護）');

function createQaDomEnv() {
  const elements = {};
  const toasts = [];
  const createEl = (id, props = {}) => {
    const classes = new Set(props.classes || []);
    const attrs = { ...(props.attrs || {}) };
    const el = {
      id,
      value: props.value || '',
      textContent: props.textContent || '',
      innerHTML: props.innerHTML || '',
      disabled: Boolean(props.disabled),
      src: props.src || '',
      onerror: null,
      classList: {
        add: (...cs) => cs.forEach(c => classes.add(c)),
        remove: (...cs) => cs.forEach(c => classes.delete(c)),
        toggle: (c, force) => {
          if (force === undefined) {
            if (classes.has(c)) classes.delete(c); else classes.add(c);
          } else if (force) classes.add(c); else classes.delete(c);
        },
        contains: (c) => classes.has(c)
      },
      getAttribute: (k) => (k in attrs ? attrs[k] : null),
      setAttribute: (k, v) => { attrs[k] = String(v); },
      removeAttribute: (k) => { delete attrs[k]; },
      addEventListener: (ev, fn) => {
        el._listeners = el._listeners || {};
        el._listeners[ev] = el._listeners[ev] || [];
        el._listeners[ev].push(fn);
      },
      trigger: (ev, eventObj = {}) => {
        if (el._listeners && el._listeners[ev]) {
          el._listeners[ev].forEach(fn => fn({ target: el, preventDefault: () => {}, ...eventObj }));
        }
      },
      focus: () => {},
      querySelectorAll: () => [],
      querySelector: () => null,
      ...props
    };
    elements[id] = el;
    return el;
  };

  [
    'itunes-search-input',
    'btn-itunes-search-submit',
    'itunes-search-btn-text',
    'itunes-search-spinner',
    'itunes-results-container',
    'itunes-preview-empty',
    'itunes-preview-content',
    'btn-submit-itunes-batch',
    'itunes-preview-artwork',
    'itunes-preview-album',
    'itunes-preview-artist',
    'itunes-preview-meta',
    'itunes-preview-tracks-tbody',
    'itunes-selected-summary',
    'edit-album-name',
    'edit-album-artist',
    'edit-album-release-date',
    'edit-album-artwork-url',
    'edit-album-art-preview',
    'edit-tracks-table-body',
    'edit-tracks-mobile-container',
    'edit-tracks-count-badge',
    'edit-tracks-empty-warning',
    'modal-edit-album',
    'btn-submit-edit-album',
    'btn-mobile-submit-edit-album'
  ].forEach(id => createEl(id));

  const storeContent = fs.readFileSync(path.join(__dirname, '../src/ScriptsState.html'), 'utf8');
  const storeJs = (storeContent.match(scriptTagRegex) || [])[1];
  const appContent = fs.readFileSync(path.join(__dirname, '../src/ScriptsApp.html'), 'utf8');
  const appJs = (appContent.match(scriptTagRegex) || [])[1];

  const sandbox = {
    window: { innerWidth: 1024, addEventListener: () => {} },
    document: {
      getElementById: (id) => elements[id] || null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    Utils: {
      escapeHtml: (s) => Utils.escapeHtml(s),
      formatDate: (d) => Utils.formatDate(d),
      debounce: (fn) => fn,
      resolveArtworkUrl: (u, sz) => Utils.resolveArtworkUrl(u, sz),
      extractDriveFileId: (u) => Utils.extractDriveFileId(u),
      getDefaultArtworkSvg: () => Utils.getDefaultArtworkSvg(),
      handleImageError: (el, u) => Utils.handleImageError(el, u),
      showToast: (msg, type) => { toasts.push({ msg, type }); },
      toggleGlobalLoading: () => {}
    },
    ApiClient: function() {},
    console
  };

  vm.createContext(sandbox);
  vm.runInContext(storeJs + '\nthis.Store = Store;', sandbox);
  vm.runInContext(appJs + '\nthis.App = App;', sandbox);

  return { App: sandbox.App, elements, toasts };
}

test('App.executeItunesSearch & selectItunesAlbumForPreview: 片側失敗警告トーストと出典別Lookup振り分けの動的検証 (AC-4, AC-6)', async () => {
  const { App, elements, toasts } = createQaDomEnv();
  const app = new App();

  elements['itunes-search-input'].value = 'Official髭男dism';
  app.api.searchAlbums = async () => ({
    albums: [
      {
        source: 'musicbrainz',
        sourceId: SAMPLE_MBID,
        albumName: 'Editorial <script>alert(1)</script>',
        albumArtist: 'Official髭男dism',
        releaseDate: '2021-08',
        trackCount: 14,
        artworkUrl100: `https://coverartarchive.org/release/${SAMPLE_MBID}/front-250`,
        extra: { format: 'CD + DVD', country: 'JP', discCount: 2, disambiguation: '初回盤<img onerror=alert(1)>' }
      }
    ],
    sources: {
      itunes: { ok: false, count: 0, error: 'iTunes Timeout' },
      musicbrainz: { ok: true, count: 1 }
    }
  });

  await app.executeItunesSearch();

  // iTunes失敗・MB成功時の警告トースト確認
  assert.strictEqual(toasts.some(t => t.type === 'warning' && t.msg.includes('iTunes の検索に失敗したため MusicBrainz の結果のみ表示しています')), true);
  // 検索ボタンが操作可能に戻っていること
  assert.strictEqual(elements['btn-itunes-search-submit'].disabled, false);
  // 描画HTMLに生の <script> や <img onerror が含まれずエスケープされていること (AC-9)
  const renderedHtml = elements['itunes-results-container'].innerHTML;
  assert.strictEqual(renderedHtml.includes('<script>'), false);
  assert.strictEqual(renderedHtml.includes('&lt;script&gt;'), true);
  assert.strictEqual(renderedHtml.includes('MusicBrainz'), true);
  assert.strictEqual(renderedHtml.includes('2枚組'), true);

  // MB アルバム選択時の lookupMusicBrainzRelease 振り分けと truncated 警告検証
  let calledMbid = null;
  app.api.lookupMusicBrainzRelease = async (mbid) => {
    calledMbid = mbid;
    return {
      albumDetail: {
        source: 'musicbrainz',
        sourceId: mbid,
        albumName: 'Editorial',
        albumArtist: 'Official髭男dism',
        releaseDate: '2021-08',
        artworkUrl100: '',
        artworkUrl500: '',
        trackCount: 2,
        truncated: true,
        tracks: [
          { cdNumber: 1, trackNumber: 1, trackName: 'Editorial', trackArtist: 'Official髭男dism', mediumFormat: 'CD' },
          { cdNumber: 2, trackNumber: 1, trackName: 'Live Intro', trackArtist: 'Official髭男dism', mediumFormat: 'DVD' }
        ]
      }
    };
  };

  await app.selectItunesAlbumForPreview(SAMPLE_MBID, 'musicbrainz');
  assert.strictEqual(calledMbid, SAMPLE_MBID);
  assert.strictEqual(elements['itunes-preview-meta'].textContent.includes('[MusicBrainz] 2021-08'), true);
  assert.strictEqual(elements['itunes-preview-tracks-tbody'].innerHTML.includes('(CD)'), true);
  assert.strictEqual(elements['itunes-preview-tracks-tbody'].innerHTML.includes('(DVD)'), true);
  assert.strictEqual(toasts.some(t => t.type === 'warning' && t.msg.includes('一部のトラックが省略されている')), true);
});

test('App.openEditAlbumModal & handleSaveAlbumEdit: MB部分日付 (YYYY / YYYY-MM) の未変更時保持と変更時更新の検証 (Q-5)', async () => {
  const { App, elements } = createQaDomEnv();
  const app = new App();
  app.bindEvents();

  const partialDateAlbum = {
    albumName: 'Partial Date Album',
    albumArtist: 'Test Artist',
    releaseDate: '2021-08',
    artworkUrl: '',
    totalTracks: 1,
    discs: {
      1: {
        cdNumber: 1,
        tracks: [{ cdNumber: 1, trackNumber: 1, trackName: 'Song 1', trackArtist: 'Test Artist' }]
      }
    }
  };

  // ケース1: 日付欄を触らずに保存した場合 -> 元の部分日付 '2021-08' が維持されること
  app.openEditAlbumModal(partialDateAlbum);
  assert.strictEqual(elements['edit-album-release-date'].value, ''); // <input type="date"> には入らないため空文字

  let savedEditPayload = null;
  app.api.updateAlbumBatch = async (payload) => {
    savedEditPayload = payload;
    return { updatedRowCount: 1 };
  };

  await app.handleSaveAlbumEdit();
  assert.strictEqual(savedEditPayload.album.releaseDate, '2021-08');

  // ケース2: ユーザーが日付欄を意図的に変更した場合 -> 新しい日付が送信されること
  app.openEditAlbumModal(partialDateAlbum);
  elements['edit-album-release-date'].value = '2021-08-18';
  elements['edit-album-release-date'].trigger('change');

  await app.handleSaveAlbumEdit();
  assert.strictEqual(savedEditPayload.album.releaseDate, '2021-08-18');

  // ケース3: ユーザーが日付欄を一度操作して空にクリアした場合 -> 空文字 '' が送信されること
  app.openEditAlbumModal(partialDateAlbum);
  elements['edit-album-release-date'].value = '';
  elements['edit-album-release-date'].trigger('input');

  await app.handleSaveAlbumEdit();
  assert.strictEqual(savedEditPayload.album.releaseDate, '');
});

// -------------------------------------------------------------
// セクション 8: GAS V8 ランタイム 単一グローバルスコープ共有・識別子衝突防止検証
// -------------------------------------------------------------
console.log('\n>>> [8] GAS V8 ランタイム 単一グローバルスコープ共有・識別子衝突防止検証');

test('GAS V8 Global Scope: src/*.js 全7ファイルを同一VMコンテキスト（require未定義の純粋GAS V8環境）で任意の順序で評価・RPC実行しても SyntaxError / ReferenceError が一切発生しないこと', () => {
  const srcDir = path.join(__dirname, '../src');
  const allJsFiles = fs.readdirSync(srcDir).filter(f => f.endsWith('.js')).sort();
  const orders = [
    allJsFiles,
    [...allJsFiles].reverse(),
    ['Code.js', 'ItunesService.js', 'MusicBrainzService.js', 'MusicService.js', 'Config.js', 'SheetService.js', 'DriveService.js'],
    ['MusicService.js', 'MusicBrainzService.js', 'ItunesService.js', 'SheetService.js', 'DriveService.js', 'Config.js', 'Code.js']
  ];

  for (const fileOrder of orders) {
    const ctx = vm.createContext({
      console,
      PropertiesService: {
        getScriptProperties: () => ({
          getProperties: () => ({ SPREADSHEET_ID: 'ss-1', DRIVE_FOLDER_ID: 'dr-1' })
        })
      },
      CacheService: {
        getScriptCache: () => ({
          get: () => null,
          put: () => {}
        })
      },
      Utilities: {
        sleep: () => {}
      },
      UrlFetchApp: {
        fetchAll: () => [
          {
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify({
              results: [{
                wrapperType: 'collection',
                collectionId: 101,
                collectionName: 'GAS V8 Album',
                artistName: 'GAS V8 Artist',
                releaseDate: '2025-01-01T00:00:00Z',
                trackCount: 5
              }]
            })
          },
          {
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify({
              releases: [{
                id: SAMPLE_MBID,
                score: 95,
                title: 'GAS V8 MB Album',
                date: '2025-02',
                'track-count': 6,
                'artist-credit': [{ name: 'GAS V8 Artist' }]
              }]
            })
          }
        ],
        fetch: () => ({
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            id: SAMPLE_MBID,
            title: 'GAS V8 MB Album',
            date: '2025-02',
            'artist-credit': [{ name: 'GAS V8 Artist' }],
            media: [{
              position: 1,
              format: 'CD',
              tracks: [{ position: 1, number: '1', title: 'Track 1' }]
            }]
          })
        })
      }
    });

    for (const file of fileOrder) {
      const srcCode = fs.readFileSync(path.join(srcDir, file), 'utf8');
      assert.doesNotThrow(
        () => vm.runInContext(srcCode, ctx, { filename: file }),
        `ファイル順序 [${fileOrder.join(' -> ')}] の ${file} 評価時に構文エラーや識別子重複が発生してはならない`
      );
    }

    const runtimeResult = vm.runInContext(
      `(() => {
        const ms = getMusicService();
        const searchRes = apiSearchAlbums('GAS V8');
        const mbLookupRes = apiLookupMusicBrainzRelease('${SAMPLE_MBID}');
        return {
          instancesOk: Boolean(
            ms &&
            ms.config instanceof Config &&
            ms.sheetService instanceof SheetService &&
            ms.driveService instanceof DriveService &&
            ms.itunesService instanceof ItunesService &&
            ms.musicBrainzService instanceof MusicBrainzService
          ),
          searchOk: Boolean(searchRes && searchRes.success === true && searchRes.data.albums.length === 2),
          lookupOk: Boolean(mbLookupRes && mbLookupRes.success === true && mbLookupRes.data.albumDetail.tracks.length === 1)
        };
      })()`,
      ctx
    );
    assert.strictEqual(runtimeResult.instancesOk, true);
    assert.strictEqual(runtimeResult.searchOk, true);
    assert.strictEqual(runtimeResult.lookupOk, true);
  }
});

Promise.all(pendingPromises).then(() => {
  console.log('\n===============================================================');
  console.log(`QA検証完了: 成功 = ${passCount}, 失敗 = ${failCount}`);
  console.log('===============================================================');

  if (issues.length > 0) {
    console.log('\n発見された課題一覧:');
    issues.forEach(i => console.log(`- ${i.name}: ${i.error.message}`));
    process.exit(1);
  }
});


