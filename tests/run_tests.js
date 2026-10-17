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
assert(driveService.generateWebUrl('abc123xyz') === 'https://drive.google.com/uc?export=view&id=abc123xyz', 'Web表示URL生成');

// 3. ItunesService のテスト
console.log('\n[3] ItunesService のテスト');
const ItunesService = require('../src/ItunesService');
const itunesService = new ItunesService();

assert(
  itunesService.convertTo500x500ArtworkUrl('https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/100x100bb.jpg') ===
  'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/500x500bb.jpg',
  '500x500アートワークURL置換'
);

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
  () => musicService.lookupItunesAlbum(''),
  'VALIDATION_FAILED',
  '空コレクションIDでのLookup例外'
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
const jsFiles = ['Config.js', 'SheetService.js', 'DriveService.js', 'ItunesService.js', 'MusicService.js', 'Code.js'];
jsFiles.forEach((file) => {
  const code = fs.readFileSync(path.join(srcDir, file), 'utf8');
  try {
    new vm.Script(code);
    assert(true, `${file} 構文チェック正常`);
  } catch (err) {
    assert(false, `${file} 構文エラー: ${err.message}`);
  }
});

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

console.log('\n==================================================');
console.log(`テスト結果サマリー: 成功 = ${passCount}, 失敗 = ${failCount}`);
console.log('==================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('全単体テスト & 構文検証をパスしました！');
}
