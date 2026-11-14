# 実装計画・タスク仕様書: スマートフォン画面における楽曲一覧レイアウト・視認性の改善

- **文書バージョン**: 1.1.0
- **作成日**: 2026年11月14日
- **最終改訂日**: 2026年11月14日（QAレポート `docs/qa/mobile_track_list_layout_qa_report.md` 差し戻しおよび設計書 v1.1.0 改訂に伴う全面改訂）
- **作成ロール**: テックリード (`tech-lead`)
- **上流設計書**: `docs/architecture/mobile_track_list_layout_design.md` (v1.1.0)
- **参照QAレポート**: `docs/qa/mobile_track_list_layout_qa_report.md` (v1.0.0)
- **成果物パス**: `docs/planning/mobile_track_list_layout_plan.md`

---

## 0. 採択済み要件・方針（確定インプット）

上流設計書 v1.1.0 に反映された確定方針（Q-01〜Q-04）および QA 指摘事項（`BUG-001`〜`BUG-008`）への対処方針は次の通りである。

- **Q-01（対象スコープ）**: 主対象である STEP 3（`TrackDetail`）に加え、`ItunesModal` 楽曲プレビュー（モバイル排他切替・フッター保護・`table-fixed`）および横断検索ドロップダウン候補行をスコープに含める。
- **Q-02（操作ボタンラベル）**: `#track-album-header` の3操作ボタン（「編集」「曲追加」「削除」）は、`<2xl`（`320px〜1535px`）の縦2段構成時および `2xl:`（`>=1536px`）の横1行構成時の全解像度帯で、アイコン横にテキストラベルを 1行（`whitespace-nowrap`）で表示し、`min-h-[44px] min-w-[44px]` を維持する。
- **Q-03（`Track N` バッジ）**: トラック一覧行右端の `Track N` バッジはモバイル（`<768px`）のみ非表示（`hidden md:inline-block`）とし、PC版（`>=768px`）では表示を維持する。
- **Q-04（折り返し制御）**: タイトル・アーティスト名・曲名・プレビューテーブルセルにおいて、狭幅で文字が消失しないよう `break-words` および `[overflow-wrap:anywhere]` による長大無空白文字列の強制折り返しを適用する。

---

## 1. アーキテクチャレビュー所見 (v1.1.0 改訂精査)

### 1.1 実現可能性評価: 【極めて高い (Feasible)】
改訂されたシステムアーキテクチャ設計書 v1.1.0（ADR-01〜ADR-05）を現行ソースコードおよび QA 実ブラウザ計測結果と突き合わせて批判的に精査した結果、全不具合（`BUG-001`〜`BUG-008`）に対する設計解は技術的に整合しており、破綻なく実装可能であると評価する。

1. **`BUG-001`（`768px〜1024px` 破綻）の解消性**:
   - **【事実】** `<main>` の `md:col-span-5`（`41.67%`）配下では、`768px` 時のペイン幅が `319px`、`1024px` 時は `426px` しかなく、`320px` スマホより狭い。
   - **【決定】** 横並び境界を `2xl:flex-row`（`1536px`）へ引き上げ、スクロール本体パディングを `p-2.5 md:p-3 lg:p-5`、カード内パディングを `p-3 2xl:p-4`、ジャケット幅を `w-20 h-20 lg:w-24 lg:h-24 xl:w-28 xl:h-28` とすることで、`320px〜1536px+` の全解像度でメタデータ幅 **`177px〜343px`**・ボタン各幅 **`85px〜151px`**・重なり `0px` を数学的に保証できる。
2. **`BUG-004`（`11px` 隙間）＆ `<main>` `divide-y` 干渉の解消性**:
   - **【事実】** `src/index.template.html` L25 の `<main class="... divide-y md:divide-y-0 md:divide-x ...">` は、Tailwind の `.divide-y > :not([hidden]) ~ :not([hidden])` セレクタ（HTML の `[hidden]` 属性のみ除外し、`.hidden` クラスは除外しない）により、モバイル単一ペイン表示時にも `#pane-albums` や `#pane-tracks` の上端に `border-top: 1px` を付与してしまう。
   - **【決定】** モバイルでは `setMobileStep()` により常に1ペインのみ表示されるため、`src/index.template.html` から `divide-y md:divide-y-0` を削除して `md:divide-x` のみに統一する。その上で `#pane-tracks` を `overflow-hidden p-0` とし、`#tracks-mobile-back-bar` を `flex-shrink-0` 固定ヘッダー、`.track-detail-scroll-body` を `flex-1 min-h-0 overflow-y-auto` に分離すれば、スクロール隙間を物理的に `0px` にできる。
3. **`BUG-002`・`BUG-003`・`BUG-006`（`ItunesModal`）の解消性**:
   - モバイル（`<768px`）で検索結果リストとプレビューパネルを排他切替し、フッターを `flex-col sm:flex-row` ＋ `flex-shrink-0 whitespace-nowrap` とし、テーブルへ `table-fixed`＋固定列幅比率を適用することで、テーブル高さ `0px` 潰れと横溢れを完全に解消できる。

### 1.2 留意事項・技術リスクと対策（v1.1.0 精査で特定した実装注意点）

1. **【重要】`.track-detail-scroll-body` 追加に伴う `#track-empty-state` の縦中央揃え維持**:
   - **【事実】** 現行 `src/TrackDetail.html` では `#pane-tracks` が `flex flex-col` であったため、子要素 `#track-empty-state`（`flex-1 flex flex-col items-center justify-center`）が残り高さいっぱいに広がり上下中央に配置されていた。
   - **リスク**: 新設する `.track-detail-scroll-body` が `block` 要素（`flex flex-col` なし）のままだと、`#track-empty-state` の `flex-1` が無効になり、空状態アイコンが画面上部に張り付く。
   - **対策**: `.track-detail-scroll-body` 自体に `flex flex-col` を付与する（`class="track-detail-scroll-body flex-1 min-h-0 overflow-y-auto p-2.5 md:p-3 lg:p-5 flex flex-col"`）。なお `#track-breadcrumb`・`#track-album-header` は `flex-shrink-0` であり、`#track-discs-container` は通常描画時に自然高を持つため縦スクロールと空状態中央配置が両立する。
2. **【重要】`#track-album-header` 内部要素の `md:` → `2xl:` 一斉引き上げ漏れ防止**:
   - **リスク**: 外側の `#track-album-header` だけを `2xl:flex-row` にしても、内部の「情報ラッパー（`md:items-center md:gap-4 md:w-auto`）」「ボタングループ（`md:w-auto md:flex md:pt-0 md:border-t-0`）」「ボタンアイコン（`md:w-5 md:h-5`）」に `md:` が残ると、`768px〜1535px` 帯域で縦積みコンテナの中でボタンが折り返し崩壊したりボーダーが消えたりする。
   - **対策**: `#track-album-header` 内のレイアウト切替クラスは、すべて例外なく **`md:` から `2xl:` へ引き上げる**（テキスト文字サイズ `text-base md:text-xl` 等は従来のまま維持可）。特にアイコンを `w-4 h-4 2xl:w-5 2xl:h-5` にすることで `768px`（ボタン幅約 `85px`）でも余裕を持って 1行に収まる。
3. **【重要】`ItunesModal` モバイル排他切替の状態リセットと `md:` リサイズ跨ぎ整合**:
   - **リスク**: スマホでプレビューを開いたままモーダルを閉じ、次回開いた際に前回のプレビュー画面がいきなり出たり、PC幅へリサイズした際／PCからスマホへ縮小した際に両ペインが非表示・重複表示になる恐れがある。
   - **対策**:
     - `ScriptsApp.html` に `setItunesMobileView(view)`（`view`: `'results' | 'preview'`）を設け、`this.itunesMobileView = view` として一元管理する。
     - CSS クラスは常に `md:block`（`#itunes-results-container`）および `md:flex`（`#itunes-preview-panel`）を残し、JS ではモバイル用の `hidden` / `flex`（または `block`）のみを切り替える。これにより `>=768px` では常に両ペインが表示され、リサイズ跨ぎで表示が壊れない。
     - `openItunesModal()`、検索実行 `executeItunesSearch()`、接続切替時の初期化（`ScriptsApp.html` L689-715）、および新設 `#btn-itunes-mobile-back` クリック時は必ず `setItunesMobileView('results')` を呼び、アルバム選択成功時 `selectItunesAlbumForPreview()` のみ `setItunesMobileView('preview')` へ遷移させる。
4. **【重要】`ItunesModal` テーブル `table-fixed` 下での `CD` 列 `whitespace-nowrap` 干渉**:
   - **【事実】** 現行 `ScriptsApp.html` L1744 では CD 列 `<td>` に `whitespace-nowrap` が付いており、MusicBrainz データでは `1 (CD)` のような `mediumFormat` 付き文字列が入る（L1739-1740）。
   - **リスク**: `table-fixed` 下で `whitespace-nowrap` を残すと、狭い `CD` 列（`w-10` = `40px`）から文字が右の `No` 列へはみ出て重なる。
   - **対策**: `CD` 列 `<th>` を `w-11 sm:w-14` とし、生成 `<td>` から `whitespace-nowrap` を外して `break-words` を適用する。
5. **【重要】`BUG-007`（画像エラー二重発火）の既存テスト・未バインド保険との両立**:
   - **【事実】** `ScriptsApp.html` L39-48 の `window.addEventListener('error', ..., true)` と、L1088 / L1163 / L1407 / L1681 / L1728 / L1982 の個別 `img.onerror` の双方が `Utils.handleImageError()` を呼ぶため、1回の失敗で Step 0 → 1 → 2 が連続実行されていた。
   - **対策**: `window` キャプチャリスナー（L43）の条件に `&& typeof target.onerror !== 'function'` を追加する。これにより、個別 `onerror` がバインドされている全画像（`#track-header-artwork` 等）では `window` キャプチャがスキップされて 1イベントにつき 1回のみ発火（Step 0 → 1 → 次回失敗で 1 → 2）し、仮に未バインドの `img[data-artwork]` があっても保険として動作する。
6. **【重要】既存テストの属性順序制約 (`id` → `class`) の継続遵守**:
   - `tests/red_team_attack_test.js` L1506 / L1814 / L1860 は `<button ... id="..." ... class="...">` の順を期待している。新設・修正するすべてのボタン（`#btn-itunes-mobile-back`, `#btn-close-itunes-modal`, `#btn-itunes-search-submit`, `#btn-cancel-itunes-modal`, `#btn-submit-itunes-batch`, および `TrackDetail.html` のボタン群）で **`id` 属性を `class` 属性より前**に記述する。
7. **【重要】`tests/run_tests.js` [16] および `tests/red_team_attack_test.js` [9.4] の同期更新 (`BUG-008`)**:
   - v1.0.0 用の静的検査（`-mx-2.5 -mt-2.5` や `md:flex-row`, `grid-rows-[minmax(0,2fr)_minmax(0,3fr)]`）は v1.1.0 実装後に失敗するため、TASK-004 で v1.1.0 契約へ確実に更新し、あわせて `BUG-001`〜`BUG-007` の退行防止テストと実ブラウザ幾何確認手順を整備する。

### 1.3 アーキテクトへのエスカレーション有無: 【エスカレーション不要】
設計書 v1.1.0 の全仕様および QA レポートの指摘事項と本計画書は完全に整合している。

---

## 2. 影響範囲・変更対象ファイル一覧

| レイヤー | 対象ファイル | 変更種別 | 変更概要 (v1.1.0) |
| :--- | :--- | :---: | :--- |
| **Frontend Skeleton** | `src/index.template.html` | 修正 | ・`<main>` からモバイル不要の `divide-y md:divide-y-0` を撤去し `md:divide-x` のみにして、`.hidden` 要素の次ペイン上端 `1px` ボーダー干渉を根絶（`BUG-004` 関連）。 |
| **Frontend View** | `src/TrackDetail.html` | 修正 | ・`#pane-tracks` を `flex flex-col overflow-hidden p-0` に変更し、`#tracks-mobile-back-bar` を `flex-shrink-0`（非 sticky・負マージン廃止）として分離（`BUG-004`）。<br>・`.track-detail-scroll-body`（`flex-1 min-h-0 overflow-y-auto p-2.5 md:p-3 lg:p-5 flex flex-col`）を新設。<br>・`#track-breadcrumb` / `#breadcrumb-artist` に `min-w-0 truncate` を追加（`BUG-005`）。<br>・`#track-album-header` を `2xl:flex-row` へ引き上げ、ジャケット段階サイズ（`w-20 h-20 lg:w-24 lg:h-24 xl:w-28 xl:h-28`）、タイトル等 `break-words [overflow-wrap:anywhere] 2xl:truncate`、操作ボタンアイコン `2xl:w-5 2xl:h-5` へ改訂（`BUG-001`）。 |
| **Frontend View** | `src/ItunesModal.html` | 修正 | ・2ペインのモバイル排他切替構造化＋モバイル用戻るバー `#itunes-mobile-back-bar`（`#btn-itunes-mobile-back`）新設。<br>・`#itunes-preview-content` およびテーブルラッパーの `min-h-0` / `overflow-y-auto` を `md:` 以上限定化（`BUG-002`）。<br>・`<table>` へ `table-fixed` と明示列幅（`CD`, `No`, `曲名`, `アーティスト`）を適用（`BUG-003`）。<br>・フッター `flex-col sm:flex-row`、ボタン `flex-shrink-0 whitespace-nowrap`、全ボタン・入力欄の `min-h-[44px]` 統一（`BUG-002`, `BUG-006`）。 |
| **Frontend Controller** | `src/ScriptsApp.html` | 修正 | ・`setItunesMobileView(view)` 新設と `openItunesModal()`, `executeItunesSearch()`, `selectItunesAlbumForPreview()`, リセット処理、`#btn-itunes-mobile-back` への連動。<br>・`selectItunesAlbumForPreview()` の `<td>` へ `break-words [overflow-wrap:anywhere]` 適用および `CD` セル `whitespace-nowrap` 除去（`BUG-003`）。<br>・`renderTrackDetail()` のトラック行へ `[overflow-wrap:anywhere]` 追加、`#itunes-results-container` 候補アイテムおよび `handleGlobalSearch()` 全候補行へ `min-h-[44px]` 統一（`BUG-006`）。<br>・`bindEvents()` の `window` キャプチャエラーリスナーへ `typeof target.onerror !== 'function'` ガード追加（`BUG-007`）。 |
| **Test** | `tests/run_tests.js` | 修正 | ・セクション `[16]` を v1.1.0 契約（`2xl:flex-row`, 非 sticky 分離, `divide-y` 不在, `#breadcrumb-artist` truncate, `ItunesModal` 排他切替/`table-fixed`/44px, `BUG-007` 二重発火防止単体テスト）へ更新・拡充（`BUG-008`）。 |
| **Test** | `tests/red_team_attack_test.js` | 修正 | ・セクション `[9.4]` を v1.1.0 契約へ更新し、`ItunesModal` 全ボタン 44px（`id`→`class` 順）、`table-fixed`、`2xl:flex-row`、`#breadcrumb-artist`、二重発火防止ガードの退行検査を追加（`BUG-008`）。 |
| **Build Output** | `dist/index.html` | 自動生成 | ・`npm.cmd run build`（`build.js`）により再生成（手編集禁止）。 |

### 依存関係・後方互換性への考慮事項
- **非変更領域**: `src/Code.js`, `src/MusicService.js`, `src/SheetService.js`, `src/DriveService.js`, `src/ScriptsState.html`, `src/ScriptsApiClient.html`, `src/ScriptsUtils.html`, `src/Styles.html`, `src/ArtistList.html`, `src/AlbumList.html`, `build.js`。
- **DOM ID 契約**: v1.0.0 で保護対象とした全既存 ID に加え、新設 ID `#btn-itunes-mobile-back`（および `#itunes-mobile-back-bar`）を含めすべて単一DOM一意とする。
- **検索ジャンプ互換**: `.track-detail-scroll-body` が `overflow-y-auto` コンテナとなるため、`selectTrackFromSearch()` (L1471) の `rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' })` はそのまま `.track-detail-scroll-body` をスクロールする（JSロジック変更不要）。

---

## 3. インターフェース・DOM構造仕様 (v1.1.0)

### 3.1 `src/TrackDetail.html` 構造契約

```text
#pane-tracks (h-full flex flex-col overflow-hidden md:col-span-5 bg-slate-950 p-0)
├── #tracks-mobile-back-bar (md:hidden px-3 py-2 border-b border-slate-800 bg-slate-950 flex items-center justify-between flex-shrink-0)
│   ├── #btn-back-to-albums (id先頭, min-h-[44px] min-w-[44px] ...)
│   └── <span>STEP 3 / 3</span>
└── .track-detail-scroll-body (flex-1 min-h-0 overflow-y-auto p-2.5 md:p-3 lg:p-5 flex flex-col)
    ├── #track-breadcrumb (hidden md:flex items-center gap-2 text-xs text-slate-400 mb-4 flex-shrink-0 min-w-0)
    │   ├── #breadcrumb-artist (hover:text-slate-200 cursor-pointer min-w-0 truncate)
    │   ├── <span class="flex-shrink-0">/</span>
    │   └── #breadcrumb-album (text-slate-200 font-semibold min-w-0 truncate)
    ├── #track-album-header (bg-slate-900 border border-slate-800/80 rounded-xl p-3 2xl:p-4 mb-4 flex flex-col 2xl:flex-row items-stretch 2xl:items-center gap-3 2xl:gap-4 flex-shrink-0 shadow-lg)
    │   ├── [情報ラッパー] (flex items-start 2xl:items-center gap-3 2xl:gap-4 flex-1 min-w-0 w-full 2xl:w-auto)
    │   │   ├── #btn-zoom-track-artwork (id先頭, relative group cursor-pointer flex-shrink-0)
    │   │   │   └── #track-header-artwork (w-20 h-20 lg:w-24 lg:h-24 xl:w-28 xl:h-28 flex-shrink-0 ...)
    │   │   └── [メタデータ] (flex-1 min-w-0)
    │   │       ├── #track-header-album-name (text-base md:text-xl font-bold text-slate-100 break-words [overflow-wrap:anywhere] 2xl:truncate mb-1)
    │   │       ├── #track-header-artist-name (text-xs md:text-sm text-indigo-400 font-medium break-words [overflow-wrap:anywhere] 2xl:truncate mb-2)
    │   │       └── [発売日・曲数バッジ群] (flex flex-wrap items-center gap-2 ...)
    │   └── [操作ボタングループ] (w-full 2xl:w-auto grid grid-cols-3 2xl:flex items-center gap-1.5 pt-2.5 2xl:pt-0 border-t border-slate-800/80 2xl:border-t-0 flex-shrink-0)
    │       ├── #btn-edit-album (id先頭, min-h-[44px] min-w-[44px] justify-center px-1.5 sm:px-2 py-2 ..., icon w-4 h-4 2xl:w-5 2xl:h-5, span whitespace-nowrap)
    │       ├── #btn-add-track-to-album (同上)
    │       └── #btn-delete-album (同上)
    ├── #track-discs-container (space-y-4 min-w-0)
    └── #track-empty-state (flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500)
```

### 3.2 `src/ItunesModal.html` 構造契約

```text
#modal-itunes
└── [モーダル枠] (w-full max-w-4xl h-[92vh] md:h-[85vh] ... flex flex-col overflow-hidden)
    ├── [ヘッダー] (px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-800 flex items-center justify-between gap-2 flex-shrink-0)
    │   └── #btn-close-itunes-modal (id先頭, min-h-[44px] min-w-[44px] flex items-center justify-center ...)
    ├── [検索入力バー] (p-2.5 sm:p-3 border-b border-slate-800 flex gap-2 flex-shrink-0)
    │   ├── #itunes-search-input (min-h-[44px] flex-1 min-w-0 ...)
    │   └── #btn-itunes-search-submit (id先頭, min-h-[44px] px-4 py-2 ... whitespace-nowrap flex-shrink-0)
    ├── [メイン2ペイン] (flex-1 min-h-0 overflow-hidden grid grid-cols-1 md:grid-cols-12 md:divide-x divide-slate-800)
    │   ├── #itunes-results-container (初期: h-full min-h-0 overflow-y-auto md:block md:col-span-5 divide-y divide-slate-800/60 p-1)
    │   │   ※ preview切替時: 'hidden' を付与 ('md:block' により PC では常に表示)
    │   └── #itunes-preview-panel (初期: hidden md:flex h-full min-h-0 overflow-y-auto md:col-span-7 bg-slate-950/60 p-3 md:p-4 flex-col)
    │       ※ preview切替時: 'hidden' を外し 'flex' を付与
    │       ├── #itunes-mobile-back-bar (md:hidden pb-2 mb-3 border-b border-slate-800 flex items-center justify-between flex-shrink-0)
    │       │   ├── #btn-itunes-mobile-back (id先頭, inline-flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-2.5 py-2 -ml-1 ...)
    │       │   └── <span>収録曲プレビュー</span>
    │       ├── #itunes-preview-empty (flex-1 flex flex-col items-center justify-center ...)
    │       └── #itunes-preview-content (hidden md:flex-1 md:min-h-0 flex flex-col)
    │           ├── [プレビューヘッダー] (flex gap-3 items-start sm:items-center mb-3 pb-3 border-b border-slate-800 flex-shrink-0)
    │           │   └── #itunes-preview-album / #itunes-preview-artist (break-words [overflow-wrap:anywhere] md:truncate)
    │           └── [テーブルラッパー] (md:flex-1 md:min-h-0 md:overflow-y-auto md:pr-1)
    │               └── table.w-full.table-fixed.text-left.text-xs.text-slate-300
    │                   ├── thead: CD(w-11 sm:w-14), No(w-8 sm:w-10), 曲名(可変残余), アーティスト(hidden sm:table-cell sm:w-[35%] md:w-[36%])
    │                   └── tbody#itunes-preview-tracks-tbody
    └── [フッター] (px-3 sm:px-4 py-3 border-t border-slate-800 bg-slate-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 flex-shrink-0)
        ├── #itunes-selected-summary (text-xs text-slate-400 font-mono truncate min-w-0 sm:flex-1)
        └── [ボタン群] (flex items-center justify-end gap-2 flex-shrink-0)
            ├── #btn-cancel-itunes-modal (id先頭, min-h-[44px] ... whitespace-nowrap flex-shrink-0)
            └── #btn-submit-itunes-batch (id先頭, min-h-[44px] ... whitespace-nowrap flex-shrink-0)
```

### 3.3 `ScriptsApp.html` 追加メソッド・変更仕様

```javascript
class App {
  /**
   * iTunes検索モーダルのモバイル表示ペインを切り替える (<768px 向け)
   * @param {'results'|'preview'} view
   */
  setItunesMobileView(view) {
    // this.itunesMobileView = view === 'preview' ? 'preview' : 'results';
    // resultsEl (#itunes-results-container): view === 'preview' のとき 'hidden' を付与（md:block は維持）
    // previewEl (#itunes-preview-panel): view === 'preview' のとき 'hidden' を除去し 'flex' を付与、
    //   view === 'results' のとき 'hidden' を付与し 'flex' を除去（md:flex は維持）
    // previewEl の scrollTop を 0 にリセットすると視認性が良い
  }
}
```

- **`bindEvents()` 内 `window` キャプチャエラーガード (`BUG-007`)**:
  - `if (target && target.tagName === 'IMG' && target.hasAttribute('data-artwork') && typeof target.onerror !== 'function') { Utils.handleImageError(target); }`
- **`renderTrackDetail()` 内トラック行 (`BUG-001` / 長大文字列補強)**:
  - 曲名 `<p>` と `artistDiffHtml` `<p>` に `break-words [overflow-wrap:anywhere] md:truncate` を適用。

---

## 4. テスト戦略 (v1.1.0 補強版)

### 4.1 単体テスト・静的構造検証 (`tests/run_tests.js`, `tests/red_team_attack_test.js`)
1. **DOM ID 一意性 & `id`→`class` 属性順序検証**:
   - `TrackDetail.html`・`ItunesModal.html`（`btn-itunes-mobile-back` 含む）・`dist/index.html` で全必須 ID が各 1箇所のみ存在することを検証する。
   - すべての対象ボタンで `id="..."` が `class="..."` より前に記述され、`min-h-[44px]`（正方形アイコンボタンは `min-w-[44px]` も）が設定されていることを検証する。
2. **v1.1.0 レイアウト契約検証**:
   - `src/index.template.html`: `<main` に `divide-y` が含まれず、`md:divide-x` であること（`BUG-004`）。
   - `src/TrackDetail.html`: `#pane-tracks`（`overflow-hidden p-0`）、`#tracks-mobile-back-bar`（`flex-shrink-0` かつ `sticky`・`-mx-2.5`・`-mt-2.5` 不在）、`.track-detail-scroll-body`（`flex-1 min-h-0 overflow-y-auto p-2.5 md:p-3 lg:p-5 flex flex-col`）、`#breadcrumb-artist`（`min-w-0 truncate`）、`#track-album-header`（`flex-col 2xl:flex-row`, `p-3 2xl:p-4`, `w-20 h-20 lg:w-24 lg:h-24 xl:w-28 xl:h-28`, `2xl:truncate`）（`BUG-001`, `BUG-004`, `BUG-005`）。
   - `src/ItunesModal.html`: `#btn-itunes-mobile-back` 存在、`#itunes-preview-content` が `md:flex-1 md:min-h-0`（無条件 `min-h-0` 排除）、テーブルに `table-fixed`、フッターに `flex-col sm:flex-row` とボタン `flex-shrink-0 whitespace-nowrap`（`BUG-002`, `BUG-003`, `BUG-006`）。
3. **VM 動的振る舞い・XSS・二重発火防止検証**:
   - `setItunesMobileView('preview')` / `('results')`、`openItunesModal()`、`selectItunesAlbumForPreview()`、`handleResetConnection()` による `#itunes-results-container` / `#itunes-preview-panel` クラス切替検証。
   - `renderTrackDetail()`, `selectItunesAlbumForPreview()`, `handleGlobalSearch()` について、`min-h-[44px]`（検索候補の全3タイプ含む）、`[overflow-wrap:anywhere]`、`CD` セル `whitespace-nowrap` 不在、`Utils.escapeHtml()` XSS 防御を検証。
   - **BUG-007 検証**: VM 内の `window` イベントリスナーへモック画像エラー（`target.onerror` が関数のケース vs `null` のケース）を送り、個別 `onerror` バインド済み画像では `window` キャプチャが `Utils.handleImageError` を二重呼出ししない（Step 0 → Step 1 のみ遷移）ことを検証する。

### 4.2 結合・ビルドテスト方針
- `npm.cmd run build` で `dist/index.html` を再生成し、`npm.cmd test`（`run_tests.js` + `red_team_attack_test.js` + `qa_comprehensive_verification.js`）の全パスを確認する。

### 4.3 実ブラウザ幾何確認観点（`BUG-008` 対策・QA 引き継ぎ基準）
シニアコーダー完了報告および QA 検証時には、Node.js 自動テストに加え、Headless ブラウザ（またはブラウザ DevTools 端末エミュレーション）により以下を確認対象とする：
1. 幅帯: `320px`, `375px`, `430px`, `768px`, `1024px`, `1280px`, `1536px`
2. 実測チェック項目:
   - `#track-header-album-name` / `#track-header-artist-name` の描画幅 `>= 160px`、画像とボタンの重なり `0px`。
   - `#tracks-mobile-back-bar` スクロール時の上端隙間 `0px`（背後要素が透けないこと）。
   - `#pane-tracks`・`#track-breadcrumb`・`ItunesModal` テーブルで `scrollWidth <= clientWidth`（長大無空白英数字データ含む）。
   - `ItunesModal` スマホ（`320×640`）でフッターボタン1行維持、検索結果↔プレビュー切替、長文タイトル時のテーブル可視・縦スクロール可能。
   - 全対話ボタン・検索候補行の高さ `>= 44px`。
   - `#track-header-artwork` エラー発生時の Step 0 → Step 1 → Step 2 正常遷移（1エラーにつき1ステップ遷移）。

---

## 5. 実装タスク一覧 (順序定義)

### タスク [TASK-001]: `src/index.template.html` と `src/TrackDetail.html` の構造再設計
- **ID**: TASK-001
- **目的**: `BUG-001`（`768〜1024px` 破綻）、`BUG-004`（戻るバー `11px` 隙間＆`divide-y` 干渉）、`BUG-005`（パンくず溢れ）を HTML/CSS 構造レベルで根絶する。
- **入力**:
  - `docs/architecture/mobile_track_list_layout_design.md` v1.1.0 (FR-MOB-001〜005, ADR-01, ADR-03)
  - 現行 `src/index.template.html` (L25) および `src/TrackDetail.html` (L1-94)
- **期待される結果**:
  1. `src/index.template.html` L25 の `<main>` が `divide-y md:divide-y-0` を除いた `flex-1 overflow-hidden relative grid grid-cols-1 md:grid-cols-12 md:divide-x divide-slate-800` となること。
  2. `src/TrackDetail.html` の `#pane-tracks` が `h-full flex flex-col overflow-hidden md:col-span-5 bg-slate-950 p-0` となり、`#tracks-mobile-back-bar` が `md:hidden px-3 py-2 border-b border-slate-800 bg-slate-950 flex items-center justify-between flex-shrink-0`（`sticky`, `-mx-*`, `-mt-*` 撤去）として独立配置されること。
  3. スクロール本体ラッパー `<div class="track-detail-scroll-body flex-1 min-h-0 overflow-y-auto p-2.5 md:p-3 lg:p-5 flex flex-col">` が `#track-breadcrumb`, `#track-album-header`, `#track-discs-container`, `#track-empty-state` を内包すること。
  4. `#track-breadcrumb` に `min-w-0`、`#breadcrumb-artist` に `min-w-0 truncate`、`#breadcrumb-album` に `min-w-0 truncate`、`/` に `flex-shrink-0` が設定されること。
  5. `#track-album-header` および内部のレイアウト境界クラス（`2xl:flex-row`, `2xl:items-center`, `2xl:gap-4`, `2xl:p-4`, `2xl:w-auto`, `2xl:flex`, `2xl:pt-0`, `2xl:border-t-0`）がすべて `2xl:` へ引き上げられ、ジャケット画像が `w-20 h-20 lg:w-24 lg:h-24 xl:w-28 xl:h-28 flex-shrink-0`、タイトル・アーティスト名が `break-words [overflow-wrap:anywhere] 2xl:truncate`、操作ボタンアイコンが `w-4 h-4 2xl:w-5 2xl:h-5 flex-shrink-0` となること。
  6. すべてのボタンで `id` 属性が `class` 属性より前にあり、`min-h-[44px] min-w-[44px]` が維持されること。
- **対象ファイル**: `src/index.template.html`, `src/TrackDetail.html`
- **依存関係**: なし
- **受け入れ基準**:
  - 上記 1〜6 がすべて満たされ、既存 DOM ID の重複・欠落がない。
- **検証方法**:
  - `src/index.template.html` と `src/TrackDetail.html` の差分確認（`sticky` / `-mx-` / `-mt-` / `divide-y` / `md:flex-row` が残存しないこと）。

---

### タスク [TASK-002]: `src/ItunesModal.html` のモバイル排他ビュー・フッター保護・`table-fixed`・44px統一
- **ID**: TASK-002
- **目的**: `BUG-002`（フッター縦割れ＆テーブル高さ `0px` 潰れ）、`BUG-003`（テーブル横溢れ）、`BUG-006`（44px未達）を解消するマークアップ構造を実装する。
- **入力**:
  - `docs/architecture/mobile_track_list_layout_design.md` v1.1.0 (FR-MOB-006, NFR-UX-001, ADR-04)
  - 現行 `src/ItunesModal.html` (L1-98)
- **期待される結果**:
  1. 閉じるボタン `#btn-close-itunes-modal`（`id` 先頭, `min-h-[44px] min-w-[44px]`）、検索入力欄 `#itunes-search-input`（`min-h-[44px] min-w-0`）、検索実行ボタン `#btn-itunes-search-submit`（`id` 先頭, `min-h-[44px] whitespace-nowrap flex-shrink-0`）が適切に設定されること。
  2. メイン2ペインコンテナ（L33）から `grid-rows-[minmax(0,2fr)_minmax(0,3fr)]` 等を撤去し、`flex-1 min-h-0 overflow-hidden grid grid-cols-1 md:grid-cols-12 md:divide-x divide-slate-800` とすること。
  3. `#itunes-results-container` は `h-full min-h-0 overflow-y-auto md:block md:col-span-5 divide-y divide-slate-800/60 p-1`、`#itunes-preview-panel` は初期 `hidden md:flex h-full min-h-0 overflow-y-auto md:col-span-7 bg-slate-950/60 p-3 md:p-4 flex-col` とすること。
  4. `#itunes-preview-panel` 内の先頭にモバイル戻るバー `#itunes-mobile-back-bar`（`md:hidden pb-2 mb-3 border-b border-slate-800 flex items-center justify-between flex-shrink-0`）と `#btn-itunes-mobile-back`（`id` 先頭, `min-h-[44px] min-w-[44px]`）を新設すること。
  5. `#itunes-preview-content` を `hidden md:flex-1 md:min-h-0 flex flex-col`、テーブルラッパーを `md:flex-1 md:min-h-0 md:overflow-y-auto md:pr-1` とし、モバイル時は `#itunes-preview-panel` 全体で縦スクロールできるようにすること。
  6. `#itunes-preview-album` / `#itunes-preview-artist` に `break-words [overflow-wrap:anywhere] md:truncate` を適用すること。
  7. プレビュー `<table>` に `w-full table-fixed text-left text-xs text-slate-300` を設定し、`<thead>` 列を CD (`w-11 sm:w-14`) / No (`w-8 sm:w-10`) / 曲名 (残余可変) / アーティスト (`hidden sm:table-cell sm:w-[35%] md:w-[36%]`) に構成すること。
  8. フッターを `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 flex-shrink-0` とし、`#itunes-selected-summary` に `min-w-0 sm:flex-1`、右ボタン群に `flex items-center justify-end gap-2 flex-shrink-0`、`#btn-cancel-itunes-modal` と `#btn-submit-itunes-batch` に `id` 先頭・`min-h-[44px]`・`whitespace-nowrap`・`flex-shrink-0` を設定すること。
- **対象ファイル**: `src/ItunesModal.html`
- **依存関係**: なし（TASK-001 と並列実施可能）
- **受け入れ基準**:
  - `ItunesModal.html` 内の既存 ID がすべて維持され、`btn-itunes-mobile-back` が重複なく1箇所に存在する。
  - フッターボタン、閉じるボタン、検索ボタン、戻るボタンすべてに `min-h-[44px]` があり、`id` が `class` より前に配置されている。
- **検証方法**:
  - `src/ItunesModal.html` の差分確認。

---

### タスク [TASK-003]: `src/ScriptsApp.html` のモバイル切替制御・テーブル折り返し・44px統一・二重発火防止
- **ID**: TASK-003
- **目的**: `ItunesModal` モバイルビュー切替ロジックの実装、プレビューテーブルおよび検索候補の横溢れ/44px対応、ならびに `BUG-007` 画像エラー二重発火の解消を行う。
- **入力**:
  - `docs/architecture/mobile_track_list_layout_design.md` v1.1.0 (ADR-02, ADR-04, ADR-05, FR-MOB-003, FR-MOB-006, FR-MOB-007, NFR-UX-001)
  - 現行 `src/ScriptsApp.html` (`constructor`, `bindEvents`, `resetUIAfterModeChange` L689-715, `renderTrackDetail` L1173-1219, `handleGlobalSearch` L1308-1388, `openItunesModal`〜`selectItunesAlbumForPreview` L1540-1770)
- **期待される結果**:
  1. **iTunes モーダルモバイルビュー切替制御 (`BUG-002`)**:
     - `constructor()` で `this.itunesMobileView = 'results';` を初期化し、`setItunesMobileView(view)` メソッドを実装する（`'preview'` 時は `#itunes-results-container` に `hidden` を付与し `#itunes-preview-panel` から `hidden` を除去＋`flex` 付与＋`scrollTop = 0`、`'results'` 時はその逆。PC用 `md:block` / `md:flex` は常に維持）。
     - `bindEvents()` に `#btn-itunes-mobile-back` のクリックリスナー（`this.setItunesMobileView('results')`）を登録する。
     - `openItunesModal()`, `executeItunesSearch()`（検索結果描画時）, および接続設定切替初期化ブロック（L689-715付近）で `this.setItunesMobileView('results')` を呼ぶ。
     - `selectItunesAlbumForPreview()` で API 取得・描画成功時に `this.setItunesMobileView('preview')` を呼ぶ。
  2. **プレビューテーブル・検索候補の改善 (`BUG-003`, `BUG-006`)**:
     - `selectItunesAlbumForPreview()` 生成 `<tr>` で、CD 列 `<td>` から `whitespace-nowrap` を外して `break-words` にし、曲名 `<td>` と中身のモバイルサブアーティスト `<span>` と PC アーティスト `<td>` に `break-words [overflow-wrap:anywhere]` を適用する。`Utils.escapeHtml()` を維持する。
     - `renderItunesResults()` の `.itunes-result-item` に `min-h-[44px]` を追加する。
     - `handleGlobalSearch()` のアーティスト候補行（L1309）・アルバム候補行（L1340）にも `min-h-[44px]` を追加し、楽曲行含めテキスト部分に `break-words [overflow-wrap:anywhere] md:truncate` を統一する。
     - `renderTrackDetail()` のトラック名・別トラックアーティスト名 `<p>` にも `[overflow-wrap:anywhere]` を補強し、`#track-discs-container` 内の長大無空白文字列が `768px〜1024px` でも突き抜けないようにする。
  3. **画像エラー二重発火防止 (`BUG-007`)**:
     - `bindEvents()` L43 の `window.addEventListener('error', ..., true)` 内条件を `if (target && target.tagName === 'IMG' && target.hasAttribute('data-artwork') && typeof target.onerror !== 'function')` に修正する。
- **対象ファイル**: `src/ScriptsApp.html`
- **依存関係**: TASK-002 と DOM ID（`#btn-itunes-mobile-back`, `#itunes-results-container`, `#itunes-preview-panel`）で連携するため、TASK-002 と整合させながら実装する。
- **受け入れ基準**:
  - `Utils.escapeHtml()` / `Utils.highlightMatch()` が全動的テキストで維持され、インラインイベント属性が一切追加されていない。
  - `setItunesMobileView` がモーダル起動・検索・選択・戻る・リセット・リサイズ跨ぎのすべてで整合する。
  - `window` キャプチャエラーリスナーが個別 `onerror` バインド済み画像で二重発火しない。
- **検証方法**:
  - TASK-004 の VM 単体テストによる検証。

---

### タスク [TASK-004]: 自動テスト (`tests/run_tests.js`, `tests/red_team_attack_test.js`) の v1.1.0 契約更新＆退行防止拡充
- **ID**: TASK-004
- **目的**: `BUG-008` への対応として、v1.1.0 のレイアウト・状態切替・二重発火防止契約を検証するテストへ更新・拡充し、将来のリグレッションを自動検知可能にする。
- **入力**:
  - TASK-001〜TASK-003 完了後の `src/index.template.html`, `src/TrackDetail.html`, `src/ItunesModal.html`, `src/ScriptsApp.html`
  - 現行 `tests/run_tests.js` (L3051-3209) および `tests/red_team_attack_test.js` (L1847-1907)
- **期待される結果**:
  1. `tests/run_tests.js` セクション `[16]` に以下が実装されていること：
     - `src/index.template.html` の `<main>` に `divide-y` が不在で `md:divide-x` であること。
     - `TrackDetail.html` の単一DOM契約、非 sticky 分離構造（`p-0`, `flex-shrink-0`, `.track-detail-scroll-body`, `sticky`・`-mx-2.5`・`-mt-2.5` 不在）、`#breadcrumb-artist` の `min-w-0` + `truncate`、`#track-album-header` の `2xl:flex-row` / `p-3 2xl:p-4` / `2xl:truncate` / ジャケット段階サイズ（`w-20 h-20 lg:w-24 lg:h-24 xl:w-28 xl:h-28`）。
     - `ItunesModal.html` の `#btn-itunes-mobile-back` 単一DOM契約・`44px`・`id`→`class` 順、フッター `flex-col sm:flex-row`・ボタン `flex-shrink-0 whitespace-nowrap min-h-[44px]`、`table-fixed`、および `#itunes-preview-content` が無条件 `min-h-0` ではなく `md:flex-1 md:min-h-0` であること。
     - VM テスト：`setItunesMobileView` の切替動作（`openItunesModal`, `selectItunesAlbumForPreview`, `handleResetConnection` 連動含む）、`handleGlobalSearch` の全候補行（artist/album/track）`min-h-[44px]`、プレビューセルの `CD` `whitespace-nowrap` 不在と `[overflow-wrap:anywhere]`、`renderTrackDetail()` の `[overflow-wrap:anywhere]`、および **BUG-007（`window` キャプチャ＋個別 `onerror` で `Utils.handleImageError` が 1回だけ呼ばれ Step 0→1 になること、かつ未バインド時は保険発火すること）** の検証。
  2. `tests/red_team_attack_test.js` セクション `[9.4]` が v1.1.0 仕様へ更新され、加えて `ItunesModal.html` 全操作ボタンの 44px（`id`→`class` 順）、`table-fixed`、`TrackDetail` の `2xl:flex-row`・`#breadcrumb-artist`・`divide-y` 不在・二重発火ガードの検査が含まれること。
- **対象ファイル**: `tests/run_tests.js`, `tests/red_team_attack_test.js`
- **依存関係**: TASK-001, TASK-002, TASK-003 完了後
- **受け入れ基準**:
  - 既存テストを無効化・緩和することなく、v1.1.0 仕様に基づくアサーションへ正確に更新・追加されている。
- **検証方法**:
  - TASK-005 にて `npm.cmd run build && npm.cmd test` を実行して全件 PASS を確認する。

---

### タスク [TASK-005]: `dist/index.html` 再ビルド・全自動テスト実行・レイアウト実描画確認
- **ID**: TASK-005
- **目的**: SSOT である `src/*.html` から `dist/index.html` を決定論的にビルドし、全テストスイートおよび主要ブレークポイントでの実描画を検証して完了報告を行う。
- **入力**:
  - TASK-001〜TASK-004 完了後のソース・テスト一式
- **期待される結果**:
  1. `npm.cmd run build` がエラーなく完了し、`dist/index.html` が最新化される。
  2. `npm.cmd test`（`tests/run_tests.js`, `tests/red_team_attack_test.js`, `tests/qa_comprehensive_verification.js`）がすべて Exit Code 0 でパスする。
  3. （可能環境であれば Headless ブラウザ等で）代表幅 `320px`, `768px`, `1024px`, `1280px`, `1536px` における水平オーバーフローゼロ・要素重なりゼロ・`ItunesModal` モバイル切替＆テーブル高確保を確認する（未実施のブラウザ観点がある場合は事実ベースで未検証として正直に報告する）。
- **対象ファイル**: `dist/index.html`（ビルド生成物）
- **依存関係**: TASK-001, TASK-002, TASK-003, TASK-004 完了後
- **受け入れ基準**:
  - `npm.cmd run build` 成功、`npm.cmd test` 全件 PASS（失敗 0件）。
  - すべての報告内容が実際に実行・観察したコマンド出力およびファイル内容と一致している。
- **検証方法**:
  - `npm.cmd run build`
  - `npm.cmd test`
