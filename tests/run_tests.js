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
assert(driveService.generateWebUrl('abc123xyz') === 'https://drive.google.com/thumbnail?id=abc123xyz&sz=w800', 'Web表示URL生成');

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

// Google Drive URL解決 & ID抽出テスト
assert(Utils.extractDriveFileId('https://drive.google.com/uc?export=view&id=FILE_123_abc') === 'FILE_123_abc', 'Drive uc?id からのID抽出');
assert(Utils.extractDriveFileId('https://drive.google.com/file/d/FILE_456_def/view?usp=sharing') === 'FILE_456_def', 'Drive /file/d/ からのID抽出');
assert(Utils.extractDriveFileId('https://drive.google.com/open?id=FILE_789_ghi') === 'FILE_789_ghi', 'Drive open?id からのID抽出');
assert(Utils.extractDriveFileId('https://lh3.googleusercontent.com/d/FILE_XYZ_000') === 'FILE_XYZ_000', 'lh3.googleusercontent.com からのID抽出');
assert(Utils.extractDriveFileId('https://is1-ssl.mzstatic.com/image.jpg') === null, '非Drive URLでのnull返却');

assert(
  Utils.resolveArtworkUrl('https://drive.google.com/uc?export=view&id=testId123', 400) ===
  'https://drive.google.com/thumbnail?id=testId123&sz=w400',
  'Google Drive URLのサムネイルURL変換'
);
assert(
  Utils.resolveArtworkUrl('https://is1-ssl.mzstatic.com/image.jpg', 400) ===
  'https://is1-ssl.mzstatic.com/image.jpg',
  '通常画像URLの維持'
);
assert(Utils.resolveArtworkUrl('', 400) === '', '空文字URLの処理');

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
const validResult = musicServiceWithMock.updateAlbum({
  targetKey: { originalAlbumArtist: 'Artist', originalAlbumName: 'Album' },
  album: { albumArtist: 'New Artist', albumName: 'New Album' },
  tracks: [{ cdNumber: 1, trackNumber: 1, trackName: 'Track 1' }]
});
assert(validResult.updatedRowCount === 1, '正常なアルバム編集処理の成功');

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

// 9. src/index.html バンドル成果物の構文およびセキュリティ検査
console.log('\n[9] src/index.html バンドル成果物の構文およびセキュリティ検査');
try {
  const indexHtmlPath = path.join(srcDir, 'index.html');
  assert(fs.existsSync(indexHtmlPath), 'src/index.html が存在する');
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

  // インライン onerror 属性の不在検証
  const onerrorMatch = indexHtml.match(/\bonerror\s*=\s*["'][^"']*["']/i);
  assert(!onerrorMatch, 'src/index.html 内にインライン onerror 属性が存在しないこと');

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

console.log('\n==================================================');
console.log(`テスト結果サマリー: 成功 = ${passCount}, 失敗 = ${failCount}`);
console.log('==================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('全単体テスト & 構文検証をパスしました！');
}
