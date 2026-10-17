/**
 * Red Team 破壊的テスト & セキュリティ脆弱性検証スクリプト
 * Target: MusicInfo-app
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const findings = [];

function recordResult(testName, passed, detail = '', severity = 'INFO') {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] [${severity}] ${testName} - ${detail}`);
    findings.push({ testName, severity, detail });
  }
}

console.log('================================================================');
console.log('  RED TEAM ATTACK & ROBUSTNESS TEST SUITE');
console.log('  Target: MusicInfo-app (GAS + Frontend + Components)');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// [TEST SUITE 1] 境界値・異常値・クラッシュ注入テスト
// -----------------------------------------------------------------------------
console.log('>>> [1] 境界値・型違い・極限値注入テスト (MusicService / Config)');

const Config = require('../src/Config');
const DriveService = require('../src/DriveService');
const ItunesService = require('../src/ItunesService');
const MusicService = require('../src/MusicService');
const SheetService = require('../src/SheetService');

// モック環境のセットアップ
global.PropertiesService = {
  getScriptProperties: () => ({
    getProperties: () => ({
      SPREADSHEET_ID: 'valid-test-sheet-id',
      DRIVE_FOLDER_ID: 'valid-test-drive-id',
      SHEET_NAME: 'MusicTracks'
    })
  })
};

const mockConfig = new Config();
const mockDriveService = new DriveService(mockConfig);
const mockItunesService = new ItunesService();
let insertedRows = [];
const mockSheetService = {
  insertTracksBatch: (tracks, meta, artworkUrl) => {
    insertedRows.push({ tracks, meta, artworkUrl });
    return tracks.length;
  },
  appendSingleTrack: (trackPayload) => {
    insertedRows.push(trackPayload);
    return trackPayload;
  },
  fetchAllTracks: () => []
};

const musicService = new MusicService(mockConfig, mockSheetService, mockDriveService, mockItunesService);

// 1.1 saveSingleTrack: cdNumber / trackNumber 境界値テスト
const cdNumberPayloads = [
  { val: 0, shouldFail: true, desc: 'CD番号: 0' },
  { val: -1, shouldFail: true, desc: 'CD番号: 負数(-1)' },
  { val: -99999, shouldFail: true, desc: 'CD番号: 巨大負数(-99999)' },
  { val: NaN, shouldFail: true, desc: 'CD番号: NaN' },
  { val: 'NaN', shouldFail: true, desc: 'CD番号: 文字列 "NaN"' },
  { val: '１', shouldFail: true, desc: 'CD番号: 全角１ ("１" -> NaN)' },
  { val: 'abc', shouldFail: true, desc: 'CD番号: 英字 "abc"' },
  { val: '', shouldFail: false, desc: 'CD番号: 空文字 (デフォルト1にフォールバック)' },
  { val: null, shouldFail: false, desc: 'CD番号: null (デフォルト1にフォールバック)' },
  { val: undefined, shouldFail: false, desc: 'CD番号: undefined (デフォルト1にフォールバック)' },
  { val: 1, shouldFail: false, desc: 'CD番号: 正常値 1' },
  { val: 999999999999999, shouldFail: false, desc: 'CD番号: 巨大整数 999999999999999' },
  { val: 1.5, shouldFail: true, desc: 'CD番号: 小数点 (1.5) は整数でないため拒絶されるべき' },
  { val: Infinity, shouldFail: true, desc: 'CD番号: Infinity は拒絶されるべき' }
];

cdNumberPayloads.forEach((tc) => {
  try {
    musicService.saveSingleTrack({
      cdNumber: tc.val,
      albumArtist: 'Test Artist',
      albumName: 'Test Album',
      trackName: 'Test Track',
      trackNumber: 1
    });
    // 成功した場合
    if (tc.shouldFail) {
      recordResult(`saveSingleTrack(${tc.desc})`, false, `例外が発生せず受け入れられてしまった (値: ${tc.val})`, 'HIGH');
    } else {
      recordResult(`saveSingleTrack(${tc.desc})`, true);
    }
  } catch (err) {
    if (tc.shouldFail) {
      recordResult(`saveSingleTrack(${tc.desc})`, true);
    } else {
      recordResult(`saveSingleTrack(${tc.desc})`, false, `予期せぬ例外: ${err.message}`, 'MEDIUM');
    }
  }
});

// 1.2 saveSingleTrack: trackNumber 境界値テスト
const trackNumberPayloads = [
  { val: 0, shouldFail: true, desc: 'トラック番号: 0' },
  { val: -5, shouldFail: true, desc: 'トラック番号: 負数(-5)' },
  { val: NaN, shouldFail: true, desc: 'トラック番号: NaN' },
  { val: 2.5, shouldFail: true, desc: 'トラック番号: 小数点 (2.5) は整数でないため拒絶されるべき' },
  { val: Infinity, shouldFail: true, desc: 'トラック番号: Infinity は拒絶されるべき' }
];

trackNumberPayloads.forEach((tc) => {
  try {
    musicService.saveSingleTrack({
      cdNumber: 1,
      albumArtist: 'Test Artist',
      albumName: 'Test Album',
      trackName: 'Test Track',
      trackNumber: tc.val
    });
    if (tc.shouldFail) {
      recordResult(`saveSingleTrack(${tc.desc})`, false, `例外が発生せず受け入れられてしまった (値: ${tc.val})`, 'HIGH');
    } else {
      recordResult(`saveSingleTrack(${tc.desc})`, true);
    }
  } catch (err) {
    if (tc.shouldFail) {
      recordResult(`saveSingleTrack(${tc.desc})`, true);
    } else {
      recordResult(`saveSingleTrack(${tc.desc})`, false, `予期せぬ例外: ${err.message}`, 'MEDIUM');
    }
  }
});

// 1.3 超長大文字列 (10,000文字) & 特殊Unicode注入
console.log('\n>>> [1.3] 超長大文字列 & Unicodeサロゲートペア注入');
const megaString = 'A'.repeat(10000);
const unicodeString = '𠮷野家👨‍👩‍👧‍👦\uD83D\uDE00\u202E\u0000テスト'; // サロゲートペア、結合絵文字、RTL制御、ヌル文字

try {
  musicService.saveSingleTrack({
    cdNumber: 1,
    albumArtist: megaString,
    albumName: unicodeString,
    trackName: 'Normal Track',
    trackNumber: 1
  });
  // 要件・詳細設計で文字列長255文字制限が定義されているか
  recordResult('saveSingleTrack(10,000文字注入)', false, '255文字超過の超長大文字列がバリデーションを通過して保存された（文字長バリデーション欠落）', 'MEDIUM');
} catch (err) {
  recordResult('saveSingleTrack(10,000文字注入)', true);
}

// 1.4 saveAlbumFromItunes: tracks 配列破壊テスト
console.log('\n>>> [1.4] saveAlbumFromItunes tracks 配列破壊テスト');
const corruptTrackArrays = [
  { tracks: [], desc: 'tracks が空配列' },
  { tracks: null, desc: 'tracks が null' },
  { tracks: [null], desc: 'tracks に null が混入' },
  { tracks: [undefined], desc: 'tracks に undefined が混入' },
  { tracks: [{}], desc: 'tracks に空オブジェクトが混入' },
  { tracks: ['invalid_string'], desc: 'tracks に非オブジェクト文字列が混入' }
];

corruptTrackArrays.forEach((tc) => {
  try {
    musicService.saveAlbumFromItunes({
      albumName: 'Corrupt Album',
      albumArtist: 'Corrupt Artist',
      tracks: tc.tracks
    });
    // 空配列やnull混入で通ってしまった場合
    recordResult(`saveAlbumFromItunes(${tc.desc})`, false, '不正なトラック配列が例外なく処理された', 'HIGH');
  } catch (err) {
    // 適切なエラーコードか、未処理TypeErrorか
    if (err instanceof TypeError) {
      recordResult(`saveAlbumFromItunes(${tc.desc})`, false, `未処理 TypeError が発生: ${err.message}`, 'HIGH');
    } else {
      recordResult(`saveAlbumFromItunes(${tc.desc})`, true, `適切にエラー送出: ${err.message}`);
    }
  }
});

// 1.5 非文字列キーワード注入: searchItunesAlbums(12345) / searchItunesAlbums({})
console.log('\n>>> [1.5] searchItunesAlbums 非文字列注入');
const nonStringKeywords = [
  { val: 12345, desc: '数値をキーワードに渡す' },
  { val: {}, desc: 'オブジェクトをキーワードに渡す' },
  { val: true, desc: '真偽値をキーワードに渡す' }
];

nonStringKeywords.forEach((tc) => {
  try {
    musicService.searchItunesAlbums(tc.val);
    recordResult(`searchItunesAlbums(${tc.desc})`, true);
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('trim is not a function')) {
      recordResult(`searchItunesAlbums(${tc.desc})`, false, `未処理 TypeError (keyword.trim is not a function): ${err.message}`, 'HIGH');
    } else {
      recordResult(`searchItunesAlbums(${tc.desc})`, true);
    }
  }
});


// -----------------------------------------------------------------------------
// [TEST SUITE 2] セキュリティ & エクスプロイト検証
// -----------------------------------------------------------------------------
console.log('\n>>> [2] セキュリティ & エクスプロイト検証 (XSS, Drive, Config)');

// 2.1 XSS サニタイズ完全性検証
const utilsContent = fs.readFileSync(path.join(__dirname, '../src/ScriptsUtils.html'), 'utf8');
const scriptTagRegex = /<script>([\s\S]*?)<\/script>/;
const utilsJs = (utilsContent.match(scriptTagRegex) || [])[1];
const utilsSandbox = {};
vm.createContext(utilsSandbox);
vm.runInContext(utilsJs + '\nthis.Utils = Utils;', utilsSandbox);
const Utils = utilsSandbox.Utils;

const xssPayloads = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  'javascript:alert(1)',
  '"><script>alert(document.cookie)</script>',
  '\' onfocus=\'alert(1)',
  '<svg/onload=alert(1)>',
  '<iframe src="javascript:alert(1)"></iframe>'
];

let xssEscapedAll = true;
xssPayloads.forEach((payload) => {
  const escaped = Utils.escapeHtml(payload);
  if (escaped.includes('<') || escaped.includes('>') || escaped.includes('"') || escaped.includes("'")) {
    xssEscapedAll = false;
    recordResult(`Utils.escapeHtml("${payload}")`, false, `危険な記号が残留: ${escaped}`, 'CRITICAL');
  }
});
if (xssEscapedAll) {
  recordResult('Utils.escapeHtml 全XSS記号エスケープ検証', true);
}

// 2.2 DriveService ファイル名サニタイズ & ディレクトリトラバーサル検証
console.log('\n>>> [2.2] DriveService ファイル名サニタイズ検証');
const driveSanitizeTests = [
  { input: '../../../../etc/passwd', expectedNotContain: ['/', '\\', '..'], desc: 'パストラバーサル相対パス' },
  { input: '..\\..\\windows\\system32\\calc.exe', expectedNotContain: ['\\', '/'], desc: 'Windows UNC パス' },
  { input: 'CON', desc: 'Windows予約デバイス名 CON' },
  { input: 'PRN', desc: 'Windows予約デバイス名 PRN' },
  { input: 'AUX', desc: 'Windows予約デバイス名 AUX' },
  { input: 'NUL', desc: 'Windows予約デバイス名 NUL' },
  { input: 'Album: "Best" / Hits * 2026? <New> | Special', expectedNotContain: [':', '"', '/', '*', '?', '<', '>', '|'], desc: '禁止記号全種' },
  { input: '///', desc: 'スラッシュのみ' },
  { input: '   ', desc: '空白のみ' },
  { input: 'A'.repeat(500), desc: '500文字の超長大アルバム名' },
  { input: 'Album\0Name\x01\x1F', desc: 'ヌル文字およびASCII制御文字' }
];

driveSanitizeTests.forEach((tc) => {
  const sanitized = mockDriveService.sanitizeFileName(tc.input);
  let safe = true;
  let reason = '';

  if (!sanitized || sanitized.length === 0) {
    safe = false;
    reason = 'サニタイズ結果が空文字';
  } else if (sanitized.length > 60) {
    safe = false;
    reason = `文字長が60文字を超過 (${sanitized.length}文字)`;
  } else if (tc.expectedNotContain) {
    for (const char of tc.expectedNotContain) {
      if (sanitized.includes(char)) {
        safe = false;
        reason = `禁止文字 [${char}] が残留: ${sanitized}`;
        break;
      }
    }
  }

  // ヌル文字検査
  if (sanitized.includes('\0')) {
    safe = false;
    reason = `ヌル文字 (\\0) がファイル名に残留: ${sanitized}`;
  }

  if (safe) {
    recordResult(`DriveService.sanitizeFileName(${tc.desc})`, true);
  } else {
    recordResult(`DriveService.sanitizeFileName(${tc.desc})`, false, reason, 'MEDIUM');
  }
});

// 2.3 プロパティ未設定時の安全なフォールバック
console.log('\n>>> [2.3] プロパティ未設定時の安全な例外・フォールバック検証');
global.PropertiesService = {
  getScriptProperties: () => ({
    getProperties: () => ({})
  })
};

const brokenConfig = new Config();
try {
  brokenConfig.getSpreadsheetId();
  recordResult('Config.getSpreadsheetId (未設定時)', false, '未設定なのに例外が発生しなかった', 'HIGH');
} catch (err) {
  if (err.code === 'CONFIG_SPREADSHEET_ID_MISSING') {
    recordResult('Config.getSpreadsheetId (未設定時)', true);
  } else {
    recordResult('Config.getSpreadsheetId (未設定時)', false, `コード不一致: ${err.code}`, 'MEDIUM');
  }
}

try {
  brokenConfig.getDriveFolderId();
  recordResult('Config.getDriveFolderId (未設定時)', false, '未設定なのに例外が発生しなかった', 'HIGH');
} catch (err) {
  if (err.code === 'CONFIG_DRIVE_FOLDER_ID_MISSING') {
    recordResult('Config.getDriveFolderId (未設定時)', true);
  } else {
    recordResult('Config.getDriveFolderId (未設定時)', false, `コード不一致: ${err.code}`, 'MEDIUM');
  }
}

// 2.4 スプレッドシート式インジェクション (CSV/Formula Injection)
console.log('\n>>> [2.4] スプレッドシート式インジェクション検証');
const formulaPayloads = [
  '=SUM(1,2)',
  '=cmd|\' /C calc\'!A0',
  '-5+2',
  '+10-3',
  '@SUM(B1:B10)'
];

formulaPayloads.forEach((formula) => {
  insertedRows = [];
  try {
    musicService.saveSingleTrack({
      cdNumber: 1,
      albumArtist: formula,
      albumName: 'Formula Test',
      trackName: formula,
      trackNumber: 1
    });
    const saved = insertedRows[insertedRows.length - 1];
    // 式インジェクション（=で始まる文字列）の無害化（先頭シングルクォート等）が行われているか
    if (saved && String(saved.albumArtist).startsWith('=')) {
      recordResult(`CSV/式インジェクション (${formula})`, false, '先頭の "=" がエスケープされずにスプレッドシートへ直接書き込まれる仕様（式実行の可能性あり）', 'LOW');
    } else {
      recordResult(`CSV/式インジェクション (${formula})`, true);
    }
  } catch (err) {
    recordResult(`CSV/式インジェクション (${formula})`, true);
  }
});


// -----------------------------------------------------------------------------
// [TEST SUITE 3] 状態破壊 & レースコンディション検証
// -----------------------------------------------------------------------------
console.log('\n>>> [3] 状態破壊 & レースコンディション検証 (Store / Search)');

const storeContent = fs.readFileSync(path.join(__dirname, '../src/ScriptsState.html'), 'utf8');
const storeJs = (storeContent.match(scriptTagRegex) || [])[1];
const storeSandbox = {};
vm.createContext(storeSandbox);
vm.runInContext(storeJs + '\nthis.Store = Store;', storeSandbox);
const Store = storeSandbox.Store;

const store = new Store();

// 3.1 破壊的トラックオブジェクト混入時の buildCatalog 耐性
const corruptedTracks = [
  null,
  undefined,
  {},
  { cdNumber: 'invalid', trackNumber: 'none' },
  { albumArtist: null, albumName: undefined, cdNumber: 1, trackNumber: 1, trackName: null }
];

try {
  store.setTracks(corruptedTracks);
  recordResult('Store.setTracks(null/undefined/空オブジェクト混入)', true);
} catch (err) {
  recordResult('Store.setTracks(null/undefined/空オブジェクト混入)', false, `クラッシュ発生: ${err.message}`, 'HIGH');
}

// 3.2 数値の曲名 (Prince - 1999等) での横断検索クラッシュ耐性
const numericTracks = [
  {
    cdNumber: 1,
    albumArtist: 'Prince',
    albumName: '1999',
    trackArtist: 'Prince',
    trackNumber: 1,
    trackName: 1999 // 数値型
  },
  {
    cdNumber: 1,
    albumArtist: 'Blur',
    albumName: 'Blur',
    trackArtist: 'Blur',
    trackNumber: 2,
    trackName: 2 // 数値型
  }
];

try {
  store.setTracks(numericTracks);
  const searchRes = store.searchAcrossAllTracks('1999');
  recordResult('Store.searchAcrossAllTracks (曲名が数値型の場合)', true);
} catch (err) {
  recordResult('Store.searchAcrossAllTracks (曲名が数値型の場合)', false, `toLowerCase クラッシュ: ${err.message}`, 'HIGH');
}

// 3.3 二重送信防止フラグ (isSaving) の検証
console.log('\n>>> [3.3] 二重送信防止 (Double Click / Rapid Click) 検証');
const appContent = fs.readFileSync(path.join(__dirname, '../src/ScriptsApp.html'), 'utf8');

const hasIsSavingCheckInBatch = appContent.includes('if (this.store.state.isSaving) return;') &&
                                appContent.includes('this.store.state.isSaving = true;');
recordResult('submitItunesBatch 二重送信ガード (isSaving)', hasIsSavingCheckInBatch, 'isSaving による排他制御が存在する');

const hasIsSavingCheckInManual = appContent.includes('submitManualTrack') &&
                                 appContent.includes('if (this.store.state.isSaving) return;') &&
                                 appContent.includes('this.store.state.isSaving = true;');
recordResult('submitManualTrack 二重送信ガード (isSaving)', hasIsSavingCheckInManual, 'isSaving による排他制御が存在する');

const hasManualButtonDisable = appContent.includes('btn-submit-manual-track') &&
                               appContent.includes('disabled = true');
recordResult('submitManualTrack 送信ボタンの物理無効化 (disabled = true)', hasManualButtonDisable, '手動登録送信時にボタンが disabled されない（連打の視覚的抑止不足）', 'LOW');


// -----------------------------------------------------------------------------
// [TEST SUITE 4] スマホ UI / 狭小画面 (320px) & アクセシビリティ検証
// -----------------------------------------------------------------------------
console.log('\n>>> [4] スマホUI / 320px 破壊的検証 & 44px タッチターゲット');

const navbarContent = fs.readFileSync(path.join(__dirname, '../src/Navbar.html'), 'utf8');
const albumListContent = fs.readFileSync(path.join(__dirname, '../src/AlbumList.html'), 'utf8');
const trackDetailContent = fs.readFileSync(path.join(__dirname, '../src/TrackDetail.html'), 'utf8');
const manualModalContent = fs.readFileSync(path.join(__dirname, '../src/ManualModal.html'), 'utf8');

// 4.1 タッチターゲット 44px 検証
// btn-back-to-artists
const backToArtistsHas44px = albumListContent.includes('btn-back-to-artists') &&
                             (albumListContent.includes('min-h-[44px]') || albumListContent.includes('h-11'));
recordResult('btn-back-to-artists 44pxタッチターゲット確保', backToArtistsHas44px, '戻るボタンのパディングが py-1 で約24pxしかなく 44px 未満', 'MEDIUM');

// btn-back-to-albums
const backToAlbumsHas44px = trackDetailContent.includes('btn-back-to-albums') &&
                            (trackDetailContent.includes('min-h-[44px]') || trackDetailContent.includes('h-11'));
recordResult('btn-back-to-albums 44pxタッチターゲット確保', backToAlbumsHas44px, '戻るボタンのパディングが py-1 で約24pxしかなく 44px 未満', 'MEDIUM');

// 4.2 手動フォーム Enter キーによる誤送信／リロード防止
const hasFormPreventDefault = appContent.includes('form-manual-track') &&
                              (appContent.includes('preventDefault') || appContent.includes('submit'));
recordResult('手動登録フォーム Enter キー押下時のデフォルト送信抑止', hasFormPreventDefault, 'form submit イベントの preventDefault が未登録のため Enter 押下で予期せぬリロードまたは不正遷移の恐れあり', 'MEDIUM');


// -----------------------------------------------------------------------------
// 結果サマリー
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`RED TEAM 検証結果: 全 ${totalTests} 件中 成功 = ${passedTests}, 指摘/失敗 = ${failedTests}`);
console.log('================================================================');

if (findings.length > 0) {
  console.log('\n【検出された指摘・脆弱性一覧】');
  findings.forEach((f, idx) => {
    console.log(`${idx + 1}. [${f.severity}] ${f.testName}: ${f.detail}`);
  });
}
