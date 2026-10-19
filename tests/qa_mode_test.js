/**
 * QAエンジニア 障害モード・エッジケース詳細検証テストスクリプト
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passCount = 0;
let failCount = 0;
const findings = [];

function assert(condition, message, findingObj = null) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failCount++;
    if (findingObj) {
      findings.push(findingObj);
    }
  }
}

console.log('==================================================');
console.log('QA詳細検証 & 障害モード分析 開始');
console.log('==================================================\n');

// モックDOM要素
class MockElement {
  constructor(id) {
    this.id = id;
    this.classes = new Set();
    this.classList = {
      add: (...cls) => cls.forEach(c => this.classes.add(c)),
      remove: (...cls) => cls.forEach(c => this.classes.delete(c)),
      toggle: (c, force) => {
        if (force === undefined) {
          if (this.classes.has(c)) this.classes.delete(c);
          else this.classes.add(c);
        } else if (force) {
          this.classes.add(c);
        } else {
          this.classes.delete(c);
        }
      },
      contains: (c) => this.classes.has(c)
    };
    this.textContent = '';
    this.innerHTML = '';
    this.disabled = false;
  }
  getAttribute(attr) { return this[attr] || ''; }
  setAttribute(attr, val) { this[attr] = val; }
  querySelectorAll() { return []; }
  appendChild() {}
  removeChild() {}
  remove() {}
}

const mockDomElements = {};
function getMockElement(id) {
  if (!mockDomElements[id]) {
    mockDomElements[id] = new MockElement(id);
  }
  return mockDomElements[id];
}

const srcDir = path.join(__dirname, '../src');
const files = ['ScriptsUtils.html', 'ScriptsApiClient.html', 'ScriptsState.html', 'ScriptsApp.html'];

const ctx = {
  console,
  setTimeout,
  clearTimeout,
  Date,
  Set,
  Map,
  Array,
  Object,
  String,
  Number,
  Boolean,
  document: {
    getElementById: (id) => getMockElement(id),
    querySelectorAll: () => [],
    addEventListener: () => {},
    createElement: () => new MockElement('created')
  },
  window: {
    addEventListener: () => {},
    innerWidth: 1024
  }
};
vm.createContext(ctx);

for (const f of files) {
  const content = fs.readFileSync(path.join(srcDir, f), 'utf8');
  const jsMatch = content.match(/<script>([\s\S]*?)<\/script>/);
  vm.runInContext(jsMatch[1], ctx);
}

const Store = ctx.window.Store;
const App = ctx.window.App;
const Utils = ctx.window.Utils;

(async () => {

// --------------------------------------------------------------------------------
// [TEST 1] クイック検索によるアーティスト/アルバム遷移時の選択状態リーク検証
// --------------------------------------------------------------------------------
console.log('[TEST 1] 検索経由遷移時の選択状態整合性検証');

const app = new App();
app.store.setTracks([
  { cdNumber: 1, albumArtist: 'Artist A', albumName: 'Album A1', trackNumber: 1, trackName: 'Song A1' },
  { cdNumber: 1, albumArtist: 'Artist A', albumName: 'Album A2', trackNumber: 1, trackName: 'Song A2' },
  { cdNumber: 1, albumArtist: 'Artist B', albumName: 'Album B1', trackNumber: 1, trackName: 'Song B1' }
]);

// 1. Artist A を選択
app.selectArtist('Artist A');
// 2. 選択モードをONにして Album A1 を選択
app.toggleAlbumSelectMode(true);
app.toggleAlbumSelection('Artist A', 'Album A1');

assert(app.store.state.isAlbumSelectMode === true, '選択モードが有効化されている');
assert(app.store.state.selectedAlbumKeysForDeletion.size === 1, '1件選択されている');

// 3. クイック検索結果で Artist B の Album B1 を選択するシナリオ (selectSearchResultItem の再現)
const mockSearchItemEl = {
  getAttribute: (attr) => {
    if (attr === 'data-type') return 'album';
    if (attr === 'data-artist') return 'Artist B';
    if (attr === 'data-album') return 'Album B1';
    return null;
  }
};

app.selectSearchResultItem(mockSearchItemEl, 'pc');

// 検証: アーティストが Artist B に切り替わった後、以前の選択状態はどうなっているか？
const isSelectModeAfterSearch = app.store.state.isAlbumSelectMode;
const selectedKeysAfterSearch = Array.from(app.store.state.selectedAlbumKeysForDeletion);
const selectedAlbumsForDel = app.getSelectedAlbumsForDeletion();
const countBadgeText = getMockElement('selected-album-count-badge').textContent;
const isDeleteBtnDisabled = getMockElement('btn-delete-selected-albums').disabled;

console.log(`  -> 検索後 isAlbumSelectMode: ${isSelectModeAfterSearch}`);
console.log(`  -> 検索後 selectedAlbumKeysForDeletion: ${JSON.stringify(selectedKeysAfterSearch)}`);
console.log(`  -> 検索後 getSelectedAlbumsForDeletion: ${JSON.stringify(selectedAlbumsForDel)}`);
console.log(`  -> 検索後 バッジテキスト: "${countBadgeText}"`);
console.log(`  -> 検索後 削除ボタン非活性: ${isDeleteBtnDisabled}`);

assert(
  isSelectModeAfterSearch === false,
  '検索から別アーティストのアルバムへ遷移した際、選択モードが自動終了すること',
  {
    id: 'ISSUE-001',
    title: 'クイック検索から別アルバム/トラックへ遷移した際にアルバム選択モードおよび選択キーSetがリセットされず状態不整合が発生する',
    severity: 'Medium',
    detail: `isSelectMode: ${isSelectModeAfterSearch}, selectedKeys: ${JSON.stringify(selectedKeysAfterSearch)}, badge: "${countBadgeText}"`
  }
);

assert(
  selectedKeysAfterSearch.length === 0,
  '検索から別アーティストのアルバムへ遷移した際、他アーティストの選択中キーがクリアされること',
  {
    id: 'ISSUE-002',
    title: '他アーティストのアルバム選択キーがメモリ上に残存しUIバッジ表示と選択状態が不一致になる',
    severity: 'Medium',
    detail: `残存キー: ${JSON.stringify(selectedKeysAfterSearch)}`
  }
);

// --------------------------------------------------------------------------------
// [TEST 2] 特殊文字・記号を含むアルバムのキー照合
// --------------------------------------------------------------------------------
console.log('\n[TEST 2] 特殊文字・記号を含むアルバムの削除キー照合');
const specialStore = new Store();
specialStore.setTracks([
  { cdNumber: 1, albumArtist: 'AC/DC', albumName: 'Back in Black (Remastered)', trackNumber: 1, trackName: 'Hells Bells' },
  { cdNumber: 1, albumArtist: 'Artist:::Colons', albumName: 'Album:::Test', trackNumber: 1, trackName: 'Test' }
]);

specialStore.deleteAlbumsFromCatalog([
  { albumArtist: 'AC/DC', albumName: 'Back in Black (Remastered)' }
]);
assert(specialStore.state.allTracks.length === 1, '特殊文字 (スラッシュ、括弧) を含むアルバムが正確に除外されること');

specialStore.deleteAlbumsFromCatalog([
  { albumArtist: 'Artist:::Colons', albumName: 'Album:::Test' }
]);
assert(specialStore.state.allTracks.length === 0, 'コロン(:::)を含むアルバムが正確に除外されること');

// --------------------------------------------------------------------------------
// [TEST 3] 前後空白（トリム）の差異に対する照合検証
// --------------------------------------------------------------------------------
console.log('\n[TEST 3] 前後空白（トリム）の差異に対する照合検証');
const trimStore = new Store();
trimStore.setTracks([
  { cdNumber: 1, albumArtist: '  Spaced Artist  ', albumName: '  Spaced Album  ', trackNumber: 1, trackName: 'Song' }
]);
// 削除キーとしてトリムされたキーを渡す
trimStore.deleteAlbumsFromCatalog([
  { albumArtist: 'Spaced Artist', albumName: 'Spaced Album' }
]);
assert(trimStore.state.allTracks.length === 0, '前後に空白が存在するトラックがトリム済みキーで正常に削除除外されること');

// --------------------------------------------------------------------------------
// [TEST 4] SheetService: スプレッドシート側の前後空白トリム照合
// --------------------------------------------------------------------------------
console.log('\n[TEST 4] SheetService の前後空白トリム照合');
const SheetServiceClass = require('../src/SheetService');

const mockConfig = {
  getSpreadsheetId: () => 'test-id',
  getSheetName: () => 'MusicTracks'
};

let testSheetData = [
  ['CD番号', 'アルバムアーティスト名', 'アルバム名', 'アーティスト名', 'トラック番号', 'トラック名', 'リリース日', 'アルバムアートURL'],
  [1, '  Spaced Artist  ', '  Spaced Album  ', 'Artist', 1, 'Song 1', '2026-01-01', '']
];
let writtenValues = null;

global.SpreadsheetApp = {
  openById: () => ({
    getSheetByName: () => ({
      getLastRow: () => testSheetData.length,
      getRange: (r, c, numR, numC) => ({
        getValues: () => testSheetData.slice(r - 1, r - 1 + numR),
        clearContent: () => {},
        setValues: (vals) => { writtenValues = vals; },
        setNumberFormat: () => {}
      })
    })
  }),
  flush: () => {}
};
global.LockService = {
  getScriptLock: () => ({
    tryLock: () => true,
    releaseLock: () => {}
  })
};

const sheetSvc = new SheetServiceClass(mockConfig);
const trimDelRes = sheetSvc.deleteAlbumsBatch([
  { albumArtist: 'Spaced Artist', albumName: 'Spaced Album' }
]);
assert(trimDelRes.deletedAlbumCount === 1, 'SheetService: スプレッドシート内の前後に余白がある行がトリム済みキーで削除されること');
assert(trimDelRes.deletedTrackCount === 1, 'SheetService: 削除トラック数が 1 であること');

// --------------------------------------------------------------------------------
// [TEST 5] 削除処理中のモーダル制御・Escキー影響検証 (BUG-002)
// --------------------------------------------------------------------------------
console.log('\n[TEST 5] 削除処理中のモーダル制御・Escキー影響検証');
const escapeTestApp = new App();
escapeTestApp.deletingAlbums = [{ albumArtist: 'Artist A', albumName: 'Album A1' }];

assert(escapeTestApp.deletingAlbums !== null, '削除対象がセットされている');

// 削除通信待機中のクローズ操作抑止検証
escapeTestApp.isDeletingAlbums = true;
escapeTestApp.closeDeleteConfirmModal();
assert(escapeTestApp.isDeletingAlbums === true, '削除実行中フラグが保持されていること');
assert(escapeTestApp.deletingAlbums !== null, '削除通信待機中はモーダルクローズが抑止され deletingAlbums が破棄されないこと');

// 削除通信完了後の通常クローズ検証
escapeTestApp.isDeletingAlbums = false;
escapeTestApp.closeDeleteConfirmModal();
assert(escapeTestApp.deletingAlbums === null, '削除完了後はモーダルクローズで deletingAlbums が安全に null クリアされること');

// --------------------------------------------------------------------------------
// [TEST 6] STEP 3 個別アルバム削除ボタン押下時の安全性
// --------------------------------------------------------------------------------
console.log('\n[TEST 6] STEP 3 個別削除ボタン押下時の安全性');
const step3App = new App();
step3App.store.state.selectedArtist = null;
step3App.store.state.selectedAlbum = null;

let modalOpened = false;
let toastShown = false;
step3App.openDeleteConfirmModal = () => { modalOpened = true; };
ctx.window.Utils.showToast = (msg, type) => {
  if (type === 'warning') toastShown = true;
};

// btn-delete-album のクリックハンドラを再現
const curAlbum = step3App.store.getSelectedAlbumData();
if (curAlbum) {
  step3App.openDeleteConfirmModal([{ albumArtist: curAlbum.albumArtist, albumName: curAlbum.albumName }]);
} else {
  ctx.window.Utils.showToast('削除対象のアルバムが選択されていません', 'warning');
}

assert(modalOpened === false, 'アルバム未選択時はモーダルが開かないこと');
assert(toastShown === true, 'アルバム未選択時は警告トーストが表示されること');

// --------------------------------------------------------------------------------
// [TEST 7] 全アルバム削除時（全アーティスト0件）のフォールバック検証
// --------------------------------------------------------------------------------
console.log('\n[TEST 7] 全アルバム削除時（全アーティスト0件）のフォールバック検証');
const allDeleteStore = new Store();
allDeleteStore.setTracks([
  { cdNumber: 1, albumArtist: 'Only Artist', albumName: 'Only Album', trackNumber: 1, trackName: 'Only Song' }
]);
allDeleteStore.state.selectedArtist = 'Only Artist';
allDeleteStore.state.selectedAlbum = 'Only Album';

allDeleteStore.deleteAlbumsFromCatalog([{ albumArtist: 'Only Artist', albumName: 'Only Album' }]);

assert(allDeleteStore.state.allTracks.length === 0, '全曲が削除されたこと');
assert(allDeleteStore.state.artistList.length === 0, 'artistList が空になったこと');
assert(Object.keys(allDeleteStore.state.musicCatalog).length === 0, 'musicCatalog が空になったこと');

// --------------------------------------------------------------------------------
// [TEST 8] 削除確認モーダルのトラック件数集計整合性検証
// --------------------------------------------------------------------------------
console.log('\n[TEST 8] 削除確認モーダルのトラック件数集計整合性検証');
const modalCountApp = new App();
modalCountApp.store.setTracks([
  { cdNumber: 1, albumArtist: 'Artist X', albumName: 'Album 1', trackNumber: 1, trackName: 'T1' },
  { cdNumber: 1, albumArtist: 'Artist X', albumName: 'Album 1', trackNumber: 2, trackName: 'T2' },
  { cdNumber: 2, albumArtist: 'Artist X', albumName: 'Album 1', trackNumber: 1, trackName: 'T3' },
  { cdNumber: 1, albumArtist: 'Artist X', albumName: 'Album 2', trackNumber: 1, trackName: 'T4' }
]);

modalCountApp.openDeleteConfirmModal([
  { albumArtist: 'Artist X', albumName: 'Album 1' }
]);

const warningText = getMockElement('delete-confirm-track-warning').textContent;
console.log(`  -> モーダル警告文: "${warningText}"`);
assert(
  warningText.includes('合計 3 曲'),
  'Album 1 (2枚組計3曲) の削除警告に「合計 3 曲」と表示されること'
);

// --------------------------------------------------------------------------------
// [TEST 9] executeDeleteAlbums 実行中のボタン disabled 化および finally 復帰検証 (BUG-002)
// --------------------------------------------------------------------------------
console.log('\n[TEST 9] 削除実行中のボタン非活性化・復帰検証');
const lockBtnApp = new App();
lockBtnApp.deletingAlbums = [{ albumArtist: 'Artist X', albumName: 'Album 1' }];

let resolveApi;
lockBtnApp.api.deleteAlbumsBatch = () => new Promise((resolve) => {
  resolveApi = resolve;
});

// 非同期実行開始
const deletePromise = lockBtnApp.executeDeleteAlbums();

// 実行中のボタン状態確認
const btnExecute = getMockElement('btn-confirm-execute-delete');
const btnCancel = getMockElement('btn-cancel-delete-album');
const btnClose = getMockElement('btn-close-delete-confirm');

assert(lockBtnApp.isDeletingAlbums === true, '通信待機中に isDeletingAlbums が true であること');
assert(btnExecute.disabled === true, '通信待機中に確定ボタンが disabled = true であること');
assert(btnCancel.disabled === true, '通信待機中にキャンセルボタンが disabled = true であること');
assert(btnClose.disabled === true, '通信待機中に閉じるボタンが disabled = true であること');

// API完了
resolveApi({ success: true, deletedAlbumCount: 1, deletedTrackCount: 2 });
await deletePromise;

assert(lockBtnApp.isDeletingAlbums === false, '通信完了後に isDeletingAlbums が false に復帰すること');
assert(btnExecute.disabled === false, '通信完了後に確定ボタンが disabled = false に復帰すること');
assert(btnCancel.disabled === false, '通信完了後にキャンセルボタンが disabled = false に復帰すること');
assert(btnClose.disabled === false, '通信完了後に閉じるボタンが disabled = false に復帰すること');

// --------------------------------------------------------------------------------
// [TEST 10] アルバム選択モード切替ボタン表記およびアクセシビリティ整合性検証 (BUG-003)
// --------------------------------------------------------------------------------
console.log('\n[TEST 10] 選択モード切替ボタン表記・アクセシビリティ整合性検証');
const toggleBtnApp = new App();
toggleBtnApp.store.setTracks([
  { cdNumber: 1, albumArtist: 'Artist 1', albumName: 'Album 1', trackNumber: 1, trackName: 'T1' }
]);
toggleBtnApp.selectArtist('Artist 1');

const btnToggle = getMockElement('btn-toggle-album-select');
const btnText = getMockElement('btn-toggle-album-select-text');

assert(btnText.textContent === '選択', '初期状態ではボタンテキストが「選択」であること');
assert(btnToggle.getAttribute('aria-pressed') === 'false', '初期状態では aria-pressed が "false" であること');

// 選択モードをONにする
toggleBtnApp.toggleAlbumSelectMode(true);
assert(btnText.textContent === '完了', '選択モード有効化時はボタンテキストが「完了」になること');
assert(btnToggle.getAttribute('aria-pressed') === 'true', '選択モード有効化時は aria-pressed が "true" になること');

// 選択モードをOFFにする
toggleBtnApp.toggleAlbumSelectMode(false);
assert(btnText.textContent === '選択', '選択モード終了時はボタンテキストが「選択」に復帰すること');
assert(btnToggle.getAttribute('aria-pressed') === 'false', '選択モード終了時は aria-pressed が "false" に復帰すること');

// --------------------------------------------------------------------------------
// テスト結果集計
// --------------------------------------------------------------------------------
console.log('\n==================================================');
console.log(`QA検証テスト結果: 成功 = ${passCount}, 失敗 = ${failCount}`);
console.log('==================================================');

if (findings.length > 0) {
  console.log('\n【発見された不具合・課題】:');
  findings.forEach((f) => {
    console.log(`- [${f.id}] [${f.severity}] ${f.title}`);
    if (f.detail) console.log(`  詳細: ${f.detail}`);
  });
}

if (failCount > 0) {
  process.exit(1);
}

})();
