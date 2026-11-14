# QA検証レポート

- **検証対象**: GitHub Pages フロントエンド移行・GAS JSON API 化・ハイブリッドモード実装（BUG-001 〜 BUG-006 是正後 再検証）
- **参照ドキュメント**:
  - アーキテクチャ設計書: [github_pages_frontend_design.md](file:///c:/Users/nanko/Downloads/MusicInfo-app/docs/architecture/github_pages_frontend_design.md) (v2.0.0)
  - 実装計画書: [github_pages_frontend_plan.md](file:///c:/Users/nanko/Downloads/MusicInfo-app/docs/planning/github_pages_frontend_plan.md) (v1.0.0)
  - 実装報告書: [github_pages_frontend_implementation_report.md](file:///c:/Users/nanko/Downloads/MusicInfo-app/docs/reports/github_pages_frontend_implementation_report.md)
- **初回検証日**: 2026-11-14
- **再検証日**: 2026-11-14
- **担当**: Phase 4 QAエンジニア

---

## 1. 検証サマリー

### 総合判定
**合格 (Pass / 条件付きクリア：実機未検証事項あり)**

初回 QA で検出された全 6 件の不具合（`BUG-001` High × 1、`BUG-002`〜`BUG-004` Medium × 3、`BUG-005`〜`BUG-006` Low × 2）について、シニアコーダーによる修正および回帰テスト追加後の実コード精査・テストスイート全件実行・独立障害注入スクリプト（`qa_reverify.js`）による再検証を実施した。

結果として、**BUG-001 〜 BUG-006 はすべて解消され、新たな不具合・リグレッション・`Promise.race` の未処理 Rejection リーク等も検出されなかった**ため、コードおよびローカル検証ベースでは **合格** と判定する（実ブラウザ・実 GAS `/exec`・GitHub Actions 実機での最終スモーク確認のみ環境制約により **未検証** としてセクション 4 に記載）。

### 検証ステータス内訳（再検証時点）

| ステータス | 対象範囲 | 主な根拠 |
| :--- | :--- | :--- |
| **実行済み** | ビルドパイプライン (`build.js`)、全統合テスト (`npm test` = `tests/run_tests.js`: 451件 + `tests/red_team_attack_test.js`: 289件 + `tests/qa_comprehensive_verification.js`: 9件)、独立再検証スクリプト (`qa_reverify.js`) による `dist/index.html` 構文検査・`fetchTextWithTimeout_` `Promise.race` 未処理 Rejection 検査・`checkHealth` HTTP 404 診断・`LocalDemoTransport` 書込不可時フォールバック/後続書込エラー・モード切替リセット後の iTunes 再検索/再選択/再一括登録・画像失敗ロールバック検証 | `cmd /c "node build.js && node tests/run_tests.js && node tests/red_team_attack_test.js && node tests/qa_comprehensive_verification.js"` 終了コード 0、`cmd /c "npm.cmd test"` 終了コード 0、`node qa_reverify.js` 終了コード 0 |
| **検査済み** | 修正対象ファイル全量（[Navbar.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/Navbar.html), [index.template.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/index.template.html), [ScriptsApiClient.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ScriptsApiClient.html), [ScriptsApp.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ScriptsApp.html), [build.js](file:///c:/Users/nanko/Downloads/MusicInfo-app/build.js), [package.json](file:///c:/Users/nanko/Downloads/MusicInfo-app/package.json), [tests/run_tests.js](file:///c:/Users/nanko/Downloads/MusicInfo-app/tests/run_tests.js), [tests/red_team_attack_test.js](file:///c:/Users/nanko/Downloads/MusicInfo-app/tests/red_team_attack_test.js), [tests/qa_comprehensive_verification.js](file:///c:/Users/nanko/Downloads/MusicInfo-app/tests/qa_comprehensive_verification.js)）および先行実装済みファイル（[Code.js](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/Code.js), [Config.js](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/Config.js), [ConnectionModal.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ConnectionModal.html), [deploy-pages.yml](file:///c:/Users/nanko/Downloads/MusicInfo-app/.github/workflows/deploy-pages.yml)） | 実ファイル精読および `git diff --stat` / 成果物 `dist/index.html` 確認 |
| **推論済み** | 320px 幅実機画面での [Navbar.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/Navbar.html) 折り返し描画（`min-h-[3.5rem]`・`flex-wrap` と [index.template.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/index.template.html#L25) `<main class="flex-1 overflow-hidden ...">` のレイアウト整合性） | CSS クラス定義からの構造推論 |
| **未検証** | 実ブラウザ（Chromium / Safari / Firefox 実機 320px ビューポート）上での Tailwind CDN 適用と視覚描画、実 Google Apps Script `/exec` エンドポイントへの 302 リダイレクトを伴う CORS 通信、GitHub Actions ランナー上での GitHub Pages デプロイ実行 | ローカルの headless Node/VM 環境のみ利用可能であり、外部ネットワーク上の実 GAS デプロイ・実ブラウザ・CI ランナーでの実動確認は不可 |

---

## 2. 観点別テスト結果

### 2.1 実行コマンド・テストスイート結果一覧（是正後）

| 実行対象 | 結果 | 計測値 | 備考 |
| :--- | :--- | :--- | :--- |
| `node build.js` | **実行済み（成功）** | 終了コード `0`、`dist\index.html` (`249979 characters`)、`dist\.nojekyll` 生成 | コールバック置換 `() => ...` 適用確認 |
| `node tests/run_tests.js` | **実行済み（成功）** | `成功 = 451, 失敗 = 0` | 初回 440件 → 回帰テスト追加後 451件 |
| `node tests/red_team_attack_test.js` | **実行済み（成功）** | `全 289 件中 成功 = 289, 指摘/失敗 = 0` | 初回 285件 → 回帰テスト追加後 289件 |
| `node tests/qa_comprehensive_verification.js` | **実行済み（成功）** | `成功 = 9, 失敗 = 0` | `package.json` の `"test"` に統合済み |
| `cmd /c "npm.cmd test"` | **実行済み（成功）** | 終了コード `0` | 3スイート連続一括実行をパス |
| 独立再検証プローブ (`qa_reverify.js`) | **実行済み（成功）** | 終了コード `0`（6検証項目すべてパス） | `Promise.race` `unhandledRejection: 0`、iTunes リセット後再登録、画像ロールバック等を独立検証 |

### 2.2 重点検証観点・QA 12観点の再検証結果

| 検証観点 | ステータス | 結果 | 詳細・所見 |
| :--- | :--- | :--- | :--- |
| **1. CORS / GAS 302 リダイレクト / エンドポイント検証** | **実行済み / 検査済み** | **合格 (BUG-002 解消)** | `HttpJsonTransport` に共通 `fetchTextWithTimeout_()`（[ScriptsApiClient.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ScriptsApiClient.html#L281-L344)）と `parseJsonResponseOrThrow_()`（L353-L382）が導入され、`response.text()` を含む全体が `AbortController` + `Promise.race` タイムアウト保護および `NETWORK_ERROR` 分類の対象となった。`qa_reverify.js` にて `fetchFn` / `response.text()` がタイムアウト後に遅延 reject するケースおよび `signal.abort` 即 reject ケースを検証し、`unhandledRejection` が **0件** であることを確認済み。`checkHealth()` も同様に保護され、HTTP 404 HTML 応答では `/exec` URL 確認を優先案内するメッセージが返る。 |
| **2. GAS `doPost(e)` / `doGet(e)` セキュリティ・入力境界** | **実行済み / 検査済み** | **合格** | `API_DISABLED`・定数時間比較 (`constantTimeEqual_`)・スカラ引数ガード (`extractScalarArg_`)・10MB 文字数上限・プロトタイプ汚染防御・`doGet` 情報非露出を維持し、全テストパス。 |
| **3. ハイブリッドモード切替 / `LocalDemoTransport` / `ScriptsApp.html`** | **実行済み / 検査済み** | **合格 (BUG-003, 004, 005 解消)** | `loadInitialData()` が `true` / `false` を返し、`handleSaveAndConnect()`・`handleResetConnection()`・`handleResetDemoData()` が `true` のみで完了トーストを出力するため偽成功トーストが抑止された（BUG-003）。`resetSelectionStateForModeChange_()` はメモリ状態に加えメイン検索入力・サジェスト・iTunes モーダル DOM を初期状態に戻し、`qa_reverify.js` でモード切替後の再検索→再プレビュー→一括登録（`savedBatchCount: 2`）の正常完走を確認（BUG-004）。`handleImageUpload()` はアップロード失敗時に元の `urlInputEl.value` またはデフォルト SVG へプレビューを復元、`LocalDemoTransport.loadTracks_()` は初回書込不可時に警告のみでデモ配列を返却（後続の書込では `LOCAL_STORAGE_QUOTA_EXCEEDED` を送出）、`sanitizeArtworkUrl_()` は `http://`/`https://`/許可ビットマップ DataURL/内蔵固定デモ SVG のみ通すホワイトリスト方式となった（BUG-005）。 |
| **4. UI / モバイル表示 / `ConnectionModal` 操作性** | **検査済み / 推論済み** | **合格 (BUG-001 解消)** | [Navbar.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/Navbar.html#L1-L76) の `#app-header` が `min-h-[3.5rem] md:h-14 flex-wrap md:flex-nowrap py-1.5 md:py-0`、右側ボタングループが `flex-wrap min-w-0 max-w-full md:flex-shrink-0` に改修され、全 4 ボタン（`#btn-reload-data` 含む）が `min-h-[44px] min-w-[44px]` を満たす。`<main class="flex-1 overflow-hidden ...">`（[index.template.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/index.template.html#L25)）との組み合わせにより、モバイル 320px で折り返してもヘッダー高さ拡張を阻害せずレイアウト崩れを回避できる構造（実機描画は **未検証**）。 |
| **5. ビルドパイプライン・CI/CD・GAS デプロイ分離** | **実行済み / 検査済み** | **合格 (BUG-006 解消)** | `build.js` の全 `replace` 呼び出し（L43, L330, L333, L349, L351）がコールバック形式 `() => ...` へ統一され、生成物 `dist/index.html` の 2本のインライン `<script>` は `vm.Script` で構文エラーゼロ。機密情報・`google.script.run`・`<base target="_top">` 非混入。 |
| **6. 既存テスト品質・偽陰性リスク** | **実行済み / 検査済み** | **合格 (BUG-006 解消)** | [package.json](file:///c:/Users/nanko/Downloads/MusicInfo-app/package.json#L13) の `"test"` に `tests/qa_comprehensive_verification.js` が統合され、`[QA-4]` の誤った旧行番号コメントも修正済み。`tests/run_tests.js`（451件）と `tests/red_team_attack_test.js`（289件）に BUG-001〜BUG-006 すべての回帰テストが追加され全件パスした。 |

---

## 3. 発見された不具合・課題一覧 (Issue票)

是正後の再検証において、**新規不具合の検出は 0 件** である。初回 QA で起票した `BUG-001`〜`BUG-006` の是正確認結果は以下の通り。

### [BUG-001] 320px 幅モバイル画面におけるヘッダー（Navbar）の表示溢れおよびタッチターゲット幅不足
- **重大度**: High → **ステータス: 修正済み・再検証 PASS**
- **修正内容・再検証証拠**:
  - [Navbar.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/Navbar.html#L1-L76): `#app-header` を `min-h-[3.5rem] md:h-14 ... flex-wrap md:flex-nowrap ... py-1.5 md:py-0`、右側ボタングループ（L39）を `flex-wrap justify-end ... min-w-0 max-w-full md:flex-shrink-0` に修正し、全 4 ボタン（`#btn-reload-data` L70 含む）へ `min-h-[44px] min-w-[44px]` を付与。
  - [index.template.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/index.template.html#L13-L25) の `flex-col` + `<main class="flex-1 overflow-hidden">` と整合し折り返し時の縦方向クリップも発生しない設計を確認。
  - `tests/red_team_attack_test.js` `[9.3]`（L1800-L1834）の回帰検証で PASS。

### [BUG-002] `HttpJsonTransport` におけるボディ受信時のタイムアウト漏れ・エラー分類欠落・HTML応答時の誤診断
- **重大度**: Medium → **ステータス: 修正済み・再検証 PASS**
- **修正内容・再検証証拠**:
  - [ScriptsApiClient.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ScriptsApiClient.html#L281-L439): `fetchTextWithTimeout_()` および `parseJsonResponseOrThrow_()` を実装し、`callAction()` と `checkHealth()` の双方で `response.text()` を含む通信全体へ `AbortController` タイムアウト・`NETWORK_ERROR` 分類・HTTP 4xx/5xx HTML 応答時の URL 確認優先案内を適用。
  - `qa_reverify.js` `[2]`, `[3]` にてタイムアウト後遅延 reject 時の `unhandledRejection === 0` および `checkHealth` HTTP 404 メッセージを確認。`tests/run_tests.js` L2740-L2811 の回帰テストでも PASS。

### [BUG-003] `handleSaveAndConnect` における初回データ取得失敗時の偽成功トースト表示と重複通信
- **重大度**: Medium → **ステータス: 修正済み・再検証 PASS**
- **修正内容・再検証証拠**:
  - [ScriptsApp.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ScriptsApp.html#L774-L878): `loadInitialData()` が成否の真偽値（L862 `return true` / L878 `return false`）を返すよう改修され、`handleSaveAndConnect()`・`handleResetConnection()`・`handleResetDemoData()` が `if (loaded)` の場合のみ成功/切替トーストを表示。
  - `tests/run_tests.js` L2962-L2988 の回帰テストで偽成功トースト非出力・接続モーダル再オープンを確認して PASS。

### [BUG-004] モード切替後の iTunes 一括登録モーダル DOM および検索入力欄の残留
- **重大度**: Medium → **ステータス: 修正済み・再検証 PASS**
- **修正内容・再検証証拠**:
  - [ScriptsApp.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ScriptsApp.html#L653-L719): `resetSelectionStateForModeChange_()` で `#header-search-*`, `#mobile-search-*`, `#pc-search-results`, `#mobile-search-results`, `closeSearchDropdown` および `#modal-itunes` 内の検索入力・結果・プレビュー各要素・送信ボタン `disabled = true` を一括リセット。
  - `qa_reverify.js` `[5]` にてモード切替リセット後に再度 GAS 接続→iTunes 検索→プレビュー→一括登録（`savedBatchCount: 2`）まで副作用なく完走することを確認。`tests/run_tests.js` L3015-L3025 でも PASS。

### [BUG-005] 画像アップロード失敗時のプレビュー不整合、および初回 `localStorage` 書込不可時のデモ読込失敗・画像URLサニタイズ境界
- **重大度**: Low → **ステータス: 修正済み・再検証 PASS**
- **修正内容・再検証証拠**:
  - [ScriptsApp.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ScriptsApp.html#L2089-L2152): `uploadArtwork` 失敗時に `restoreUrl || previousUrl || defaultPreviewSvg` へプレビュー画像をロールバック（`qa_reverify.js` `[6]` および `tests/run_tests.js` L3027-L3038 で PASS）。
  - [ScriptsApiClient.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ScriptsApiClient.html#L714-L724): 初回デモ保存失敗時は `console.warn` 後にインメモリデモ配列を返却（後続の書込では `LOCAL_STORAGE_QUOTA_EXCEEDED` を適切に送出することを `qa_reverify.js` `[4]` で確認）。
  - [ScriptsApiClient.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ScriptsApiClient.html#L637-L675): `sanitizeArtworkUrl_()` を内蔵固定デモ SVG Set + `http://`/`https://` + ビットマップ DataURL のホワイトリスト方式へ改修（`tests/run_tests.js` L2830-L2849・`tests/red_team_attack_test.js` L1739-L1786 で PASS）。

### [BUG-006] テストスイートのカバレッジ抜け・CI 除外および `build.js` 置換仕様上の注意点
- **重大度**: Low → **ステータス: 修正済み・再検証 PASS**
- **修正内容・再検証証拠**:
  - [build.js](file:///c:/Users/nanko/Downloads/MusicInfo-app/build.js#L43)（および L330, L333, L349, L351）を関数置換 `() => ...` へ変更（`tests/run_tests.js` L3040-L3045 で PASS）。
  - [package.json](file:///c:/Users/nanko/Downloads/MusicInfo-app/package.json#L13) の `"test"` へ `tests/qa_comprehensive_verification.js` を統合し、`[QA-4]` コメント（L244）も修正済み。`cmd /c "npm.cmd test"` 終了コード 0 を確認。

---

## 4. エスカレーション事項 (あれば)

- **アーキテクチャ・実装への差戻し**: なし（BUG-001〜BUG-006 全件解消、新規不具合 0 件）。
- **リリース前・運用反映時の実機スモークテスト推奨**:
  - 今回の環境では Node/VM 上の自動テストおよび障害注入検証までは完了（**合格**）しているが、以下の 3 点は環境制約上 **未検証** である。
    1. 実ブラウザ（特に 320px 幅モバイル実機 / DevTools デバイスモード）でのヘッダー折り返し視覚確認。
    2. 実 Google Apps Script Web App (`ANYONE_ANONYMOUS` + `API_TOKEN`) へのデプロイと GitHub Pages 公開画面からの 302 リダイレクト越え CORS 疎通確認。
    3. GitHub Actions ランナー上での `.github/workflows/deploy-pages.yml` 実行と GitHub Pages 公開確認。
  - デプロイ実施時に [README.md](file:///c:/Users/nanko/Downloads/MusicInfo-app/README.md) の手順に沿って上記 3 点の疎通確認を行うことを推奨する。
