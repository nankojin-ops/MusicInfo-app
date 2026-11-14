# ソフトウェア監査・最終レビュー報告書

- **監査対象**: MusicInfo-app フロントエンド GitHub Pages 公開対応・GAS JSON API 専用化・ハイブリッドモード実装
- **監査実施日**: 2026-11-14
- **監査担当**: Phase 5 コードレビュアー（ソフトウェア監査担当）
- **参照設計書・計画書・報告書**:
  - 確定アーキテクチャ設計書: [github_pages_frontend_design.md](file:///c:/Users/nanko/Downloads/MusicInfo-app/docs/architecture/github_pages_frontend_design.md) (v2.0.0)
  - 承認済み実装計画書: [github_pages_frontend_plan.md](file:///c:/Users/nanko/Downloads/MusicInfo-app/docs/planning/github_pages_frontend_plan.md) (v1.0.0)
  - 実装・検証完了報告書: [github_pages_frontend_implementation_report.md](file:///c:/Users/nanko/Downloads/MusicInfo-app/docs/reports/github_pages_frontend_implementation_report.md)
  - QA検証レポート（再検証済み）: [github_pages_frontend_qa_report.md](file:///c:/Users/nanko/Downloads/MusicInfo-app/docs/qa/github_pages_frontend_qa_report.md)

---

## 1. 総合リリース推奨判定

- **判定結果**: **【 承認 (Release Approved) 】**
- **判定理由サマリー**:
  1. **要件・設計・実装計画への完全準拠**: 確定アーキテクチャ設計書（v2.0.0）の受け入れ基準 `AC-GH-001` 〜 `AC-GH-006` および `ADR-001` 〜 `ADR-003`、ならびに承認済み実装計画書（v1.0.0）の `TASK-001` 〜 `TASK-008` が逸脱なく実装されている。
  2. **セキュリティ境界の堅牢性**: `src/Code.js` の `doPost(e)` は 10MB 文字数上限・JSON オブジェクト構造検証・`API_TOKEN` 未設定時の `API_DISABLED`（Secure by Default）・`constantTimeEqual_()` による定数時間比較・`Object.prototype.hasOwnProperty.call` によるアクションホワイトリスト検証・`extractScalarArg_()` によるスカラ引数汚染防御をすべて満たし、認証失敗時はスプレッドシートおよび Google Drive へ一切アクセスしない。また公開成果物 `dist/index.html` に `google.script.run`、`<base target="_top">`、`module.exports`、機密情報（`API_TOKEN`・`SPREADSHEET_ID`・`DRIVE_FOLDER_ID`）が混入していないことを直接検証した。
  3. **ビルドおよび全テストスイートの完全通過**: 監査時点で `node build.js`（終了コード 0）、`node tests/run_tests.js`（成功 451 / 失敗 0）、`node tests/red_team_attack_test.js`（成功 289 / 失敗 0）、`node tests/qa_comprehensive_verification.js`（成功 9 / 失敗 0）の計 749 件が 100% 通過し、Phase 4 QA で検出された `BUG-001` 〜 `BUG-006` の是正およびワークスペース上に不要な一時ファイルが残存していないことを確認した。
  4. **リリース運用上の前提確認**: ローカルのヘッドレス Node.js / `vm` 環境での検証は完了しているが、実ブラウザ（320px 幅実機描画）、実 GAS Web App（`ANYONE_ANONYMOUS` + `API_TOKEN`）への 302 リダイレクト越え CORS 通信、および GitHub Actions 実機ランナー実行の 3 点は環境制約上未検証であるため、デプロイ直後のスモーク確認を前提条件として承認する。

---

## 2. 準拠性監査

- **要件定義・受け入れ基準への準拠状況**:
  - **AC-GH-001（ビルド成果物の独立出力と GAS 非混入）**: `build.js` が [dist/index.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/dist/index.html)（249,979 文字）および [dist/.nojekyll](file:///c:/Users/nanko/Downloads/MusicInfo-app/dist/.nojekyll)（0 バイト）のみを生成し、旧 `src/index.html` は削除済み。`.gitignore` に `dist/` と `src/index.html`、`.claspignore` に `dist/**`, `.github/**`, `src/*.html` が設定されており、`clasp push` 時にバックエンド `.js` と `appsscript.json` のみが対象となる設計が維持されている。
  - **AC-GH-002（ハイブリッド起動とローカル/デモモード動作）**: [ScriptsApiClient.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ScriptsApiClient.html) の `LocalDemoTransport` が初回起動時に 3 アーティスト・4 アルバム・複数 Disc 構成・計 13 曲の内蔵デモデータ（外部通信不要の SVG Data URI ジャケット）を展開し、`localStorage` 上で CRUD（`getAllData`, `saveAlbumBatch`, `saveTrackSingle`, `updateAlbumBatch`, `deleteAlbumsBatch`）を実行可能。`Navbar.html` の `#connection-mode-badge` / `#connection-mode-dot` でモードが可視化され、バックエンド専用操作では `LOCAL_MODE_UNSUPPORTED` による案内トーストが表示される。
  - **AC-GH-003（接続設定 UI と GAS API 連携モード切替）**: [ConnectionModal.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ConnectionModal.html) と [ScriptsApp.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ScriptsApp.html) により、GAS `/exec` URL と `API_TOKEN` の検証・事前接続テスト・保存切替・リセット（`localStorage` 削除＋`local_demo` 復帰）・デモ初期化が実装されている。
  - **AC-GH-004（`ApiClient` の `google.script.run` 廃止とプロトコル遵守）**: `google.script.run` 参照は全排除され、`HttpJsonTransport` と `LocalDemoTransport` の 2 アダプタで既存 11 メソッドの公開契約を維持。`HttpJsonTransport.callAction()` は `POST` + `mode: 'cors'` + `credentials: 'omit'` + `redirect: 'follow'` + `Content-Type: text/plain;charset=utf-8`（カスタムヘッダなし、ボディ JSON `{ action, token, payload }`）を厳守している。
  - **AC-GH-005（GAS API 専用化とセキュリティ境界）**: [appsscript.json](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/appsscript.json#L8-L11) の `webapp.access` は `"ANYONE_ANONYMOUS"` に更新済み。[Code.js](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/Code.js) の `doGet(e)` は `{ success: true, data: { service: 'MusicInfo-app', role: 'api-only', status: 'ok', apiConfigured }, timestamp }` のみを返却し、`doPost(e)` は 11 アクションディスパッチと認証境界を実装している。
  - **AC-GH-006（自動テスト・GitHub Actions デプロイ基盤）**: [package.json](file:///c:/Users/nanko/Downloads/MusicInfo-app/package.json#L13) の `"test"` に `run_tests.js`・`red_team_attack_test.js`・`qa_comprehensive_verification.js` の 3 スイートが統合され、[.github/workflows/deploy-pages.yml](file:///c:/Users/nanko/Downloads/MusicInfo-app/.github/workflows/deploy-pages.yml) に `npm run build` → `npm test` → `actions/upload-pages-artifact` → `actions/deploy-pages` のパイプラインが定義されている。

- **システムアーキテクチャへの準拠状況**:
  - `ADR-001`（ハイブリッド起動＋CORS 単純リクエスト＋`API_TOKEN` 認証）、`ADR-002`（GitHub Pages 一本化＋`dist/` 出力＋GAS API 専用化）、`ADR-003`（`actions/deploy-pages` CI/CD、`npm ci` 非使用）のすべてに完全準拠しており、上流決定からの無断逸脱はない。

- **実装計画書への準拠状況**:
  - `TASK-001` 〜 `TASK-008` および §1.2 の全 8 件の技術リスク対策（ネスト `{}` 対応の `stripModuleExportsGuards`、`<base target="_top">` 削除＋インライン SVG favicon、Google Workspace `/a/macros/<domain>/s/.../exec` URL 許容、非 JSON 応答診断、`extractScalarArg_` 防御等）がすべて漏れなく反映されている。

---

## 3. 品質・技術的負債監査

- **コード品質 / 保守性 / シンプルさ**:
  - **良好**: [build.js](file:///c:/Users/nanko/Downloads/MusicInfo-app/build.js#L198-L243) の `stripModuleExportsGuards()` は文字列リテラルを考慮したブレース深度追跡によりネスト `{}` 破損を防いでおり、同ファイルのテンプレート置換（L43, L330, L333, L349, L351）も関数置換 `() => ...` により特殊パターン（`$$` / `$&`）破損を防止している。
  - **良好**: [ScriptsApiClient.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ScriptsApiClient.html#L281-L382) の `HttpJsonTransport` は `fetchTextWithTimeout_()` と `parseJsonResponseOrThrow_()` の共通ヘルパーへ抽出されており、`callAction()` と `checkHealth()` 間の重複ロジックがない。また `Promise.race([ioPromise, abortPromise])` は両プロミスに race ハンドラが登録されるため、タイムアウト後に `ioPromise` が遅延 reject しても `UnhandledPromiseRejection` が発生しないことを独自検証コマンドで確認した（`Unhandled count: 0`）。
  - **留意**: [ScriptsApp.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ScriptsApp.html) は全体で 2,908 行に達しており、接続モーダル制御は `ScriptsApp` 内のメソッド群として凝集されているものの、ファイル全体としての責任範囲は広い（本タスクでは計画通り最小侵襲で拡張されており欠陥ではない）。

- **結合度と凝集度**:
  - **良好**: フロントエンドは `ConnectionConfigStore`（設定永続化・URL 検証）、`HttpJsonTransport`（HTTP 通信）、`LocalDemoTransport`（ローカル永続化・デモデータ管理）、`ApiClient`（ファサード）に明確に責務分離され、`options` 引数による `storageAdapter` / `fetchFn` の DI が可能な疎結合設計となっている。
  - **良好**: バックエンド [Code.js](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/Code.js) はトランスポート・認証・ルーティングのみを担い、業務サービス群（`MusicService` 等）を変更せずに既存 11 RPC へ委譲する高い凝集度を維持している。

- **エラーハンドリング・セキュリティ**:
  - **良好**: [Config.js](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/Config.js#L78-L93) と [Code.js](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/Code.js#L125-L173) により、`API_TOKEN` 未設定・空文字時は `API_DISABLED`、トークン不一致時は定数時間比較 `constantTimeEqual_()` により `UNAUTHORIZED` を返却する。`doPost(e)` の `MAX_PAYLOAD_CHARS`（10MB 文字数上限）および `extractScalarArg_()` の非スカラ排除も適切。
  - **良好**: `LocalDemoTransport` は `loadTracks_()` での初回保存失敗（`QuotaExceededError` 等）時に警告のみでインメモリ返却へフォールバックし、後続の書き込み操作時は `LOCAL_STORAGE_QUOTA_EXCEEDED` を送出して既存ストレージ状態を破壊しない。`sanitizeArtworkUrl_()` は内蔵固定 4 種デモ SVG と `http://` / `https://` およびビットマップ画像 Base64 DataURL のみを許可し、外部 SVG や `javascript:` / `file:` スキームを遮断している。
  - **良好**: [ScriptsApp.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ScriptsApp.html#L754-L882) では `loadInitialData()` の成否戻り値に応じて成功トースト表示を制御し、`resetSelectionStateForModeChange_()` でモード切替時に選択状態・検索バー・iTunes モーダル DOM を一括リセットし、さらに `handleImageUpload()` 失敗時のプレビューロールバックも実装されている。

- **テスト網羅性・適切性**:
  - 監査実行時の検証結果（すべて終了コード `0`）：
    - `node build.js`: `dist\index.html`（249,979 文字）および `dist\.nojekyll` 生成成功。`dist/index.html` 内の全 3 本の `<script>` タグについて `vm.Script` 構文エラーゼロ、`google.script`・`<base target`・`module.exports`・`<?!=` 残存ゼロを直接確認。
    - `node tests/run_tests.js`: **成功 = 451, 失敗 = 0**
    - `node tests/red_team_attack_test.js`: **成功 = 289, 失敗 = 0**
    - `node tests/qa_comprehensive_verification.js`: **成功 = 9, 失敗 = 0**
  - 単体テスト・境界値テスト・Red Team 攻撃耐性テスト・QA 障害再現回帰テスト（`BUG-001` 〜 `BUG-006`）まで網羅されており、偽陰性の兆候は見られない。またワークスペースに `qa_reverify.js` 等の一時スクリプトが残留していないことも確認済み。

- **長期的運用リスク・技術的負債**:
  - [README.md](file:///c:/Users/nanko/Downloads/MusicInfo-app/README.md) に存在しないファイル名（`ModalForm.html`）や `ConnectionModal.html` 実ボタン文言との軽微な表記揺れが残っているため、長期保守の観点から早期の整合修正が望ましい（リリース阻害ではない）。
  - ローカルモードでの `uploadArtwork` は最大約 1.5MB 相当の DataURL を許容しているため、複数アルバムへローカル画像を登録すると `localStorage` のオリジン上限（通常約 5MB）に到達する可能性がある（ただし例外捕捉と GAS 連携案内により安全に処理される）。

---

## 4. 指摘事項一覧 (区分別)

### [欠陥 / Defect]
- **該当なし（0 件）**

### [リスク / Risk]
1. **実環境（実ブラウザ・実 GAS Web App・GitHub Actions）未検証に伴う初期リリース時疎通リスク**
   - **指摘内容**: すべての実装・検証はローカルのヘッドレス Node.js / `vm` サンドボックス上で完了しているが、実ブラウザ（320px 幅実描画）、実 GAS デプロイ（`ANYONE_ANONYMOUS` + `API_TOKEN` での 302 リダイレクト越え CORS POST）、および GitHub Actions ランナー（`Settings > Pages > Source: GitHub Actions` 設定連動）の実機動作は未検証である。
   - **証拠**: [github_pages_frontend_qa_report.md](file:///c:/Users/nanko/Downloads/MusicInfo-app/docs/qa/github_pages_frontend_qa_report.md#L30) および [github_pages_frontend_implementation_report.md](file:///c:/Users/nanko/Downloads/MusicInfo-app/docs/reports/github_pages_frontend_implementation_report.md#L68-L71) の未検証項目記録。
   - **影響**: 初回デプロイ時に GitHub Pages の Source 設定漏れや GAS デプロイ設定ミス（`ANYONE` のまま等）があると接続エラーやワークフロー失敗が生じる。
   - **対応方針**: 初回リリース手順に従い、デプロイ直後に上記 3 点のスモーク確認を実施すること。

2. **ローカルモードにおける複数画像登録時の `localStorage` 容量到達リスク**
   - **指摘内容**: `LocalDemoTransport.uploadArtwork` の許容サイズ上限（`1.5 * 1024 * 1024` 文字、約 1.5MB）に対して、一般的なブラウザの `localStorage` 上限は約 5MB であるため、ローカルモードのみで複数枚の画像をアップロード保存すると数枚で容量上限に達する。
   - **証拠**: [ScriptsApiClient.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ScriptsApiClient.html#L1052-L1055)（`MAX_LOCAL_DATAURL_LEN`）および L752-756（`LOCAL_STORAGE_QUOTA_EXCEEDED` 送出）。
   - **影響**: ローカルモード利用中に追加保存ができなくなる（既存データは保護され、エラーメッセージで GAS 連携が案内されるためデータ破損は起きない）。

3. **クライアント `localStorage` への `API_TOKEN` 保存リスク（ADR-001 既知トレードオフ）**
   - **指摘内容**: ブラウザの `localStorage` に `API_TOKEN` を平文保持するため、共有端末でのリセット忘れや将来の UI 拡張での XSS 混入時にトークン漏洩リスクがある。
   - **証拠**: [github_pages_frontend_design.md](file:///c:/Users/nanko/Downloads/MusicInfo-app/docs/architecture/github_pages_frontend_design.md#L320-L321)、[ConnectionModal.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ConnectionModal.html#L43-L45)（共有端末注意喚起）、[ScriptsApiClient.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ScriptsApiClient.html#L188)。
   - **影響**: 共有 PC での第三者による GAS API 不正操作リスク。UI 上の注意喚起・リセットボタン・`Utils.escapeHtml` 徹底により適切に緩和されている。

### [改善提案 / Suggestion]
1. **`README.md` のファイル一覧・ボタン文言の軽微な整合修正**
   - **指摘内容**: [README.md](file:///c:/Users/nanko/Downloads/MusicInfo-app/README.md#L41) のディレクトリ構成図に実在しない `ModalForm.html` が記載されている（実ファイルは `ItunesModal.html`, `ManualModal.html`, `EditAlbumModal.html`, `ImageModal.html`）。また同 L113 の「保存して接続」および L115 の「設定をリセット（ローカルへ戻る）」は、[ConnectionModal.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ConnectionModal.html#L90-L100) の実際のボタン文言（「保存して GAS に接続」「ローカルモードへリセット」）と表現が若干異なる。
   - **証拠**: [README.md](file:///c:/Users/nanko/Downloads/MusicInfo-app/README.md#L36-L45), [README.md](file:///c:/Users/nanko/Downloads/MusicInfo-app/README.md#L113-L115), [build.js](file:///c:/Users/nanko/Downloads/MusicInfo-app/build.js#L23-L36), [ConnectionModal.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ConnectionModal.html#L90-L101)。
   - **影響**: 実動作への影響はないが、ドキュメントと画面・ファイル構成の一致性を高めるため次回メンテナンス時等の更新を推奨する。

2. **URL バリデーション／URL サニタイザ正規表現のさらなる厳格化**
   - **指摘内容**: [ScriptsApiClient.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ScriptsApiClient.html#L86) の Google Workspace ドメイン部 `[^/]+` は空白や `@` 等を排除しないパターンであり、また同 L665 の `sanitizeArtworkUrl_` における `/^https?:\/\/\S+$/i` は `"` や `<` 等を許容する（表示側では `Utils.escapeHtml` で保護されているため XSS には直結しない）。
   - **証拠**: [ScriptsApiClient.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ScriptsApiClient.html#L86), [ScriptsApiClient.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ScriptsApiClient.html#L665)。
   - **影響**: 現状でも防御は成立しているが、`new URL(...)` によるホスト検証や制御文字・引用符の排除を追加すると多層防御がさらに向上する。

3. **`ScriptsApp.html` の中長期的モジュール分割検討**
   - **指摘内容**: [ScriptsApp.html](file:///c:/Users/nanko/Downloads/MusicInfo-app/src/ScriptsApp.html) が 2,908 行と大きくなっており、今後 UI 機能を追加する場合は接続設定コントローラーやモーダル別ハンドラの別ファイル分離（`build.js` 結合対象の拡張）を検討する余地がある。

### [アーキテクチャ上の懸念事項 / Architectural Concern]
- **該当なし（0 件）**

---

## 5. 推奨される差し戻し先 (差し戻し判定の場合)
- 該当なし（判定：**承認 (Release Approved)**）。
