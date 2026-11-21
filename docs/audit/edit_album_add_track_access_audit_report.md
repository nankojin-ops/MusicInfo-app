# ソフトウェア監査・最終レビュー報告書: アルバム編集モーダルにおけるトラック追加ボタンの常時アクセス性改善

- **監査実施日**: 2026年11月21日
- **担当ロール**: コードレビュアー / ソフトウェア監査担当者 (`code-reviewer`)
- **監査対象ドキュメント**:
  - 上流設計書: `docs/architecture/edit_album_add_track_access_design.md` (v1.0.0)
  - 実装計画書: `docs/planning/edit_album_add_track_access_plan.md` (v1.0.0)
  - 実装報告書: `docs/reports/edit_album_add_track_access_implementation_report.md`
  - QA検証レポート: `docs/qa/edit_album_add_track_access_qa_report.md` (v1.0.0)
- **監査対象コード・ビルド成果物**:
  - `src/EditAlbumModal.html` / `src/ScriptsApp.html`
  - `tests/run_tests.js` / `tests/red_team_attack_test.js`
  - `dist/index.html`（および関連参照ファイル `src/index.template.html`, `src/ScriptsState.html`, `src/ScriptsUtils.html`, `src/ItunesModal.html`, `src/ManualModal.html`, `build.js`, `tests/qa_comprehensive_test.js`）
- **監査報告書パス**: `docs/audit/edit_album_add_track_access_audit_report.md`

---

## 1. 総合リリース推奨判定

- **判定結果**: 【 **承認 (Release Approved)** 】
- **判定理由サマリー**:
  1. **要件・設計・計画の完全準拠**: 上流設計書の **ADR-01〜ADR-03** および受け入れ基準 **AC-001〜AC-007**、実装計画書の **TASK-001〜TASK-005**（留意事項6点含む）が、`src/EditAlbumModal.html`、`src/ScriptsApp.html`、`tests/run_tests.js`、`tests/red_team_attack_test.js`、および `dist/index.html` に過不足なく実装・反映されていることを直接照合で確認しました。
  2. **高いコード品質と既存契約の非破壊**: フッター新設ボタン `#btn-footer-add-edit-track` は既存 `this.addEditTrackRow()` を共通呼び出ししておりロジック重複がなく、`isSaving` ガードおよび `handleSaveAlbumEdit()` の `try / finally` 復帰、全追加 DOM 参照の null ガードが適切に機能しています。また `handleImageUpload()` の `relatedBtnIds`（5要素）や既存 `btnSubmit.disabled = true` 記述などの契約も完全に維持されています。
  3. **テストの独立検証・実ブラウザ幾何検証の再現確認**: 本監査にて独立して実行した `npm.cmd test`（単体・結合 521件 / Red Team 309件 / QA検証スクリプト 9件）および `node tests/qa_comprehensive_test.js`（25件）がすべて失敗ゼロ（Exit Code 0）でパスしました。さらに Microsoft Edge Headless + CDP による `dist/index.html` の代表9幅帯（`320px`〜`1536px`）実描画計測を独立再実施し、全幅帯で高さ `44px`・水平溢れゼロ・重なりゼロ・`<640px` 2段分離・`lg:` ヒント切替・最上部クリック時の自動追加＆フォーカス移動を確認しました。
  4. **QA観察事項 `[OBS-001]`〜`[OBS-004]` のリリース非阻害判定**: 精査の結果、これら4件はいずれも本改修で新たに発生・悪化した欠陥ではなく、変更前から存在するアプリ共通 UI 構造または本改修スコープ外（合意済み）の既知仕様に起因するため、リリース承認を阻害するものではありません（うち2件をリスク、2件を改善提案として記録）。

---

## 2. 準拠性監査

### 2.1 要件定義・受け入れ基準（AC-001〜AC-007）への準拠状況

| 要件 / 受け入れ基準 | 準拠状況 | 検証根拠（実見ファイル・実測事実） |
| :--- | :---: | :--- |
| **AC-001** (スクロール外操作性) | **準拠** | `src/EditAlbumModal.html` L179-188 でモーダル下端固定領域（`flex-shrink-0`）に `#btn-footer-add-edit-track` を配置。Edge 実描画の全9幅帯で `footerInsideVp: true`・最下部スクロール時 `hitIsFooterAdd: true` を確認。 |
| **AC-002** (両ボタン挙動一致・誘導) | **準拠** | `src/ScriptsApp.html` L287-294 で両ボタンとも `() => this.addEditTrackRow()` を呼び出し。`tests/run_tests.js` `[17]`（L3649-3690）および Edge `375×667` 最上部クリック実測で、入力保持・連番継承・`.edit-track-name` フォーカス・フォーム内表示到達を確認。 |
| **AC-003** (モバイル狭幅 `320px〜430px`) | **準拠** | `src/EditAlbumModal.html` L179-208 の `flex-col sm:flex-row` と `w-full sm:w-auto` により `<640px` で2段分離。Edge 実測（`320×640`, `375×667`, `430×932`）で `twoRow: true`, `footerH: 123`, `footerOverflow: false`, `overlaps: false` を確認。 |
| **AC-004** (タブレット・PC `640px〜1536px+` & 縦スクロール) | **準拠** | `src/EditAlbumModal.html` L32 に `min-h-0`、L189-193 に `hidden lg:flex ... min-w-0` / `truncate`、L197 に `w-full sm:w-auto flex-shrink-0` を適用。Edge 実測で `640〜768px` は1行・ヒント非表示、`1024〜1536px` は1行・ヒント表示（`hintW: 375.3`, `hintTruncated: false`）、全9幅帯で `formScrollable: true` を確認。 |
| **AC-005** (44px ターゲット & 単一DOM) | **準拠** | `src/EditAlbumModal.html` 内の全操作ボタンが `min-h-[44px]`（アイコン系2種は `min-w-[44px]` も）および `type="button"` を保有。同ファイル内の全21個の ID すべてが `src/EditAlbumModal.html`・`dist/index.html` 双方で厳密に 1 件のみ存在することを検証済み。 |
| **AC-006** (`isSaving` ガード & `handleImageUpload` 非阻害) | **準拠** | `src/ScriptsApp.html` L2444 の `isSaving` 早期リターン、L2575-2583 / L2629-2630 の `disabled` 同期および `finally` 復帰を実装。L2157-2163 の `handleImageUpload` `relatedBtnIds`（5要素）は未変更。`tests/run_tests.js` L3692-3795 で保存成功・例外時・画像アップロード中の挙動を検証済み。 |
| **AC-007** (SSOT ビルド・全自動テスト・実描画) | **準拠** | `dist/index.html`（`270,011 bytes` / タイムスタンプ `2026/11/21 10:33:22`）は `src/EditAlbumModal.html`（`10:26:38`）および `src/ScriptsApp.html`（`10:26:51`）より新しく、変更内容と完全一致。`npm.cmd test`（521 + 309 + 9件）および `node tests/qa_comprehensive_test.js`（25件）が全件成功（Exit Code 0）。 |

### 2.2 システムアーキテクチャ（ADR-01〜ADR-03）への準拠状況
- **ADR-01（ツールバーとフッターの併存構成）**: 既存 `#btn-add-edit-track`（`src/EditAlbumModal.html` L137）と `#edit-tracks-empty-warning`（L170-172）を維持したまま `#btn-footer-add-edit-track`（L182）を新設し、共通メソッド `addEditTrackRow()` へ集約。
- **ADR-02（フッターレスポンシブ幾何設計）**: 既存 `ItunesModal.html`（L93-106）と整合する `flex-col sm:flex-row` 構成を採用し、`hidden md:flex` から `hidden lg:flex` への引き上げおよび `whitespace-nowrap flex-shrink-0` 適用により `320px` および `768px` の圧迫・折り返しを解消。
- **ADR-03（DOM ID 一意性・状態同期方針）**: 新規 ID `#btn-footer-add-edit-track` を分離し、重複 ID を排除。`addEditTrackRow()` のロジックガードと `handleSaveAlbumEdit()` の `disabled` 同期の二段防御を実装し、システム境界（バックエンド GAS・Store・API・他モーダル）への侵食はゼロ。

### 2.3 実装計画書（TASK-001〜TASK-005）への準拠状況
- **TASK-001**: `src/EditAlbumModal.html` の `#form-edit-album` へ `min-h-0` 付与、ツールバー `#btn-add-edit-track` の `disabled:`・`whitespace-nowrap`・`flex-shrink-0`（SVG 含む）補完、フッター再構成、`md:w-auto` から `sm:w-auto` への修正、全ボタン `id` → `type="button"` → `class` 属性順統一をすべて計画通りに実装。
- **TASK-002**: `src/ScriptsApp.html` の `bindEvents()`、`addEditTrackRow()`、`handleSaveAlbumEdit()` の3箇所のみを計画通りに修正。既存テスト保護対象（`btnSubmit.disabled = true` / `btnMobileSubmit.disabled = true` / `handleImageUpload` 5要素）を維持。
- **TASK-003**: `tests/run_tests.js` 末尾へセクション `[17]`（L3356-3796）を追加。既存 `[1]`〜`[16]` の弱体化・削除なし。
- **TASK-004**: `tests/red_team_attack_test.js` の `[5.3.2]`（L1008-1035）を個別要素抽出による 44px・`type="button"`・`id→class` 順検証へ強化し、`[9.5]`（L1964-2050）を追加。既存チェックの削除なし。
- **TASK-005**: `dist/index.html` のビルド反映、全自動テストおよび Headless 実描画検証を実施済み。

---

## 3. 品質・技術的負債監査

### 3.1 コード品質 / 保守性 / シンプルさ
- **差分規模と明快さ**: `src/` の変更は `src/EditAlbumModal.html`（+23/-13行）および `src/ScriptsApp.html`（+11/-0行）の極めて局所的な範囲に収まっており、過剰な抽象化や不要な複雑性は導入されていません。
- **既存パターンとの一貫性**:
  - `src/ScriptsApp.html` L287-294 のリスナー登録は、同メソッド内の `btnCloseEdit` / `btnCancelEdit`（L257-260）や `btnSubmitEdit` / `btnMobileSubmitEdit`（L312-319）と同じ明示的 null ガードスタイルで統一されています。
  - `src/EditAlbumModal.html` L179 のフッター構造は `src/ItunesModal.html` L93 のレスポンシブ規約（`px-3 sm:px-4 py-3 ... flex-col sm:flex-row ... gap-2.5`）と調和しています。
- **文字コード・XSS・フォーム安全性**: `#btn-footer-add-edit-track` には `type="button"` が明示され、インラインイベント属性は一切使用されていません。

### 3.2 結合度と凝集度
- **高凝集な責務集約**: トラック行の追加・DOM入力同期（`syncEditingTracksFromDom()`）・再描画（`renderEditModalTracks()`）・末尾フォーカス＆スクロール誘導はすべて `App.prototype.addEditTrackRow()`（`src/ScriptsApp.html` L2443-2479）に単一集約されており、UI 要素（ツールバー／フッターの2ボタン）との結合はイベントバインディングのみに疎結合化されています。
- **Store / API との非侵入性**: `this.store.state.isSaving` の既存フラグ契約のみを参照しており、Store・ApiClient・バックエンド GAS コードとの結合度増加はありません。

### 3.3 エラーハンドリング・セキュリティ・null 安全性
- **null ガードによるモック互換維持**: `bindEvents()`（L291-294）、`addEditTrackRow()`（L2444 の `this.store && this.store.state && this.store.state.isSaving`）、`handleSaveAlbumEdit()`（L2582-2583, L2629-2630）のすべてに null ガードが付与されているため、一部 DOM が未定義なテスト環境（`tests/qa_comprehensive_test.js` L711-723 等）でも例外を送出しません。
- **`finally` 復帰**: `handleSaveAlbumEdit()`（L2625-2638）の `finally` ブロックで `isSaving = false` および両追加ボタン・両保存ボタンの `disabled = false` 復帰を保証しており、API エラー発生時にも操作不能状態に陥りません。
- **Enter 誤送信・XSS 防御**: `<form id="form-edit-album">` の `onsubmit="event.preventDefault();"` および新設ボタン `type="button"` を維持・適用し、`Utils.escapeHtml()` 経路への副作用はありません。

### 3.4 テスト網羅性・適切性（形骸化・盲点チェック）
- **既存テストの非弱体化**: `git diff` により、`tests/run_tests.js` `[1]`〜`[16]` および `tests/red_team_attack_test.js` の既存テスト項目が削除・緩和されていないことを確認しました。さらに `[5.3.2]` は従来のファイル全体 `.includes('min-h-[44px]')` による抜け穴を塞ぐ厳格化が行われました。
- **新規テストの実効性**:
  - `tests/run_tests.js` `[17]`（L3457-3795）では `vm.runInContext` 上で実 `ScriptsUtils.html` / `ScriptsState.html` / `ScriptsApp.html` を読み込み、`bindEvents()` 後のクリック発火、入力変更値の保持、エラー例外投げ込み後の `finally` 復帰（実際に `Simulated Save Failure` が L2610 で捕捉されることをログ確認）、および `uploadStarted` 待機を用いた `handleImageUpload` 非阻害検証（L3772 の到達ガード付き）まで行っており、空振り PASS（形骸化）は認められません。
  - `tests/red_team_attack_test.js` `[9.5]`（L1964-2050）でも保護クラス・`min-h-0`・`dist/index.html` 重複ID不在・`isSaving` ガード配置順序（`isSavingPos < syncPos`）まで静的検証しています。
- **軽微なテスト盲点**: `EditAlbumModal.html` 内の残り2ボタン（画像アップロード系）の `type="button"` 統一チェックおよび残り3 ID の `dist/index.html` 単一 DOM チェック（詳細は後述 `[SUG-001]`）が未統合ですが、実コード上は問題ないことを本監査で全数確認済みです。

### 3.5 QA レポート観察事項 `[OBS-001]`〜`[OBS-004]` の影響評価と長期的運用リスク
- **`[OBS-001]`（右下固定トーストによる `#btn-submit-edit-album` クリック遮蔽）**:
  - **判定**: **既存共通 UI リスク（別タスク送り・リリース承認可）**。`#toast-container`（`src/index.template.html` L46）と `pointer-events-auto`（`src/ScriptsUtils.html` L265）は全モーダル（`ManualModal.html` L114-122, `ItunesModal.html` L97-105 等）共通の既存構造であり、本改修以前から `#btn-submit-edit-album` はフッター右下に存在していました。本改修で悪化した事象ではなく、新設 `#btn-footer-add-edit-track` 自体は遮蔽されません。ただし実操作上のリスク（Medium）として明確に観測されたため `[RISK-001]` として記録します。
- **`[OBS-002]`（モーダル再オープン時の `scrollTop` 非リセット）**:
  - **判定**: **既存軽微 UX 課題（別タスク送り・改善提案）**。`openEditAlbumModal()`（`src/ScriptsApp.html` L2035-2097）に変更前から `scrollTop = 0` リセット処理がないことによる既存挙動であり、本改修で新たに発生した問題ではありません。
- **`[OBS-003]`（`320px〜375px` の本文内既存3ボタンの2行折り返し）**:
  - **判定**: **既存軽微表示課題（別タスク送り・改善提案）**。変更対象外の `#btn-edit-album-upload`, `#btn-edit-album-drive`, `#btn-renumber-edit-tracks` の既存動作であり、44px 要件・水平非溢れは満たしています。
- **`[OBS-004]`（保存中 `isSaving === true` の他ボタンおよび `#global-loading` 重ね順）**:
  - **判定**: **計画合意済みの既存構造リスク（別タスク送り・リリース承認可）**。上流設計書 1.4節 4・ADR-03・実装計画書 1.2節 6 でスコープ外と明確に合意済みです。ただし、コード監査により「保存中に `#btn-cancel-edit-album` を押下すると `closeEditAlbumModal()` が `this.editingTargetKey = null` にしてしまい、API 成功後の `this.store.updateAlbumInCatalog()`（`src/ScriptsState.html` L330）で null 参照エラーが起き得る」具体的な影響経路を確認したため、将来の全面排他ロック化に向けて `[RISK-002]` に正確な事実を記録します。

---

## 4. 指摘事項一覧 (区分別)

### [欠陥 / Defect]
- **指摘なし（0件）**: 本改修の実装およびテストにおいて、仕様違反・動作不良・デグレードに該当する欠陥は検出されませんでした。

### [リスク / Risk]

1. **`[RISK-001]` 右下固定トースト（`#toast-container`）による保存ボタン等のクリック遮蔽リスク（QA `[OBS-001]` / 既存共通 UI 課題）**
   - **指摘内容**: エラー通知等のトースト表示中に、フッター右下の `#btn-submit-edit-album` 上へトーストが重なり、トースト消滅まで保存ボタンが押下できなくなる既存の UI 構造リスクがある。
   - **証拠**:
     - `src/index.template.html` L39 (`<?!= include('EditAlbumModal'); ?>`) より後ろの L46 に `<div id="toast-container" class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"></div>` が配置され、両者とも `z-50` である。
     - `src/ScriptsUtils.html` L265 で生成される各トースト要素に `pointer-events-auto` が設定されており、クリック閉じハンドラを持たない。
     - 他モーダル（`src/ItunesModal.html` L97-105、`src/ManualModal.html` L114-122）も同様にフッター右下に保存ボタンを配置している。
   - **影響**: バリデーション警告や保存エラー（`duration=7000`）表示直後の数秒間、狭幅画面や複数トースト表示時にユーザーが「変更を保存」を再クリックできない。本改修の新設ボタン `#btn-footer-add-edit-track` には影響せず、既存仕様起因のためリリース非阻害。
   - **関連要件 / 原則**: AC-006（エラー復帰後の操作性）、フロントエンド共通 UI 設計。次期 UI 改善タスクにてトースト表示位置の上端変更またはクリック透過・タップ閉じ対応を推奨。

2. **`[RISK-002]` 保存処理中（`isSaving === true`）のモーダル閉じる／キャンセル操作等による状態不整合リスク（QA `[OBS-004]` / 既存仕様）**
   - **指摘内容**: 保存通信中に `#global-loading` がモーダル背面に描画され、かつキャンセル／閉じる／採番／削除ボタンが無効化・ガードされていない既存構造により、保存通信完了前にモーダルを閉じるとキャッシュ同期例外が起きる潜在リスクがある。
   - **証拠**:
     - `src/index.template.html` L16 の `#global-loading`（`z-50`）より L39 の `EditAlbumModal`（`z-50`）が後置されており、保存中もモーダルが前面に描画される。
     - `src/ScriptsApp.html` L257-260 で `#btn-close-edit-album` と `#btn-cancel-edit-album` に接続された `closeEditAlbumModal()`（L2099-2106）には `if (this.store.state.isSaving) return;` ガードがなく、`this.editingTargetKey = null;` を実行する。
     - 保存成功後の `handleSaveAlbumEdit()` L2612 が呼ぶ `Store.updateAlbumInCatalog()`（`src/ScriptsState.html` L329-330）は `targetKey.originalAlbumArtist` を参照するため、`editingTargetKey` が `null` の場合 `TypeError` を送出し `catch` 節へ落ちる。また `removeEditTrackRow()`（L2481）および `renumberEditTracks()`（L2491）にも `isSaving` ガードはない。
   - **影響**: 低頻度ながら、通信遅延中にユーザーがキャンセルを押下した場合、スプレッドシート／ローカルDB側が更新済みであるにもかかわらず画面上に更新エラーが表示されローカルキャッシュが更新されない不整合が発生し得る。
   - **関連要件 / 原則**: 設計書 1.4節 4、ADR-03、実装計画書 1.2節 6 にて本スコープ外と合意された既存仕様。将来的に `closeEditAlbumModal()` の `isSaving` ガード追加や `#global-loading` の `z-index` 調整を別タスクで検討することを推奨。

3. **`[RISK-003]` 物理モバイル端末・実 GAS デプロイ環境における未検証残余リスク**
   - **指摘内容**: 自動テストおよび Headless ブラウザ実測は Windows 上の Microsoft Edge（`local_demo` データおよびモック）で実施されており、実スマートフォン端末の仮想キーボード展開時および実 GAS Web アプリデプロイ環境での E2E 結合は未検証である。
   - **証拠**: 実装報告書 L52-55、QA レポート L37-39。
   - **影響**: `<form id="form-edit-album">` への `min-h-0` 適用と `h-full` 構造により理論上安全であるが、iOS Safari 等の実機ブラウザにおける `100vh` / ソフトウェアキーボード出現時のレイアウト再計算挙動に微細な差異が生じる可能性はゼロではない。
   - **関連要件 / 原則**: AC-001, AC-003, AC-007、原則10（未検証事実の明示）。

### [改善提案 / Suggestion]

1. **`[SUG-001]` `EditAlbumModal` テストのボタン検証粒度と単一 DOM チェック対象 ID の統一**
   - **指摘内容**: `tests/red_team_attack_test.js` および `tests/run_tests.js` において、`EditAlbumModal.html` 内の画像アップロード系2ボタンおよび残り3つの既存操作 ID も同一ループに統合すると保守性が高まる。
   - **証拠**:
     - `tests/red_team_attack_test.js` L1009-1035（`[5.3.2]`）では7ボタンに対して `min-h-[44px]`・`type="button"`・`id→class` 順を厳格検証しているが、`btn-edit-album-upload` と `btn-edit-album-drive` は L1408-1424 で `min-h-[44px]` のみ検証（`type="button"` チェックなし）。
     - `tests/run_tests.js` L3365-3371 および `tests/red_team_attack_test.js` L2003 の単一 DOM チェックは主要5 ID のみ対象としており、`btn-close-edit-album`, `btn-mobile-submit-edit-album`, `btn-renumber-edit-tracks` は含まれていない（なお、本監査にて全21 ID の一意性と画像系2ボタンの `type="button"` 付与は実ファイル・`dist/index.html` で直接確認済み）。
   - **影響**: 現状の実コードに不備はなくリリース阻害要因ではないが、将来の編集でボタン属性や ID が誤改変された際の検知漏れ防止に寄与する。
   - **関連要件 / 原則**: 計画書 TASK-004（L298）、NFR-COMPAT-001。

2. **`[SUG-002]` モーダル再オープン時のスクロール初期化および狭幅本文ボタンの折り返し改善（QA `[OBS-002]` / `[OBS-003]`）**
   - **指摘内容**: 別の改善タスクにて、`openEditAlbumModal()` 実行時の `#form-edit-album` スクロール位置初期化、および狭幅時（`320px〜375px`）の既存本文内3ボタンの1行化を検討すると UX がさらに向上する。
   - **証拠**: `src/ScriptsApp.html` L2035-2097 (`openEditAlbumModal()`) に `scrollTop = 0` リセット処理が存在しないこと、および `src/EditAlbumModal.html` L84, L91, L129 に `whitespace-nowrap` が指定されていないこと。
   - **影響**: `[OBS-002]` は再オープン時に直前のスクロール位置が引き継がれ基本情報欄が見切れる軽微な不便、`[OBS-003]` は狭幅端末でのボタン文字2行折り返し（いずれも機能支障・44px割れ・横溢れはなし）。
   - **関連要件 / 原則**: 共通10原則2（上流スコープ境界の尊重）、既存 UX 品質向上。

3. **`[SUG-003]` 長期保守性観点: 併存ボタン同期・保存ロック制御の将来リファクタリング候補および既存テストモック整備**
   - **指摘内容**:
     1. **併存ボタンの仕様同期**: ADR-01 に基づき `#btn-add-edit-track`（`src/EditAlbumModal.html` L137）と `#btn-footer-add-edit-track`（L182）の2箇所が存在するため、将来ボタンラベルやスタイル・`isSaving` 制御対象を変更する際は両箇所の同期更新が必要となる。将来さらにロック対象ボタンを増やす場合、`handleSaveAlbumEdit()`（`src/ScriptsApp.html` L2573-2583, L2627-2630）は既存 Red Team テスト L1059 との互換に留意しつつ共通ヘルパー化を検討する余地がある。
     2. **既存テストモックの補完（参考観測）**: 変更対象外の `tests/qa_comprehensive_test.js` L737-747 のモック `Utils` に `normalizeSearchText` が未定義であるため、テスト実行時に `Store.buildCatalog`（`src/ScriptsState.html` L72）で `TypeError: Utils.normalizeSearchText is not a function` が発生し、`handleSaveAlbumEdit()` の `catch` 節に捕捉されて標準出力にログが出力されている（アサーション対象が `savedEditPayload` のためテスト自体は25件全件 PASS しているが、別タスクでのモック補完が望ましい）。
   - **証拠**: 上記各行番号および `node tests/qa_comprehensive_test.js` 実行ログ。
   - **影響**: 今回の変更による不具合ではなく、長期的なテストログの明瞭性と保守性に関する参考提案。

### [アーキテクチャ上の懸念事項 / Architectural Concern]
- **指摘なし（0件）**: 本件アーキテクチャ設計（ADR-01〜ADR-03）および実装には全体設計の破綻や技術的矛盾は認められませんでした。なお、既存全モーダル共通のトースト配置・`z-index` 重ね順・保存中排他制御については、今後の横断的な UI アーキテクチャ改善テーマとしてバックログ管理することを推奨します。

---

## 5. 推奨される差し戻し先 (差し戻し判定の場合)
- **該当なし**: 判定結果が **承認 (Release Approved)** であるため、差し戻しは不要です。
