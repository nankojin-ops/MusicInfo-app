/**
 * MusicInfo-app ローカルユニットテスト & 構文検証スクリプト
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failCount++;
  }
}

function assertThrows(fn, expectedCode, message) {
  try {
    fn();
    console.error(`  ✗ FAIL (Expected throw): ${message}`);
    failCount++;
  } catch (err) {
    if (!expectedCode || err.code === expectedCode) {
      console.log(`  ✓ PASS: ${message} (Threw ${err.code || err.message})`);
      passCount++;
    } else {
      console.error(`  ✗ FAIL (Wrong code ${err.code}): ${message}`);
      failCount++;
    }
  }
}

console.log('==================================================');
console.log('MusicInfo-app 単体テストおよび構文検証を開始');
console.log('==================================================\n');

// 1. Config クラスのテスト
console.log('[1] Config クラスのテスト');
const Config = require('../src/Config');

// モック環境の PropertiesService をセット
global.PropertiesService = {
  getScriptProperties: () => ({
    getProperties: () => ({
      SPREADSHEET_ID: 'test-ss-id',
      DRIVE_FOLDER_ID: 'test-drive-id',
      SHEET_NAME: 'CustomTracks'
    })
  })
};

const config = new Config();
assert(config.getSpreadsheetId() === 'test-ss-id', 'スプレッドシートIDの取得');
assert(config.getDriveFolderId() === 'test-drive-id', 'ドライブフォルダIDの取得');
assert(config.getSheetName() === 'CustomTracks', 'カスタムシート名の取得');
assert(config.validate() === true, '必須プロパティ検証成功');
assert(Config.CONSTANTS.SHEET_HEADERS.length === 8, '8列ヘッダー定義が存在する');
assert(Config.CONSTANTS.ITUNES.SEARCH_URL.includes('itunes.apple.com'), 'iTunesエンドポイント定数');
assert(Config.CONSTANTS.MUSICBRAINZ && Config.CONSTANTS.MUSICBRAINZ.RELEASE_ENDPOINT.includes('musicbrainz.org/ws/2/release'), 'MusicBrainzエンドポイント定数');
assert(Config.CONSTANTS.MUSICBRAINZ.CAA_BASE_URL.includes('coverartarchive.org/release'), 'Cover Art Archive エンドポイント定数');
assert(config.getMusicBrainzUserAgent() === 'MusicInfoApp/1.0 ( https://github.com/nankojin-ops/MusicInfo-app )', 'デフォルトMusicBrainz User-Agentの取得');
assert(config.isMusicBrainzEnabled() === true, 'デフォルトMusicBrainz有効状態(true)');

// カスタムUAおよび機能スイッチ無効化のプロパティ検証
global.PropertiesService = {
  getScriptProperties: () => ({
    getProperties: () => ({
      SPREADSHEET_ID: 'test-ss-id',
      DRIVE_FOLDER_ID: 'test-drive-id',
      MUSICBRAINZ_USER_AGENT: 'CustomMusicApp/2.0 ( mailto:test@example.com )',
      MUSICBRAINZ_ENABLED: 'false'
    })
  })
};
const customMbConfig = new Config();
assert(customMbConfig.getMusicBrainzUserAgent() === 'CustomMusicApp/2.0 ( mailto:test@example.com )', 'スクリプトプロパティによるMusicBrainz UA上書き');
assert(customMbConfig.isMusicBrainzEnabled() === false, 'MUSICBRAINZ_ENABLED="false" による無効化スイッチ');

// 空プロパティ時の例外テスト
global.PropertiesService = {
  getScriptProperties: () => ({
    getProperties: () => ({})
  })
};
const emptyConfig = new Config();
assertThrows(() => emptyConfig.getSpreadsheetId(), 'CONFIG_SPREADSHEET_ID_MISSING', '未設定スプレッドシートIDで例外送出');
assertThrows(() => emptyConfig.getDriveFolderId(), 'CONFIG_DRIVE_FOLDER_ID_MISSING', '未設定ドライブフォルダIDで例外送出');
assert(emptyConfig.getSheetName() === 'MusicTracks', 'デフォルトシート名 MusicTracks');

// 2. DriveService のテスト
console.log('\n[2] DriveService のテスト');
const DriveService = require('../src/DriveService');
const driveService = new DriveService(config);

assert(driveService.sanitizeFileName('Album: Greatest / Hits? *2026*') === 'Album_Greatest_Hits_2026', 'ファイル名サニタイズ');

// [BUG-003] 長大マルチバイト（絵文字）切断時の孤立サロゲート除去
const emojiName = 'A'.repeat(59) + '😀';
const sanitizedEmoji = driveService.sanitizeFileName(emojiName);
assert(sanitizedEmoji.length <= 60, 'sanitizeFileName: 長大文字列が60文字以内 (BUG-003)');
assert(typeof sanitizedEmoji.isWellFormed === 'function' ? sanitizedEmoji.isWellFormed() : !/[\uD800-\uDBFF]$/.test(sanitizedEmoji), 'sanitizeFileName: 孤立上位サロゲートが除去され Well-Formed UTF-16 であること (BUG-003)');
assert(sanitizedEmoji === 'A'.repeat(59), 'sanitizeFileName: 59文字+絵文字で絵文字が安全に切り落とされ59文字になること (BUG-003)');

// [BUG-004] アルバム名が単一ドットまたはドットのみの場合のフォールバック
assert(driveService.sanitizeFileName('.') === 'album', 'sanitizeFileName: 単一ドット "." で "album" フォールバック (BUG-004)');
assert(driveService.sanitizeFileName('..') === 'album', 'sanitizeFileName: ドットのみ ".." で "album" フォールバック (BUG-004)');
assert(driveService.sanitizeFileName('...') === 'album', 'sanitizeFileName: ドットのみ "..." で "album" フォールバック (BUG-004)');
assert(driveService.sanitizeFileName('   .   ') === 'album', 'sanitizeFileName: 空白付きドット "   .   " で "album" フォールバック (BUG-004)');
assert(driveService.generateWebUrl('abc123xyz') === 'https://drive.google.com/thumbnail?id=abc123xyz&sz=w800', 'Web表示URL生成');
assert(driveService.extractDriveFileId('https://drive.google.com/file/d/abc1234567890123456789012345/view') === 'abc1234567890123456789012345', 'DriveService: /file/d/ からのID抽出');
assert(driveService.extractDriveFileId('https://drive.google.com/uc?export=view&id=abc1234567890123456789012345') === 'abc1234567890123456789012345', 'DriveService: ?id= からのID抽出');
assert(driveService.extractDriveFileId('https://lh3.googleusercontent.com/d/abc1234567890123456789012345') === 'abc1234567890123456789012345', 'DriveService: lh3 からのID抽出');
assert(driveService.extractDriveFileId('abc1234567890123456789012345') === 'abc1234567890123456789012345', 'DriveService: 25文字以上の生ID抽出');
assert(driveService.extractDriveFileId('https://example.com/image.jpg') === null, 'DriveService: 非Drive URLでのnull返却');
assert(driveService.generatePublicUrl('testId123') === 'https://lh3.googleusercontent.com/d/testId123', 'DriveService: 公開URL生成');
assert(driveService.generatePublicUrl('') === '', 'DriveService: 空IDでの空文字返却');
assert(
  driveService.ensurePublicArtwork('https://drive.google.com/file/d/testDriveId1234567890123456/view', 'Album') ===
  'https://lh3.googleusercontent.com/d/testDriveId1234567890123456',
  'DriveService: ensurePublicArtwork (Drive URL)'
);
assert(
  driveService.ensurePublicArtwork('https://example.com/cover.jpg', 'Album') ===
  'https://example.com/cover.jpg',
  'DriveService: ensurePublicArtwork (外部URL・Node.js環境防御)'
);
assert(driveService.ensurePublicArtwork('', 'Album') === '', 'DriveService: ensurePublicArtwork (空文字)');

// [2.1] 新命名規則 generateArtworkFileName のテスト (AC-001)
const testDate1 = new Date('2026-10-19T11:45:32.000Z'); // JST 2026-10-19 20:45:32
assert(
  driveService.generateArtworkFileName('First Love', 'jpg', testDate1) === 'artwork_First_Love_20261019204500.jpg',
  'generateArtworkFileName: JST日時および秒00固定フォーマット完全一致 (AC-001-1)'
);
assert(
  driveService.generateArtworkFileName('A/B*C:D? "Test"', 'jpg', testDate1) === 'artwork_A_B_C_D_Test_20261019204500.jpg',
  'generateArtworkFileName: 記号・禁止文字のサニタイズ (AC-001-2)'
);
assert(
  driveService.generateArtworkFileName('', 'jpg', testDate1) === 'artwork_album_20261019204500.jpg',
  'generateArtworkFileName: 空文字アルバム名での "album" フォールバック (AC-001-3)'
);
assert(
  driveService.generateArtworkFileName('Test Album', 'png', testDate1) === 'artwork_Test_Album_20261019204500.png',
  'generateArtworkFileName: PNG拡張子の反映 (AC-001-4)'
);
assert(
  driveService.generateArtworkFileName('Test Album', '.webp', testDate1) === 'artwork_Test_Album_20261019204500.webp',
  'generateArtworkFileName: 先頭ドット付きWebP拡張子の反映 (AC-001-4)'
);

// [2.2] downloadAndSaveArtwork での新命名規則適用検証 (AC-001-5)
let createdFileName = '';
global.DriveApp = {
  getFolderById: (id) => ({
    createFile: (blob) => {
      createdFileName = blob.getName();
      return {
        getId: () => 'mock-file-id-itunes',
        setSharing: () => {}
      };
    }
  }),
  Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
  Permission: { VIEW: 'VIEW' }
};
global.UrlFetchApp = {
  fetch: () => ({
    getResponseCode: () => 200,
    getBlob: () => {
      let bName = '';
      let bType = '';
      return {
        setName: (n) => { bName = n; },
        getName: () => bName,
        setContentType: (t) => { bType = t; }
      };
    }
  })
};

driveService.downloadAndSaveArtwork('https://example.com/art.jpg', 'Utada Album');
assert(
  createdFileName.startsWith('artwork_Utada_Album_') && createdFileName.endsWith('00.jpg'),
  'downloadAndSaveArtwork: 新命名規則 (artwork_xxx_YYYYMMDDHHMM00.jpg) が適用されていること (AC-001-5)'
);

// [2.3] saveUploadedArtwork 単体テスト (AC-002)
let savedFileBlob = null;
global.DriveApp = {
  getFolderById: (id) => ({
    createFile: (blob) => {
      savedFileBlob = blob;
      return {
        getId: () => 'mock-uploaded-file-id',
        setSharing: () => {}
      };
    }
  }),
  Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
  Permission: { VIEW: 'VIEW' }
};

// 正常系: DataURLプレフィックス付きBase64
const sampleBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD';
const uploadRes1 = driveService.saveUploadedArtwork(sampleBase64, 'image/jpeg', 'My Album');
assert(
  uploadRes1 && uploadRes1.fileId === 'mock-uploaded-file-id' &&
  uploadRes1.publicUrl === 'https://lh3.googleusercontent.com/d/mock-uploaded-file-id' &&
  uploadRes1.fileName.startsWith('artwork_My_Album_') && uploadRes1.fileName.endsWith('.jpg'),
  'saveUploadedArtwork: DataURL付きBase64の正常保存と公開URL返却 (AC-002-1)'
);

// 正常系: プレーンBase64 & PNG
const plainBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const uploadRes2 = driveService.saveUploadedArtwork(plainBase64, 'image/png', 'PNG Album');
assert(
  uploadRes2 && uploadRes2.fileName.endsWith('.png'),
  'saveUploadedArtwork: プレーンBase64およびPNG拡張子の正常保存'
);

// 異常系: 不正MIMEタイプ (AC-002-4)
assertThrows(
  () => driveService.saveUploadedArtwork(sampleBase64, 'application/pdf', 'Bad Album'),
  'VALIDATION_FAILED',
  'saveUploadedArtwork: 不正MIME (application/pdf) で例外送出 (AC-002-4)'
);
assertThrows(
  () => driveService.saveUploadedArtwork('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', '', 'Bad Gif'),
  'VALIDATION_FAILED',
  'saveUploadedArtwork: 不正MIME (image/gif) で例外送出 (AC-002-4)'
);

// [BUG-001] DataURLヘッダ優先およびMIME偽装バイパス脆弱性検証
const uploadResHeaderOnly = driveService.saveUploadedArtwork(sampleBase64, '', 'Header Only Album');
assert(
  uploadResHeaderOnly && uploadResHeaderOnly.fileName.endsWith('.jpg'),
  'saveUploadedArtwork: 引数mimeTypeが空でもDataURLヘッダからMIME特定 (BUG-001)'
);

assertThrows(
  () => driveService.saveUploadedArtwork('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'image/jpeg', 'Mismatched Album'),
  'VALIDATION_FAILED',
  'saveUploadedArtwork: DataURLヘッダ(png)と引数mimeType(jpeg)の不一致で VALIDATION_FAILED (BUG-001)'
);

assertThrows(
  () => driveService.saveUploadedArtwork('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==', 'image/jpeg', 'XSS Album'),
  'VALIDATION_FAILED',
  'saveUploadedArtwork: DataURLヘッダが不正MIMEの場合に引数偽装があっても VALIDATION_FAILED (BUG-001)'
);

assertThrows(
  () => driveService.saveUploadedArtwork(sampleBase64, 'image/gif', 'Bad Param Album'),
  'VALIDATION_FAILED',
  'saveUploadedArtwork: 引数が不正MIME(image/gif)の場合に VALIDATION_FAILED (BUG-001)'
);

// 異常系: 5MB超過 (AC-002-3)
const bigBuffer = Buffer.alloc(5 * 1024 * 1024 + 10);
const bigBase64 = bigBuffer.toString('base64');
assertThrows(
  () => driveService.saveUploadedArtwork(bigBase64, 'image/jpeg', 'Huge Album'),
  'VALIDATION_FAILED',
  'saveUploadedArtwork: 5MB超過で VALIDATION_FAILED 例外送出 (AC-002-3)'
);

// 異常系: 空データ
assertThrows(
  () => driveService.saveUploadedArtwork('', 'image/jpeg', 'Empty Album'),
  'VALIDATION_FAILED',
  'saveUploadedArtwork: 空画像データで例外送出'
);

// [2.4] importArtworkFromDrive 単体テスト (AC-003)
let copiedNewName = '';
let copiedFolder = null;
global.DriveApp = {
  getFolderById: (id) => ({ id: id }),
  getFileById: (id) => {
    if (id === 'forbidden-file-id12345678901234') {
      throw new Error('Access denied');
    }
    if (id === 'non-image-file-id123456789012345') {
      return {
        getId: () => id,
        getMimeType: () => 'text/plain',
        getName: () => 'notes.txt'
      };
    }
    if (id === 'no-copy-permission-id123456789') {
      return {
        getId: () => id,
        getMimeType: () => 'image/png',
        getName: () => 'readonly.png',
        makeCopy: () => { throw new Error('Copy permission denied'); },
        setSharing: () => {}
      };
    }
    return {
      getId: () => id,
      getMimeType: () => 'image/jpeg',
      getName: () => 'original.jpg',
      makeCopy: (newName, targetFolder) => {
        copiedNewName = newName;
        copiedFolder = targetFolder;
        return {
          getId: () => 'copied-new-file-id',
          getName: () => newName,
          setSharing: () => {}
        };
      },
      setSharing: () => {}
    };
  },
  Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
  Permission: { VIEW: 'VIEW' }
};

// 正常系: 有効なDrive URLからコピー作成
const driveImportRes = driveService.importArtworkFromDrive('https://drive.google.com/file/d/valid-drive-12345678901234567890/view', 'Imported Album');
assert(
  driveImportRes && driveImportRes.fileId === 'copied-new-file-id' &&
  driveImportRes.publicUrl === 'https://lh3.googleusercontent.com/d/copied-new-file-id' &&
  copiedNewName.startsWith('artwork_Imported_Album_') && copiedNewName.endsWith('.jpg'),
  'importArtworkFromDrive: 専用管理フォルダへの複製と新命名規則適用 (AC-003-2)'
);

// 異常系: 非画像ファイルの指定拒絶
assertThrows(
  () => driveService.importArtworkFromDrive('non-image-file-id123456789012345', 'Text Album'),
  'VALIDATION_FAILED',
  'importArtworkFromDrive: 非画像形式ファイル指定時に例外送出'
);

// 異常系: アクセス不能ファイル (AC-003-3)
assertThrows(
  () => driveService.importArtworkFromDrive('forbidden-file-id12345678901234', 'Denied Album'),
  'DRIVE_ACCESS_DENIED',
  'importArtworkFromDrive: アクセス権のないDrive URLで DRIVE_ACCESS_DENIED 送出 (AC-003-3)'
);

// 異常系: 不正なURL/ID
assertThrows(
  () => driveService.importArtworkFromDrive('https://example.com/not-drive', 'Invalid URL'),
  'INVALID_DRIVE_ID',
  'importArtworkFromDrive: 不正なDrive URLで INVALID_DRIVE_ID 送出'
);

// 縮退動作 (Graceful Degradation): コピー権限なし時に元ファイルの公開URLへフォールバック
const fallbackRes = driveService.importArtworkFromDrive('no-copy-permission-id123456789', 'Fallback Album');
assert(
  fallbackRes && fallbackRes.fileId === 'no-copy-permission-id123456789' &&
  fallbackRes.publicUrl === 'https://lh3.googleusercontent.com/d/no-copy-permission-id123456789',
  'importArtworkFromDrive: コピー作成失敗時の元ファイル公開URLフォールバック (Graceful Degradation)'
);

// 3. ItunesService のテスト
console.log('\n[3] ItunesService のテスト');
const ItunesService = require('../src/ItunesService');
const itunesService = new ItunesService();

assert(
  itunesService.convertTo500x500ArtworkUrl('https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/100x100bb.jpg') ===
  'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/500x500bb.jpg',
  '500x500アートワークURL置換'
);
assert(itunesService.buildSearchRequest('   ') === null, 'ItunesService.buildSearchRequest: 空キーワードでnull');
const itReqSample = itunesService.buildSearchRequest('Official髭男dism');
assert(itReqSample && itReqSample.url.includes('itunes.apple.com/search') && itReqSample.muteHttpExceptions === true, 'ItunesService.buildSearchRequest: リクエストオブジェクト生成');

// 3.1. MusicBrainzService のテスト
console.log('\n[3.1] MusicBrainzService のテスト');
const MusicBrainzService = require('../src/MusicBrainzService');
const mbService = new MusicBrainzService(config);

const validMbid = 'b1234567-89ab-cdef-0123-456789abcdef';
assert(mbService.isValidMbid(validMbid) === true, 'isValidMbid: 正常な小文字UUID');
assert(mbService.isValidMbid(validMbid.toUpperCase()) === true, 'isValidMbid: 正常な大文字UUID');
assert(mbService.isValidMbid('12345') === false, 'isValidMbid: 数値文字列を拒否');
assert(mbService.isValidMbid('../release/hack') === false, 'isValidMbid: パストラバーサル文字列を拒否');
assert(mbService.isValidMbid('<script>alert(1)</script>') === false, 'isValidMbid: XSS文字列を拒否');
assert(mbService.isValidMbid('') === false, 'isValidMbid: 空文字を拒否');

const sanitizedQuery = mbService.sanitizeSearchQuery('AC/DC + "Live" (2026) *test*');
assert(sanitizedQuery.includes('\\/') && sanitizedQuery.includes('\\+') && sanitizedQuery.includes('\\"') && sanitizedQuery.includes('\\('), 'sanitizeSearchQuery: Lucene特殊文字エスケープ');

assert(
  mbService.formatArtistCredit([
    { name: 'Official髭男dism', joinphrase: ' feat. ' },
    { artist: { name: 'Guest Vocal' }, joinphrase: '' }
  ]) === 'Official髭男dism feat. Guest Vocal',
  'formatArtistCredit: 複数アーティストとjoinphraseの連結'
);
assert(mbService.formatArtistCredit([], '不明なアーティスト') === '不明なアーティスト', 'formatArtistCredit: 空配列時のフォールバック');

assert(
  mbService.buildCoverArtUrl(validMbid, 250) === `https://coverartarchive.org/release/${validMbid}/front-250`,
  'buildCoverArtUrl: 250px CAA URL生成'
);
assert(
  mbService.buildCoverArtUrl(validMbid, 500) === `https://coverartarchive.org/release/${validMbid}/front-500`,
  'buildCoverArtUrl: 500px CAA URL生成'
);
assert(mbService.buildCoverArtUrl('invalid-mbid', 250) === '', 'buildCoverArtUrl: 不正MBID時は空文字を返す');

// searchReleases モック検証 (UAヘッダ・1100msレート制御・503リトライ)
let capturedFetchCalls = [];
let sleepCalls = [];
let mockCacheStore = {};

global.CacheService = {
  getScriptCache: () => ({
    get: (key) => mockCacheStore[key] || null,
    put: (key, val) => { mockCacheStore[key] = val; }
  })
};
global.Utilities = {
  sleep: (ms) => { sleepCalls.push(ms); },
  formatDate: (d) => '2026-10-18'
};

global.UrlFetchApp = {
  fetch: (url, options) => {
    capturedFetchCalls.push({ url, options });
    return {
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({
        releases: [
          {
            id: validMbid,
            score: 100,
            title: 'Editorial (初回限定盤)',
            status: 'Official',
            disambiguation: 'CD+DVD',
            date: '2021-08-18',
            country: 'JP',
            'track-count': 18,
            'artist-credit': [{ name: 'Official髭男dism' }],
            media: [
              { format: 'CD', 'track-count': 14 },
              { format: 'DVD', 'track-count': 4 }
            ]
          }
        ]
      })
    };
  }
};

const mbSearchRes = mbService.searchReleases('Official髭男dism');
assert(capturedFetchCalls.length === 1, 'searchReleases: UrlFetchApp.fetch が1回呼ばれた');
assert(
  capturedFetchCalls[0].options &&
  capturedFetchCalls[0].options.headers &&
  capturedFetchCalls[0].options.headers['User-Agent'] === 'MusicInfoApp/1.0 ( https://github.com/nankojin-ops/MusicInfo-app )' &&
  capturedFetchCalls[0].options.headers['Accept'] === 'application/json',
  'searchReleases: User-Agent および Accept: application/json ヘッダが付与されていること (AC-13)'
);
assert(
  capturedFetchCalls[0].url.includes('dismax=true') && capturedFetchCalls[0].url.includes('fmt=json'),
  'searchReleases: クエリパラメータに dismax=true と fmt=json が含まれること'
);
assert(mbSearchRes.length === 1 && mbSearchRes[0].source === 'musicbrainz', 'searchReleases: source === "musicbrainz" で正規化される');
assert(mbSearchRes[0].sourceId === validMbid, 'searchReleases: sourceId に MBID がセットされる');
assert(mbSearchRes[0].extra.format === 'CD + DVD' && mbSearchRes[0].extra.discCount === 2 && mbSearchRes[0].extra.country === 'JP', 'searchReleases: extra に format / discCount / country が抽出される');

// 連続呼び出し時の 1,100ms 間隔制御検証 (AC-12)
sleepCalls = [];
mbService.searchReleases('Second Query');
assert(sleepCalls.length >= 1 && sleepCalls[0] > 0 && sleepCalls[0] <= 1100, 'enforceRateLimit_: 連続リクエスト時に Utilities.sleep で1,100ms間隔制御が働くこと (AC-12)');

// HTTP 503 時の1回限定リトライ成功・再失敗検証 (AC-12)
let attempt503 = 0;
global.UrlFetchApp = {
  fetch: () => {
    attempt503++;
    if (attempt503 === 1) {
      return { getResponseCode: () => 503, getContentText: () => 'Service Unavailable' };
    }
    return {
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ releases: [] })
    };
  }
};
const retrySuccessRes = mbService.searchReleases('Retry Test');
assert(attempt503 === 2 && Array.isArray(retrySuccessRes), 'searchReleases: HTTP 503 応答時に1回リトライして2回目200で成功すること');

let attemptAlways503 = 0;
global.UrlFetchApp = {
  fetch: () => {
    attemptAlways503++;
    return { getResponseCode: () => 503, getContentText: () => 'Service Unavailable' };
  }
};
assertThrows(
  () => mbService.searchReleases('Always 503'),
  'MUSICBRAINZ_RATE_LIMITED',
  'searchReleases: HTTP 503 がリトライ後も続く場合は最大1回リトライで打ち切り MUSICBRAINZ_RATE_LIMITED 例外'
);
assert(attemptAlways503 === 2, 'searchReleases: 503 連続失敗時の総リクエスト回数は初回+リトライ1回の計2回であること');

// lookupRelease の検証 (不正MBID遮断・アナログ盤 number:"A1" 対策・CAA front判定)
let lookupFetchCount = 0;
global.UrlFetchApp = {
  fetch: () => {
    lookupFetchCount++;
    return {
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({
        id: validMbid,
        title: 'Multi Format Release',
        date: '2021-08',
        'artist-credit': [{ name: 'Official髭男dism' }],
        'cover-art-archive': { front: true },
        media: [
          {
            position: 2,
            format: 'DVD',
            'track-count': 1,
            tracks: [
              { position: 1, number: 'DVD-1', title: 'Live Movie', 'artist-credit': [{ name: 'Official髭男dism' }] }
            ]
          },
          {
            position: 1,
            format: '12" Vinyl',
            'track-count': 2,
            tracks: [
              { position: 2, number: 'B1', title: 'Vinyl Side B', 'artist-credit': [] },
              { position: 1, number: 'A1', title: 'Vinyl Side A', 'artist-credit': [{ name: 'Guest Artist' }] }
            ]
          }
        ]
      })
    };
  }
};

assertThrows(
  () => mbService.lookupRelease('not-a-valid-uuid'),
  'VALIDATION_FAILED',
  'lookupRelease: 不正MBIDは VALIDATION_FAILED で拒否されること (AC-8)'
);
assert(lookupFetchCount === 0, 'lookupRelease: 不正MBID時は外部HTTP通信が1回も行われないこと (AC-8)');

const mbDetail = mbService.lookupRelease(validMbid);
assert(mbDetail.source === 'musicbrainz' && mbDetail.sourceId === validMbid, 'lookupRelease: source と sourceId が設定される');
assert(mbDetail.releaseDate === '2021-08', 'lookupRelease: 部分日付(YYYY-MM)が捏造されずそのまま保持される (Q-5)');
assert(mbDetail.artworkUrl500 === `https://coverartarchive.org/release/${validMbid}/front-500`, 'lookupRelease: cover-art-archive.front===true 時に CAA front-500 URLが設定される (AC-7)');
assert(mbDetail.tracks.length === 3, 'lookupRelease: 全メディア(Vinyl + DVD)の計3曲が抽出される (Q-4)');
assert(mbDetail.tracks[0].cdNumber === 1 && mbDetail.tracks[0].trackNumber === 1 && mbDetail.tracks[0].trackName === 'Vinyl Side A', 'lookupRelease: number("A1")ではなく position(1) で整列・抽出される (AC-6)');
assert(mbDetail.tracks[1].cdNumber === 1 && mbDetail.tracks[1].trackNumber === 2 && mbDetail.tracks[1].trackArtist === 'Official髭男dism', 'lookupRelease: トラックアーティスト空時にアルバムアーティストへフォールバック');
assert(mbDetail.tracks[2].cdNumber === 2 && mbDetail.tracks[2].mediumFormat === 'DVD', 'lookupRelease: Disc 2 に mediumFormat("DVD") が保持される');

// cover-art-archive.front === false 時の検証
global.UrlFetchApp = {
  fetch: () => ({
    getResponseCode: () => 200,
    getContentText: () => JSON.stringify({
      id: validMbid,
      title: 'No Cover Album',
      'artist-credit': [{ name: 'Artist' }],
      'cover-art-archive': { front: false },
      media: [{ position: 1, format: 'CD', tracks: [{ position: 1, title: 'Song 1' }] }]
    })
  })
};
const noCoverDetail = mbService.lookupRelease(validMbid);
assert(noCoverDetail.artworkUrl100 === '' && noCoverDetail.artworkUrl500 === '', 'lookupRelease: front===false 時は artworkUrl が空文字になること (AC-7)');

// 4. MusicService バリデーションのテスト
console.log('\n[4] MusicService バリデーションのテスト');
const MusicService = require('../src/MusicService');
const musicService = new MusicService(config, {}, driveService, itunesService);

assertThrows(
  () => musicService.searchItunesAlbums(''),
  'VALIDATION_FAILED',
  '空キーワードでのiTunes検索例外'
);
assertThrows(
  () => musicService.searchAlbums('   '),
  'VALIDATION_FAILED',
  '空キーワードでの統合検索(searchAlbums)例外'
);
assertThrows(
  () => musicService.lookupItunesAlbum(''),
  'VALIDATION_FAILED',
  '空コレクションIDでのLookup例外'
);
assertThrows(
  () => musicService.lookupMusicBrainzRelease('invalid-uuid'),
  'VALIDATION_FAILED',
  '不正MBIDでのMusicService.lookupMusicBrainzRelease例外'
);
assertThrows(
  () => musicService.saveAlbumFromItunes({ albumName: '', albumArtist: 'Artist', tracks: [] }),
  'VALIDATION_FAILED',
  'アルバム名欠落での一括登録例外'
);
assertThrows(
  () => musicService.saveAlbumFromItunes({ albumName: 'Album', albumArtist: '', tracks: [] }),
  'VALIDATION_FAILED',
  'アーティスト名欠落での一括登録例外'
);
assertThrows(
  () => musicService.saveAlbumFromItunes({ albumName: 'Album', albumArtist: 'Artist', tracks: [] }),
  'VALIDATION_FAILED',
  'トラック0件での一括登録例外'
);
assertThrows(
  () => musicService.saveSingleTrack({ cdNumber: 0, albumArtist: 'A', albumName: 'B', trackName: 'C', trackNumber: 1 }),
  'VALIDATION_FAILED',
  'CD番号0での手動登録例外'
);

// 手動登録時の ensurePublicArtwork 呼び出し検証
let capturedAppendPayload = null;
const mockSheetServiceForAppend = {
  appendSingleTrack: (payload) => {
    capturedAppendPayload = payload;
    return payload;
  }
};
const musicServiceForAppend = new MusicService(config, mockSheetServiceForAppend, driveService, itunesService);
musicServiceForAppend.saveSingleTrack({
  cdNumber: 1,
  albumArtist: 'Test Artist',
  albumName: 'Test Album',
  trackArtist: 'Test Artist',
  trackNumber: 1,
  trackName: 'Test Track',
  artworkUrl: 'https://drive.google.com/file/d/saveTestId123456789012345/view'
});
assert(
  capturedAppendPayload && capturedAppendPayload.artworkUrl === 'https://lh3.googleusercontent.com/d/saveTestId123456789012345',
  'MusicService.saveSingleTrack: ensurePublicArtwork 経由で公開URLに正規化されて保存されること'
);

// 4.1. MusicService 統合検索・マージ・重複判定4条件・並び順・片側障害フォールバック検証
console.log('\n[4.1] MusicService 統合検索・重複判定・並び順・障害分離のテスト');

const baseItunesItem = {
  collectionId: 1001,
  albumName: 'Editorial',
  albumArtist: 'Official髭男dism',
  releaseDate: '2021-08-18',
  trackCount: 14,
  artworkUrl100: 'https://example.com/it100.jpg',
  artworkUrl500: 'https://example.com/it500.jpg',
  primaryGenreName: 'J-Pop'
};

// ① 4条件すべて一致（NFKC全角・空白・句読点差を含む）→ MB側が非表示になること (AC-3)
const mergedDup = musicService.mergeAlbumSearchResults(
  [baseItunesItem],
  [{
    sourceId: validMbid,
    albumName: 'Ｅｄｉｔｏｒｉａｌ',
    albumArtist: 'Official 髭男 dism',
    releaseDate: '2021-08',
    trackCount: 14,
    extra: { score: 100 }
  }]
);
assert(mergedDup.length === 1 && mergedDup[0].source === 'itunes', '重複判定①: 4条件すべて一致時はMB項目が非表示になりiTunes項目のみ残る');

// ② アルバム名が異なる（Deluxe表記あり）→ 両方残ること (AC-3)
const mergedDiffAlbum = musicService.mergeAlbumSearchResults(
  [baseItunesItem],
  [{
    sourceId: validMbid,
    albumName: 'Editorial (Deluxe Edition)',
    albumArtist: 'Official髭男dism',
    releaseDate: '2021-08-18',
    trackCount: 14,
    extra: { score: 100 }
  }]
);
assert(mergedDiffAlbum.length === 2, '重複判定②: アルバム名(括弧内版表記)が異なる場合は両方表示される');

// ③ アーティスト名が異なる → 両方残ること (AC-3)
const mergedDiffArtist = musicService.mergeAlbumSearchResults(
  [baseItunesItem],
  [{
    sourceId: validMbid,
    albumName: 'Editorial',
    albumArtist: 'OFFICIAL HIGE DANDISM',
    releaseDate: '2021-08-18',
    trackCount: 14,
    extra: { score: 100 }
  }]
);
assert(mergedDiffArtist.length === 2, '重複判定③: アーティスト名表記が異なる場合は両方表示される');

// ④ 曲数が異なる（14曲 vs 18曲）→ 両方残ること (AC-3)
const mergedDiffTracks = musicService.mergeAlbumSearchResults(
  [baseItunesItem],
  [{
    sourceId: validMbid,
    albumName: 'Editorial',
    albumArtist: 'Official髭男dism',
    releaseDate: '2021-08-18',
    trackCount: 18,
    extra: { score: 100 }
  }]
);
assert(mergedDiffTracks.length === 2, '重複判定④: トラック数が異なる場合は両方表示される');

// ⑤ リリース年が異なる、または片方欠損 → 両方残ること (AC-3)
const mergedDiffYear = musicService.mergeAlbumSearchResults(
  [baseItunesItem],
  [
    {
      sourceId: validMbid,
      albumName: 'Editorial',
      albumArtist: 'Official髭男dism',
      releaseDate: '2022-08-18',
      trackCount: 14,
      extra: { score: 100 }
    },
    {
      sourceId: 'c1234567-89ab-cdef-0123-456789abcdef',
      albumName: 'Editorial',
      albumArtist: 'Official髭男dism',
      releaseDate: '',
      trackCount: 14,
      extra: { score: 95 }
    }
  ]
);
assert(mergedDiffYear.length === 3, '重複判定⑤: リリース年不一致または欠損時は両方表示される');

// ⑥ 記号のみのアルバム名（"+" vs "="）→ 誤統合されないこと
const mergedSymbols = musicService.mergeAlbumSearchResults(
  [{ collectionId: 2001, albumName: '+', albumArtist: 'Ed Sheeran', releaseDate: '2011-09-09', trackCount: 12 }],
  [{ sourceId: validMbid, albumName: '=', albumArtist: 'Ed Sheeran', releaseDate: '2011-09-09', trackCount: 12, extra: { score: 100 } }]
);
assert(mergedSymbols.length === 2, '重複判定⑥: 記号のみの異なるアルバム名("+" と "=")が誤統合されないこと');

// 並び順の検証: iTunesブロック(元の順序) → MBブロック(score降順、同点は元の順序) (AC-2)
const sortedMerged = musicService.mergeAlbumSearchResults(
  [
    { collectionId: 10, albumName: 'iTunes First', albumArtist: 'A', releaseDate: '2020', trackCount: 10 },
    { collectionId: 20, albumName: 'iTunes Second', albumArtist: 'A', releaseDate: '2021', trackCount: 10 }
  ],
  [
    { sourceId: 'mb-low', albumName: 'MB Low Score', albumArtist: 'A', releaseDate: '2019', trackCount: 10, extra: { score: 70 } },
    { sourceId: 'mb-high-1', albumName: 'MB High 1', albumArtist: 'A', releaseDate: '2018', trackCount: 10, extra: { score: 95 } },
    { sourceId: 'mb-high-2', albumName: 'MB High 2', albumArtist: 'A', releaseDate: '2017', trackCount: 10, extra: { score: 95 } }
  ]
);
assert(
  sortedMerged.length === 5 &&
  sortedMerged[0].sourceId === '10' &&
  sortedMerged[1].sourceId === '20' &&
  sortedMerged[2].sourceId === 'mb-high-1' &&
  sortedMerged[3].sourceId === 'mb-high-2' &&
  sortedMerged[4].sourceId === 'mb-low',
  '並び順検証: 先頭にiTunes結果(API順)、続けてMB結果(score降順・同点は元の順序)で整列される (AC-2)'
);

// 片側失敗フォールバックの検証 (AC-4, AC-5)
const okItunesMock = { searchAlbums: () => [baseItunesItem] };
const failItunesMock = { searchAlbums: () => { throw new Error('iTunes 500 Error'); } };
const okMbMock = {
  isEnabled: () => true,
  searchReleases: () => [{
    source: 'musicbrainz',
    sourceId: validMbid,
    albumName: 'MB Only Album',
    albumArtist: 'Official髭男dism',
    releaseDate: '2023-01-01',
    trackCount: 10,
    extra: { score: 100 }
  }]
};
const failMbMock = {
  isEnabled: () => true,
  searchReleases: () => {
    const err = new Error('MusicBrainz 503');
    err.code = 'MUSICBRAINZ_RATE_LIMITED';
    throw err;
  }
};

// MBのみ失敗 → iTunes結果を返し sources.musicbrainz.ok === false
const msMbFail = new MusicService(config, {}, driveService, okItunesMock, failMbMock);
const resMbFail = msMbFail.searchAlbums('髭男');
assert(
  resMbFail.albums.length === 1 &&
  resMbFail.albums[0].source === 'itunes' &&
  resMbFail.sources.itunes.ok === true &&
  resMbFail.sources.musicbrainz.ok === false,
  '片側失敗フォールバック: MusicBrainz失敗時もiTunes結果を返却し sources.musicbrainz.ok===false となる (AC-4)'
);

// iTunesのみ失敗 → MB結果を返し sources.itunes.ok === false
const msItFail = new MusicService(config, {}, driveService, failItunesMock, okMbMock);
const resItFail = msItFail.searchAlbums('髭男');
assert(
  resItFail.albums.length === 1 &&
  resItFail.albums[0].source === 'musicbrainz' &&
  resItFail.sources.itunes.ok === false &&
  resItFail.sources.musicbrainz.ok === true,
  '片側失敗フォールバック: iTunes失敗時もMusicBrainz結果を返却し sources.itunes.ok===false となる (AC-4)'
);

// 両方失敗 → ALBUM_SEARCH_ALL_FAILED 例外 (AC-5)
const msAllFail = new MusicService(config, {}, driveService, failItunesMock, failMbMock);
assertThrows(
  () => msAllFail.searchAlbums('髭男'),
  'ALBUM_SEARCH_ALL_FAILED',
  '両方失敗時: ALBUM_SEARCH_ALL_FAILED 例外を送出する (AC-5)'
);

// 機能スイッチ無効時の検証 (AC-11)
let mbCalledWhenDisabled = false;
const spyMbMock = {
  isEnabled: () => false,
  searchReleases: () => { mbCalledWhenDisabled = true; return []; }
};
const msDisabled = new MusicService(customMbConfig, {}, driveService, okItunesMock, spyMbMock);
const resDisabled = msDisabled.searchAlbums('髭男');
assert(
  mbCalledWhenDisabled === false &&
  resDisabled.albums.length === 1 &&
  resDisabled.sources.musicbrainz.skipped === true,
  '機能スイッチ無効時: MusicBrainzを呼び出さずiTunes結果のみ返し skipped===true となる (AC-11)'
);

// Code.js 新規RPC (apiSearchAlbums / apiLookupMusicBrainzRelease) の検証
const Code = require('../src/Code');
assert(typeof Code.apiSearchAlbums === 'function', 'Code.apiSearchAlbums が公開されている');
assert(typeof Code.apiLookupMusicBrainzRelease === 'function', 'Code.apiLookupMusicBrainzRelease が公開されている');
const invalidMbidRpcRes = Code.apiLookupMusicBrainzRelease('invalid-mbid');
assert(invalidMbidRpcRes.success === false && invalidMbidRpcRes.code === 'VALIDATION_FAILED', 'apiLookupMusicBrainzRelease: 不正MBID時に VALIDATION_FAILED レスポンスを返す');

// 5. フロントエンド Utils クラスのテスト
console.log('\n[5] Utils クラスのテスト (XSS & 日付)');
const utilsContent = fs.readFileSync(path.join(__dirname, '../src/ScriptsUtils.html'), 'utf8');
const scriptTagRegex = /<script>([\s\S]*?)<\/script>/;
const utilsJs = (utilsContent.match(scriptTagRegex) || [])[1];
const utilsSandbox = {};
vm.createContext(utilsSandbox);
vm.runInContext(utilsJs + '\nthis.Utils = Utils;', utilsSandbox);
const Utils = utilsSandbox.Utils;

assert(
  Utils.escapeHtml('<script>alert("xss & \'danger\'")</script>') ===
  '&lt;script&gt;alert(&quot;xss &amp; &#039;danger&#039;&quot;)&lt;/script&gt;',
  'XSS特殊文字エスケープ'
);
assert(Utils.formatDate('2026-10-17T04:10:28Z') === '2026-10-17', 'ISO文字列の日付フォーマット');
assert(Utils.formatDate(new Date(2026, 9, 17)) === '2026-10-17', 'Dateオブジェクトの日付フォーマット');

// Google Drive URL解決 & ID抽出テスト
assert(Utils.extractDriveFileId('https://drive.google.com/uc?export=view&id=FILE_123_abc') === 'FILE_123_abc', 'Drive uc?id からのID抽出');
assert(Utils.extractDriveFileId('https://drive.google.com/file/d/FILE_456_def/view?usp=sharing') === 'FILE_456_def', 'Drive /file/d/ からのID抽出');
assert(Utils.extractDriveFileId('https://drive.google.com/open?id=FILE_789_ghi') === 'FILE_789_ghi', 'Drive open?id からのID抽出');
assert(Utils.extractDriveFileId('https://lh3.googleusercontent.com/d/FILE_XYZ_000') === 'FILE_XYZ_000', 'lh3.googleusercontent.com からのID抽出');
assert(Utils.extractDriveFileId('https://is1-ssl.mzstatic.com/image.jpg') === null, '非Drive URLでのnull返却');

assert(
  Utils.resolveArtworkUrl('https://drive.google.com/uc?export=view&id=testId123', 400) ===
  'https://lh3.googleusercontent.com/d/testId123',
  'Google Drive URLの公開URL変換'
);
assert(
  Utils.resolveArtworkUrl('https://is1-ssl.mzstatic.com/image.jpg', 400) ===
  'https://is1-ssl.mzstatic.com/image.jpg',
  '通常画像URLの維持'
);
assert(Utils.resolveArtworkUrl('', 400) === '', '空文字URLの処理');

// handleImageError 多重フォールバックテスト
const mockImg = {
  attrs: {},
  src: '',
  onerror: () => {},
  getAttribute(name) { return this.attrs[name] || null; },
  setAttribute(name, val) { this.attrs[name] = String(val); },
  removeAttribute(name) { delete this.attrs[name]; }
};

// Step 0 -> Step 1 (Drive画像エラー時に thumbnail へフォールバック)
mockImg.setAttribute('data-artwork', 'https://drive.google.com/file/d/mockId12345678901234567890/view');
mockImg.setAttribute('data-error-step', '0');
Utils.handleImageError(mockImg);
assert(mockImg.attrs['data-error-step'] === '1', 'handleImageError: Step 0 から Step 1 への遷移');
assert(mockImg.src.includes('drive.google.com/thumbnail?id=mockId12345678901234567890'), 'handleImageError: thumbnailへのフォールバック');

// Step 1 -> Step 2 (予備失敗時に SVG へ最終フォールバック)
Utils.handleImageError(mockImg);
assert(mockImg.attrs['data-error-step'] === '2', 'handleImageError: Step 1 から Step 2 への遷移');
assert(mockImg.src.startsWith('data:image/svg+xml'), 'handleImageError: デフォルトSVGへのフォールバック');
assert(mockImg.onerror === null, 'handleImageError: onerror 解除によるループ防止');
assert(!mockImg.attrs['data-artwork'], 'handleImageError: data-artwork 属性の除去');

// 6. フロントエンド Store クラスのテスト (ツリー構築 & ソート)
console.log('\n[6] Store クラスのテスト (MusicCatalog ツリー構築 & 検索)');
const storeContent = fs.readFileSync(path.join(__dirname, '../src/ScriptsState.html'), 'utf8');
const storeJs = (storeContent.match(scriptTagRegex) || [])[1];
const storeSandbox = {};
vm.createContext(storeSandbox);
vm.runInContext(storeJs + '\nthis.Store = Store;', storeSandbox);
const Store = storeSandbox.Store;

const store = new Store();
const testTracks = [
  {
    cdNumber: 1,
    albumArtist: 'Official髭男dism',
    albumName: 'Editorial',
    trackArtist: 'Official髭男dism',
    trackNumber: 2,
    trackName: 'Cry Baby',
    releaseDate: '2021-08-18',
    artworkUrl: 'https://example.com/editorial.jpg'
  },
  {
    cdNumber: 1,
    albumArtist: 'Official髭男dism',
    albumName: 'Editorial',
    trackArtist: 'Official髭男dism',
    trackNumber: 1,
    trackName: 'Editorial (Intro)',
    releaseDate: '2021-08-18',
    artworkUrl: 'https://example.com/editorial.jpg'
  },
  {
    cdNumber: 2,
    albumArtist: 'BUMP OF CHICKEN',
    albumName: 'BUMP OF CHICKEN II',
    trackArtist: 'BUMP OF CHICKEN',
    trackNumber: 1,
    trackName: '天体観測',
    releaseDate: '2013-07-03',
    artworkUrl: ''
  }
];

store.setTracks(testTracks);

assert(store.state.artistList.length === 2, 'アーティスト2件登録');
assert(store.state.artistList.includes('Official髭男dism'), 'アーティスト名含む');
assert(store.state.artistList.includes('BUMP OF CHICKEN'), 'アーティスト名含む');

// ツリー構造確認
const higedan = store.state.musicCatalog['Official髭男dism'];
assert(higedan && higedan.albumCount === 1, '髭男のアルバム件数1件');
const editorial = higedan.albums['Editorial'];
assert(editorial && editorial.totalTracks === 2, 'Editorialの総トラック数2曲');
assert(editorial.discs[1].tracks[0].trackNumber === 1, 'Track 1 が先頭にソートされている');
assert(editorial.discs[1].tracks[1].trackNumber === 2, 'Track 2 が2番目にソートされている');

// 全体横断検索テスト
const searchResults = store.searchAcrossAllTracks('天体観測');
assert(searchResults.length === 1 && searchResults[0].trackName === '天体観測', '曲名で横断検索');

const searchByCd = store.searchAcrossAllTracks('2');
assert(searchByCd.length === 1 && searchByCd[0].cdNumber === 2, 'CD番号(2)で横断検索');

// 6.1. アルバム一覧のリリース日昇順ソートテスト (Store.getAlbumsForSelectedArtist)
console.log('\n[6.1] Store.getAlbumsForSelectedArtist (リリース日昇順ソート) のテスト');
const multiAlbumTracks = [
  { cdNumber: 1, albumArtist: 'アーティストA', albumName: '最新アルバムZ', releaseDate: '2023-01-15', trackNumber: 1, trackName: 'Song Z' },
  { cdNumber: 1, albumArtist: 'アーティストA', albumName: '過去アルバムA', releaseDate: '2010-05-20', trackNumber: 1, trackName: 'Song A' },
  { cdNumber: 1, albumArtist: 'アーティストA', albumName: '同日アルバム2', releaseDate: '2020-10-01', trackNumber: 1, trackName: 'Song 2' },
  { cdNumber: 1, albumArtist: 'アーティストA', albumName: '同日アルバム1', releaseDate: '2020-10-01', trackNumber: 1, trackName: 'Song 1' },
  { cdNumber: 1, albumArtist: 'アーティストA', albumName: '日付未設定アルバムB', releaseDate: '', trackNumber: 1, trackName: 'Song Unknown B' },
  { cdNumber: 1, albumArtist: 'アーティストA', albumName: '日付未設定アルバムA', releaseDate: '', trackNumber: 1, trackName: 'Song Unknown A' }
];

const testSortStore = new Store();
testSortStore.setTracks(multiAlbumTracks);
testSortStore.state.selectedArtist = 'アーティストA';

const sortedAlbums = testSortStore.getAlbumsForSelectedArtist();
assert(sortedAlbums.length === 6, '全6件のアルバムが取得できること');
assert(sortedAlbums[0].albumName === '過去アルバムA', '最古アルバム(2010)が先頭');
assert(sortedAlbums[1].albumName === '同日アルバム1', '同日(2020)で名前昇順の「同日アルバム1」が2番目');
assert(sortedAlbums[2].albumName === '同日アルバム2', '同日(2020)で名前昇順の「同日アルバム2」が3番目');
assert(sortedAlbums[3].albumName === '最新アルバムZ', '最新アルバム(2023)が4番目');
assert(sortedAlbums[4].albumName === '日付未設定アルバムA', '日付未設定同士で名前昇順の「日付未設定アルバムA」が5番目');
assert(sortedAlbums[5].albumName === '日付未設定アルバムB', '日付未設定同士で名前昇順の「日付未設定アルバムB」が6番目');

// 6.2. アルバム編集に関する単体テスト (Store.updateAlbumInCatalog)
console.log('\n[6.2] Store.updateAlbumInCatalog (差分同期＆改名自動追従) のテスト');
store.state.selectedArtist = 'Official髭男dism';
store.state.selectedAlbum = 'Editorial';

store.updateAlbumInCatalog(
  { originalAlbumArtist: 'Official髭男dism', originalAlbumName: 'Editorial' },
  { albumArtist: 'Official髭男dism (Renamed)', albumName: 'Editorial Deluxe', releaseDate: '2021-08-20', artworkUrl: 'https://example.com/editorial_deluxe.jpg' },
  [
    { cdNumber: 1, trackNumber: 1, trackName: 'Editorial (Intro) 2026', trackArtist: 'Official髭男dism (Renamed)' },
    { cdNumber: 1, trackNumber: 2, trackName: 'Cry Baby', trackArtist: 'Official髭男dism (Renamed)' },
    { cdNumber: 1, trackNumber: 3, trackName: 'New Bonus Track', trackArtist: 'Official髭男dism (Renamed)' }
  ]
);

assert(store.state.selectedArtist === 'Official髭男dism (Renamed)', '改名後のアーティスト選択状態追従');
assert(store.state.selectedAlbum === 'Editorial Deluxe', '改名後のアルバム選択状態追従');
assert(!store.state.musicCatalog['Official髭男dism']?.albums['Editorial'], '旧アルバムがカタログから消去されている');
const updatedAlbum = store.state.musicCatalog['Official髭男dism (Renamed)']?.albums['Editorial Deluxe'];
assert(updatedAlbum && updatedAlbum.totalTracks === 3, '新アルバムに3曲が格納されている');
assert(updatedAlbum.discs[1].tracks[2].trackName === 'New Bonus Track', '追加トラックが正しく反映されている');

// 6.3. MusicService.updateAlbum バリデーションテスト
console.log('\n[6.3] MusicService.updateAlbum 二重バリデーションテスト');
const SheetService = require('../src/SheetService');
const mockSheetService = {
  updateAlbumBatch: (targetKey, newAlbumMeta, newTracks) => ({
    updatedRowCount: newTracks.length,
    totalRowCount: newTracks.length,
    previousRowCount: 2,
    albumName: newAlbumMeta.albumName,
    albumArtist: newAlbumMeta.albumArtist
  })
};
const musicServiceWithMock = new MusicService(config, mockSheetService, driveService, itunesService);

// 正常系
let capturedUpdateAlbum = null;
const mockSheetServiceWithCapture = {
  updateAlbumBatch: (targetKey, newAlbumMeta, newTracks) => {
    capturedUpdateAlbum = newAlbumMeta;
    return {
      updatedRowCount: newTracks.length,
      totalRowCount: newTracks.length,
      previousRowCount: 2,
      albumName: newAlbumMeta.albumName,
      albumArtist: newAlbumMeta.albumArtist
    };
  }
};
const musicServiceWithCapture = new MusicService(config, mockSheetServiceWithCapture, driveService, itunesService);

const validResult = musicServiceWithCapture.updateAlbum({
  targetKey: { originalAlbumArtist: 'Artist', originalAlbumName: 'Album' },
  album: {
    albumArtist: 'New Artist',
    albumName: 'New Album',
    artworkUrl: 'https://drive.google.com/file/d/editTestId123456789012345/view'
  },
  tracks: [{ cdNumber: 1, trackNumber: 1, trackName: 'Track 1' }]
});
assert(validResult.updatedRowCount === 1, '正常なアルバム編集処理の成功');
assert(
  capturedUpdateAlbum && capturedUpdateAlbum.artworkUrl === 'https://lh3.googleusercontent.com/d/editTestId123456789012345',
  'MusicService.updateAlbum: ensurePublicArtwork 経由で公開URLに正規化されて保存されること'
);

// 異常系: targetKey欠落
assertThrows(
  () => musicServiceWithMock.updateAlbum({ album: { albumArtist: 'A', albumName: 'B' }, tracks: [{ cdNumber: 1, trackNumber: 1, trackName: 'T' }] }),
  'VALIDATION_FAILED',
  'targetKey欠落での例外'
);
// 異常系: targetKey.originalAlbumArtist空文字
assertThrows(
  () => musicServiceWithMock.updateAlbum({ targetKey: { originalAlbumArtist: '', originalAlbumName: 'B' }, album: { albumArtist: 'A', albumName: 'B' }, tracks: [{ cdNumber: 1, trackNumber: 1, trackName: 'T' }] }),
  'VALIDATION_FAILED',
  'targetKey.originalAlbumArtist空文字での例外'
);
// 異常系: album.albumName欠落
assertThrows(
  () => musicServiceWithMock.updateAlbum({ targetKey: { originalAlbumArtist: 'A', originalAlbumName: 'B' }, album: { albumArtist: 'A', albumName: '' }, tracks: [{ cdNumber: 1, trackNumber: 1, trackName: 'T' }] }),
  'VALIDATION_FAILED',
  'album.albumName欠落での例外'
);
// 異常系: album.albumName 255文字超過
assertThrows(
  () => musicServiceWithMock.updateAlbum({ targetKey: { originalAlbumArtist: 'A', originalAlbumName: 'B' }, album: { albumArtist: 'A', albumName: 'x'.repeat(256) }, tracks: [{ cdNumber: 1, trackNumber: 1, trackName: 'T' }] }),
  'VALIDATION_FAILED',
  'album.albumName 255文字超過での例外'
);
// 異常系: tracks空配列
assertThrows(
  () => musicServiceWithMock.updateAlbum({ targetKey: { originalAlbumArtist: 'A', originalAlbumName: 'B' }, album: { albumArtist: 'A', albumName: 'B' }, tracks: [] }),
  'VALIDATION_FAILED',
  'tracks空配列での全削除抑止例外'
);
// 異常系: CD番号に小数注入
assertThrows(
  () => musicServiceWithMock.updateAlbum({ targetKey: { originalAlbumArtist: 'A', originalAlbumName: 'B' }, album: { albumArtist: 'A', albumName: 'B' }, tracks: [{ cdNumber: 1.5, trackNumber: 1, trackName: 'T' }] }),
  'VALIDATION_FAILED',
  'CD番号に小数注入時の例外'
);
// 異常系: トラック番号に0注入
assertThrows(
  () => musicServiceWithMock.updateAlbum({ targetKey: { originalAlbumArtist: 'A', originalAlbumName: 'B' }, album: { albumArtist: 'A', albumName: 'B' }, tracks: [{ cdNumber: 1, trackNumber: 0, trackName: 'T' }] }),
  'VALIDATION_FAILED',
  'トラック番号に0注入時の例外'
);
// 異常系: 同一CD番号内でのトラック番号重複
assertThrows(
  () => musicServiceWithMock.updateAlbum({
    targetKey: { originalAlbumArtist: 'A', originalAlbumName: 'B' },
    album: { albumArtist: 'A', albumName: 'B' },
    tracks: [
      { cdNumber: 1, trackNumber: 1, trackName: 'Track 1' },
      { cdNumber: 1, trackNumber: 1, trackName: 'Track 1 Duplicate' }
    ]
  }),
  'VALIDATION_FAILED',
  '同一CD番号内でのトラック番号重複禁止例外'
);
// 異なるCD番号間での同じトラック番号は許可
const diffCdResult = musicServiceWithMock.updateAlbum({
  targetKey: { originalAlbumArtist: 'A', originalAlbumName: 'B' },
  album: { albumArtist: 'A', albumName: 'B' },
  tracks: [
    { cdNumber: 1, trackNumber: 1, trackName: 'Disc 1 Track 1' },
    { cdNumber: 2, trackNumber: 1, trackName: 'Disc 2 Track 1' }
  ]
});
assert(diffCdResult.updatedRowCount === 2, '別CD番号間での同一トラック番号(1)は許容');

// 6.4. SheetService.updateAlbumBatch 排他ロック & アトミック置換テスト
console.log('\n[6.4] SheetService.updateAlbumBatch 排他ロック＆アトミック更新テスト');
let lockReleased = false;
global.LockService = {
  getScriptLock: () => ({
    tryLock: (timeout) => true,
    releaseLock: () => { lockReleased = true; }
  })
};

let mockSheetData = [
  ['CD番号', 'アルバムアーティスト名', 'アルバム名', 'アーティスト名', 'トラック番号', 'トラック名', 'リリース日', 'アルバムアートURL'],
  [1, 'Original Artist', 'Target Album', 'Original Artist', 1, 'Old Track 1', '2020-01-01', ''],
  [1, 'Original Artist', 'Target Album', 'Original Artist', 2, 'Old Track 2', '2020-01-01', ''],
  [1, 'Other Artist', 'Other Album', 'Other Artist', 1, 'Other Track', '2020-01-01', '']
];
let cleared = false;
let setValuesCalledWith = null;

const mockSheetObj = {
  getLastRow: () => mockSheetData.length,
  getRange: (row, col, numRows, numCols) => ({
    getValues: () => mockSheetData.slice(row - 1, row - 1 + numRows),
    clearContent: () => { cleared = true; },
    setValues: (values) => { setValuesCalledWith = values; }
  })
};

global.SpreadsheetApp = {
  openById: () => ({
    getSheetByName: () => mockSheetObj
  }),
  flush: () => {}
};

const realSheetService = new SheetService(config);

const editResult = realSheetService.updateAlbumBatch(
  { originalAlbumArtist: 'Original Artist', originalAlbumName: 'Target Album' },
  { albumArtist: 'Renamed Artist', albumName: 'Renamed Album', releaseDate: '2026-10-17', artworkUrl: 'https://example.com/art.jpg' },
  [
    { cdNumber: 1, trackNumber: 1, trackName: '=SUM(1,2)', trackArtist: 'Renamed Artist' }
  ]
);

assert(lockReleased === true, '排他ロックが確実に releaseLock された');
assert(cleared === true, '更新前に clearContent() が実行された');
assert(editResult.updatedRowCount === 1, '更新新トラック数 1');
assert(editResult.previousRowCount === 2, '旧トラック削除数 2');
assert(editResult.totalRowCount === 2, '更新後全件数 2 (他アルバム1行 + 新トラック1行)');

// 式インジェクション サニタイズの検証
assert(setValuesCalledWith !== null, 'setValues が呼び出された');
const injectedTrackRow = setValuesCalledWith.find(r => r[1] === 'Renamed Artist');
assert(injectedTrackRow !== undefined, '新アルバム行が存在する');
assert(injectedTrackRow[5] === "'=SUM(1,2)", '曲名の式インジェクションが先頭シングルクォートで無害化された');

// 存在しないアルバム更新時の NOT_FOUND 例外
assertThrows(
  () => realSheetService.updateAlbumBatch(
    { originalAlbumArtist: 'NonExistent', originalAlbumName: 'NonExistent' },
    { albumArtist: 'A', albumName: 'B' },
    [{ cdNumber: 1, trackNumber: 1, trackName: 'T' }]
  ),
  'NOT_FOUND',
  '存在しないアルバムの更新要求で NOT_FOUND 例外'
);

// ロック取得失敗時の LOCK_TIMEOUT 例外
global.LockService = {
  getScriptLock: () => ({
    tryLock: (timeout) => false,
    releaseLock: () => {}
  })
};
assertThrows(
  () => realSheetService.updateAlbumBatch(
    { originalAlbumArtist: 'Original Artist', originalAlbumName: 'Target Album' },
    { albumArtist: 'A', albumName: 'B' },
    [{ cdNumber: 1, trackNumber: 1, trackName: 'T' }]
  ),
  'LOCK_TIMEOUT',
  'ロック取得タイムアウト時の LOCK_TIMEOUT 例外'
);

// LockService モックを通常状態に復帰
global.LockService = {
  getScriptLock: () => ({
    tryLock: (timeout) => true,
    releaseLock: () => {}
  })
};

// 6.5. SheetService.insertTracksBatch 部分日付 (YYYY-MM / YYYY) のプレーンテキスト書式保護検証 (Q-5)
let capturedNumberFormat = null;
let capturedInsertBatchRows = null;
const mockSheetForPartialDate = {
  getLastRow: () => 1,
  getRange: (row, col, numRows, numCols) => ({
    setNumberFormat: (fmt) => {
      if (col === 7) capturedNumberFormat = fmt;
    },
    setValues: (vals) => {
      capturedInsertBatchRows = vals;
    }
  })
};
global.SpreadsheetApp = {
  openById: () => ({
    getSheetByName: () => mockSheetForPartialDate
  }),
  flush: () => {}
};
const partialDateSheetService = new SheetService(config);
partialDateSheetService.insertTracksBatch(
  [{ cdNumber: 1, trackNumber: 1, trackName: 'Partial Date Song', trackArtist: 'Official髭男dism' }],
  { albumName: 'Partial Date Album', albumArtist: 'Official髭男dism', releaseDate: '2021-08' },
  'https://lh3.googleusercontent.com/d/art123'
);
assert(capturedNumberFormat === '@', 'SheetService.insertTracksBatch: G列(リリース日)にプレーンテキスト書式 "@" が設定されること (Q-5)');
assert(capturedInsertBatchRows && capturedInsertBatchRows[0][6] === '2021-08', 'SheetService.insertTracksBatch: 部分日付 "2021-08" が加工されず書き込まれること (Q-5)');

// 7. 全HTMLファイルのGAS include構文およびプレースホルダーなし検証
console.log('\n[7] 全ファイルのプレースホルダーなし & 構文チェック');
const srcDir = path.join(__dirname, '../src');
const files = fs.readdirSync(srcDir);

let placeholderFound = false;
files.forEach((file) => {
  const filePath = path.join(srcDir, file);
  const content = fs.readFileSync(filePath, 'utf8');

  // 禁止プレースホルダーの検査
  if (content.includes('// TODO') || content.includes('// ここに実装') || content.includes('// 省略')) {
    console.error(`  ✗ FAIL: プレースホルダー検出 in ${file}`);
    placeholderFound = true;
  }
});

// 8. 全ファイルの構文エラーチェック (vm.Script & JSON.parse)
console.log('\n[8] 全ファイルの構文解析 (Syntax Check)');
const jsFiles = ['Config.js', 'SheetService.js', 'DriveService.js', 'ItunesService.js', 'MusicBrainzService.js', 'MusicService.js', 'Code.js'];
jsFiles.forEach((file) => {
  const code = fs.readFileSync(path.join(srcDir, file), 'utf8');
  try {
    new vm.Script(code);
    assert(true, `${file} 構文チェック正常`);
  } catch (err) {
    assert(false, `${file} 構文エラー: ${err.message}`);
  }
});

// 8.1. GAS V8 ランタイム 単一グローバルスコープ共有シミュレーション検証 (再発防止)
console.log('\n[8.1] GAS V8 ランタイム 単一グローバルスコープ共有シミュレーションテスト');
(() => {
  const allSrcJsFiles = fs.readdirSync(srcDir).filter(f => f.endsWith('.js')).sort();
  const orderPatterns = [
    { name: 'アルファベット順 (Code.js 先頭)', list: [...allSrcJsFiles] },
    { name: '逆アルファベット順 (SheetService.js 先頭)', list: [...allSrcJsFiles].reverse() },
    { name: '依存定義順 (Config.js 先頭〜Code.js 末尾)', list: ['Config.js', 'SheetService.js', 'DriveService.js', 'ItunesService.js', 'MusicBrainzService.js', 'MusicService.js', 'Code.js'] }
  ];

  orderPatterns.forEach((pattern) => {
    const gasContext = vm.createContext({
      console,
      PropertiesService: {
        getScriptProperties: () => ({
          getProperties: () => ({
            SPREADSHEET_ID: 'gas-vm-ss-id',
            DRIVE_FOLDER_ID: 'gas-vm-drive-id',
            SHEET_NAME: 'MusicTracks'
          })
        })
      },
      CacheService: {
        getScriptCache: () => ({ get: () => null, put: () => {} })
      },
      Utilities: {
        sleep: () => {},
        formatDate: () => '2026-10-18'
      },
      UrlFetchApp: {
        fetchAll: () => [
          {
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify({
              results: [{
                wrapperType: 'collection',
                collectionId: 12345,
                collectionName: 'GAS V8 Shared Scope Album',
                artistName: 'GAS Artist',
                releaseDate: '2026-01-01',
                trackCount: 10
              }]
            })
          },
          {
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify({ releases: [] })
          }
        ],
        fetch: () => ({
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ results: [], releases: [] })
        })
      }
    });

    let loadError = null;
    for (const file of pattern.list) {
      const code = fs.readFileSync(path.join(srcDir, file), 'utf8');
      try {
        vm.runInContext(code, gasContext, { filename: file });
      } catch (err) {
        loadError = new Error(`[${pattern.name}] ${file} 読み込み時にエラー: ${err.message}`);
        break;
      }
    }
    assert(loadError === null, `GAS V8 単一グローバルスコープ評価 (${pattern.name}) で Identifier 重複等の SyntaxError が発生しないこと${loadError ? ': ' + loadError.message : ''}`);

    // 全クラスおよびRPC関数が同一グローバルコンテキスト内で共存・動作することを検証
    try {
      const verifyResult = vm.runInContext(`
        (function() {
          const classesAvailable = [
            typeof Config === 'function',
            typeof SheetService === 'function',
            typeof DriveService === 'function',
            typeof ItunesService === 'function',
            typeof MusicBrainzService === 'function',
            typeof MusicService === 'function'
          ].every(Boolean);

          const rpcsAvailable = [
            typeof doGet === 'function',
            typeof doPost === 'function',
            typeof getMusicService === 'function',
            typeof apiGetAllData === 'function',
            typeof apiSearchAlbums === 'function',
            typeof apiSearchItunes === 'function',
            typeof apiLookupItunesAlbum === 'function',
            typeof apiLookupMusicBrainzRelease === 'function',
            typeof apiSaveAlbumBatch === 'function',
            typeof apiSaveTrackSingle === 'function',
            typeof apiUpdateAlbumBatch === 'function',
            typeof apiUploadArtwork === 'function',
            typeof apiResolveDriveArtwork === 'function',
            typeof apiDeleteAlbumsBatch === 'function'
          ].every(Boolean);

          const ms = getMusicService();
          const searchRes = apiSearchAlbums('GAS V8 Test');
          return {
            classesAvailable,
            rpcsAvailable,
            msCreated: Boolean(ms && ms.config && ms.musicBrainzService),
            searchSuccess: Boolean(searchRes && searchRes.success === true && searchRes.data.albums.length === 1)
          };
        })();
      `, gasContext);

      assert(
        verifyResult.classesAvailable && verifyResult.rpcsAvailable && verifyResult.msCreated && verifyResult.searchSuccess,
        `GAS V8 単一グローバルスコープ (${pattern.name}) 内で全6クラスと全RPC関数が正常にインスタンス化・実行できること`
      );
    } catch (err) {
      assert(false, `GAS V8 単一グローバルスコープ (${pattern.name}) 実行時エラー: ${err.message}`);
    }
  });
})();

const htmlScriptFiles = ['ScriptsUtils.html', 'ScriptsApiClient.html', 'ScriptsState.html', 'ScriptsApp.html'];
htmlScriptFiles.forEach((file) => {
  const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
  const jsMatch = content.match(/<script>([\s\S]*?)<\/script>/);
  if (!jsMatch) {
    assert(false, `${file} 内に <script> タグが見つかりません`);
  } else {
    try {
      new vm.Script(jsMatch[1]);
      assert(true, `${file} インラインJS構文チェック正常`);
    } catch (err) {
      assert(false, `${file} 構文エラー: ${err.message}`);
    }
  }
});

// appsscript.json のJSON妥当性
try {
  const jsonContent = fs.readFileSync(path.join(srcDir, 'appsscript.json'), 'utf8');
  const manifest = JSON.parse(jsonContent);
  assert(manifest.runtimeVersion === 'V8', 'appsscript.json runtimeVersion === V8');
  assert(manifest.webapp && manifest.webapp.executeAs === 'USER_DEPLOYING', 'appsscript.json webapp.executeAs === USER_DEPLOYING');
  assert(manifest.webapp && manifest.webapp.access === 'ANYONE_ANONYMOUS', 'appsscript.json webapp.access === ANYONE_ANONYMOUS');
  assert(manifest.oauthScopes.length === 3, 'appsscript.json oauthScopes 3件定義');
} catch (err) {
  assert(false, `appsscript.json パースエラー: ${err.message}`);
}

// 9. dist/index.html バンドル成果物の構文・文言・セキュリティ検査
console.log('\n[9] dist/index.html バンドル成果物の構文およびセキュリティ検査');
const distDir = path.join(__dirname, '../dist');
try {
  const legacySrcIndexHtmlPath = path.join(srcDir, 'index.html');
  assert(!fs.existsSync(legacySrcIndexHtmlPath), 'src/index.html が廃止され存在しないこと');

  const distIndexHtmlPath = path.join(distDir, 'index.html');
  const distNoJekyllPath = path.join(distDir, '.nojekyll');
  assert(fs.existsSync(distIndexHtmlPath), 'dist/index.html が存在する');
  assert(fs.existsSync(distNoJekyllPath), 'dist/.nojekyll が存在する');

  const distFiles = fs.readdirSync(distDir);
  assert(
    !distFiles.some(f => f.endsWith('.js') || f === 'appsscript.json'),
    'dist/ 配下にバックエンド JS や appsscript.json が混入していないこと'
  );

  const indexHtml = fs.readFileSync(distIndexHtmlPath, 'utf8');
  const navbarHtml = fs.readFileSync(path.join(srcDir, 'Navbar.html'), 'utf8');
  const itunesModalHtml = fs.readFileSync(path.join(srcDir, 'ItunesModal.html'), 'utf8');

  // インライン onerror 属性・GAS専用タグ/API の不在検証
  const onerrorMatch = indexHtml.match(/\bonerror\s*=\s*["'][^"']*["']/i);
  assert(!onerrorMatch, 'dist/index.html 内にインライン onerror 属性が存在しないこと (AC-10)');
  assert(!indexHtml.includes('<base target="_top">'), 'dist/index.html 内に <base target="_top"> が存在しないこと');
  assert(!indexHtml.includes('google.script.run'), 'dist/index.html 内に google.script.run が存在しないこと');
  assert(!indexHtml.includes('module.exports'), 'dist/index.html 内に module.exports の残骸が存在しないこと');
  assert(indexHtml.includes('<link rel="icon"'), 'dist/index.html に favicon が設定されていること');

  // ボタン名称・モーダル見出しの更新と旧文言不在検証 (AC-16, AC-17, AC-18)
  assert(navbarHtml.includes('アルバム検索・一括登録') && navbarHtml.includes('>一括登録<'), 'Navbar.html に新ボタン名称（アルバム検索・一括登録 / 一括登録）が含まれること (AC-16)');
  assert(itunesModalHtml.includes('アルバムを検索して一括登録') && itunesModalHtml.includes('iTunes / MusicBrainz'), 'ItunesModal.html に新見出しと補足表記が含まれること (AC-17)');
  assert(indexHtml.includes('アルバム検索・一括登録') && indexHtml.includes('アルバムを検索して一括登録'), 'dist/index.html にビルド後の新文言が反映されていること (AC-18)');
  assert(
    !indexHtml.includes('iTunesから一括登録') &&
    !indexHtml.includes('iTunes登録') &&
    !indexHtml.includes('iTunes一括登録'),
    'dist/index.html に旧ボタン文言（iTunesから一括登録 / iTunes登録 / iTunes一括登録）が残存していないこと (AC-18)'
  );

  // 全 <script> タグの構文解析
  const scriptTags = [...indexHtml.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi)];
  let allScriptsOk = true;
  scriptTags.forEach((m, idx) => {
    const code = m[1].trim();
    if (!code) return; // 外部CDNタグ等
    try {
      new vm.Script(code, { filename: `dist_index_script_${idx + 1}.js` });
    } catch (err) {
      allScriptsOk = false;
      console.error(`  ✗ FAIL: dist/index.html 内 script #${idx + 1} 構文エラー: ${err.message}`);
    }
  });
  assert(allScriptsOk, 'dist/index.html 内の全 script ブロックが構文エラーなくパース可能');
} catch (err) {
  assert(false, `dist/index.html 検証エラー: ${err.message}`);
}

// 10. 画像アップロード・Google Drive連携およびファイル命名規則統一のテスト
console.log('\n[10] 画像アップロード・Google Drive連携およびファイル命名規則統一のテスト');

// 10.1 Utils.validateImageFile テスト
const validJpeg = { name: 'jacket.jpg', type: 'image/jpeg', size: 1024 * 1024 };
assert(Utils.validateImageFile(validJpeg).valid === true, 'Utils.validateImageFile: 正常なJPEG画像');
const validPng = { name: 'art.png', type: 'image/png', size: 2 * 1024 * 1024 };
assert(Utils.validateImageFile(validPng).valid === true, 'Utils.validateImageFile: 正常なPNG画像');
const validWebp = { name: 'cover.webp', type: 'image/webp', size: 500 * 1024 };
assert(Utils.validateImageFile(validWebp).valid === true, 'Utils.validateImageFile: 正常なWebP画像');

const extOnlyJpeg = { name: 'photo.JPEG', type: '', size: 500 * 1024 };
assert(Utils.validateImageFile(extOnlyJpeg).valid === true && Utils.validateImageFile(extOnlyJpeg).mimeType === 'image/jpeg', 'Utils.validateImageFile: type空時の拡張子フォールバック');

const overSize = { name: 'huge.jpg', type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 };
const overRes = Utils.validateImageFile(overSize);
assert(overRes.valid === false && overRes.error.includes('5MB以内'), 'Utils.validateImageFile: 5MB超過の遮断 (AC-002-3)');

const badPdf = { name: 'doc.pdf', type: 'application/pdf', size: 1024 };
const pdfRes = Utils.validateImageFile(badPdf);
assert(pdfRes.valid === false && pdfRes.error.includes('対応形式はJPEG、PNG、WebPのみ'), 'Utils.validateImageFile: 不正形式 (PDF) の遮断 (AC-002-4)');

const badGif = { name: 'anim.gif', type: 'image/gif', size: 1024 };
assert(Utils.validateImageFile(badGif).valid === false, 'Utils.validateImageFile: 不正形式 (GIF) の遮断 (AC-002-4)');

assert(Utils.validateImageFile(null).valid === false, 'Utils.validateImageFile: null指定時の遮断');

// 10.2 Code.js RPC エンドポイントテスト
global.PropertiesService = {
  getScriptProperties: () => ({
    getProperties: () => ({
      SPREADSHEET_ID: 'test-ss-id',
      DRIVE_FOLDER_ID: 'test-drive-id',
      SHEET_NAME: 'CustomTracks'
    })
  })
};

global.DriveApp = {
  getFolderById: (id) => ({
    id: id,
    createFile: (blob) => ({
      getId: () => 'mock-rpc-file-id',
      getName: () => (blob && blob.getName ? blob.getName() : 'artwork.jpg'),
      setSharing: () => {}
    })
  }),
  getFileById: (id) => ({
    getId: () => id,
    getMimeType: () => 'image/jpeg',
    getName: () => 'original.jpg',
    makeCopy: (newName, targetFolder) => ({
      getId: () => 'copied-rpc-file-id',
      getName: () => newName,
      setSharing: () => {}
    }),
    setSharing: () => {}
  }),
  Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
  Permission: { VIEW: 'VIEW' }
};

// apiUploadArtwork RPCテスト
const sampleUploadPayload = {
  base64Data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD',
  mimeType: 'image/jpeg',
  albumName: 'RPC Album'
};
const rpcUploadOk = Code.apiUploadArtwork(sampleUploadPayload);
assert(rpcUploadOk && rpcUploadOk.success === true && rpcUploadOk.data && rpcUploadOk.data.fileId, 'Code.apiUploadArtwork: 正常系 (success: true)');

const rpcUploadNg = Code.apiUploadArtwork(null);
assert(rpcUploadNg && rpcUploadNg.success === false && rpcUploadNg.code === 'VALIDATION_FAILED', 'Code.apiUploadArtwork: 異常系 (success: false)');

// apiResolveDriveArtwork RPCテスト
const sampleDrivePayload = {
  driveUrlOrId: 'https://drive.google.com/file/d/valid-drive-12345678901234567890/view',
  albumName: 'RPC Drive Album'
};
const rpcDriveOk = Code.apiResolveDriveArtwork(sampleDrivePayload);
assert(rpcDriveOk && rpcDriveOk.success === true && rpcDriveOk.data && rpcDriveOk.data.publicUrl, 'Code.apiResolveDriveArtwork: 正常系 (success: true)');

const rpcDriveNg = Code.apiResolveDriveArtwork({ driveUrlOrId: '' });
assert(rpcDriveNg && rpcDriveNg.success === false && rpcDriveNg.code === 'VALIDATION_FAILED', 'Code.apiResolveDriveArtwork: 異常系 (success: false)');

// 10.3 DriveArtworkModal の存在検証
const driveModalPath = path.join(srcDir, 'DriveArtworkModal.html');
assert(fs.existsSync(driveModalPath), 'DriveArtworkModal.html が存在する (TASK-005)');
const indexHtmlForModal = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
assert(indexHtmlForModal.includes('id="modal-drive-artwork"'), 'dist/index.html に DriveArtworkModal がバンドルされていること');
assert(indexHtmlForModal.includes('id="btn-edit-album-upload"'), 'dist/index.html に EditAlbumModal のローカル選択ボタンが存在すること');
assert(indexHtmlForModal.includes('id="btn-edit-album-drive"'), 'dist/index.html に EditAlbumModal のDrive追加ボタンが存在すること');
assert(indexHtmlForModal.includes('id="btn-manual-upload"'), 'dist/index.html に ManualModal のローカル選択ボタンが存在すること');
assert(indexHtmlForModal.includes('id="btn-manual-drive"'), 'dist/index.html に ManualModal のDrive追加ボタンが存在すること');
assert(indexHtmlForModal.includes('id="manual-art-preview"'), 'dist/index.html に ManualModal のプレビュー画像枠が存在すること');

// 10.4 [BUG-002] handleImageUpload実行中の親フォーム保存/登録/Driveボタン非活性化およびHTMLボタン存在検証
const scriptsAppHtml = fs.readFileSync(path.join(srcDir, 'ScriptsApp.html'), 'utf8');
const expectedRelatedBtns = [
  'btn-submit-edit-album',
  'btn-mobile-submit-edit-album',
  'btn-submit-manual-track',
  'btn-edit-album-drive',
  'btn-manual-drive'
];

expectedRelatedBtns.forEach(btnId => {
  assert(indexHtmlForModal.includes(`id="${btnId}"`), `dist/index.html に親フォーム関連ボタン id="${btnId}" が存在する (BUG-002)`);
  assert(scriptsAppHtml.includes(`'${btnId}'`), `ScriptsApp.html の handleImageUpload で '${btnId}' が非活性化対象に含まれている (BUG-002)`);
});

assert(scriptsAppHtml.includes('relatedBtns.forEach(btn => { btn.disabled = true; });'), 'handleImageUpload: アップロード中に親フォームボタンが disabled 化される (BUG-002)');
assert(scriptsAppHtml.includes('relatedBtns.forEach(btn => { btn.disabled = false; });'), 'handleImageUpload: finally ブロックで親フォームボタンが活性化復帰される (BUG-002)');

// =============================================================================
// [11] アルバム一括削除・個別削除機能の単体・結合テスト
// =============================================================================
console.log('\n[11] アルバム一括削除・個別削除機能の単体・結合テスト');

// 11.1 SheetService.deleteAlbumsBatch 単体テスト
console.log('\n[11.1] SheetService.deleteAlbumsBatch のテスト');

let deleteMockSheetData = [
  ['CD番号', 'アルバムアーティスト名', 'アルバム名', 'アーティスト名', 'トラック番号', 'トラック名', 'リリース日', 'アルバムアートURL'],
  [1, 'Official髭男dism', 'Editorial', 'Official髭男dism', 1, 'Editorial (Intro)', '2021-08-18', 'https://example.com/art1.jpg'],
  [1, 'Official髭男dism', 'Editorial', 'Official髭男dism', 2, 'Cry Baby', '2021-08-18', 'https://example.com/art1.jpg'],
  [1, 'Official髭男dism', 'Traveler', 'Official髭男dism', 1, 'Pretender', '2019-10-09', 'https://example.com/art2.jpg'],
  [1, 'BUMP OF CHICKEN', 'jupiter', 'BUMP OF CHICKEN', 1, '天体観測', '2002-02-20', 'https://example.com/art3.jpg'],
  [1, 'King Gnu', 'CEREMONY', 'King Gnu', 1, '=cmd|\' /C calc\'', '2020-01-15', 'https://example.com/art4.jpg']
];

let deleteCleared = false;
let deleteSetValuesCalledWith = null;
let deleteLockReleased = false;

const deleteMockSheetObj = {
  getLastRow: () => deleteMockSheetData.length,
  getRange: (row, col, numRows, numCols) => ({
    getValues: () => deleteMockSheetData.slice(row - 1, row - 1 + numRows),
    clearContent: () => { deleteCleared = true; },
    setValues: (values) => { deleteSetValuesCalledWith = values; },
    setNumberFormat: (fmt) => {}
  })
};

global.SpreadsheetApp = {
  openById: () => ({
    getSheetByName: () => deleteMockSheetObj
  }),
  flush: () => {}
};

global.LockService = {
  getScriptLock: () => ({
    tryLock: (timeout) => true,
    releaseLock: () => { deleteLockReleased = true; }
  })
};

const deleteSheetService = new SheetService(config);

// 11.1.1 単一アルバム削除テスト
const delResult1 = deleteSheetService.deleteAlbumsBatch([
  { albumArtist: 'Official髭男dism', albumName: 'Editorial' }
]);
assert(deleteLockReleased === true, 'SheetService.deleteAlbumsBatch: 排他ロックが確実に解放されること');
assert(deleteCleared === true, 'SheetService.deleteAlbumsBatch: clearContent() が実行されること');
assert(delResult1.deletedAlbumCount === 1, 'SheetService.deleteAlbumsBatch: 削除アルバム数が 1 であること');
assert(delResult1.deletedTrackCount === 2, 'SheetService.deleteAlbumsBatch: 削除トラック数が 2 であること');
assert(delResult1.remainingRowCount === 3, 'SheetService.deleteAlbumsBatch: 残存トラック数が 3 であること');
assert(deleteSetValuesCalledWith !== null && deleteSetValuesCalledWith.length === 3, 'SheetService.deleteAlbumsBatch: 残存3行が一括書き戻されること');

// 11.1.2 複数アルバム一括削除テスト
deleteMockSheetData = [
  ['CD番号', 'アルバムアーティスト名', 'アルバム名', 'アーティスト名', 'トラック番号', 'トラック名', 'リリース日', 'アルバムアートURL'],
  [1, 'Official髭男dism', 'Traveler', 'Official髭男dism', 1, 'Pretender', '2019-10-09', ''],
  [1, 'BUMP OF CHICKEN', 'jupiter', 'BUMP OF CHICKEN', 1, '天体観測', '2002-02-20', ''],
  [1, 'King Gnu', 'CEREMONY', 'King Gnu', 1, "'=cmd|' /C calc'", '2020-01-15', '']
];
const delResult2 = deleteSheetService.deleteAlbumsBatch([
  { albumArtist: 'Official髭男dism', albumName: 'Traveler' },
  { albumArtist: 'BUMP OF CHICKEN', albumName: 'jupiter' }
]);
assert(delResult2.deletedAlbumCount === 2, 'SheetService.deleteAlbumsBatch: 2件のアルバムが一括削除されること');
assert(delResult2.deletedTrackCount === 2, 'SheetService.deleteAlbumsBatch: 2件のトラックが一括削除されること');
assert(delResult2.remainingRowCount === 1, 'SheetService.deleteAlbumsBatch: 残存トラック数が 1 であること');
const remainingKingGnu = deleteSetValuesCalledWith[0];
assert(remainingKingGnu[1] === 'King Gnu' && remainingKingGnu[5] === "'=cmd|' /C calc'", 'SheetService.deleteAlbumsBatch: 残存行の数式インジェクション保護シングルクォートが維持されること');

// 11.1.3 全行削除（残存0行境界値）テスト
deleteMockSheetData = [
  ['CD番号', 'アルバムアーティスト名', 'アルバム名', 'アーティスト名', 'トラック番号', 'トラック名', 'リリース日', 'アルバムアートURL'],
  [1, 'King Gnu', 'CEREMONY', 'King Gnu', 1, 'Track 1', '2020-01-15', '']
];
deleteSetValuesCalledWith = null;
const delResultAll = deleteSheetService.deleteAlbumsBatch([
  { albumArtist: 'King Gnu', albumName: 'CEREMONY' }
]);
assert(delResultAll.deletedAlbumCount === 1, '全行削除: 削除アルバム数 1');
assert(delResultAll.deletedTrackCount === 1, '全行削除: 削除トラック数 1');
assert(delResultAll.remainingRowCount === 0, '全行削除: remainingRowCount === 0');
assert(deleteSetValuesCalledWith === null, '全行削除: 残存0行時は setValues([]) が呼び出されずヘッダーのみ保護されること');

// 11.1.4 lastRow < 2 (データなし) 境界値テスト
deleteMockSheetData = [
  ['CD番号', 'アルバムアーティスト名', 'アルバム名', 'アーティスト名', 'トラック番号', 'トラック名', 'リリース日', 'アルバムアートURL']
];
const delResultEmpty = deleteSheetService.deleteAlbumsBatch([
  { albumArtist: 'A', albumName: 'B' }
]);
assert(delResultEmpty.deletedAlbumCount === 0 && delResultEmpty.remainingRowCount === 0, 'lastRow < 2 時は安全に空結果オブジェクトが返ること');

// 11.1.5 存在しないアルバム指定テスト
deleteMockSheetData = [
  ['CD番号', 'アルバムアーティスト名', 'アルバム名', 'アーティスト名', 'トラック番号', 'トラック名', 'リリース日', 'アルバムアートURL'],
  [1, 'Existing', 'Album', 'Existing', 1, 'Song', '2020', '']
];
const delResultNotFound = deleteSheetService.deleteAlbumsBatch([
  { albumArtist: 'NonExistent', albumName: 'NonExistent' }
]);
assert(delResultNotFound.deletedAlbumCount === 0 && delResultNotFound.deletedTrackCount === 0, '存在しないアルバム指定時は削除件数0で安全に終了すること');
assert(delResultNotFound.remainingRowCount === 1, '存在しないアルバム指定時は既存行がそのまま保持されること');

// 11.1.6 排他ロック取得失敗（タイムアウト）テスト
global.LockService = {
  getScriptLock: () => ({
    tryLock: (timeout) => false,
    releaseLock: () => {}
  })
};
assertThrows(
  () => deleteSheetService.deleteAlbumsBatch([{ albumArtist: 'A', albumName: 'B' }]),
  'LOCK_TIMEOUT',
  'SheetService.deleteAlbumsBatch: ロック取得失敗時に LOCK_TIMEOUT 例外が送出されること'
);

// 11.2 MusicService.deleteAlbums & validateDeletePayload_ 単体テスト
console.log('\n[11.2] MusicService.deleteAlbums & validateDeletePayload_ のテスト');
global.LockService = {
  getScriptLock: () => ({
    tryLock: (timeout) => true,
    releaseLock: () => {}
  })
};
const mockSheetServiceForMusic = {
  deleteAlbumsBatch: (keys) => ({
    deletedAlbumCount: keys.length,
    deletedTrackCount: keys.length * 5,
    deletedAlbums: keys,
    remainingRowCount: 10
  })
};
const delMusicService = new MusicService(config, mockSheetServiceForMusic, driveService, itunesService);

// 正常系
const validDelRes = delMusicService.deleteAlbums({
  albums: [
    { albumArtist: 'Artist A', albumName: 'Album A' },
    { albumArtist: 'Artist B', albumName: 'Album B' }
  ]
});
assert(validDelRes.deletedAlbumCount === 2, 'MusicService.deleteAlbums: 正常系委譲成功');

// 異常系バリデーションテスト
assertThrows(() => delMusicService.deleteAlbums(null), 'VALIDATION_FAILED', 'deleteAlbums: payload null での例外');
assertThrows(() => delMusicService.deleteAlbums('invalid'), 'VALIDATION_FAILED', 'deleteAlbums: payload 文字列での例外');
assertThrows(() => delMusicService.deleteAlbums([]), 'VALIDATION_FAILED', 'deleteAlbums: payload 配列での例外');
assertThrows(() => delMusicService.deleteAlbums({}), 'VALIDATION_FAILED', 'deleteAlbums: albums プロパティなしでの例外');
assertThrows(() => delMusicService.deleteAlbums({ albums: [] }), 'VALIDATION_FAILED', 'deleteAlbums: albums 空配列での例外');
assertThrows(() => delMusicService.deleteAlbums({ albums: [{ albumArtist: '', albumName: 'Album' }] }), 'VALIDATION_FAILED', 'deleteAlbums: albumArtist 空文字での例外');
assertThrows(() => delMusicService.deleteAlbums({ albums: [{ albumArtist: 'Artist', albumName: '   ' }] }), 'VALIDATION_FAILED', 'deleteAlbums: albumName 空白のみでの例外');
assertThrows(() => delMusicService.deleteAlbums({ albums: [{ albumArtist: 'A'.repeat(256), albumName: 'Album' }] }), 'VALIDATION_FAILED', 'deleteAlbums: albumArtist 255文字超過での例外');
assertThrows(() => delMusicService.deleteAlbums({ albums: [{ albumArtist: 'A', albumName: 'B'.repeat(256) }] }), 'VALIDATION_FAILED', 'deleteAlbums: albumName 255文字超過での例外');

// 11.3 Code.apiDeleteAlbumsBatch RPC テスト
console.log('\n[11.3] Code.apiDeleteAlbumsBatch RPC テスト');
assert(typeof Code.apiDeleteAlbumsBatch === 'function', 'Code.apiDeleteAlbumsBatch が公開されていること');

// RPC 正常系
const rpcDelOk = Code.apiDeleteAlbumsBatch({
  albums: [{ albumArtist: 'Artist', albumName: 'Album' }]
});
assert(rpcDelOk && rpcDelOk.success === true && rpcDelOk.data, 'Code.apiDeleteAlbumsBatch: 正常系 (success: true)');

// RPC 異常系
const rpcDelNg = Code.apiDeleteAlbumsBatch(null);
assert(rpcDelNg && rpcDelNg.success === false && rpcDelNg.code === 'VALIDATION_FAILED', 'Code.apiDeleteAlbumsBatch: 異常系 (VALIDATION_FAILED)');

// 11.4 Store.deleteAlbumsFromCatalog キャッシュ差分同期テスト
console.log('\n[11.4] Store.deleteAlbumsFromCatalog テスト');
const delTestStore = new Store();
delTestStore.setTracks([
  { cdNumber: 1, albumArtist: 'Artist 1', albumName: 'Album 1A', trackName: 'Song 1', trackNumber: 1 },
  { cdNumber: 1, albumArtist: 'Artist 1', albumName: 'Album 1B', trackName: 'Song 2', trackNumber: 1 },
  { cdNumber: 1, albumArtist: 'Artist 2', albumName: 'Album 2A', trackName: 'Song 3', trackNumber: 1 }
]);
delTestStore.state.isAlbumSelectMode = true;
delTestStore.state.selectedAlbumKeysForDeletion.add('Artist 1:::Album 1A');

delTestStore.deleteAlbumsFromCatalog([{ albumArtist: 'Artist 1', albumName: 'Album 1A' }]);

assert(delTestStore.state.allTracks.length === 2, 'Store.deleteAlbumsFromCatalog: 該当アルバムのトラックが除外されること');
assert(!delTestStore.state.musicCatalog['Artist 1'].albums['Album 1A'], 'Store.deleteAlbumsFromCatalog: カタログツリーから該当アルバムが消去されること');
assert(delTestStore.state.musicCatalog['Artist 1'].albumCount === 1, 'Store.deleteAlbumsFromCatalog: アルバム件数が減算されること');
assert(delTestStore.state.isAlbumSelectMode === false, 'Store.deleteAlbumsFromCatalog: isAlbumSelectMode が false にリセットされること');
assert(delTestStore.state.selectedAlbumKeysForDeletion.size === 0, 'Store.deleteAlbumsFromCatalog: selectedAlbumKeysForDeletion がクリアされること');

// アーティスト配下の全アルバム削除時、アーティストが消滅すること
delTestStore.deleteAlbumsFromCatalog([{ albumArtist: 'Artist 1', albumName: 'Album 1B' }]);
assert(!delTestStore.state.musicCatalog['Artist 1'], 'Store.deleteAlbumsFromCatalog: 全アルバム削除時にアーティストがカタログから消滅すること');
assert(!delTestStore.state.artistList.includes('Artist 1'), 'Store.deleteAlbumsFromCatalog: artistList からアーティストが除外されること');

// 11.5 ApiClient.prototype.deleteAlbumsBatch メソッド存在確認
console.log('\n[11.5] ApiClient.deleteAlbumsBatch テスト');
const apiClientContent = fs.readFileSync(path.join(__dirname, '../src/ScriptsApiClient.html'), 'utf8');
assert(apiClientContent.includes('deleteAlbumsBatch(albums)'), 'ApiClient に deleteAlbumsBatch メソッドが存在すること');
assert(apiClientContent.includes("callAction('deleteAlbumsBatch'") && !apiClientContent.includes('google.script.run'), 'ApiClient.deleteAlbumsBatch が HTTP JSON API / ローカルアダプタを使用し google.script.run に依存しないこと');

// 11.6 UIコンポーネントおよび dist/index.html バンドル検証
console.log('\n[11.6] UIコンポーネントおよび dist/index.html バンドル検証');
const indexHtmlLatest = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
assert(indexHtmlLatest.includes('id="modal-delete-confirm"'), 'dist/index.html に modal-delete-confirm が存在する (TASK-005)');
assert(indexHtmlLatest.includes('id="btn-toggle-album-select"'), 'dist/index.html に btn-toggle-album-select が存在する (TASK-004)');
assert(indexHtmlLatest.includes('id="album-selection-toolbar"'), 'dist/index.html に album-selection-toolbar が存在する (TASK-004)');
assert(indexHtmlLatest.includes('id="btn-select-all-albums"'), 'dist/index.html に btn-select-all-albums が存在する (TASK-004)');
assert(indexHtmlLatest.includes('id="btn-deselect-all-albums"'), 'dist/index.html に btn-deselect-all-albums が存在する (TASK-004)');
assert(indexHtmlLatest.includes('id="selected-album-count-badge"'), 'dist/index.html に selected-album-count-badge が存在する (TASK-004)');
assert(indexHtmlLatest.includes('id="btn-delete-selected-albums"'), 'dist/index.html に btn-delete-selected-albums が存在する (TASK-004)');
assert(indexHtmlLatest.includes('id="btn-delete-album"'), 'dist/index.html に btn-delete-album が存在する (TASK-004)');
assert(indexHtmlLatest.includes('id="btn-confirm-execute-delete"'), 'dist/index.html に btn-confirm-execute-delete が存在する (TASK-004)');
assert(indexHtmlLatest.includes('id="delete-confirm-track-warning"'), 'dist/index.html に delete-confirm-track-warning が存在する (TASK-004)');
assert(indexHtmlLatest.includes('id="delete-confirm-album-list"'), 'dist/index.html に delete-confirm-album-list が存在する (TASK-004)');

console.log('\n[11.7] アルバム一括削除 不具合修正検証 (BUG-001, BUG-002, BUG-003)');
const scriptsAppHtmlForBugCheck = fs.readFileSync(path.join(srcDir, 'ScriptsApp.html'), 'utf8');

// BUG-001
assert(
  scriptsAppHtmlForBugCheck.includes('this.store.state.isAlbumSelectMode = false;') &&
  scriptsAppHtmlForBugCheck.includes('this.store.state.selectedAlbumKeysForDeletion.clear();') &&
  scriptsAppHtmlForBugCheck.includes('this.toggleAlbumSelectMode(false);'),
  'selectSearchResultItem でアルバム選択モードと選択キーSetが確実にリセットされること (BUG-001)'
);

// BUG-002
assert(
  scriptsAppHtmlForBugCheck.includes('if (this.isDeletingAlbums)') &&
  scriptsAppHtmlForBugCheck.includes('this.isDeletingAlbums = true;') &&
  scriptsAppHtmlForBugCheck.includes('btnCancel.disabled = true;') &&
  scriptsAppHtmlForBugCheck.includes('btnClose.disabled = true;'),
  'closeDeleteConfirmModal の通信待機中クローズ抑止およびボタン disabled 化が実装されていること (BUG-002)'
);

// BUG-003
assert(
  scriptsAppHtmlForBugCheck.includes("btnToggleSelect.setAttribute('aria-pressed', 'true');") &&
  scriptsAppHtmlForBugCheck.includes("btnToggleSelect.setAttribute('aria-pressed', 'false');"),
  'アルバム選択切替ボタンの aria-pressed トグル整合性が実装されていること (BUG-003)'
);

// --------------------------------------------------
// [12] コードレビュー指摘事項改善（信頼性・堅牢性・保守性向上）テスト
// --------------------------------------------------
console.log('\n[12] コードレビュー指摘事項改善（信頼性・堅牢性・保守性向上）テスト (TASK-001〜TASK-010)');

// [12.1] Config クラスの改修検証 (API_TOKEN 管理・Secure by Default)
console.log('\n[12.1] Config クラスの改修検証 (API_TOKEN 管理・Secure by Default)');
{
  // 未設定時: false / API_DISABLED
  global.PropertiesService = {
    getScriptProperties: () => ({
      getProperties: () => ({
        SPREADSHEET_ID: 'ss-123',
        DRIVE_FOLDER_ID: 'folder-123'
      })
    })
  };
  const cfgDefault = new Config();
  assert(cfgDefault.hasApiToken() === false, 'Config: API_TOKEN 未設定時は hasApiToken() === false (Secure by Default)');
  assertThrows(() => cfgDefault.getApiToken(), 'API_DISABLED', 'Config: API_TOKEN 未設定時は getApiToken() が API_DISABLED を送出');
  assert(typeof cfgDefault.isEmbeddingAllowed === 'undefined', 'Config: 旧 isEmbeddingAllowed() が削除されていること');

  // 空文字・空白のみ設定時: false / API_DISABLED
  global.PropertiesService = {
    getScriptProperties: () => ({
      getProperties: () => ({
        SPREADSHEET_ID: 'ss-123',
        DRIVE_FOLDER_ID: 'folder-123',
        API_TOKEN: '   '
      })
    })
  };
  const cfgBlank = new Config();
  assert(cfgBlank.hasApiToken() === false, 'Config: API_TOKEN="   " 時に hasApiToken() === false');
  assertThrows(() => cfgBlank.getApiToken(), 'API_DISABLED', 'Config: API_TOKEN="   " 時に API_DISABLED を送出');

  // 有効値設定時: 前後空白トリムして返却
  global.PropertiesService = {
    getScriptProperties: () => ({
      getProperties: () => ({
        SPREADSHEET_ID: 'ss-123',
        DRIVE_FOLDER_ID: 'folder-123',
        API_TOKEN: '  my-secret-api-token-012345  '
      })
    })
  };
  const cfgValid = new Config();
  assert(cfgValid.hasApiToken() === true, 'Config: 有効な API_TOKEN 設定時に hasApiToken() === true');
  assert(cfgValid.getApiToken() === 'my-secret-api-token-012345', 'Config: API_TOKEN の前後空白がトリムされて返却されること');

  // 排他制御定数の検証
  assert(Config.CONSTANTS.LOCK_TIMEOUT_MS === 30000, 'Config.CONSTANTS.LOCK_TIMEOUT_MS === 30000');
  assert(Config.CONSTANTS.MUSICBRAINZ.LOCK_TIMEOUT_MS === 10000, 'Config.CONSTANTS.MUSICBRAINZ.LOCK_TIMEOUT_MS === 10000');
}

// [12.2] Code.js doGet の API 専用ヘルスチェック JSON 検証
console.log('\n[12.2] Code.js doGet の API 専用ヘルスチェック JSON 検証');
{
  const CodeModule = require('../src/Code');

  let lastMimeType = null;
  global.ContentService = {
    MimeType: { JSON: 'JSON', TEXT: 'TEXT' },
    createTextOutput: (content) => ({
      _content: content,
      setMimeType: function(mime) {
        lastMimeType = mime;
        return this;
      },
      getContent: function() { return this._content; }
    })
  };

  // 1. API_TOKEN 未設定 -> apiConfigured: false
  global.PropertiesService = {
    getScriptProperties: () => ({
      getProperties: () => ({
        SPREADSHEET_ID: 'ss-secret-id',
        DRIVE_FOLDER_ID: 'folder-secret-id'
      })
    })
  };
  lastMimeType = null;
  const resUnconfigured = CodeModule.doGet({});
  const rawUnconfigured = resUnconfigured.getContent();
  const parsedUnconfigured = JSON.parse(rawUnconfigured);
  assert(lastMimeType === 'JSON', 'doGet: MimeType.JSON が設定されること');
  assert(
    parsedUnconfigured.success === true &&
    parsedUnconfigured.data &&
    parsedUnconfigured.data.service === 'MusicInfo-app' &&
    parsedUnconfigured.data.role === 'api-only' &&
    parsedUnconfigured.data.status === 'ok' &&
    parsedUnconfigured.data.apiConfigured === false,
    'doGet: API_TOKEN 未設定時は apiConfigured: false のヘルスチェック JSON を返すこと'
  );
  assert(
    !rawUnconfigured.includes('ss-secret-id') && !rawUnconfigured.includes('folder-secret-id'),
    'doGet: スプレッドシートID・DriveフォルダID等の機密情報が出力されないこと'
  );

  // 2. API_TOKEN 設定済み -> apiConfigured: true (トークン値自体は絶対に出力しない)
  global.PropertiesService = {
    getScriptProperties: () => ({
      getProperties: () => ({
        SPREADSHEET_ID: 'ss-secret-id',
        DRIVE_FOLDER_ID: 'folder-secret-id',
        API_TOKEN: 'super-secret-token-value-xyz'
      })
    })
  };
  const resConfigured = CodeModule.doGet({});
  const rawConfigured = resConfigured.getContent();
  const parsedConfigured = JSON.parse(rawConfigured);
  assert(parsedConfigured.data.apiConfigured === true, 'doGet: API_TOKEN 設定済み時は apiConfigured: true を返すこと');
  assert(!rawConfigured.includes('super-secret-token-value-xyz'), 'doGet: API_TOKEN の値自体はレスポンスに含まれないこと');
}

// [12.3] ItunesService.lookupAlbumSongs の JSON.parse 例外保護検証 (TASK-003)
console.log('\n[12.3] ItunesService.lookupAlbumSongs の JSON.parse 例外保護検証 (TASK-003)');
{
  const testItunesService = new ItunesService();
  
  // 破損レスポンス（HTMLエラーページ）のシミュレート
  global.UrlFetchApp = {
    fetch: () => ({
      getResponseCode: () => 200,
      getContentText: () => '<html><body>502 Bad Gateway</body></html>'
    })
  };

  assertThrows(
    () => testItunesService.lookupAlbumSongs(123456),
    'ITUNES_API_PARSE_ERROR',
    'ItunesService.lookupAlbumSongs: 外部APIからの不正HTML返却時に ITUNES_API_PARSE_ERROR が送出されること'
  );
}

// [12.4] DriveService.downloadAndSaveArtwork の動的MIME・拡張子判定検証 (TASK-004)
console.log('\n[12.4] DriveService.downloadAndSaveArtwork の動的MIME・拡張子判定検証 (TASK-004)');
{
  const testDriveService = new DriveService(config);
  
  const testMimeCases = [
    { mime: 'image/png', expectedExt: 'png', expectedMime: 'image/png' },
    { mime: 'image/webp', expectedExt: 'webp', expectedMime: 'image/webp' },
    { mime: 'image/jpeg', expectedExt: 'jpg', expectedMime: 'image/jpeg' },
    { mime: 'image/png; charset=utf-8', expectedExt: 'png', expectedMime: 'image/png' },
    { mime: 'application/octet-stream', expectedExt: 'jpg', expectedMime: 'image/jpeg' }
  ];

  for (const tc of testMimeCases) {
    let capturedName = '';
    let capturedType = '';

    global.DriveApp = {
      getFolderById: () => ({
        createFile: (blob) => {
          capturedName = blob.getName();
          return {
            getId: () => 'mock-file-id',
            setSharing: () => {}
          };
        }
      }),
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
      Permission: { VIEW: 'VIEW' }
    };

    global.UrlFetchApp = {
      fetch: () => ({
        getResponseCode: () => 200,
        getBlob: () => {
          let bName = '';
          let bType = tc.mime;
          return {
            setName: (n) => { bName = n; },
            getName: () => bName,
            setContentType: (t) => { capturedType = t; },
            getContentType: () => bType
          };
        }
      })
    };

    testDriveService.downloadAndSaveArtwork('https://example.com/cover', 'TestAlbum');
    assert(
      capturedName.endsWith('.' + tc.expectedExt),
      `downloadAndSaveArtwork: MIME [${tc.mime}] に対し拡張子 [.${tc.expectedExt}] が付与されること (実際: ${capturedName})`
    );
    assert(
      capturedType === tc.expectedMime,
      `downloadAndSaveArtwork: MIME [${tc.mime}] に対し Content-Type [${tc.expectedMime}] が設定されること`
    );
  }
}

// [12.5] SheetService.insertTracksBatch & appendSingleTrack 排他制御検証 (TASK-005)
console.log('\n[12.5] SheetService.insertTracksBatch & appendSingleTrack 排他制御検証 (TASK-005)');
{
  const testSheetService = new SheetService(config);

  // 1. insertTracksBatch 正常系: ロック獲得および解放
  let insertLockReleased = false;
  let insertLockRequestedTimeout = 0;
  global.LockService = {
    getScriptLock: () => ({
      tryLock: (timeout) => {
        insertLockRequestedTimeout = timeout;
        return true;
      },
      releaseLock: () => {
        insertLockReleased = true;
      }
    })
  };
  global.SpreadsheetApp = {
    openById: () => ({
      getSheetByName: () => ({
        getLastRow: () => 1,
        getRange: () => ({
          setNumberFormat: () => {},
          setValues: () => {}
        })
      })
    }),
    flush: () => {}
  };

  testSheetService.insertTracksBatch(
    [{ cdNumber: 1, trackNumber: 1, trackName: 'Song1', trackArtist: 'Artist1' }],
    { albumName: 'Album1', albumArtist: 'Artist1', releaseDate: '2024-01-01' },
    'https://example.com/art.jpg'
  );
  assert(insertLockRequestedTimeout === 30000, 'insertTracksBatch: ロック待機時間が 30000ms であること');
  assert(insertLockReleased === true, 'insertTracksBatch: 正常終了時に releaseLock が呼ばれること');

  // 2. insertTracksBatch 異常系: ロックタイムアウト
  global.LockService = {
    getScriptLock: () => ({
      tryLock: () => false,
      releaseLock: () => {}
    })
  };
  assertThrows(
    () => testSheetService.insertTracksBatch(
      [{ cdNumber: 1, trackNumber: 1, trackName: 'Song1', trackArtist: 'Artist1' }],
      { albumName: 'Album1', albumArtist: 'Artist1', releaseDate: '2024-01-01' },
      'https://example.com/art.jpg'
    ),
    'LOCK_TIMEOUT',
    'insertTracksBatch: ロックタイムアウト時に LOCK_TIMEOUT 例外が送出されること'
  );

  // 3. appendSingleTrack 正常系: ロック獲得および解放
  let appendLockReleased = false;
  let appendLockRequestedTimeout = 0;
  global.LockService = {
    getScriptLock: () => ({
      tryLock: (timeout) => {
        appendLockRequestedTimeout = timeout;
        return true;
      },
      releaseLock: () => {
        appendLockReleased = true;
      }
    })
  };
  global.SpreadsheetApp = {
    openById: () => ({
      getSheetByName: () => ({
        getLastRow: () => 1,
        appendRow: () => {}
      })
    }),
    flush: () => {}
  };

  testSheetService.appendSingleTrack({
    cdNumber: 1,
    trackNumber: 1,
    trackName: 'Single Song',
    albumArtist: 'Single Artist',
    albumName: 'Single Album',
    trackArtist: 'Single Artist',
    releaseDate: '2024-01-01',
    artworkUrl: 'https://example.com/art.jpg'
  });
  assert(appendLockRequestedTimeout === 30000, 'appendSingleTrack: ロック待機時間が 30000ms であること');
  assert(appendLockReleased === true, 'appendSingleTrack: 正常終了時に releaseLock が呼ばれること');

  // 4. appendSingleTrack 異常系: ロックタイムアウト
  global.LockService = {
    getScriptLock: () => ({
      tryLock: () => false,
      releaseLock: () => {}
    })
  };
  assertThrows(
    () => testSheetService.appendSingleTrack({
      cdNumber: 1,
      trackNumber: 1,
      trackName: 'Single Song',
      albumArtist: 'Single Artist',
      albumName: 'Single Album',
      trackArtist: 'Single Artist',
      releaseDate: '2024-01-01',
      artworkUrl: 'https://example.com/art.jpg'
    }),
    'LOCK_TIMEOUT',
    'appendSingleTrack: ロックタイムアウト時に LOCK_TIMEOUT 例外が送出されること'
  );

  // 安全な状態に復帰
  global.LockService = {
    getScriptLock: () => ({
      tryLock: () => true,
      releaseLock: () => {}
    })
  };
}

// [12.6] MusicBrainzService.enforceRateLimit_ 排他制御検証 (TASK-006)
console.log('\n[12.6] MusicBrainzService.enforceRateLimit_ 排他制御検証 (TASK-006)');
{
  const mbService = new MusicBrainzService(config);

  let mbLockAcquired = false;
  let mbLockReleased = false;
  let mbLockTimeoutRequested = 0;

  global.LockService = {
    getScriptLock: () => ({
      tryLock: (timeout) => {
        mbLockTimeoutRequested = timeout;
        mbLockAcquired = true;
        return true;
      },
      releaseLock: () => {
        mbLockReleased = true;
      }
    })
  };

  global.CacheService = {
    getScriptCache: () => ({
      get: () => null,
      put: () => {}
    })
  };

  mbService.enforceRateLimit_();
  assert(mbLockAcquired === true, 'enforceRateLimit_: LockService.getScriptLock().tryLock が呼び出されること');
  assert(mbLockTimeoutRequested === 10000, 'enforceRateLimit_: ロックタイムアウトが 10000ms であること');
  assert(mbLockReleased === true, 'enforceRateLimit_: 正常終了時に releaseLock が呼ばれること');

  // ロックタイムアウト時でも可用性優先で例外を投げずに続行すること
  global.LockService = {
    getScriptLock: () => ({
      tryLock: () => false,
      releaseLock: () => {}
    })
  };
  let errorThrown = false;
  try {
    mbService.enforceRateLimit_();
  } catch (e) {
    errorThrown = true;
  }
  assert(errorThrown === false, 'enforceRateLimit_: ロック獲得タイムアウト時でも可用性優先で続行し例外を投げないこと');

  // モック復帰
  global.LockService = {
    getScriptLock: () => ({
      tryLock: () => true,
      releaseLock: () => {}
    })
  };
}

// [12.7] Utils.highlightMatch 元文字列直接マッチング方式検証 (TASK-007)
console.log('\n[12.7] Utils.highlightMatch 元文字列直接マッチング方式検証 (TASK-007)');
{
  // 1. カタカナ検索 -> ひらがな生文字列にマッチ
  const html1 = Utils.highlightMatch('あいうえお', ['アイウ']);
  assert(
    html1.includes('<mark class="bg-indigo-500/30 text-indigo-200 rounded px-0.5 font-bold">あいう</mark>えお'),
    `highlightMatch: カタカナ「アイウ」検索で生テキスト「あいうえお」の一致部分がハイライトされること (実際: ${html1})`
  );

  // 2. ひらがな検索 -> カタカナ生文字列にマッチ
  const html2 = Utils.highlightMatch('アイウエオ', ['あいう']);
  assert(
    html2.includes('<mark class="bg-indigo-500/30 text-indigo-200 rounded px-0.5 font-bold">アイウ</mark>エオ'),
    `highlightMatch: ひらがな「あいう」検索で生テキスト「アイウエオ」の一致部分がハイライトされること (実際: ${html2})`
  );

  // 3. 全角記号・英数・絵文字混在時のハイライトズレなし検証
  const complexText = 'Official髭男dism - Ｓｕｂｔｉｔｌｅ！ ✨ [2022]';
  const html3 = Utils.highlightMatch(complexText, ['Subtitle']);
  assert(
    html3.includes('Ｓｕｂｔｉｔｌｅ'),
    'highlightMatch: 全角英数や記号が混在してもハイライト位置が正しく維持されること'
  );

  // 4. XSS 特殊文字の無害化エスケープ
  const maliciousText = '<script>alert("XSS")</script>&"\'';
  const html4 = Utils.highlightMatch(maliciousText, ['alert']);
  assert(!html4.includes('<script>'), 'highlightMatch: <script> タグが安全にエスケープされていること');
  assert(html4.includes('&lt;script&gt;'), 'highlightMatch: &lt;script&gt; にエスケープされていること');
  assert(html4.includes('&amp;&quot;&#039;'), 'highlightMatch: &, ", \' が安全にエスケープされていること');

  // 5. 正規表現メタ文字が含まれる検索語のエスケープ安全性
  const metaText = 'Album [Special (Edition) + Extra] {2024}';
  const html5 = Utils.highlightMatch(metaText, ['[Special', '(Edition)+']);
  assert(html5.includes('<mark'), 'highlightMatch: 正規表現特殊文字を含む検索語でもエラーにならずハイライトされること');

  // 6. 重複・隣接トークンのマージ
  const overlapText = 'abcdefg';
  const html6 = Utils.highlightMatch(overlapText, ['abc', 'cde']);
  assert(
    html6.includes('<mark class="bg-indigo-500/30 text-indigo-200 rounded px-0.5 font-bold">abcde</mark>fg'),
    `highlightMatch: 重複区間がマージされて1つのmarkタグになること (実際: ${html6})`
  );
}

// [12.8] Utils.resizeImage & handleImageUpload 画像縮小連携検証 (TASK-007, TASK-008)
console.log('\n[12.8] Utils.resizeImage & handleImageUpload 画像縮小連携検証 (TASK-007, TASK-008)');
{
  assert(typeof Utils.resizeImage === 'function', 'Utils.resizeImage が関数として定義されていること');

  // Node.js 環境でのフォールバック動作
  const mockFile = { name: 'test.jpg', size: 100, type: 'image/jpeg' };
  const fallbackPromise = Utils.resizeImage(mockFile);
  assert(fallbackPromise && typeof fallbackPromise.then === 'function', 'Utils.resizeImage: Promise (Thenable) を返却すること');
  if (fallbackPromise && typeof fallbackPromise.catch === 'function') {
    fallbackPromise.catch(() => {});
  }

  // ScriptsApp.html 内で resizeImage の呼び出しおよび image/jpeg の設定が存在することの静的検証
  const scriptsAppHtml = fs.readFileSync(path.join(srcDir, 'ScriptsApp.html'), 'utf8');
  assert(
    scriptsAppHtml.includes('Utils.resizeImage(file'),
    'ScriptsApp.html: handleImageUpload で Utils.resizeImage が呼び出されていること'
  );
  assert(
    scriptsAppHtml.includes("uploadMimeType = headerMatch ? headerMatch[1].toLowerCase() : 'image/jpeg';"),
    'ScriptsApp.html: リサイズ後の MIMEタイプとして動的判定または image/jpeg が設定されていること'
  );
}

// [12.9] build.js 自動生成警告バナー検証 (TASK-009)
console.log('\n[12.9] build.js 自動生成警告バナー検証 (TASK-009)');
{
  const indexHtmlContent = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  assert(
    indexHtmlContent.startsWith('<!-- ========================================================================= -->'),
    'dist/index.html: 最冒頭に自動生成警告バナーが存在すること (TASK-009)'
  );
  assert(
    indexHtmlContent.includes('WARNING: このファイルは build.js によって自動生成されたファイルです。'),
    'dist/index.html: 自動生成物（直接編集禁止）の警告文が含まれること'
  );
}

// =============================================================================
// [13] Code.js doPost JSON API ディスパッチャ・認証・11アクション検証
// =============================================================================
console.log('\n[13] Code.js doPost JSON API ディスパッチャ・認証・11アクション検証');
{
  const CodeModule = require('../src/Code');

  global.ContentService = {
    MimeType: { JSON: 'JSON', TEXT: 'TEXT' },
    createTextOutput: (content) => ({
      _content: content,
      setMimeType: function() { return this; },
      getContent: function() { return this._content; }
    })
  };

  let dbAccessCount = 0;
  global.SpreadsheetApp = {
    openById: () => {
      dbAccessCount++;
      throw new Error('Should not be called on auth failure');
    }
  };
  global.DriveApp = {
    getFolderById: () => {
      dbAccessCount++;
      throw new Error('Should not be called on auth failure');
    },
    getFileById: () => {
      dbAccessCount++;
      throw new Error('Should not be called on auth failure');
    }
  };

  // 13.1 定数時間比較テスト
  assert(CodeModule.constantTimeEqual_('abc123', 'abc123') === true, 'constantTimeEqual_: 一致で true');
  assert(CodeModule.constantTimeEqual_('abc123', 'xbc123') === false, 'constantTimeEqual_: 先頭文字違いで false');
  assert(CodeModule.constantTimeEqual_('abc123', 'abc124') === false, 'constantTimeEqual_: 末尾文字違いで false');
  assert(CodeModule.constantTimeEqual_('abc123', 'abc1234') === false, 'constantTimeEqual_: 長さ違いで false');
  assert(CodeModule.constantTimeEqual_(null, 'abc') === false, 'constantTimeEqual_: 非文字列で false');

  // 13.2 API_TOKEN 未設定時 -> API_DISABLED (DB未アクセス)
  global.PropertiesService = {
    getScriptProperties: () => ({
      getProperties: () => ({ SPREADSHEET_ID: 'ss-1', DRIVE_FOLDER_ID: 'df-1' })
    })
  };
  dbAccessCount = 0;
  const resDisabled = JSON.parse(CodeModule.doPost({
    postData: { contents: JSON.stringify({ action: 'getAllData', token: 'any-token' }) }
  }).getContent());
  assert(resDisabled.success === false && resDisabled.code === 'API_DISABLED', 'doPost: API_TOKEN 未設定時は API_DISABLED を返すこと');
  assert(dbAccessCount === 0, 'doPost: API_DISABLED 時に SpreadsheetApp / DriveApp へアクセスしないこと');

  // 13.3 API_TOKEN 設定時の異常リクエスト検証
  const validToken = 'test-api-token-very-secret-98765';
  global.PropertiesService = {
    getScriptProperties: () => ({
      getProperties: () => ({
        SPREADSHEET_ID: 'ss-1',
        DRIVE_FOLDER_ID: 'df-1',
        API_TOKEN: validToken
      })
    })
  };

  const invalidBodyCases = [
    { name: 'イベント null', event: null },
    { name: '空文字ボディ', event: { postData: { contents: '   ' } } },
    { name: '不正JSON', event: { postData: { contents: '{broken-json' } } },
    { name: '配列JSON', event: { postData: { contents: '[]' } } },
    { name: '10MB超過ボディ', event: { postData: { contents: 'x'.repeat(10 * 1024 * 1024 + 1) } } }
  ];
  invalidBodyCases.forEach(tc => {
    const out = JSON.parse(CodeModule.doPost(tc.event).getContent());
    assert(out.success === false && out.code === 'INVALID_REQUEST', `doPost: ${tc.name} で INVALID_REQUEST を返すこと`);
  });

  // 13.4 トークン未指定・不一致 -> UNAUTHORIZED (DB未アクセス)
  dbAccessCount = 0;
  ['', null, 12345, 'wrong-token', validToken.slice(0, -1)].forEach(badToken => {
    const out = JSON.parse(CodeModule.doPost({
      postData: { contents: JSON.stringify({ action: 'getAllData', token: badToken }) }
    }).getContent());
    assert(out.success === false && out.code === 'UNAUTHORIZED', `doPost: 不正トークン (${JSON.stringify(badToken)}) で UNAUTHORIZED を返すこと`);
  });
  assert(dbAccessCount === 0, 'doPost: UNAUTHORIZED 時に SpreadsheetApp / DriveApp へアクセスしないこと');

  // 13.5 許可リスト外・プロトタイプ汚染アクション -> UNKNOWN_ACTION
  ['unknownAction', 'toString', 'constructor', '__proto__', 'valueOf', null].forEach(badAction => {
    const out = JSON.parse(CodeModule.doPost({
      postData: { contents: JSON.stringify({ action: badAction, token: validToken }) }
    }).getContent());
    assert(out.success === false && out.code === 'UNKNOWN_ACTION', `doPost: 許可外アクション (${String(badAction)}) で UNKNOWN_ACTION を返すこと`);
  });

  // 13.6 全 11 アクションのディスパッチ検証（業務モック環境）
  const mockSheetRows = [
    ['CD番号', 'アルバムアーティスト名', 'アルバム名', 'アーティスト名', 'トラック番号', 'トラック名', 'リリース日', 'アルバムアートURL'],
    [1, 'Test Artist', 'Test Album', 'Test Artist', 1, 'Track 1', '2025-01-01', 'https://example.com/1.jpg']
  ];
  global.LockService = {
    getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} })
  };
  global.CacheService = {
    getScriptCache: () => ({ get: () => null, put: () => {} })
  };
  global.Utilities = {
    sleep: () => {},
    base64Decode: (str) => Buffer.from(str, 'base64'),
    formatDate: () => '20261114120000'
  };
  global.SpreadsheetApp = {
    flush: () => {},
    openById: () => ({
      getSheetByName: () => ({
        getLastRow: () => mockSheetRows.length,
        getRange: (r, c, nr) => ({
          getValues: () => mockSheetRows.slice(r - 1, r - 1 + nr),
          setValues: () => {},
          clearContent: () => {},
          setNumberFormat: () => {}
        }),
        appendRow: () => {}
      })
    })
  };
  global.DriveApp = {
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
    Permission: { VIEW: 'VIEW' },
    getFolderById: () => ({
      createFile: () => ({ getId: () => 'mock-file-123', getName: () => 'art.jpg', setSharing: () => {} })
    }),
    getFileById: (id) => ({
      getId: () => id,
      getMimeType: () => 'image/jpeg',
      getName: () => 'orig.jpg',
      makeCopy: (name) => ({ getId: () => 'copy-file-123', getName: () => name, setSharing: () => {} }),
      setSharing: () => {}
    })
  };
  global.UrlFetchApp = {
    fetchAll: () => [
      {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          results: [{ wrapperType: 'collection', collectionId: 999, collectionName: 'Search Alb', artistName: 'Art', trackCount: 1 }]
        })
      },
      {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ releases: [] })
      }
    ],
    fetch: (url) => {
      if (url.includes('itunes.apple.com/search')) {
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            results: [{ wrapperType: 'collection', collectionId: 999, collectionName: 'It Alb', artistName: 'Art', trackCount: 1 }]
          })
        };
      }
      if (url.includes('itunes.apple.com/lookup')) {
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            results: [
              { wrapperType: 'collection', collectionId: 999, collectionName: 'It Alb', artistName: 'Art', trackCount: 1 },
              { wrapperType: 'track', trackName: 'Song 1', artistName: 'Art', discNumber: 1, trackNumber: 1 }
            ]
          })
        };
      }
      if (url.includes('musicbrainz.org/ws/2/release/')) {
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            id: '11111111-1111-1111-1111-111111111111',
            title: 'MB Alb',
            date: '2024-01-01',
            'artist-credit': [{ name: 'MB Art' }],
            media: [{ position: 1, format: 'CD', tracks: [{ position: 1, title: 'MB Song 1' }] }]
          })
        };
      }
      return { getResponseCode: () => 200, getContentText: () => '{}' };
    }
  };

  const callDoPost = (action, payload) => JSON.parse(
    CodeModule.doPost({ postData: { contents: JSON.stringify({ action, token: validToken, payload }) } }).getContent()
  );

  assert(callDoPost('getAllData', null).success === true, 'doPost [1/11]: getAllData 成功');
  assert(callDoPost('searchAlbums', { keyword: 'Test' }).success === true, 'doPost [2/11]: searchAlbums (object) 成功');
  assert(callDoPost('searchAlbums', 'Test').success === true, 'doPost [2b/11]: searchAlbums (scalar) 成功');
  assert(callDoPost('searchItunes', { keyword: 'Test' }).success === true, 'doPost [3/11]: searchItunes 成功');
  assert(callDoPost('lookupItunesAlbum', { collectionId: 999 }).success === true, 'doPost [4/11]: lookupItunesAlbum 成功');
  assert(callDoPost('lookupMusicBrainzRelease', { mbid: '11111111-1111-1111-1111-111111111111' }).success === true, 'doPost [5/11]: lookupMusicBrainzRelease 成功');
  assert(callDoPost('saveAlbumBatch', {
    albumName: 'Batch Alb',
    albumArtist: 'Batch Art',
    tracks: [{ cdNumber: 1, trackNumber: 1, trackName: 'T1' }]
  }).success === true, 'doPost [6/11]: saveAlbumBatch 成功');
  assert(callDoPost('saveTrackSingle', {
    cdNumber: 1, trackNumber: 1, albumArtist: 'Art', albumName: 'Alb', trackName: 'Single'
  }).success === true, 'doPost [7/11]: saveTrackSingle 成功');
  assert(callDoPost('updateAlbumBatch', {
    targetKey: { originalAlbumArtist: 'Test Artist', originalAlbumName: 'Test Album' },
    album: { albumArtist: 'Test Artist', albumName: 'Test Album', releaseDate: '2025-01-01', artworkUrl: '' },
    tracks: [{ cdNumber: 1, trackNumber: 1, trackName: 'Updated Track', trackArtist: 'Test Artist' }]
  }).success === true, 'doPost [8/11]: updateAlbumBatch 成功');
  assert(callDoPost('uploadArtwork', {
    base64Data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD',
    mimeType: 'image/jpeg',
    albumName: 'ArtTest'
  }).success === true, 'doPost [9/11]: uploadArtwork 成功');
  assert(callDoPost('resolveDriveArtwork', {
    driveUrlOrId: 'https://drive.google.com/file/d/valid-drive-12345678901234567890/view',
    albumName: 'DriveTest'
  }).success === true, 'doPost [10/11]: resolveDriveArtwork 成功');
  assert(callDoPost('deleteAlbumsBatch', {
    albums: [{ albumArtist: 'Test Artist', albumName: 'Test Album' }]
  }).success === true, 'doPost [11/11]: deleteAlbumsBatch 成功');
}

// =============================================================================
// [14] & [15] 非同期テスト群（ScriptsApiClient トランスポート層 + App ハイブリッド統合）
// =============================================================================
(async () => {
  console.log('\n[14] ScriptsApiClient.html ハイブリッドトランスポート層テスト');

  const apiHtmlRaw = fs.readFileSync(path.join(srcDir, 'ScriptsApiClient.html'), 'utf8');
  assert(!apiHtmlRaw.includes('google.script.run'), 'ScriptsApiClient.html 内に google.script.run が一切存在しないこと');

  const apiScriptMatch = apiHtmlRaw.match(/<script>([\s\S]*?)<\/script>/);
  const apiContext = vm.createContext({
    console,
    Date,
    Math,
    JSON,
    Set,
    Map,
    Error,
    Promise,
    encodeURIComponent,
    setTimeout,
    clearTimeout,
    AbortController: typeof AbortController !== 'undefined' ? AbortController : undefined,
    window: {},
    module: { exports: {} }
  });
  vm.runInContext(apiScriptMatch[1], apiContext, { filename: 'ScriptsApiClient.js' });
  const { ApiClient, ConnectionConfigStore, HttpJsonTransport, LocalDemoTransport } = apiContext.module.exports;

  // メモリベース モック localStorage ファクトリ
  const createMockStorage = () => {
    const map = new Map();
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => { map.set(k, String(v)); },
      removeItem: (k) => { map.delete(k); },
      _map: map
    };
  };

  // 14.1 ConnectionConfigStore 検証
  const cfgStorage = createMockStorage();
  const cfgStore = new ConnectionConfigStore(cfgStorage);
  assert(cfgStore.getConfig().mode === 'local_demo', 'ConnectionConfigStore: 初期状態は local_demo');

  const validExecUrl = 'https://script.google.com/macros/s/AKfycbx12345_abc-XYZ/exec';
  const validWorkspaceUrl = 'https://script.google.com/a/macros/example.co.jp/s/AKfycbx12345_abc/exec';
  assert(ConnectionConfigStore.validateEndpointUrl(validExecUrl).valid === true, 'URL検証: 標準 /exec URL を許可');
  assert(ConnectionConfigStore.validateEndpointUrl(validWorkspaceUrl).valid === true, 'URL検証: Google Workspace /a/macros/<domain>/s/.../exec URL を許可');
  assert(ConnectionConfigStore.validateEndpointUrl('https://script.google.com/macros/s/abc/dev').valid === false, 'URL検証: /dev URL を拒否');
  assert(ConnectionConfigStore.validateEndpointUrl('http://script.google.com/macros/s/abc/exec').valid === false, 'URL検証: http:// URL を拒否');
  assert(ConnectionConfigStore.validateEndpointUrl('https://evil.example.com/macros/s/abc/exec').valid === false, 'URL検証: 外部ドメイン URL を拒否');
  assert(ConnectionConfigStore.validateEndpointUrl(validExecUrl + '?token=leak').valid === false, 'URL検証: クエリパラメータ付き URL を拒否');

  cfgStorage.setItem('musicinfo_connection_config', '{invalid-json');
  assert(cfgStore.getConfig().mode === 'local_demo', 'ConnectionConfigStore: 破損 JSON 時でも local_demo へ安全フォールバック');

  cfgStore.saveConfig({ mode: 'http_api', endpointUrl: '  ' + validExecUrl + '  ', apiToken: ' token-123 ' });
  const savedCfg = cfgStore.getConfig();
  assert(savedCfg.mode === 'http_api' && savedCfg.endpointUrl === validExecUrl && savedCfg.apiToken === 'token-123', 'ConnectionConfigStore: 有効設定の正規化保存・取得');
  cfgStore.clearConfig();
  assert(cfgStore.getConfig().mode === 'local_demo', 'ConnectionConfigStore: clearConfig で local_demo 復帰');

  // 14.2 LocalDemoTransport CRUD & 境界検証
  const demoStorage = createMockStorage();
  const demoClient = new ApiClient({ storageAdapter: demoStorage });
  assert(demoClient.getMode() === 'local_demo', 'ApiClient: デフォルト起動モードが local_demo');

  const initData = await demoClient.getAllData();
  assert(Array.isArray(initData.tracks) && initData.tracks.length >= 12, 'LocalDemoTransport: 初回起動時に内蔵デモデータ（12曲以上）を返すこと');
  const demoArtists = new Set(initData.tracks.map(t => t.albumArtist));
  const demoAlbums = new Set(initData.tracks.map(t => `${t.albumArtist}:::${t.albumName}`));
  assert(demoArtists.size === 3 && demoAlbums.size === 4, 'LocalDemoTransport: デモデータが3アーティスト・4アルバム構成であること');
  assert(initData.tracks.some(t => t.cdNumber === 2), 'LocalDemoTransport: デモデータに複数Disc構成が含まれること');
  assert(initData.tracks.every(t => String(t.artworkUrl).startsWith('data:image/svg+xml')), 'LocalDemoTransport: デモジャケットが外部通信不要のSVG DataURIであること');

  // CRUD 永続化
  const singleRes = await demoClient.saveTrackSingle({
    cdNumber: 1, albumArtist: 'Local Artist', albumName: 'Local Album', trackNumber: 1, trackName: 'Local Song', releaseDate: '2026-01-01'
  });
  assert(singleRes && singleRes.savedTrack.trackName === 'Local Song', 'LocalDemoTransport: saveTrackSingle 成功');

  const batchRes = await demoClient.saveAlbumBatch({
    albumName: 'Batch Local', albumArtist: 'Local Artist', releaseDate: '2026-02-01',
    tracks: [{ cdNumber: 1, trackNumber: 1, trackName: 'B1' }, { cdNumber: 1, trackNumber: 2, trackName: 'B2' }]
  });
  assert(batchRes.count === 2, 'LocalDemoTransport: saveAlbumBatch 成功');

  const editRes = await demoClient.updateAlbumBatch({
    targetKey: { originalAlbumArtist: 'Local Artist', originalAlbumName: 'Batch Local' },
    album: { albumArtist: 'Local Artist', albumName: 'Batch Local Edited', releaseDate: '2026-02-02', artworkUrl: '' },
    tracks: [{ cdNumber: 1, trackNumber: 1, trackName: 'B1 Edited', trackArtist: 'Local Artist' }]
  });
  assert(editRes.updatedRowCount === 1 && editRes.albumName === 'Batch Local Edited', 'LocalDemoTransport: updateAlbumBatch 成功');

  // ローカル非対応操作 -> LOCAL_MODE_UNSUPPORTED
  for (const op of [
    () => demoClient.searchAlbums('test'),
    () => demoClient.searchItunes('test'),
    () => demoClient.lookupItunesAlbum(123),
    () => demoClient.lookupMusicBrainzRelease('11111111-1111-1111-1111-111111111111'),
    () => demoClient.resolveDriveArtwork({ driveUrlOrId: 'abc' })
  ]) {
    let unsupportedCode = null;
    try { await op(); } catch (e) { unsupportedCode = e.code; }
    assert(unsupportedCode === 'LOCAL_MODE_UNSUPPORTED', 'LocalDemoTransport: GASバックエンド専用機能で LOCAL_MODE_UNSUPPORTED を返すこと');
  }

  // ローカル画像アップロード (MIME・SVG拒否・正常DataURL返却)
  const localJpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  const localUpOk = await demoClient.uploadArtwork({ base64Data: localJpeg, mimeType: 'image/jpeg', albumName: 'Local' });
  assert(localUpOk.publicUrl === localJpeg, 'LocalDemoTransport.uploadArtwork: JPEG DataURL をそのまま publicUrl 返却');
  let svgRejected = false;
  try {
    await demoClient.uploadArtwork({ base64Data: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', mimeType: 'image/svg+xml' });
  } catch (e) { svgRejected = e.code === 'VALIDATION_FAILED'; }
  assert(svgRejected, 'LocalDemoTransport.uploadArtwork: SVG DataURL を VALIDATION_FAILED で拒否');

  // 全アルバム削除後に 0 件維持（勝手復活しないこと）& resetLocalDemoData() での復元
  const allNow = await demoClient.getAllData();
  const allKeysMap = new Map();
  allNow.tracks.forEach(t => allKeysMap.set(`${t.albumArtist}:::${t.albumName}`, { albumArtist: t.albumArtist, albumName: t.albumName }));
  await demoClient.deleteAlbumsBatch(Array.from(allKeysMap.values()));
  const afterDeleteAll = await demoClient.getAllData();
  assert(afterDeleteAll.totalTracks === 0, 'LocalDemoTransport: 全アルバム削除後にデモデータが勝手に復活せず 0 件を維持すること');

  const restored = await demoClient.resetLocalDemoData();
  assert(restored.totalTracks >= 12, 'LocalDemoTransport: resetLocalDemoData() でデモデータが復元されること');

  // 破損 JSON 復旧 & QuotaExceededError
  demoStorage.setItem('musicinfo_local_tracks', '{corrupted');
  const recovered = await demoClient.getAllData();
  assert(Array.isArray(recovered.tracks) && recovered.tracks.length === 0, 'LocalDemoTransport: 破損 JSON 時でも例外を出さず安全配列へ復旧すること');

  const quotaStorage = {
    getItem: () => null,
    setItem: () => { const e = new Error('Quota'); e.name = 'QuotaExceededError'; throw e; },
    removeItem: () => {}
  };
  const quotaTransport = new LocalDemoTransport(quotaStorage);
  let quotaErrCode = null;
  try {
    await quotaTransport.saveTrackSingle({
      albumArtist: 'Quota Artist',
      albumName: 'Quota Album',
      trackName: 'Quota Track',
      cdNumber: 1,
      trackNumber: 1
    });
  } catch (e) { quotaErrCode = e.code; }
  assert(quotaErrCode === 'LOCAL_STORAGE_QUOTA_EXCEEDED', 'LocalDemoTransport: 書込操作での QuotaExceededError 時に LOCAL_STORAGE_QUOTA_EXCEEDED を送出');

  // 14.3 HttpJsonTransport & ApiClient モード切替検証
  let capturedFetchArgs = null;
  const mockFetchOk = async (url, opts) => {
    capturedFetchArgs = { url, opts };
    const reqBody = JSON.parse(opts.body);
    return {
      status: 200,
      text: async () => JSON.stringify({
        success: true,
        data: reqBody.action === 'getAllData'
          ? { tracks: [{ cdNumber: 1, albumArtist: 'GAS Artist', albumName: 'GAS Album', trackNumber: 1, trackName: 'GAS Song', trackArtist: 'GAS Artist', releaseDate: '2026-03-01', artworkUrl: '' }], totalTracks: 1, loadedAt: '2026-11-14T00:00:00Z' }
          : { ok: true, action: reqBody.action }
      })
    };
  };

  const hybridStorage = createMockStorage();
  const hybridClient = new ApiClient({ storageAdapter: hybridStorage, fetchFn: mockFetchOk });
  const testConnRes = await hybridClient.testConnection(validExecUrl, 'my-secret-token');
  assert(testConnRes.ok === true && testConnRes.totalTracks === 1, 'ApiClient.testConnection: 事前接続テスト成功');
  assert(
    capturedFetchArgs.url === validExecUrl &&
    capturedFetchArgs.opts.method === 'POST' &&
    capturedFetchArgs.opts.credentials === 'omit' &&
    capturedFetchArgs.opts.headers['Content-Type'] === 'text/plain;charset=utf-8' &&
    Object.keys(capturedFetchArgs.opts.headers).length === 1,
    'HttpJsonTransport: POST + text/plain;charset=utf-8 + credentials:omit + カスタムヘッダなしで送信すること'
  );
  const sentJson = JSON.parse(capturedFetchArgs.opts.body);
  assert(sentJson.action === 'getAllData' && sentJson.token === 'my-secret-token', 'HttpJsonTransport: ボディ JSON に action と token が含まれること');

  hybridClient.saveAndActivateHttpConfig(validExecUrl, 'my-secret-token');
  assert(hybridClient.isHttpApiMode() === true, 'ApiClient: saveAndActivateHttpConfig で http_api モードへ切り替わること');
  const gasData = await hybridClient.getAllData();
  assert(gasData.tracks[0].albumArtist === 'GAS Artist', 'ApiClient: http_api モード時は HttpJsonTransport へ委譲されること');

  hybridClient.resetToLocalMode();
  assert(hybridClient.isHttpApiMode() === false, 'ApiClient: resetToLocalMode で local_demo モードへ戻ること');

  // HTML ログインページ返却時の診断エラー確認
  const htmlTransport = new HttpJsonTransport(
    () => ({ endpointUrl: validExecUrl, apiToken: 'tok' }),
    { fetchFn: async () => ({ status: 200, text: async () => '<html><body>Sign in - accounts.google.com</body></html>' }) }
  );
  let htmlDiagErr = null;
  try { await htmlTransport.getAllData(); } catch (e) { htmlDiagErr = e; }
  assert(
    htmlDiagErr && htmlDiagErr.code === 'INVALID_RESPONSE' && htmlDiagErr.message.includes('全員（匿名含む）'),
    'HttpJsonTransport: HTML応答時に ANYONE_ANONYMOUS 設定確認を促す INVALID_RESPONSE を返すこと'
  );

  // [BUG-002 回帰] HTTP 404 HTML 応答時にエンドポイント URL 確認案内が含まれること
  const html404Transport = new HttpJsonTransport(
    () => ({ endpointUrl: validExecUrl, apiToken: 'tok' }),
    { fetchFn: async () => ({ status: 404, text: async () => '<html><body>404 Not Found</body></html>' }) }
  );
  let html404Err = null;
  try { await html404Transport.getAllData(); } catch (e) { html404Err = e; }
  assert(
    html404Err && html404Err.code === 'INVALID_RESPONSE' && html404Err.message.includes('404') && html404Err.message.includes('エンドポイント URL'),
    'HttpJsonTransport: HTTP 404 HTML応答時にステータスとURL確認を案内する INVALID_RESPONSE を返すこと (BUG-002)'
  );

  // [BUG-002 回帰] ヘッダ受信後の response.text() ストールで REQUEST_TIMEOUT となること
  const bodyTimeoutTransport = new HttpJsonTransport(
    () => ({ endpointUrl: validExecUrl, apiToken: 'tok' }),
    {
      timeoutMs: 30,
      fetchFn: async () => ({
        status: 200,
        text: () => new Promise(() => {})
      })
    }
  );
  let bodyTimeoutErr = null;
  try { await bodyTimeoutTransport.getAllData(); } catch (e) { bodyTimeoutErr = e; }
  assert(
    bodyTimeoutErr && bodyTimeoutErr.code === 'REQUEST_TIMEOUT',
    'HttpJsonTransport: response.text() ストール時に REQUEST_TIMEOUT を送出すること (BUG-002)'
  );

  // [BUG-002 回帰] response.text() 実行中の通信断で NETWORK_ERROR となること
  const bodyNetErrTransport = new HttpJsonTransport(
    () => ({ endpointUrl: validExecUrl, apiToken: 'tok' }),
    {
      fetchFn: async () => ({
        status: 200,
        text: async () => { throw new TypeError('network stream aborted'); }
      })
    }
  );
  let bodyNetErr = null;
  try { await bodyNetErrTransport.getAllData(); } catch (e) { bodyNetErr = e; }
  assert(
    bodyNetErr && bodyNetErr.code === 'NETWORK_ERROR',
    'HttpJsonTransport: response.text() 通信断時に NETWORK_ERROR を送出すること (BUG-002)'
  );

  // [BUG-002 回帰] checkHealth にもタイムアウト・NETWORK_ERROR 分類が適用されること
  const healthTimeoutTransport = new HttpJsonTransport(
    () => ({ endpointUrl: validExecUrl, apiToken: 'tok' }),
    {
      timeoutMs: 25,
      fetchFn: async () => ({ status: 200, text: () => new Promise(() => {}) })
    }
  );
  let healthTimeoutErr = null;
  try { await healthTimeoutTransport.checkHealth(validExecUrl); } catch (e) { healthTimeoutErr = e; }
  assert(
    healthTimeoutErr && healthTimeoutErr.code === 'REQUEST_TIMEOUT',
    'HttpJsonTransport.checkHealth: タイムアウト時に REQUEST_TIMEOUT を送出すること (BUG-002)'
  );

  const healthNetTransport = new HttpJsonTransport(
    () => ({ endpointUrl: validExecUrl, apiToken: 'tok' }),
    { fetchFn: async () => { throw new TypeError('Failed to fetch'); } }
  );
  let healthNetErr = null;
  try { await healthNetTransport.checkHealth(validExecUrl); } catch (e) { healthNetErr = e; }
  assert(
    healthNetErr && healthNetErr.code === 'NETWORK_ERROR',
    'HttpJsonTransport.checkHealth: ネットワーク切断時に NETWORK_ERROR を送出すること (BUG-002)'
  );

  // [BUG-005 回帰] 初回 localStorage 書込不可時もデモデータがインメモリ返却されること
  const readOnlyFullStorage = {
    getItem: () => null,
    setItem: () => {
      const e = new Error('QuotaExceededError');
      e.name = 'QuotaExceededError';
      throw e;
    },
    removeItem: () => {}
  };
  const fallbackDemoTransport = new LocalDemoTransport(readOnlyFullStorage);
  const fallbackDemoRes = await fallbackDemoTransport.getAllData();
  assert(
    Array.isArray(fallbackDemoRes.tracks) && fallbackDemoRes.tracks.length >= 12,
    'LocalDemoTransport: 初回 localStorage 書込不可時でもデモデータをインメモリ返却すること (BUG-005)'
  );

  // [BUG-005 回帰] sanitizeArtworkUrl_ ホワイトリスト検証（file://・外部SVG遮断、https/bitmap許可）
  const sanitizerStorage = createMockStorage();
  sanitizerStorage.setItem('musicinfo_local_tracks', JSON.stringify({
    version: 1,
    tracks: [
      { cdNumber: 1, albumArtist: 'A', albumName: 'B1', trackName: 'T1', artworkUrl: 'file:///etc/passwd' },
      { cdNumber: 1, albumArtist: 'A', albumName: 'B2', trackName: 'T2', artworkUrl: 'data:image/svg+xml;charset=utf-8,<svg onload=alert(1)></svg>' },
      { cdNumber: 1, albumArtist: 'A', albumName: 'B3', trackName: 'T3', artworkUrl: 'https://example.com/cover.jpg' },
      { cdNumber: 1, albumArtist: 'A', albumName: 'B4', trackName: 'T4', artworkUrl: 'data:image/png;base64,iVBORw0KGgo=' }
    ]
  }));
  const sanitizerTransport = new LocalDemoTransport(sanitizerStorage);
  const sanitizedTracks = (await sanitizerTransport.getAllData()).tracks;
  assert(
    sanitizedTracks[0].artworkUrl === '' &&
    sanitizedTracks[1].artworkUrl === '' &&
    sanitizedTracks[2].artworkUrl === 'https://example.com/cover.jpg' &&
    sanitizedTracks[3].artworkUrl === 'data:image/png;base64,iVBORw0KGgo=',
    'LocalDemoTransport.sanitizeArtworkUrl_: file://・外部SVG を遮断し https/ビットマップDataURL のみ許可すること (BUG-005)'
  );

  // =============================================================================
  // [15] 接続設定 UI・App ハイブリッドモード統合検証
  // =============================================================================
  console.log('\n[15] 接続設定 UI・App ハイブリッドモード統合検証');
  const distIndexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  const requiredConnectionIds = [
    'btn-open-connection-modal',
    'connection-mode-badge',
    'connection-mode-dot',
    'modal-connection',
    'form-connection',
    'btn-close-connection-modal',
    'connection-current-mode-badge',
    'connection-endpoint-url',
    'connection-api-token',
    'btn-toggle-token-visibility',
    'connection-status-message',
    'btn-test-connection',
    'btn-save-connection',
    'btn-reset-connection',
    'btn-reset-demo-data',
    'btn-cancel-connection-modal'
  ];
  requiredConnectionIds.forEach(id => {
    assert(distIndexHtml.includes(`id="${id}"`), `dist/index.html に接続設定UI要素 id="${id}" が存在する`);
  });

  // 動的 App シミュレーション (local_demo 起動 -> http_api 切替 -> local_demo リセット)
  const makeMockEl = (id, init = {}) => {
    const cls = new Set(init.classes || []);
    const attrs = {};
    return {
      id,
      value: init.value || '',
      type: init.type || 'text',
      textContent: '',
      innerHTML: '',
      title: '',
      disabled: false,
      style: {},
      classList: {
        add: (...cs) => cs.forEach(c => cls.add(c)),
        remove: (...cs) => cs.forEach(c => cls.delete(c)),
        toggle: (c, f) => { if (f === undefined) { if (cls.has(c)) cls.delete(c); else cls.add(c); } else if (f) cls.add(c); else cls.delete(c); },
        contains: (c) => cls.has(c)
      },
      setAttribute: (k, v) => { attrs[k] = String(v); },
      getAttribute: (k) => attrs[k] || null,
      addEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      focus: () => {},
      ...init
    };
  };

  const simElements = {};
  [
    'btn-open-connection-modal', 'connection-mode-badge', 'connection-mode-dot',
    'modal-connection', 'connection-current-mode-badge', 'connection-endpoint-url',
    'connection-api-token', 'connection-status-message', 'btn-test-connection',
    'btn-save-connection', 'btn-reset-connection', 'btn-reset-demo-data',
    'btn-close-connection-modal', 'btn-cancel-connection-modal', 'btn-reload-data',
    'artist-filter-input', 'artist-filter-clear', 'global-loading', 'global-loading-text',
    'header-search-input', 'header-search-clear', 'pc-search-dropdown', 'pc-search-results',
    'mobile-search-input', 'mobile-search-clear', 'mobile-search-dropdown', 'mobile-search-results',
    'itunes-search-input', 'itunes-results-container', 'itunes-preview-empty',
    'itunes-preview-content', 'itunes-preview-artwork', 'itunes-preview-album',
    'itunes-preview-artist', 'itunes-preview-meta', 'itunes-preview-tracks-tbody',
    'itunes-selected-summary', 'btn-submit-itunes-batch',
    'edit-album-art-preview', 'edit-album-artwork-url', 'edit-album-name', 'btn-edit-album-upload'
  ].forEach(id => { simElements[id] = makeMockEl(id); });

  const simStorage = createMockStorage();
  const simApiClient = new ApiClient({ storageAdapter: simStorage, fetchFn: mockFetchOk });
  const simAppHtml = fs.readFileSync(path.join(srcDir, 'ScriptsApp.html'), 'utf8');
  const simStateHtml = fs.readFileSync(path.join(srcDir, 'ScriptsState.html'), 'utf8');
  const simUtilsHtml = fs.readFileSync(path.join(srcDir, 'ScriptsUtils.html'), 'utf8');

  const appCtx = vm.createContext({
    console, Date, Math, JSON, Set, Map, Error, Promise, String, Number, Array, Object,
    RegExp, encodeURIComponent, setTimeout, clearTimeout,
    window: { innerWidth: 1280, addEventListener: () => {} },
    document: {
      getElementById: (id) => simElements[id] || null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => makeMockEl('dyn')
    },
    Utils: null,
    ApiClient: null,
    Store: null
  });
  vm.runInContext(simUtilsHtml.match(/<script>([\s\S]*?)<\/script>/)[1], appCtx);
  appCtx.ApiClient = function() { return simApiClient; };
  vm.runInContext(simStateHtml.match(/<script>([\s\S]*?)<\/script>/)[1], appCtx);
  vm.runInContext(simAppHtml.match(/<script>([\s\S]*?)<\/script>/)[1], appCtx);

  const simApp = new appCtx.window.App();
  await simApp.init();
  assert(simApp.store.state.allTracks.length >= 12, 'App.init(): 未設定状態でローカルデモデータが自動ロードされること');
  assert(simElements['connection-mode-badge'].textContent === 'デモ/ローカル', 'App.init(): 初期モードバッジが「デモ/ローカル」になること');

  // トーストスパイ（BUG-003 検証用）
  const recordedToasts = [];
  const origShowToast = appCtx.window.Utils.showToast;
  appCtx.window.Utils.showToast = (msg, type, duration) => {
    recordedToasts.push({ msg, type });
    return origShowToast(msg, type, duration);
  };

  // [BUG-003 回帰] handleSaveAndConnect で 2回目の getAllData (loadInitialData) が失敗した場合は偽成功トーストを出さないこと
  let transientCallCount = 0;
  const transientClient = new ApiClient({
    storageAdapter: createMockStorage(),
    fetchFn: async () => {
      transientCallCount += 1;
      if (transientCallCount === 1) {
        return {
          status: 200,
          text: async () => JSON.stringify({ success: true, data: { tracks: [], totalTracks: 0 } })
        };
      }
      throw new TypeError('Transient network failure');
    }
  });
  const transientApp = new appCtx.window.App();
  transientApp.api = transientClient;
  simElements['connection-endpoint-url'].value = validExecUrl;
  simElements['connection-api-token'].value = 'secret-token';
  recordedToasts.length = 0;
  await transientApp.handleSaveAndConnect();
  assert(
    !recordedToasts.some(t => t.msg.includes('GAS バックエンド連携モードへ切り替えました')) &&
    recordedToasts.some(t => t.type === 'error' && t.msg.includes('データ取得失敗')) &&
    !simElements['modal-connection'].classList.contains('hidden'),
    'App.handleSaveAndConnect(): loadInitialData 失敗時に偽成功トーストを出さず接続モーダルを再オープンすること (BUG-003)'
  );

  // 正常切替 + BUG-004 モード切替後の iTunes モーダル・検索欄 DOM リセット確認
  simApp.store.state.selectedArtist = 'Neon Horizon';
  simApp.store.state.isAlbumSelectMode = true;
  simApp.store.state.selectedAlbumKeysForDeletion.add('Neon Horizon:::Midnight Boulevard');
  simElements['itunes-search-input'].value = 'Old Query';
  simElements['itunes-results-container'].innerHTML = '<div class="itunes-result-item">Old Result</div>';
  simElements['itunes-preview-content'].classList.remove('hidden');
  simElements['itunes-preview-empty'].classList.add('hidden');
  simElements['btn-submit-itunes-batch'].disabled = false;
  simElements['header-search-input'].value = 'Old Global Query';
  simElements['mobile-search-input'].value = 'Old Mobile Query';
  simElements['pc-search-dropdown'].classList.remove('hidden');

  simElements['connection-endpoint-url'].value = validExecUrl;
  simElements['connection-api-token'].value = 'secret-token';
  await simApp.handleSaveAndConnect();

  assert(simApiClient.isHttpApiMode() === true, 'App.handleSaveAndConnect(): http_api モードへ移行すること');
  assert(simApp.store.state.isAlbumSelectMode === false && simApp.store.state.selectedAlbumKeysForDeletion.size === 0, 'App.handleSaveAndConnect(): モード切替時に削除選択状態がリセットされること');
  assert(simApp.store.state.allTracks[0].albumArtist === 'GAS Artist', 'App.handleSaveAndConnect(): GAS側データで再ロードされること');
  assert(simElements['connection-mode-badge'].textContent === 'GAS連携中', 'App.handleSaveAndConnect(): モードバッジが「GAS連携中」に更新されること');

  await simApp.handleResetConnection();
  assert(simApiClient.isHttpApiMode() === false, 'App.handleResetConnection(): local_demo モードへ復帰すること');
  assert(simElements['connection-mode-badge'].textContent === 'デモ/ローカル', 'App.handleResetConnection(): モードバッジが「デモ/ローカル」に戻ること');
  assert(
    simElements['itunes-search-input'].value === '' &&
    !simElements['itunes-results-container'].innerHTML.includes('Old Result') &&
    simElements['itunes-preview-content'].classList.contains('hidden') &&
    !simElements['itunes-preview-empty'].classList.contains('hidden') &&
    simElements['btn-submit-itunes-batch'].disabled === true &&
    simElements['header-search-input'].value === '' &&
    simElements['mobile-search-input'].value === '' &&
    simElements['pc-search-dropdown'].classList.contains('hidden'),
    'App.handleResetConnection(): iTunesモーダルDOMおよび検索入力・ドロップダウンが初期化されること (BUG-004)'
  );

  // [BUG-005 回帰] 画像アップロード失敗時のプレビューロールバック検証
  simElements['edit-album-artwork-url'].value = 'https://example.com/original-cover.jpg';
  simElements['edit-album-art-preview'].src = 'https://example.com/original-cover.jpg';
  appCtx.window.Utils.resizeImage = async () => 'data:image/jpeg;base64,NEW_TEMP_DATA';
  const origUploadArtwork = simApp.api.uploadArtwork.bind(simApp.api);
  simApp.api.uploadArtwork = async () => { throw new Error('Simulated upload quota exceeded'); };
  await simApp.handleImageUpload({ target: { files: [{ name: 'test.jpg', type: 'image/jpeg', size: 1024 }], value: 'C:\\fakepath\\test.jpg' } }, 'editAlbum');
  simApp.api.uploadArtwork = origUploadArtwork;
  assert(
    simElements['edit-album-art-preview'].src === 'https://example.com/original-cover.jpg',
    'App.handleImageUpload(): uploadArtwork 失敗時にプレビュー画像が元の URL へロールバックされること (BUG-005)'
  );

  // [BUG-006 回帰] build.js の置換関数ガード（$$ / $& パターン耐性）検証
  const buildJsContent = fs.readFileSync(path.join(__dirname, '..', 'build.js'), 'utf8');
  assert(
    buildJsContent.includes('() => content') && buildJsContent.includes('() => combinedScriptBlock'),
    'build.js: String.replace の特殊置換記号 ($$ / $&) 耐性のためコールバック置換を使用していること (BUG-006)'
  );

  console.log('\n==================================================');
  console.log(`テスト結果サマリー: 成功 = ${passCount}, 失敗 = ${failCount}`);
  console.log('==================================================');

  if (failCount > 0) {
    process.exit(1);
  } else {
    console.log('全単体テスト & 構文検証をパスしました！');
  }
})().catch((err) => {
  console.error('非同期テスト実行中の予期しないエラー:', err);
  process.exit(1);
});
