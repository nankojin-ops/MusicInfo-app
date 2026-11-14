# QA検証レポート: スマートフォン画面における楽曲一覧レイアウト・視認性の改善

- **文書バージョン**: 1.1.0（修正後再検証・改訂版）
- **初版作成日**: 2026年11月14日（v1.0.0: 要修正差し戻し）
- **改訂日**: 2026年11月14日（v1.1.0: 全件解消確認・QAクリア）
- **検証担当**: QAエンジニア (`qa-engineer`)
- **対象要件・設計書**: `docs/architecture/mobile_track_list_layout_design.md` (v1.1.0)
- **対象実装計画書**: `docs/planning/mobile_track_list_layout_plan.md` (v1.1.0)
- **対象実装報告書**: `docs/reports/mobile_track_list_layout_implementation_report.md` (v1.1.0)
- **成果物パス**: `docs/qa/mobile_track_list_layout_qa_report.md`

---

## 1. 検証サマリー

### 1.1 テスト実施ステータス区分

本QA再検証では、行動規範に基づき、検証根拠を以下の4つのステータスに厳密に区分しています。

- **実行済み (Executed)**:
  - `npm.cmd test` による自動テストスイート全件実行（Exit Code 0）：
    - `tests/run_tests.js`: **502 PASS / 0 FAIL**
    - `tests/red_team_attack_test.js`: **302 PASS / 0 FAIL**
    - `tests/qa_comprehensive_verification.js`: **9 PASS / 0 FAIL**
  - Microsoft Edge Headless + CDP（Tailwind Play CDN ロード済み、最新ビルド済み `dist/index.html` [268,120 bytes] をローカル HTTP 配信）による実ブラウザ・実ピクセル再計測：
    - 全10ビューポート幅（`320×640`, `375×667`, `430×932`, `640×800`, `767×800`, `768×1024`, `1024×768`, `1280×800`, `1535×900`, `1536×900`）における `TrackDetail`（長文日本語＋長大無空白英数字＋2 Disc・25曲）の `getBoundingClientRect()`・`getComputedStyle()`・`scrollWidth`/`clientWidth`・ボタン重なり判定・パンくず計測。
    - デモ実データ（`Midnight Boulevard`）を用いた `320×568`, `768×1024`, `1024×768`, `1536×900` の `TrackDetail` 計測。
    - モバイル幅（`320×640`〜`767×800`）での `.track-detail-scroll-body` スクロール時（`scrollTop: 250`）における `#pane-tracks` 上端境界線（`border-top-width`）、`#tracks-mobile-back-bar` との隙間（`gapBetweenPaneAndBar` / `gapBetweenBarAndScrollBody`）、および `document.elementFromPoint` による背後透過ゼロ検証。
    - `selectedAlbum = null` 空状態（`#track-empty-state`）の `320×640` / `1024×768` 描画検証。
    - `ItunesModal` の検索前空状態（`320×640`）、検索結果一覧、長文タイトル＋長大無空白英数字＋MusicBrainz 風メディア表記（`1 (CD)` / `2 (Enhanced CD)`）プレビュー、フッター保護、パネルスクロール、`table-fixed` 水平オーバーフロー検証（`320×640`, `375×667`, `768×1024`, `1280×800`）。
    - `ItunesModal` モバイルビュー切替ライフサイクル（選択時 `preview` 遷移 → `375px` から `1024px` リサイズ時2ペイン同時復帰 → `#btn-itunes-mobile-back` で `results` 復帰 → 再オープン時 `results` リセット）検証。
    - モバイル検索ドロップダウン（`320×640`）の3種別（アーティスト／アルバム／楽曲）高さ・折り返し計測、および `selectTrackFromSearch`（20曲アルバムの18曲目へのジャンプ・ハイライト・戻るバー隙間ゼロ維持）検証。
    - `#track-header-artwork` での `error` イベント連続発火トレース計測（1回目: Step `0` → Step `1`、2回目: Step `1` → Step `2`、二重発火なし）。
    - `EditAlbumModal`・`ManualModal` 連携（プリセット値引継ぎ）回帰チェック。
- **検査済み (Inspected)**:
  - `src/index.template.html`, `src/TrackDetail.html`, `src/ItunesModal.html`, `src/ScriptsApp.html`, `src/ScriptsState.html`, `src/EditAlbumModal.html` の静的コード・Tailwind クラス適用順序・DOM ID 一意性・XSS エスケープ検査。
  - `src/*.html` と `dist/index.html` の更新タイムスタンプ整合性確認（`dist/index.html` が全ソースより新しいことを確認）。
- **推論済み (Inferred)**:
  - Chromium（Edge）のレンダリング結果に基づく他モダンブラウザ（iOS Safari / Android Chrome）での CSS Grid / Flexbox / `table-layout: fixed` / `overflow-wrap: anywhere` 挙動の同等性。
- **未検証 (Unverified)**:
  - iOS Safari / Android Chrome 実機上でのソフトキーボード表示、ピンチズーム、実タッチ操作、および実 GAS バックエンド通信を伴う iTunes / MusicBrainz 実 API 応答での手動受け入れ確認。

### 1.2 総合評価

**総合評価**: **【合格 / QAクリア】(Pass - リリース承認可能)**

- **判定理由**:
  - v1.0.0 で差し戻した全8件の不具合（**BUG-001〜BUG-008**）について、設計書 v1.1.0 に基づくアーキテクチャおよび実装修正が適切に反映され、実ブラウザ（Edge Headless + Tailwind Play CDN）実測および自動テスト（`502 + 302 + 9 = 813` 件全 PASS）の双方で完全に解消されたことを確認しました。
  - 特に Critical であった **`768px`〜`1024px` 帯でのタイトル消失・画像とボタンの物理的重なり（BUG-001）**、High であった **`ItunesModal` モバイルのボタン縦割れとプレビューテーブル `0px` 潰れ（BUG-002）**、Medium の **テーブル横溢れ（BUG-003）・戻るバー `11px` 隙間漏れ（BUG-004）・パンくず横溢れ（BUG-005）**、および Low の **44px 未満要素（BUG-006）・画像エラー二重発火（BUG-007）** はすべて解消し、新規のレイアウト破綻や機能回帰は検出されませんでした。

---

## 2. 観点別テスト結果

### 2.1 受け入れ基準（AC-001〜AC-008）トレース結果（v1.1.0）

| 受け入れ基準 | ステータス | 判定 | 実測・検証根拠サマリー |
| :--- | :---: | :---: | :--- |
| **AC-001** (モバイル `320px〜430px` アルバムヘッダー視認性とボタン配置) | 実行済み | **合格** | `320px`: `#track-header-album-name` 幅 `176px` (`h: 168px`, `overflow-wrap: anywhere`), `375px`: `231px`, `430px`: `286px`。3操作ボタンは各 `85×44px` (`320px`) / `104×44px` (`375px`) / `122×44px` (`430px`) で全幅ラベル `16px` 1行表示・重なりゼロ。 |
| **AC-002** (PC・タブレット `768px〜1536px` ヘッダー全幅保証・非重複) | 実行済み | **合格** | **BUG-001 解消**: `768px`: `171px`, `1024px`: `246px`, `1280px`: `336px`, `1535px`: `443px`, `1536px` (`2xl:flex-row`): `199px`（デモデータ実測でも `177px〜252px`）。全幅帯で `>= 160px` を達成し、画像・タイトル・3ボタン間の重なりは `0px`（すべて `false`）。 |
| **AC-003** (全幅帯トラック一覧・パンくずの水平オーバーフローゼロ) | 実行済み | **合格** | **BUG-005 解消**: `320px〜1536px` 全10幅帯で `docOverflowX: false`, `paneOverflowX: false`, `scrollBodyOverflowX: false`, `bcOverflowX: false`。`<768px` は `Track N` バッジ `display: none`、`>=768px` は `display: block`。全トラック行高 `>= 44px` (`44px〜121px`)。 |
| **AC-004** (`#tracks-mobile-back-bar` 固定とスクロール隙間ゼロ・`divide-y` 干渉なし) | 実行済み | **合格** | **BUG-004 解消**: `<main>` の `divide-y` 削除により `paneBorderTop: "0px"`。`.track-detail-scroll-body` 分離後、`320px〜767px` で `scrollTop: 250` 時も `gapBetweenPaneAndBar: 0`, `gapBetweenBarAndScrollBody: 0`, `hitAtPaneTopId: "tracks-mobile-back-bar"`（背後透過ゼロ）。 |
| **AC-005** (`ItunesModal` モバイル排他切替・フッター保護・`table-fixed`) | 実行済み | **合格** | **BUG-002 / BUG-003 解消**: `320×640` / `375×667` で「キャンセル」`72×44px`・「この内容で一括登録」`147×44px`（右端 `299 <= modalR 312`）が1行維持。結果↔プレビュー排他切替・リサイズ `375↔1024`・再オープンリセット正常。長文選択時も `#itunes-preview-panel` が `scrollH: 1487 / clientH: 351` で縦スクロール可能、`tableLayout: "fixed"`, `tableRectW: 272 === tblWrap.clientW`（横溢れゼロ）。 |
| **AC-006** (改修対象 UI・検索候補の WCAG `44px` タップ領域統一) | 実行済み | **合格** | **BUG-006 解消**: `ItunesModal` 閉じる (`44×44`), 検索 (`60×44`), 戻る (`124×44`), キャンセル (`72×44`), 登録 (`147×44`), 検索候補アイテム (`h: 92px`) すべて `>= 44px`。横断検索ドロップダウンも `artist` (`49px, 80px`), `album` (`139px, 159px`), `track` (`50px, 143px`) 全種別 `>= 44px`。 |
| **AC-007** (画像エラーフォールバック二重発火防止) | 実行済み | **合格** | **BUG-007 解消**: `#track-header-artwork` で1回目のエラー時 `callCount: 1, step: "0" → "1"`, `src: "https://drive.google.com/thumbnail?id=...&sz=w400"`, `hasOnerror: true`。2回目のエラー時 `callCount: 2, step: "1" → "2"`, `src: data:image/svg+xml...`, `hasOnerror: false`。 |
| **AC-008** (自動テスト・セキュリティ・実ブラウザ品質基準) | 実行済み | **合格** | **BUG-008 解消**: `npm.cmd test` 全件パス（502 + 302 + 9、Exit Code 0）、`dist/index.html` 最新ビルド済み、Edge Headless 全計測項目で失敗ゼロ。 |

### 2.2 12大検証項目別結果（v1.1.0）

| # | 検証観点 | ステータス | 判定 | 主な確認内容・結果 |
| :---: | :--- | :---: | :---: | :--- |
| 1 | **機能の正確性** | 実行済み | **合格** | `TrackDetail`（`320px〜1536px`）および `ItunesModal`（結果↔プレビュー排他切替、PC 2ペイン同時表示、検索前プレースホルダ表示）が全要件通り動作。 |
| 2 | **エッジケース** | 実行済み | **合格** | 長文日本語、長大無空白英数字（`Unbroken...`）、複数 Disc、25曲データ、MusicBrainz `1 (CD)` / `2 (Enhanced CD)` 注入時すべてで横はみ出しゼロ（`overflowX: false`）を確認。 |
| 3 | **境界条件** | 実行済み | **合格** | `320px`, `767px` ↔ `768px`, `1024px`, `1535px` ↔ `1536px` (`2xl:` 切替点) を検証。全境界で `albWidth >= 171px`、重なりゼロ、レイアウト崩壊なし。 |
| 4 | **無効な入力** | 実行済み | **合格** | `selectedAlbum = null` の空状態（`320px` / `1024px`）および `ItunesModal` 未検索状態で `#track-empty-state` / `#itunes-results-placeholder` が崩れず正常表示。 |
| 5 | **エラー処理** | 実行済み | **合格** | `ScriptsApp.html` L44 の `typeof target.onerror !== 'function'` ガードにより、画像エラーの二重発火が完全に抑止され Step 0 → 1 → 2 が順次動作することを確認。 |
| 6 | **セキュリティ** | 実行済み | **合格** | XSS ペイロードに対し全描画箇所でエスケープが維持され、新規インラインイベント属性や危険な URL スキームの混入なし。 |
| 7 | **並行性** | 検査済み | **合格** | レイアウト・描画層および `ItunesModal` 表示状態遷移であり、非同期ロックや競合に対する副作用なし。 |
| 8 | **信頼性** | 実行済み | **合格** | Tailwind Play CDN 環境で `2xl:flex-row`, `[overflow-wrap:anywhere]`, `table-fixed`, `md:flex`, `sm:table-cell` 等がすべて意図通りコンパイル・適用されることを確認。 |
| 9 | **パフォーマンス** | 検査済み | **合格** | CSS 宣言的切替と軽量なクラス操作のみであり、描画負荷の劣化なし。 |
| 10 | **データ整合性** | 実行済み | **合格** | 全必須 DOM ID の単一契約（`src`/`dist` とも重複なし）および `data-cd`, `data-track-no`, `data-error-step` 契約維持。 |
| 11 | **後方互換性** | 実行済み | **合格** | `selectTrackFromSearch`（`320px` で20曲中18曲目へジャンプし `scrollTop: 635`, `gapAboveBar: 0`, `row18InView: true`, `row18Highlighted: true`）、`EditAlbumModal`・`ManualModal` プリセット値引継ぎ（`Jump Album`, 曲番号 `21`）を実ブラウザ確認。 |
| 12 | **回帰リスク** | 実行済み | **合格** | `.track-detail-scroll-body` 分離および `2xl:flex-row` 引き上げに伴う既存モーダル・検索・PC 表示への負の影響はゼロ。 |

---

## 3. 旧不具合（BUG-001〜BUG-008）是正確認ログおよび新規発見事項

### 3.1 BUG-001〜BUG-008 是正確認結果

| ID | 概要（旧重要度） | 是正確認結果 | 実測エビデンス・確認箇所 |
| :--- | :--- | :---: | :--- |
| **BUG-001** | `768px〜1024px` タイトル幅 `0px` 消失・画像とボタンの重なり（Critical） | **解消済み (Verified Fixed)** | `src/TrackDetail.html` にて `#track-album-header` の横並び遷移を `2xl:flex-row` へ引き上げ、メタデータに `[overflow-wrap:anywhere] 2xl:truncate` を適用。実測幅：`768px` = `171px`, `1024px` = `246px`, `1280px` = `336px`, `1535px` = `443px`, `1536px` = `199px`。すべての組み合わせで Overlap `false`。 |
| **BUG-002** | `ItunesModal` スマホフッター縦割れ＆テーブル `0px` 潰れ（High） | **解消済み (Verified Fixed)** | `src/ItunesModal.html` + `ScriptsApp.html` にてモバイル排他切替（`#itunes-results-container` ↔ `#itunes-preview-panel` + `#btn-itunes-mobile-back`）およびフッター `flex-col sm:flex-row` / `whitespace-nowrap flex-shrink-0` / `md:flex-1 md:min-h-0` を実装。`320×640` 長文時、キャンセル `72×44px`・登録 `147×44px`、`#itunes-preview-panel` `scrollH: 1487 / clientH: 351`、`tblWrap` `h: 1227px`。リサイズ `375→1024` で `block`/`flex` 自動復帰、再オープン時 `results` 初期化。 |
| **BUG-003** | `ItunesModal` テーブル長大英数字による水平オーバーフロー（Medium） | **解消済み (Verified Fixed)** | `<table>` に `table-fixed`、`CD` 列 `w-11 sm:w-14`、No列 `w-8 sm:w-10`、アーティスト列 `hidden sm:table-cell sm:w-[35%] md:w-[36%]`、`[overflow-wrap:anywhere]` を適用。実測：`tableLayout: "fixed"`、`320px` `tableW=272` (`clientW=272`), `375px` `327` (`327`), `768px` `385` (`395`), `1280px` `479` (`489`)。全幅で `overflowX: false`。 |
| **BUG-004** | `#tracks-mobile-back-bar` スクロール時 `11px` 隙間漏れ＆`divide-y` 干渉（Medium） | **解消済み (Verified Fixed)** | `src/index.template.html` `<main>` から `divide-y` を撤去し `md:divide-x` のみに統一、`src/TrackDetail.html` で `#pane-tracks`（`overflow-hidden p-0`）直下に非 `sticky` の `#tracks-mobile-back-bar`（`flex-shrink-0`）を分離し、`.track-detail-scroll-body` にスクロールを委譲。実測：`paneBorderTop: "0px"`, `gapBetweenPaneAndBar: 0`, `gapBetweenBarAndScrollBody: 0`, `hitAtPaneTopId: "tracks-mobile-back-bar"`。 |
| **BUG-005** | `#breadcrumb-artist` の `768px〜1024px` 水平オーバーフロー（Medium） | **解消済み (Verified Fixed)** | `#track-breadcrumb`・`#breadcrumb-artist`・`#breadcrumb-album` に `min-w-0 truncate` を適用。全10ビューポートで `bcOverflowX: false`、`paneOverflowX: false`。 |
| **BUG-006** | `ItunesModal`・横断検索ドロップダウンの `44px` 未満（Low） | **解消済み (Verified Fixed)** | `ItunesModal` 閉じる(`44×44`), 検索(`60×44`), 戻る(`124×44`), キャンセル(`72×44`), 登録(`147×44`), 候補(`h: 92`)、横断検索全3種別(`49〜159px`) すべて `>= 44px` を実測。 |
| **BUG-007** | 画像エラー処理二重発火による Step 1 スキップ（Low） | **解消済み (Verified Fixed)** | `window` キャプチャリスナーに `typeof target.onerror !== 'function'` ガードを追加。実測：1回目エラーで `callCount: 1, step: "0" → "1", hasOnerror: true`、2回目エラーで `callCount: 2, step: "1" → "2", hasOnerror: false`。 |
| **BUG-008** | テスト網羅ギャップ（`id` before `class` / 実描画欠如）（Low） | **解消済み (Verified Fixed)** | `tests/run_tests.js`（502件）と `tests/red_team_attack_test.js`（302件）に v1.1.0 契約テスト（`id→class` 順・単一DOM契約・BUG-001〜007回帰）を追加し全 PASS。加えて Edge Headless 実測完了。 |

### 3.2 新規発見事項（v1.1.0）

- なし（Critical / High / Medium / Low いずれも **0件**）。

---

## 4. 詳細実測データ抜粋（Edge Headless v1.1.0 / `dist/index.html`）

### 4.1 `TrackDetail` 全幅帯実測（長文日本語＋長大無空白英数字・25曲・2 Disc）

| ビューポート | `headerFlexDir` | `#track-header-album-name` 幅 (`albW`) | `#track-header-artist-name` 幅 (`artW`) | 3操作ボタン (`W×H`) | 重なり (`Overlap`) | `doc` / `pane` / `scrollBody` / `bc` 横溢れ | 行高 (`row1` / `row2`) | `Track N` バッジ | 戻るバー隙間 (`gap`) |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `320×640` | `column` | `176px` | `176px` | `85×44` | なし | すべて `false` | `69px` / `121px` | `none` | `0px` (`barH=61`) |
| `375×667` | `column` | `231px` | `231px` | `104×44` | なし | すべて `false` | `69px` / `88px` | `none` | `0px` (`barH=61`) |
| `430×932` | `column` | `286px` | `286px` | `122×44` | なし | すべて `false` | `69px` / `88px` | `none` | `0px` (`barH=61`) |
| `640×800` | `column` | `496px` | `496px` | `192×44` | なし | すべて `false` | `53px` / `56px` | `none` | `0px` (`barH=61`) |
| `767×800` | `column` | `623px` | `623px` | `234×44` | なし | すべて `false` | `53px` / `56px` | `none` | `0px` (`barH=61`) |
| `768×1024` | `column` | `171px` | `171px` | `84×44` | なし | すべて `false` | `44px` / `56px` | `block` | - |
| `1024×768` | `column` | `246px` | `246px` | `114×44` | なし | すべて `false` | `44px` / `56px` | `block` | - |
| `1280×800` | `column` | `336px` | `336px` | `149×44` | なし | すべて `false` | `44px` / `56px` | `block` | - |
| `1535×900` | `column` | `443px` | `443px` | `185×44` | なし | すべて `false` | `44px` / `56px` | `block` | - |
| `1536×900` | `row` | `199px` | `199px` | `64 / 76 / 64 × 44` | なし | すべて `false` | `44px` / `56px` | `block` | - |

### 4.2 `ItunesModal` 実測（長文タイトル＋長大無空白英数字＋`1 (CD)` / `2 (Enhanced CD)`）

| ビューポート | 状態 | `resultsDisplay` / `previewDisplay` | プレビューパネル (`w×h`, `scrollH/clientH`) | テーブルラッパー (`w×h`, `clientW/tableW`) | `CD` 列幅 | フッター (`キャンセル` / `登録`, 右端 vs `modalR`) | 横溢れ (`overflowX`) |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `320×640` | 結果一覧 | `block` / `none` | `results: 302×351` | - | - | `72×44` / `147×44` | `false` |
| `320×640` | プレビュー | `none` / `flex` | `302×351` (`1487 / 351`) | `272×1227` (`272 / 272`) | `44px` | `72×44` (`r:144`) / `147×44` (`r:299` <= `312`) | `false` |
| `375×667` | プレビュー | `none` / `flex` | `357×376` (`1435 / 376`) | `327×1211` (`327 / 327`) | `44px` | `72×44` (`r:199`) / `147×44` (`r:354` <= `367`) | `false` |
| `768×1024` | プレビュー | `block` / `flex` | `428×661` (`661 / 661`) | `395×540` (`scrollH: 1048`, `tableW: 385`) | `56px` | `72×44` (`r:580`) / `147×44` (`r:735` <= `752`) | `false` |
| `1280×800` | プレビュー | `block` / `flex` | `522×471` (`471 / 471`) | `489×350` (`scrollH: 888`, `tableW: 479`) | `56px` | `72×44` (`r:916`) / `147×44` (`r:1071` <= `1088`) | `false` |

---

## 5. 最終QA判定と次工程への引き継ぎ

- **最終判定**: **【合格 / QAクリア】(Pass)**
- **申し送り事項**:
  - 自動テスト（813件全パス）、Edge Headless + Tailwind Play CDN 実測（`320px〜1536px` 全幅帯および境界条件・回帰観点）、およびソース・ビルド整合性検査のすべてにおいて不合格項目・新規課題はありません。
  - 次工程のコードレビュアー（`code-reviewer`）による最終監査およびリリース承認プロセスへ進行可能です。
  - なお、実機ブラウザ（iOS Safari / Android Chrome）上でのタッチ操作・ソフトキーボード表示・実 GAS/API 接続による最終受け入れ確認（Manual UAT）は「未検証」区分として記録しています。
