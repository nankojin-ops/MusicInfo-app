# QA検証レポート: アルバム編集モーダルにおけるトラック追加ボタンの常時アクセス性改善

- **文書バージョン**: 1.0.0
- **検証実施日**: 2026年11月21日
- **担当ロール**: QAエンジニア (`qa-engineer`)
- **対象要件・上流設計書**: `docs/architecture/edit_album_add_track_access_design.md` (v1.0.0 / AC-001〜AC-007)
- **対象実装計画書**: `docs/planning/edit_album_add_track_access_plan.md` (v1.0.0 / 4.4節実描画幾何検証基準)
- **対象実装報告書**: `docs/reports/edit_album_add_track_access_implementation_report.md`
- **成果物パス**: `docs/qa/edit_album_add_track_access_qa_report.md`

---

## 1. 検証サマリー

### 1.1 テスト実施ステータス（4区分）

行動規範に基づき、本QA検証における確認根拠を以下の4区分で厳密に区別して報告します。

- **実行済み (Executed)**:
  - **自動テストスイートの独立実測**（Exit Code 0 / 失敗 0件）:
    - `npm.cmd test`:
      - `tests/run_tests.js`: **成功 = 521, 失敗 = 0**（セクション `[17]` 19項目を含む）
      - `tests/red_team_attack_test.js`: **全 309 件中 成功 = 309, 指摘/失敗 = 0**（`[5.3]` 7ボタン個別44px強化・`[9.5]` 6件を含む）
      - `tests/qa_comprehensive_verification.js`: **成功 = 9, 失敗 = 0**
    - `node tests/qa_comprehensive_test.js`: **成功 = 25, 失敗 = 0**
  - **Microsoft Edge Headless + CDP による実ブラウザ障害モード・実描画幾何検証**（ローカル HTTP 配信下の `dist/index.html` [270,011 bytes]、Tailwind Play CDN ロード・`min-h-[44px]` 適用確認済み）:
    - 長尺アルバム（20曲・2 Disc・長大日本語＋無空白英数字混在）を用いた **全11ビューポート**（代表9幅帯 `320×640`, `375×667`, `430×932`, `640×800`, `767×800`, `768×1024`, `1024×768`, `1280×800`, `1536×900` ＋仮想キーボード想定極小高さ `320×480`, `375×420`）の幾何・スクロール3位置（最上部 `scrollTop=0`・中間・最下部）・`document.elementFromPoint` 遮蔽・テキスト縦割れ・重なり・水平オーバーフロー計測。
    - `320×480`, `375×667`, `768×1024`, `1280×800` における実マウスクリック（`Input.dispatchMouseEvent`）による最上部／最下部からの追加、ツールバー `#btn-add-edit-track` との一致動作、未コミット入力保持、XSS ペイロード（`<img src=x onerror="window.__xssTriggered=true">`）注入耐性、`.edit-track-name` フォーカス及び `scrollIntoView` 到達位置計測。
    - 境界・特殊攻撃検証：1曲のみ状態（削除ボタン `disabled` 共存）→2曲追加、0曲強制状態（`#edit-tracks-empty-warning` 表示）→フッター追加ボタンからの復旧、Enter キー誤送信抑止、20ms間隔 5連打バースト追加（`375×667`）、125% 文字拡大（`html { font-size: 20px }` at `1024×768`）でのフッター耐性。
    - 並行性・状態制御・エラー処理検証：`320×640` および `1024×768` での `handleSaveAlbumEdit()` 実行中（`isSaving: true`）の `disabled` 同期・視覚非活性・クリック／直接呼出抑止、API reject エラー時の `finally` 復帰、および `handleImageUpload(..., 'editAlbum')` 中の非阻害確認。
    - 既存機能回帰検証：番号自動連番採番（`#btn-renumber-edit-tracks`）、トラック削除（`.btn-remove-edit-track`）、モーダル再オープン時状態・スクロール残存確認、`ItunesModal` / `ManualModal` 開閉確認、および `#toast-container` 表示中のクリック遮蔽検証。
- **検査済み (Inspected)**:
  - `src/EditAlbumModal.html`, `src/ScriptsApp.html`, `src/ScriptsUtils.html`, `src/index.template.html`, `build.js`, `tests/run_tests.js`（セクション `[17]`）, `tests/red_team_attack_test.js`（`[5.3]`, `[9.5]`）, `tests/qa_comprehensive_test.js` の静的コード精査。
  - `dist/index.html` のビルド鮮度確認（タイムスタンプが `src/EditAlbumModal.html`・`src/ScriptsApp.html` より新しく、`src/EditAlbumModal.html` 全文と `ScriptsApp.html` 修正内容が反映され、関連 ID が厳密に単一であることを実ファイル照合で確認）。
- **推論済み (Inferred)**:
  - Chromium（Microsoft Edge）での Flexbox / `min-h-0` / `scrollIntoView` / `whitespace-nowrap` 実描画結果に基づく、他のモダンブラウザ（iOS Safari / Android Chrome）における同等挙動の推定。
- **未検証 (Unverified)**:
  - 物理スマートフォン実機（iOS Safari / Android Chrome）上での実ソフトキーボード展開時のビューポート縮小・実タッチスクロール挙動。
  - 実際の Google Apps Script (GAS) Web アプリ環境での実スプレッドシート／Google Drive 通信を伴う手動エンドツーエンド結合テスト（本検証はローカル HTTP + `local_demo` / モック環境で実施）。

### 1.2 総合評価

- **総合評価**: **合格**（AC-001〜AC-007 全件達成 / 本改修起因の不具合 0件）
- **判定理由**:
  - 上流設計書（AC-001〜AC-007）および実装計画書（4.4節）で定義されたすべての機能・幾何・セキュリティ・状態保護・ビルド・自動テスト基準を満たしており、代表9幅帯（＋極小高さ2種）の実ブラウザ計測および自動テスト 864 件（`521 + 309 + 9 + 25`）において失敗は 0 件でした。
  - なお、障害モード攻撃テストの過程で、**本改修のスコープ外である既存 UI / アプリ共通構造に起因する潜在課題 4件（Medium 1件・Low 2件・既知設計確認 1件）**を観測しました。これらはいずれも今回の変更によって新たに発生したデグレードではなく、受入基準を阻害しないため本改修自体は「合格」と判定し、第3章に独立した観察 Issue 票として報告・引き継ぎます。

---

## 2. 観点別テスト結果

### 2.1 受け入れ基準（AC-001〜AC-007）トレーサビリティ結果

| 受け入れ基準 | 検証ステータス | 判定 | 実測・検証根拠サマリー |
| :--- | :---: | :---: | :--- |
| **AC-001** (スクロール外からのトラック追加操作性) | 実行済み | **合格** | 全11ビューポート（`320×640`〜`1536×900`, `320×480`, `375×420`）の最上部・中間・最下部すべてのスクロール位置で `#btn-footer-add-edit-track` が画面下端に固定表示（`footerInsideVp=true`）され、`elementFromPoint` 遮蔽なし（全位置 `hitIsFooterAdd=true`）でクリック可能・追加成功を確認。 |
| **AC-002** (両ボタン挙動一致・自動スクロール・フォーカス) | 実行済み | **合格** | `320×480`, `375×667`, `768×1024`, `1280×800` で最上部 (`scrollTop=0`)・最下部・ツールバー `#btn-add-edit-track` から実クリックし、既存入力（1行目 XSS 文字列・20行目変更値）保持、CD/No `+1` 継承（Disc 2 #10→#11→#12→#13）、バッジ更新（`21曲` 等）、末尾 `.edit-track-name` フォーカス（`activeElementIsNewInput=true`）およびフォーム可視領域内表示（`inFormViewport=true, aboveFooter=true`）の一致を確認。 |
| **AC-003** (モバイル狭幅 `320px〜430px` フッター幾何・誤操作防止) | 実行済み | **合格** | `320×640`, `320×480`, `375×667`, `375×420`, `430×932` で上段 `#btn-footer-add-edit-track` 全幅（`296px / 351px / 406px`）、下段「キャンセル」＋「変更を保存」の2段分離（フッター高 `123px`）、フッター3ボタンの縦割れゼロ（`lines=1`）、重なりゼロ、水平溢れゼロを確認。 |
| **AC-004** (タブレット・PC `640px〜1536px+` 幾何・ヒント共存・縦スクロール) | 実行済み | **合格** | `640×800`, `767×800`, `768×1024` で1行構成（高 `69px`）・ヒント非表示（`display: none`）・重なり/溢れゼロ、`1024×768`, `1280×800`, `1536×900` でヒント表示（`display: flex`, 幅 `351.3px`）と3ボタン共存、さらに `1024×768` 文字125%拡大下でも溢れ・重なりゼロを確認。`#form-edit-album` は全11環境で `minHeight: 0px`・縦スクロール可能。 |
| **AC-005** (WCAG 44px ターゲット & 単一DOM契約) | 実行済み | **合格** | フッター3ボタン・`#btn-add-edit-track`・`#btn-close-edit-album`・`#btn-mobile-submit-edit-album`・`.btn-remove-edit-track` 等すべて実測高さ `>= 44px`（`44px` または `50px`）。`src/EditAlbumModal.html` および `dist/index.html` 内で対象 ID が厳密に 1 箇所のみ存在。 |
| **AC-006** (保存中 `isSaving` ガード・画像アップロード非阻害) | 実行済み | **合格** | `320×640` / `1024×768`（トースト非干渉状態）で `handleSaveAlbumEdit()` 待機中 `isSaving=true`, 両追加ボタン・両保存ボタン `disabled=true`, `opacity=0.4`, `cursor=not-allowed`, クリック／直接呼出とも行数不変、エラー reject 時の `finally` 復帰と入力保持を確認。`handleImageUpload` 実行中は追加ボタンが `disabled=false` を維持し追加可能。 |
| **AC-007** (SSOT ビルド・全自動テスト・実ブラウザ検証) | 実行済み | **合格** | `dist/index.html` が最新ビルド済みであり、`npm.cmd test`（521 + 309 + 9）および `node tests/qa_comprehensive_test.js`（25）が全件 Exit Code 0、Edge Headless 実ブラウザ計測でも AC-001〜AC-006 違反ゼロ。 |

### 2.2 12大検証項目別テスト結果

| # | 検証観点 | ステータス | 判定 | 主な確認内容・観測結果 |
| :---: | :--- | :---: | :---: | :--- |
| 1 | **機能の正確性** | 実行済み | **合格** | スクロール位置を問わず `#btn-footer-add-edit-track` から `addEditTrackRow()` が実行され、ツールバー `#btn-add-edit-track` と完全に同一の行追加・CD/No継承・自動フォーカス・自動スクロールが機能することを確認。 |
| 2 | **エッジケース** | 実行済み | **合格** | 1曲のみ状態（削除ボタン無効）での追加→有効化、強制0曲状態（`#edit-tracks-empty-warning` 表示）→フッターボタン押下による `CD 1 / No 1` 復旧、20曲・複数Disc・長大タイトル混在データでの正常動作を確認。 |
| 3 | **境界条件** | 実行済み | **合格** | `320px`（XS幅）, `320×480`・`375×420`（極小高さ仮想KB想定）, `640px` (`sm:`), `767px`/`768px` (`md:`), `1024px` (`lg:`), `1536px`, および `1024px` + 125% 文字サイズ拡大の境界すべてでフッター溢れ・縦割れ・重なりゼロ。 |
| 4 | **無効な入力** | 実行済み | **合格** | テキスト入力欄での Enter キー送信（フォーム誤送信・ページリロードが発生しないこと、`submitCalledCount=0`）および保存前空トラック名バリデーション維持を確認。 |
| 5 | **エラー処理** | 実行済み | **合格** | `updateAlbumBatch` の非同期エラー（reject）発生時でも `finally` ブロックにより `isSaving=false`・4ボタンの `disabled=false`・ラベル復元・モーダル開状態維持（入力保持）が確実に行われることを確認（VMテストおよび Edge 実測）。※エラー直後の右下トースト遮蔽リスクは既存課題 `[OBS-001]` に記録。 |
| 6 | **セキュリティ** | 実行済み | **合格** | インラインイベント属性（`<form>` の `onsubmit="event.preventDefault();"` 除く）非混入、`type="button"` 付与、トラック名への `<img src=x onerror="window.__xssTriggered=true">` 注入・再描画で XSS 発火ゼロ（`xssTriggered=false`）を確認。 |
| 7 | **並行性** | 実行済み | **合格** | 保存処理中の `isSaving` ガードおよびボタン `disabled` 同期、20ms間隔 5連打バーストクリックでの連番破損なし（20→25曲・`trackNumber=15`・最終行フォーカス）、画像アップロード中の追加操作との非干渉を確認。※保存中の他ボタン（キャンセル等）の既存挙動は `[OBS-004]` に記録。 |
| 8 | **信頼性** | 実行済み | **合格** | Tailwind Play CDN 環境で `min-h-[44px]`, `min-h-0`, `flex-col sm:flex-row`, `hidden lg:flex`, `disabled:opacity-40` 等が意図通り適用され、JS例外（`pageExceptions=0`）が発生しないことを確認。 |
| 9 | **パフォーマンス** | 検査済み・実行済み | **合格** | 20曲〜25曲規模で `addEditTrackRow()` 5連打後も遅延・固着なく即座に描画完了。新規 DOM 要素は固定フッターボタン 1 要素のみであり描画負荷増は無視可能。 |
| 10 | **データ整合性** | 実行済み | **合格** | 未コミット DOM 値（`syncEditingTracksFromDom()`）を失わず追加され、削除・連番採番後も `editingTracks` 配列と DOM 要素・`#edit-tracks-count-badge` が完全一致。全 ID の単一 DOM 契約も `src`/`dist` 双方で維持。 |
| 11 | **後方互換性** | 実行済み | **合格** | 既存 `#btn-add-edit-track`、ツールバー配列、`handleImageUpload` の `relatedBtnIds`（5要素）、および既存テストスイート（`qa_comprehensive_test.js` 等、一部 DOM 未定義のモック環境含む）と 100% 互換。 |
| 12 | **回帰リスク** | 実行済み | **合格** | 番号自動連番採番（`1-1, 1-2, 2-1`）、トラック削除、および `ItunesModal` / `ManualModal` 開閉に副作用・退行なし。※再オープン時スクロール位置残存の既存挙動は `[OBS-002]` に記録。 |

### 2.3 実ブラウザ（Edge Headless + CDP）詳細計測データ（`dist/index.html` / 20曲2Discデータ）

| ビューポート | フッター高 (`px`) | フッター構成 | ヒント `display` | `footerAdd` / `cancel` / `submit` / `toolbarAdd` 実測高・行数 | 水平溢れ (`doc/dialog/form/footer`) | 重なり (`footer内`) | スクロール3位置 (`top/mid/bottom`) 押下 (`hitIsFooterAdd`) | `#form-edit-album` 領域 (`clientH / scrollH`) |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `320×640` | `123` | 2段 (`w:296`) | `none` | `44/44/44/44` (全 `1行`) | 全 `false` | `false` | `true / true / true` | `448 / 3753` |
| `320×480` (極小高) | `123` | 2段 (`w:296`) | `none` | `44/44/44/44` (全 `1行`) | 全 `false` | `false` | `true / true / true` | `288 / 3753` |
| `375×667` | `123` | 2段 (`w:351`) | `none` | `44/44/44/44` (全 `1行`) | 全 `false` | `false` | `true / true / true` | `475 / 3747` |
| `375×420` (極小高) | `123` | 2段 (`w:351`) | `none` | `44/44/44/44` (全 `1行`) | 全 `false` | `false` | `true / true / true` | `228 / 3747` |
| `430×932` | `123` | 2段 (`w:406`) | `none` | `44/44/44/44` (全 `1行`) | 全 `false` | `false` | `true / true / true` | `740 / 3716` |
| `640×800` | `69` | 1行 | `none` | `44/44/44/44` (全 `1行`) | 全 `false` | `false` | `true / true / true` | `662 / 3688` |
| `767×800` | `69` | 1行 | `none` | `44/44/44/44` (全 `1行`) | 全 `false` | `false` | `true / true / true` | `662 / 3688` |
| `768×1024` | `69` | 1行 | `none` | `44/44/44/44` (全 `1行`) | 全 `false` | `false` | `true / true / true` | `782 / 1685` |
| `1024×768` | `69` | 1行 | `flex` (`w:351.3`) | `44/44/44/44` (全 `1行`) | 全 `false` | `false` | `true / true / true` | `551 / 1669` |
| `1280×800` | `69` | 1行 | `flex` (`w:351.3`) | `44/44/44/44` (全 `1行`) | 全 `false` | `false` | `true / true / true` | `580 / 1669` |
| `1536×900` | `69` | 1行 | `flex` (`w:351.3`) | `44/44/44/44` (全 `1行`) | 全 `false` | `false` | `true / true / true` | `670 / 1669` |

※全ビューポートで `footerInsideVp === true`、`formMinHeightStyle === "0px"` を実測確認済み。

---

## 3. 発見された不具合・課題一覧 (Issue票)

**本改修（AC-001〜AC-007）に対する新規不具合は 0 件です。**
以下に、独立した障害モード攻撃テストの中で実測確認された**既存構造／スコープ外領域の観察事項・潜在課題（4件）**を客観的証拠とともに記録します。

### [OBS-001]: 右下固定トースト（`#toast-container`）による `#btn-submit-edit-album` 等のクリック遮蔽リスク（既存・全モーダル共通）
- **重大度**: **Medium**（影響度: バリデーションエラーや保存エラー発生直後の数秒間、フッター右下の「変更を保存」ボタン押下が妨げられる）
- **関連要件/受け入れ基準**: AC-001 / AC-006（エラー復帰後の再保存操作性）、既存 `src/index.template.html` L46 / `src/ScriptsUtils.html` L252-274
- **再現手順**:
  1. `320×640` 幅で `#modal-edit-album` を開いた状態（または `1024×768` 等で長文エラー／複数トーストが積み上がった状態）で、`Utils.showToast(..., 'error', 7000)` 相当のエラー・警告通知を表示させる（例: 保存エラー、削除不可警告、連番採番通知など）。
  2. トーストが表示されている間（最大 7 秒間）に、フッター右下の `#btn-submit-edit-album` の中央座標をクリックする。
- **期待される動作**:
  - 通知トーストがモーダル操作ボタン（特に「変更を保存」ボタン）へのクリック／タップを妨げないこと。
- **実際の動作**:
  - `320×640` で単発エラートースト表示中に `#btn-submit-edit-album` 中央を `elementFromPoint` 計測したところ `submitBlockedByToast: true` となり、トースト要素がボタン上に重なっていた（なお新設の `#btn-footer-add-edit-track` 自体は `footerAddBlockedByToast: false` で遮蔽されない）。
  - また `1024×768` でも複数／高めのトーストが表示された状態で `#btn-submit-edit-album`（座標 `894.4, 694.6`）を実クリックした際、`hit` 要素が `DIV`（`bg-rose-600 ... pointer-events-auto`）となってクリックイベントがトーストに吸収され、`handleSaveAlbumEdit()` が発火しなかった。
- **証拠・ログ**:
  - Edge CDP 実測（`qa_edit_modal_cdp_result2.json` L2639, `qa_edit_modal_edge_attacks.js` `toastOverlap_320x640`）および `src/ScriptsUtils.html` L265（`pointer-events-auto` 付与、クリック閉じハンドラなし）、`src/index.template.html` L46（`fixed bottom-4 right-4 z-50`）。
- **考えられる原因**: **アーキテクチャ・既存UI共通設計起因**（本改修以前からの全モーダル共通仕様であり、新設フッター追加ボタン自体が起こした不具合ではない）。
- **推奨される次の対応**: 次期 UI 改善タスクとして、トースト位置を上端中央／右上（`top-4`）へ移動する、クリックで閉じる、または `pointer-events-none` 化する等の検討を推奨（テックリード／アーキテクトへ情報共有）。

---

### [OBS-002]: `EditAlbumModal` 再オープン時に `#form-edit-album` のスクロール位置（`scrollTop`）がリセットされない（既存挙動）
- **重大度**: **Low**（影響度: 前の編集で下へスクロールして閉じた直後に別アルバムを編集すると、初期表示がスクロール途中のままになり「アルバム基本情報」が見切れる）
- **関連要件/受け入れ基準**: 既存 `openEditAlbumModal()`（`src/ScriptsApp.html` L2035-2097）
- **再現手順**:
  1. `375×667` で20曲アルバムの編集モーダルを開き、`#form-edit-album` を `scrollTop = 1200` までスクロールする。
  2. `#btn-cancel-edit-album` でモーダルを閉じる（`closeEditAlbumModal()`）。
  3. 別のアルバム（20曲アルバムまたは1曲アルバム）で `openEditAlbumModal()` を再度実行する。
- **期待される動作**:
  - 新しくモーダルを開いた際、初期フォーカスされる `#edit-album-name` が画面内に見えるよう `#form-edit-album` のスクロール位置が先頭（`scrollTop = 0`）にリセットされること。
- **実際の動作**:
  - 20曲アルバム再オープン時は `scrollTop = 1200` のまま、1曲アルバム再オープン時は `scrollTop = 308`（末尾張り付き）のままであり、どちらの場合も `activeElement` は `#edit-album-name` であるにもかかわらず `nameInputVisibleInForm: false`（ビューポート上端外）となった。なおフッターの `#btn-footer-add-edit-track` はこの状態でも常時押下可能。
- **証拠・ログ**:
  - Edge CDP 実測（`qa_edit_modal_edge_attacks.js`: `reopenState.stAfterReopenShortAlbum = 308`, `reopenLongAfterLong.stAfterReopenLongAlbum = 1200`, `nameInputVisibleInForm = false`）。
- **考えられる原因**: **既存実装起因**（`openEditAlbumModal()` に `formEditAlbum.scrollTop = 0` の初期化処理が元々実装されていない）。
- **推奨される次の対応**: 任意の後続リファクタリングにて、`openEditAlbumModal()` でモーダル表示後に `form.scrollTop = 0` を設定する軽微修正を推奨。

---

### [OBS-003]: `320px〜375px` の `#form-edit-album` 本文内既存3ボタンのテキスト2行折り返し（既存挙動）
- **重大度**: **Low**（影響度: 重なりや44px割れ・横溢れは無く機能上の支障は無いが、ラベルが2行に折り返す）
- **関連要件/受け入れ基準**: 既存 `src/EditAlbumModal.html` L84, L91, L129
- **再現手順**:
  1. `320×640` または `375×667` で `EditAlbumModal` を開く。
- **期待される動作 / 実際の動作**:
  - 今回改修対象であるフッター3ボタンと `#btn-add-edit-track` は全11環境で1行維持（`lines = 1`, `h = 44px`）であった。
  - 一方、変更対象外の既存3ボタンでは以下を実測した：
    - `320px`: `#btn-renumber-edit-tracks`（「番号自動連番採番」）`h = 50px, lines = 2`、`#btn-edit-album-upload`（`lines = 2`）、`#btn-edit-album-drive`（`lines = 2`）。
    - `375px`: `#btn-edit-album-upload`（`lines = 2`）、`#btn-edit-album-drive`（`lines = 2`）。
- **考えられる原因**: **既存設計範囲（変更対象外）**。
- **推奨される次の対応**: 緊急対応不要（`430px` 以上では1行、重なり・44px割れ・水平オーバーフローはいずれも発生していないため、必要時に文言短縮等で改善可）。

---

### [OBS-004]: 保存中（`isSaving === true`）における「キャンセル／採番／削除」ボタンおよび `#global-loading` 重ね順の既知仕様（計画書合意済み）
- **重大度**: **Low**（情報記録 / 既知制約）
- **関連要件/受け入れ基準**: 設計書 1.1節 3 / 実装計画書 1.2節 6
- **実測事実**:
  - `1024×768` で保存処理実行中（`isSaving: true`, `#global-loading` 表示中）に、`#modal-edit-album`（`z-50`）と `#global-loading`（`z-50`）の DOM 記述順によりモーダルが前面に描画され、`#btn-cancel-edit-album`（`disabled: false`）がヒット可能（`cancelHitTagWhileSaving: "BUTTON#btn-cancel-edit-album"`）であり、`#btn-renumber-edit-tracks` も `disabled: false` のままであることを実測確認した。
- **考えられる原因**: 上流設計書・実装計画書で本改修スコープを「トラック追加ボタンの常時アクセス性と保存競合防御」に限定したことに伴う既存構造の残置。
- **推奨される次の対応**: 本タスクの差し戻し対象外。将来、保存中のモーダル全面ロックが必要となった際に別タスクとして検討する。

---

## 4. エスカレーション事項

- **本件（Phase 4 QAゲート）におけるエスカレーション**: **なし**（AC-001〜AC-007 はすべて完全合格であり、アーキテクチャ再設計やシニアコーダーへの差し戻しを要する致命的・高重大度欠陥は検出されませんでした）。
- **参考共有事項**: 上記 `[OBS-001]`（右下トーストによる既存保存ボタンのクリック遮蔽リスク）については、本改修に固有の不具合ではありませんが実操作上の UX リスク（Medium）として明確な再現事実が得られたため、Phase 5 レビューまたはバックログ起票時の参考情報として共有します。
