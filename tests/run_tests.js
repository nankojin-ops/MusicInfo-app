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
            typeof include === 'function',
            typeof getMusicService === 'function',
            typeof apiGetAllData === 'function',
            typeof apiSearchAlbums === 'function',
            typeof apiSearchItunes === 'function',
            typeof apiLookupItunesAlbum === 'function',
            typeof apiLookupMusicBrainzRelease === 'function',
            typeof apiSaveAlbumBatch === 'function',
            typeof apiSaveTrackSingle === 'function',
            typeof apiUpdateAlbumBatch === 'function'
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
  assert(manifest.oauthScopes.length === 3, 'appsscript.json oauthScopes 3件定義');
} catch (err) {
  assert(false, `appsscript.json パースエラー: ${err.message}`);
}

// 9. src/index.html バンドル成果物の構文・文言・セキュリティ検査
console.log('\n[9] src/index.html バンドル成果物の構文およびセキュリティ検査');
try {
  const indexHtmlPath = path.join(srcDir, 'index.html');
  assert(fs.existsSync(indexHtmlPath), 'src/index.html が存在する');
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  const navbarHtml = fs.readFileSync(path.join(srcDir, 'Navbar.html'), 'utf8');
  const itunesModalHtml = fs.readFileSync(path.join(srcDir, 'ItunesModal.html'), 'utf8');

  // インライン onerror 属性の不在検証 (AC-10)
  const onerrorMatch = indexHtml.match(/\bonerror\s*=\s*["'][^"']*["']/i);
  assert(!onerrorMatch, 'src/index.html 内にインライン onerror 属性が存在しないこと (AC-10)');

  // ボタン名称・モーダル見出しの更新と旧文言不在検証 (AC-16, AC-17, AC-18)
  assert(navbarHtml.includes('アルバム検索・一括登録') && navbarHtml.includes('>一括登録<'), 'Navbar.html に新ボタン名称（アルバム検索・一括登録 / 一括登録）が含まれること (AC-16)');
  assert(itunesModalHtml.includes('アルバムを検索して一括登録') && itunesModalHtml.includes('iTunes / MusicBrainz'), 'ItunesModal.html に新見出しと補足表記が含まれること (AC-17)');
  assert(indexHtml.includes('アルバム検索・一括登録') && indexHtml.includes('アルバムを検索して一括登録'), 'src/index.html にビルド後の新文言が反映されていること (AC-18)');
  assert(
    !indexHtml.includes('iTunesから一括登録') &&
    !indexHtml.includes('iTunes登録') &&
    !indexHtml.includes('iTunes一括登録'),
    'src/index.html に旧ボタン文言（iTunesから一括登録 / iTunes登録 / iTunes一括登録）が残存していないこと (AC-18)'
  );

  // 全 <script> タグの構文解析
  const scriptTags = [...indexHtml.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi)];
  let allScriptsOk = true;
  scriptTags.forEach((m, idx) => {
    const code = m[1].trim();
    if (!code) return; // 外部CDNタグ等
    try {
      new vm.Script(code, { filename: `index_script_${idx + 1}.js` });
    } catch (err) {
      allScriptsOk = false;
      console.error(`  ✗ FAIL: src/index.html 内 script #${idx + 1} 構文エラー: ${err.message}`);
    }
  });
  assert(allScriptsOk, 'src/index.html 内の全 script ブロックが構文エラーなくパース可能');
} catch (err) {
  assert(false, `src/index.html 検証エラー: ${err.message}`);
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
const indexHtmlForModal = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');
assert(indexHtmlForModal.includes('id="modal-drive-artwork"'), 'src/index.html に DriveArtworkModal がバンドルされていること');
assert(indexHtmlForModal.includes('id="btn-edit-album-upload"'), 'src/index.html に EditAlbumModal のローカル選択ボタンが存在すること');
assert(indexHtmlForModal.includes('id="btn-edit-album-drive"'), 'src/index.html に EditAlbumModal のDrive追加ボタンが存在すること');
assert(indexHtmlForModal.includes('id="btn-manual-upload"'), 'src/index.html に ManualModal のローカル選択ボタンが存在すること');
assert(indexHtmlForModal.includes('id="btn-manual-drive"'), 'src/index.html に ManualModal のDrive追加ボタンが存在すること');
assert(indexHtmlForModal.includes('id="manual-art-preview"'), 'src/index.html に ManualModal のプレビュー画像枠が存在すること');

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
  assert(indexHtmlForModal.includes(`id="${btnId}"`), `src/index.html に親フォーム関連ボタン id="${btnId}" が存在する (BUG-002)`);
  assert(scriptsAppHtml.includes(`'${btnId}'`), `ScriptsApp.html の handleImageUpload で '${btnId}' が非活性化対象に含まれている (BUG-002)`);
});

assert(scriptsAppHtml.includes('relatedBtns.forEach(btn => { btn.disabled = true; });'), 'handleImageUpload: アップロード中に親フォームボタンが disabled 化される (BUG-002)');
assert(scriptsAppHtml.includes('relatedBtns.forEach(btn => { btn.disabled = false; });'), 'handleImageUpload: finally ブロックで親フォームボタンが活性化復帰される (BUG-002)');

console.log('\n==================================================');
console.log(`テスト結果サマリー: 成功 = ${passCount}, 失敗 = ${failCount}`);
console.log('==================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('全単体テスト & 構文検証をパスしました！');
}
