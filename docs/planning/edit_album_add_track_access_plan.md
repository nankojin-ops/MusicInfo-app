# 実装計画・タスク仕様書: アルバム編集モーダルにおけるトラック追加ボタンの常時アクセス性改善

- **文書バージョン**: 1.0.0
- **作成日**: 2026年11月21日
- **作成ロール**: テックリード (`tech-lead`)
- **上流設計書**: `docs/architecture/edit_album_add_track_access_design.md` (v1.0.0 / ゲート1承認済み)
- **対象要望**: 「アルバム情報の編集画面にて、トラック追加ボタンを、画面外に出ても押せるようにして欲しい なお、フッター部にボタンを追加しても可」
- **成果物パス**: `docs/planning/edit_album_add_track_access_plan.md`

---

## 0. 採択済み要件・確定方針（確定インプット）

上流のシステムアーキテクチャ設計書（ADR-01〜ADR-03、AC-001〜AC-007、およびユーザー確定方針 Q-01・Q-02）に基づく確定要件は以下の通りであり、本計画書ではこれらを変更せず具体的な実装・検証仕様へ落とし込む。

- **Q-01 / ADR-01（併存構成）**: モーダルフッター（`flex-shrink-0` 固定領域）へ新規ボタン `#btn-footer-add-edit-track` を追加し、セクション2ツールバー内の既存 `#btn-add-edit-track` は削除せず維持・併存させる。両ボタンとも共通の `App.prototype.addEditTrackRow()` を呼び出す。
- **Q-02 / ADR-02（フッターレスポンシブ幾何設計）**:
  - `<640px`（モバイル狭幅）ではフッターを2段構成（`flex-col sm:flex-row`）とし、上段に `#btn-footer-add-edit-track`（`w-full sm:w-auto`）、下段に「キャンセル」「変更を保存」を配置して誤タップによる未保存破棄と横溢れを防止する。
  - フッター左側のヒント文言（「同一CD番号内でトラック番号が重複していないか確認して保存してください」）を `hidden md:flex` から `hidden lg:flex min-w-0`（内部テキスト `truncate`）へ引き上げ、`768px`（`md:`）帯域でのフッター圧迫を回避する。
  - フッター内の全ボタンに `min-h-[44px] whitespace-nowrap flex-shrink-0` を適用する。
- **ADR-03（DOM ID 一意性・状態同期・非干渉）**:
  - すべての DOM ID は単一 DOM 原則（重複 ID 禁止）を遵守する。
  - `addEditTrackRow()` 冒頭に `this.store.state.isSaving` ガードを追加し、`handleSaveAlbumEdit()` の開始時および `finally` ブロックで `#btn-add-edit-track` と `#btn-footer-add-edit-track` の `disabled` 状態を保存ボタンと同期させる。
  - `handleImageUpload()`（`src/ScriptsApp.html` L2153-2159）の `relatedBtnIds`（既存 5 要素）は変更せず、画像アップロード中もトラック追加を許容する。
- **スクロール領域保護制約**: `<form id="form-edit-album">`（`src/EditAlbumModal.html` L32）へ `min-h-0` を付与し、Flex 配下でのスクロール伸縮を保証する。

---

## 1. アーキテクチャレビュー所見

### 1.1 実現可能性評価: 【高い (Feasible)】
上流設計書（`docs/architecture/edit_album_add_track_access_design.md`）を現行コードベース（`src/EditAlbumModal.html`, `src/ScriptsApp.html`, `src/index.template.html`, `src/ItunesModal.html`）およびテストスイート（`tests/run_tests.js`, `tests/red_team_attack_test.js`, `tests/qa_comprehensive_test.js`）と照合して批判的に精査した結果、採用された設計方針はフロントエンド UI 層のみで完結し、技術的矛盾や実現不能箇所はなく、破綻なく実装可能であると評価する。

1. **幾何計算の妥当性**:
   - **【事実】** `src/EditAlbumModal.html` L2 のモーダル枠はモバイル `w-full h-full`、`md:` 以上で `md:h-[90vh] md:max-w-4xl`（最大 `896px`）、`src/EditAlbumModal.html` L1 には `p-0 md:p-4` が指定されている。
   - **【事実】** `src/ItunesModal.html` L93-106 において、`px-3 sm:px-4 py-3 ... flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 flex-shrink-0` のフッターパターンが既に導入され運用されている。
   - **【決定】** 本改修のフッター再構成は既存 `ItunesModal.html` と同系統のレスポンシブ設計であり、全代表幅（`320px`〜`1536px`）でボタン縦割れおよび水平オーバーフローを防げる。
2. **スクロール自動追従の整合性**:
   - **【事実】** `App.prototype.addEditTrackRow()`（`src/ScriptsApp.html` L2439-2474）は行追加・再描画後、追加行の `.edit-track-name` に対して `nameInput.focus()` および `nameInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' })` を実行する。
   - **【決定】** `#form-edit-album` に `min-h-0` を付与してスクロール領域の高さを確定させることで、基本情報（最上部）編集中でもリスト中間・最下部でも、フッターボタン押下後に新規行へ確実にスクロール誘導される。

### 1.2 批判的レビューによる留意事項・技術リスクと対策

上流設計書自体は整合しているが、現行のコードおよびテスト契約との突き合わせにより、シニアコーダーが実装時に踏みやすい**6つの具体的な注意点・リスク**を特定した。本計画書で以下の通り仕様を補完し、事故を未然に防止する。

1. **【重要・HTML構造】フッター右ボタン群の `md:w-auto` を `sm:w-auto` へ変更する必須修正**:
   - **【事実】** 現行 `src/EditAlbumModal.html` L187 の右ボタン群コンテナは `class="flex items-center justify-end gap-2 w-full md:w-auto"` である。
   - **【リスク】** 親フッターを `flex-col sm:flex-row` に変更しても、右ボタン群に `md:w-auto` が残っていると、**`640px〜767px`（`sm:` 以上かつ `md:` 未満）の幅帯で右ボタン群が `w-full` のまま**となり、左側の `#btn-footer-add-edit-track` と横幅を競合して折り返しまたは圧迫を発生させる。
   - **【対策】** 右ボタン群コンテナは必ず `w-full sm:w-auto flex items-center justify-end gap-2 flex-shrink-0` へ変更する（上流設計書 ADR-02 の幾何表と整合させるための必須詳細化）。

2. **【重要・UI/UX】`#btn-footer-add-edit-track` の中央揃え（`justify-center`）および `disabled:` 視覚スタイル**:
   - **【事実】** 現行ツールバーの `#btn-add-edit-track`（`src/EditAlbumModal.html` L137）は `inline-flex items-center gap-1.5 ... bg-slate-800 ...` であり、`justify-center` や `disabled:*` 装飾を持たない。
   - **【リスク】** フッターの `#btn-footer-add-edit-track` に `<640px` 全幅化（`w-full sm:w-auto`）を適用した際、`justify-center` が欠けるとモバイル幅でボタン内テキストが左寄せに偏る。また、保存中に `disabled = true` へ同期されても背景色が `bg-slate-800` のままだと、非活性であることが視覚的に判別できない（保存ボタン L194 は `disabled:bg-slate-800 disabled:text-slate-600` を使用）。
   - **【対策】** `#btn-footer-add-edit-track` には `inline-flex items-center justify-center` と `disabled:opacity-40 disabled:cursor-not-allowed`（および内部 SVG へ `flex-shrink-0`）を必須指定する。併せて既存 `#btn-add-edit-track` にも `disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap flex-shrink-0` を追加し、両ボタンの非活性表現と折り返し抑止を揃える。

3. **【重要・既存テスト互換】`tests/red_team_attack_test.js` L1045 の文字列完全一致検査との衝突回避**:
   - **【事実】** `tests/red_team_attack_test.js` L1045-1046 は `ScriptsApp.html` に対し、`appContent.includes('btnSubmit.disabled = true') && appContent.includes('btnMobileSubmit.disabled = true')` を文字列部分一致で検査している。
   - **【リスク】** `handleSaveAlbumEdit()` のボタン無効化を「配列へ全ボタンをまとめて `forEach` で `disabled = true` にする」形へ書き換えて既存の `btnSubmit.disabled = true` / `btnMobileSubmit.disabled = true` を消すと、Red Team テスト L1045 が失敗する。
   - **【対策】** `handleSaveAlbumEdit()`（`src/ScriptsApp.html` L2573-2574 および L2618-2619）の `if (btnSubmit) btnSubmit.disabled = ...` と `if (btnMobileSubmit) btnMobileSubmit.disabled = ...` の記述は**そのまま維持**し、それと並べて `btnAddEditTrack` と `btnFooterAddEditTrack` の `disabled` 同期を明示的かつ null ガード付きで追加する。

4. **【重要・属性順序＆既存テスト保護】`id` → `type` → `class` の属性順と 44px 個別要素検査の強化**:
   - **【事実】** `src/EditAlbumModal.html` 内の既存ボタン（L7, L24, L84, L91, L129, L137, L189, L194）はすべて `<button id="..." type="button" class="...">` の順で記述されている。一方、`tests/red_team_attack_test.js` L1018-1020 はファイル全体の `.includes('min-h-[44px]')` のみ検査する緩い実装であり、L1401 / L1890 では `<button[^>]*id=["']${btn.id}["'][^>]*class=["']([^"']*)["']` による要素個別検査が行われている。
   - **【対策】** 新設 `#btn-footer-add-edit-track` は必ず `id` 属性を `class` 属性より前（`id="btn-footer-add-edit-track" type="button" class="..."`）に配置し、TASK-004 で要素単位の個別 `class` 抽出検査へ強化する。

5. **【重要・テストモック互換】`qa_comprehensive_test.js` 等、一部 DOM 要素が未登録な VM 環境での null 安全性**:
   - **【事実】** `tests/qa_comprehensive_test.js` L711-723 の `createQaDomEnv()` および `tests/run_tests.js` L2908-2928 の `simElements` には、現時点で `btn-add-edit-track` や `btn-footer-add-edit-track`、`edit-tracks-table-body` 等が含まれていないテストケースがある。
   - **【対策】** `ScriptsApp.html` の `bindEvents()` および `handleSaveAlbumEdit()` における DOM 要素操作はすべて `if (el)` による null ガードを必須とし、モック環境で要素が `null` でも例外を送出しない構造とする。また `addEditTrackRow()` 末尾の `nameInput.scrollIntoView(...)` は実 DOM や対応モックでは動作するが、新規作成する VM テストモック側には `scrollIntoView: () => {}` を定義（または要素側オプショナル呼び出しを前提に検証）する。

6. **【スコープ境界の明確化】既存 `z-index` 重ね順および他ボタンの `isSaving` 制御（変更対象外）**:
   - **【事実】** `src/index.template.html` では `#global-loading`（L16, `z-50`）より `<?!= include('EditAlbumModal'); ?>`（L39, `z-50`）が後置されているため、保存中オーバーレイよりモーダルが手前に描画される既存構造である。また、`#btn-cancel-edit-album`, `#btn-close-edit-album`, `#btn-renumber-edit-tracks`, `.btn-remove-edit-track` には現在 `isSaving` ガード／無効化が実装されていない。
   - **【決定・留意】** 上流設計書（1.4節・ADR-03）でスコープは「トラック追加ボタン」のアクセス性と競合保護に限定されているため、これら他要素および `z-index` 構造の改修は本タスクでは行わない（技術的観測事実として残置）。また、`src/EditAlbumModal.html` L178 のHTMLコメント `<!-- モーダルフッター (PC表示時固定・フッターアクション) -->` は全幅帯常時固定という実装実態と乖離しているため、正確な説明コメントへ更新する。

### 1.3 アーキテクトへのエスカレーション有無: 【エスカレーション不要】
上記の留意事項はいずれも上流設計書（ADR-01〜ADR-03、Q-01・Q-02）の範囲内における実装詳細および既存テスト契約との整合化で解決可能であり、アーキテクチャ再設計や設計変更を要する欠陥は存在しない。

---

## 2. 影響範囲・変更対象ファイル一覧

| レイヤー | 対象ファイル | 変更種別 | 変更概要 |
| :--- | :--- | :---: | :--- |
| **Frontend View** | `src/EditAlbumModal.html` | 修正 | ・`<form id="form-edit-album">`（L32）へ `min-h-0` を追加。<br>・ツールバー `#btn-add-edit-track`（L137）へ `disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap flex-shrink-0`（アイコン `flex-shrink-0`）を補完。<br>・モーダルフッター（L178-199）を `flex-col sm:flex-row` 構成へ再編し、`#btn-footer-add-edit-track`（`min-h-[44px] w-full sm:w-auto whitespace-nowrap flex-shrink-0`）を追加。<br>・ヒント文言コンテナを `hidden lg:flex items-center gap-2 text-xs text-slate-400 min-w-0`（アイコン `flex-shrink-0`、テキスト `truncate`）へ変更。<br>・右ボタン群コンテナを `w-full sm:w-auto` へ変更し、`#btn-cancel-edit-album` と `#btn-submit-edit-album` へ `whitespace-nowrap flex-shrink-0` を付与。 |
| **Frontend Controller** | `src/ScriptsApp.html` | 修正 | ・`bindEvents()`（L286-290 付近）へ `#btn-footer-add-edit-track` のクリックリスナー（`this.addEditTrackRow()`）を追加。<br>・`addEditTrackRow()`（L2439 冒頭）へ `this.store.state.isSaving` ガードを追加。<br>・`handleSaveAlbumEdit()`（L2568-2576, L2617-2625）で `#btn-add-edit-track` と `#btn-footer-add-edit-track` の `disabled` 状態を保存開始時 `true` / `finally` 時 `false` へ同期（既存 `btnSubmit` / `btnMobileSubmit` 記述を維持）。 |
| **Test (Unit / Integration)** | `tests/run_tests.js` | 修正 | ・新規セクション `[17]`（L3354 付近）を追加し、`EditAlbumModal.html` の単一DOM契約・属性順・クラス契約・`dist/index.html` 反映、および VM サンドボックスでの両ボタン連動・`isSaving` ガード・`finally` 復帰を検証。 |
| **Test (Red Team)** | `tests/red_team_attack_test.js` | 修正 | ・セクション `[5.3]`（L1008-1052 付近）および／または新規検証項目を追加し、`EditAlbumModal.html` 全7ボタンの要素個別 44px・`id`→`class` 属性順・フッター保護クラス・重複ID不在・`addEditTrackRow()` の `isSaving` ガード・`handleSaveAlbumEdit()` での追加ボタン無効化同期・`handleImageUpload()` 非改変を検証。 |
| **Build Output** | `dist/index.html` | 自動生成 | ・`npm run build`（`build.js`）により再生成（直接編集禁止）。 |

### 非変更領域と後方互換性への考慮事項
- **非変更ファイル**: `src/index.template.html`, `src/TrackDetail.html`, `src/ItunesModal.html`, `src/ManualModal.html`, `src/Styles.html`, `src/ScriptsState.html`, `src/ScriptsApiClient.html`, `src/ScriptsUtils.html`, `src/*.js`, `build.js`, `tests/qa_comprehensive_test.js`, `tests/qa_comprehensive_verification.js`。
- **既存契約の維持**:
  - `src/ScriptsApp.html` L2153-2159 の `handleImageUpload()` 内 `relatedBtnIds`（5要素: `'btn-submit-edit-album'`, `'btn-mobile-submit-edit-album'`, `'btn-submit-manual-track'`, `'btn-edit-album-drive'`, `'btn-manual-drive'`）および `relatedBtns.forEach(...)` 記述を変更しないことで、`tests/run_tests.js` `[10.4]`（L1581-1597）および `tests/red_team_attack_test.js`（L1414-1434）との完全互換を保つ。
  - `tests/qa_comprehensive_test.js` L827-874 の `openEditAlbumModal & handleSaveAlbumEdit` テスト（要素未登録のモック環境）が null 参照エラーを起こさないよう、全追加 DOM アクセスを null ガードする。

---

## 3. インターフェース・DOM構造・ロジック仕様

### 3.1 `src/EditAlbumModal.html` 構造契約

シニアコーダーが実装すべき `src/EditAlbumModal.html` の要素階層・ID・必須クラス・属性順序仕様を以下に定義する。

```text
#modal-edit-album (既存維持: hidden fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 ...)
└── [モーダル本体枠] (既存維持: w-full h-full md:h-[90vh] md:max-w-4xl ... flex flex-col overflow-hidden)
    ├── [ヘッダー] (既存維持: flex-shrink-0, #btn-close-edit-album, #btn-mobile-submit-edit-album)
    ├── <form id="form-edit-album" onsubmit="event.preventDefault();" class="flex-1 min-h-0 overflow-y-auto p-3 md:p-5 space-y-5">
    │   ├── [セクション1: アルバム基本情報] (既存維持)
    │   └── [セクション2: 収録曲インライン編集エリア]
    │       ├── [収録曲ツールバー]
    │       │   └── [ボタングループ]
    │       │       ├── #btn-renumber-edit-tracks (既存維持)
    │       │       └── <button id="btn-add-edit-track" type="button" class="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 border border-slate-700 rounded-lg transition active:scale-95 whitespace-nowrap flex-shrink-0">
    │       │           ├── <svg class="w-4 h-4 text-indigo-400 flex-shrink-0" ...>
    │       │           └── <span>+ トラック追加</span>
    │       ├── [PC向けテーブル #edit-tracks-table-body] (既存維持)
    │       ├── [スマホ向けカード #edit-tracks-mobile-container] (既存維持)
    │       └── #edit-tracks-empty-warning (既存維持)
    │
    └── <!-- モーダルフッター (全幅帯常時固定・フッターアクション) -->
        <div class="px-3 sm:px-4 py-3 border-t border-slate-800 bg-slate-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3 flex-shrink-0">
        ├── [左側 / モバイル上段ラッパー] (class="flex items-center gap-3 min-w-0 w-full sm:w-auto sm:flex-1")
        │   ├── <button id="btn-footer-add-edit-track" type="button" class="min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 border border-slate-700 rounded-lg transition active:scale-95 whitespace-nowrap flex-shrink-0">
        │   │   ├── <svg class="w-4 h-4 text-indigo-400 flex-shrink-0" ...> (既存 #btn-add-edit-track と同一の + アイコン SVG)
        │   │   └── <span>+ トラック追加</span>
        │   └── [ヒント文言コンテナ] (class="hidden lg:flex items-center gap-2 text-xs text-slate-400 min-w-0")
        │       ├── <svg class="w-4 h-4 text-slate-500 flex-shrink-0" ...> (既存 L181-183 と同一の i アイコン SVG に flex-shrink-0 追加)
        │       └── <span class="truncate">同一CD番号内でトラック番号が重複していないか確認して保存してください</span>
        └── [右側 / モバイル下段アクションボタン群] (class="flex items-center justify-end gap-2 w-full sm:w-auto flex-shrink-0")
            ├── <button id="btn-cancel-edit-album" type="button" class="min-h-[44px] px-4 py-2 text-xs text-slate-400 hover:text-slate-200 border border-slate-800 hover:bg-slate-800 rounded-lg transition active:scale-95 whitespace-nowrap flex-shrink-0">
            │   キャンセル
            └── <button id="btn-submit-edit-album" type="button" class="min-h-[44px] px-5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg shadow-md transition active:scale-95 flex items-center gap-1.5 whitespace-nowrap flex-shrink-0">
                ├── <span class="edit-album-submit-btn-text">変更を保存</span>
                └── <div class="edit-album-submit-spinner hidden w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
```

#### フッター構造・幾何仕様の補足チェック
- **属性順序制約**: `EditAlbumModal.html` 内の全 `<button>` 要素は `id="..." type="button" class="..."` の順とする（`id` は必ず `class` より前、かつ `type="button"` 必須）。
- **単一 DOM 原則**: `#btn-add-edit-track` と `#btn-footer-add-edit-track`、その他すべての ID は `EditAlbumModal.html` 内で厳密に 1 回のみ出現すること。
- **レスポンシブ挙動**:
  - `<640px` (`320px`, `375px`, `430px`): `flex-col` により上段 `#btn-footer-add-edit-track`（`w-full`, 中央揃え）、`gap-2.5`（`10px`）を挟んで下段に右寄せで「キャンセル」「変更を保存」（計約 `218px` <= 内側 `296px` at `320px`）。ヒント非表示。
  - `640px〜1023px` (`640px`, `767px`, `768px`): `sm:flex-row` により 1 行配置。右ボタン群も `sm:w-auto` により自然幅（`218px`）へ切り替わり、`justify-between` で左右両端に整列。ヒントは非表示（`hidden lg:flex`）のため `768px` モーダル（内側 `702px`）でも余裕 `340px+` を確保。
  - `1024px+` (`1024px`, `1280px`, `1536px`): モーダル内側幅 `862px`。右ブロック `218px`・`gap-3`（`12px`）控除後の左ブロック幅 `632px` 内で、追加ボタン（約 `132px`）＋`gap-3`（`12px`）＋ヒント（約 `432px`）が全文表示可能であり、フォント環境差で狭まっても `min-w-0` + `truncate` によりボタン群を圧迫せず安全に省略される。

---

### 3.2 `src/ScriptsApp.html` メソッド・イベント仕様

変更対象は `App` クラスの以下 3 メソッドのみとする。完全実装コードは記載せず、仕様と契約を定義する。

1. **`bindEvents()`（`src/ScriptsApp.html` L286-290 付近の拡張）**:
   - **仕様**: 既存の `btnAddEditTrack`（`#btn-add-edit-track`）の登録直後に、`btnFooterAddEditTrack`（`document.getElementById('btn-footer-add-edit-track')`）を取得し、null チェック（`if (btnFooterAddEditTrack)`）のうえで `click` イベントリスナーとして `() => this.addEditTrackRow()` を登録する。
   - **禁止事項**: トラック行追加ロジックを無名関数内に重複記述しないこと。インラインイベント属性を使用しないこと。

2. **`addEditTrackRow()`（`src/ScriptsApp.html` L2439 冒頭）**:
   - **シグネチャ**: `addEditTrackRow(): void`
   - **仕様**:
     1. メソッド最冒頭（`this.syncEditingTracksFromDom()` より前）にて保存中ガードを実行する：`if (this.store.state.isSaving) return;`（`this.store` / `this.store.state` の存在を前提としつつ、防御的に `if (this.store && this.store.state && this.store.state.isSaving) return;` も可）。
     2. 保存中でなければ、既存の処理（`syncEditingTracksFromDom()` → デフォルトアーティスト取得 → 末尾トラックの `cdNumber`, `trackNumber + 1` 引き継ぎで `this.editingTracks.push(...)` → `renderEditModalTracks()` → `window.innerWidth < 768` に応じた対象コンテナ末尾行 `.edit-track-name` への `focus()` および `scrollIntoView({ behavior: 'smooth', block: 'nearest' })`）をそのまま維持する。

3. **`handleSaveAlbumEdit()`（`src/ScriptsApp.html` L2566-2628 付近の拡張）**:
   - **シグネチャ**: `async handleSaveAlbumEdit(): Promise<void>`
   - **仕様**:
     1. 開始時（`this.store.state.isSaving = true;` の直後、L2568-2576 ブロック）:
        - `btnSubmit`（`#btn-submit-edit-album`）と `btnMobileSubmit`（`#btn-mobile-submit-edit-album`）の既存変数・`disabled = true` 代入をそのまま維持する。
        - 追加で `btnAddEditTrack`（`document.getElementById('btn-add-edit-track')`）および `btnFooterAddEditTrack`（`document.getElementById('btn-footer-add-edit-track')`）を取得し、null ガード付き（`if (btnAddEditTrack) btnAddEditTrack.disabled = true;` / `if (btnFooterAddEditTrack) btnFooterAddEditTrack.disabled = true;`）で無効化する。
     2. 終了時（`finally` ブロック L2616-2627）:
        - `this.store.state.isSaving = false;` および `btnSubmit` / `btnMobileSubmit` の既存 `disabled = false` 復帰を維持する。
        - 追加で `if (btnAddEditTrack) btnAddEditTrack.disabled = false;` と `if (btnFooterAddEditTrack) btnFooterAddEditTrack.disabled = false;` を実行し、保存成功・API エラー・例外のいずれの終了経路でも確実に操作可能状態へ復帰させる。
   - **注意**: `handleImageUpload()`（L2153-2197）の `relatedBtnIds`（5要素）は一切変更しない。

---

## 4. テスト戦略

### 4.1 単体テスト方針（`tests/run_tests.js`）
`tests/run_tests.js` 末尾にセクション `[17] アルバム編集モーダル トラック追加常時アクセス改善テスト` を新設し、以下を検証する。
1. **静的構造・単一 DOM 契約検証 (`src/EditAlbumModal.html` & `dist/index.html`)**:
   - `#btn-add-edit-track`, `#btn-footer-add-edit-track`, `#btn-cancel-edit-album`, `#btn-submit-edit-album`, `#form-edit-album` の各 ID が `src/EditAlbumModal.html` および `dist/index.html` 内で厳密に 1 箇所のみ存在すること。
   - `<form id="form-edit-album">` に `flex-1`, `min-h-0`, `overflow-y-auto`, `onsubmit="event.preventDefault();"` が含まれること。
   - フッター親要素に `flex-col sm:flex-row` と `flex-shrink-0` が設定され、右ボタン群ラッパーが `w-full sm:w-auto`（旧 `md:w-auto` でないこと）、ヒント文言コンテナが `hidden lg:flex` と `min-w-0`（内部テキストに `truncate`）を持つこと。
   - `#btn-footer-add-edit-track`, `#btn-add-edit-track`, `#btn-cancel-edit-album`, `#btn-submit-edit-album` が `id` → `class` 属性順かつ `type="button"` を持ち、個別の `class` 属性に `min-h-[44px]`, `whitespace-nowrap`, `flex-shrink-0`（さらに `#btn-footer-add-edit-track` には `w-full`, `sm:w-auto`, `justify-center`, `disabled:` クラス）を含むこと。
2. **VM サンドボックス動的動作・ガード・復帰テスト**:
   - 既存 VM 環境（またはアルバム編集要素 `form-edit-album`, `edit-tracks-table-body`, `edit-tracks-mobile-container`, `edit-tracks-count-badge`, `edit-tracks-empty-warning`, `btn-add-edit-track`, `btn-footer-add-edit-track`, `btn-submit-edit-album`, `btn-mobile-submit-edit-album`, `modal-edit-album`, `edit-album-artist`, `edit-album-release-date` および `scrollIntoView` モックを含む独立または拡張シミュレーション）上で以下を検証する：
     - `simApp.openEditAlbumModal(...)` 後に `#btn-footer-add-edit-track` の click ハンドラ発火により、ツールバー `#btn-add-edit-track` と同様に `editingTracks` が 1 曲増え、`trackNumber` が `+1` 継承され、`#edit-tracks-count-badge` と DOM 行（`data-track-index`）が更新され、末尾 `.edit-track-name` へ `focus()` と `scrollIntoView()` が呼ばれること。
     - `simApp.store.state.isSaving = true` 状態で `addEditTrackRow()`（および両ボタンのクリック）を実行しても `editingTracks.length` が増加しないこと。
     - `handleSaveAlbumEdit()` 実行中（非同期 `updateAlbumBatch` 待機中）は `btn-add-edit-track`, `btn-footer-add-edit-track`, `btn-submit-edit-album`, `btn-mobile-submit-edit-album` がすべて `disabled === true` となり、API 成功後および API エラー発生時の双方で `finally` によりすべて `disabled === false` かつ `isSaving === false` へ復帰すること。
     - `handleImageUpload(..., 'editAlbum')` の実行中に `btn-add-edit-track` と `btn-footer-add-edit-track` が `disabled === false` のまま阻害されないこと。

### 4.2 セキュリティ・レイアウト契約テスト方針（`tests/red_team_attack_test.js`）
`tests/red_team_attack_test.js` のセクション `[5.3]` 周辺または新規サブセクションにて以下を補強・検証する。
1. **個別要素単位の 44px & 属性順検査**:
   - `EditAlbumModal.html` 内の全 7 操作ボタン（`btn-close-edit-album`, `btn-mobile-submit-edit-album`, `btn-edit-album-upload`, `btn-edit-album-drive`, `btn-renumber-edit-tracks`, `btn-add-edit-track`, `btn-footer-add-edit-track`, `btn-cancel-edit-album`, `btn-submit-edit-album` ※画像系2種含め全9ボタンへの統一も可、少なくとも L1009 の6ボタン＋新設1ボタン）について、`<button[^>]*id=["']${id}["'][^>]*class=["']([^"']*)["']` で個別抽出して `min-h-[44px]` および `type="button"` を検証する（ファイル全体の `.includes` による誤通過を排除）。
   - フッター3ボタン（`btn-footer-add-edit-track`, `btn-cancel-edit-album`, `btn-submit-edit-album`）については `whitespace-nowrap` と `flex-shrink-0`、さらに `btn-footer-add-edit-track` の `w-full`・`sm:w-auto` を追加検証する。
2. **重複 ID 不在・XSS/誤送信防止**:
   - `dist/index.html` 上で `btn-add-edit-track` と `btn-footer-add-edit-track` が各 1 件のみであること（Duplicate ID 不在）。
   - `EditAlbumModal.html` にインラインイベントハンドラ（`onclick=` 等、`form` の `onsubmit="event.preventDefault();"` を除く）が混入していないこと。
3. **競合・二重操作防止静的検査**:
   - `ScriptsApp.html` 内の `addEditTrackRow()` 範囲に `this.store.state.isSaving` ガードが含まれること、`handleSaveAlbumEdit()` に `btnAddEditTrack` / `btnFooterAddEditTrack` の無効化・復帰が含まれること、かつ既存の `btnSubmit.disabled = true` / `btnMobileSubmit.disabled = true` および `handleImageUpload` 5ボタンが維持されていること。

### 4.3 結合・ビルドテスト方針
- `npm run build`（PowerShell 環境では `npm.cmd run build`）で `dist/index.html` を再生成する。
- `npm test`（`npm.cmd test`: `tests/run_tests.js && tests/red_team_attack_test.js && tests/qa_comprehensive_verification.js`）および既存の回帰確認として `node tests/qa_comprehensive_test.js` がすべて Exit Code 0（失敗 0件）で完走することを確認する。

### 4.4 実描画幾何検証方針（Phase 3 / Phase 4 引き継ぎ基準）
Headless ブラウザまたはブラウザ DevTools エミュレーションを用い、15〜20曲程度の収録曲データで `#modal-edit-album` を開いた状態にて以下を計測・目視確認する：
- **対象幅帯（9パターン）**: `320px`, `375px`, `430px`, `640px`, `767px`, `768px`, `1024px`, `1280px`, `1536px`
- **実測チェック項目**:
  1. 最上部表示時（セクション1基本情報表示中・ツールバーが画面外にある状態）、中間、最下部（ツールバーが上端外に出た状態）のそれぞれで `#btn-footer-add-edit-track` が画面下端に固定表示され、クリック／タップ可能であること。
  2. `<640px`（`320px`, `375px`, `430px`）でフッターが2段（上段 `#btn-footer-add-edit-track` 全幅、下段キャンセル＋保存）になり、ボタン高さ `>= 44px`・縦割れなし・重なりなし・`scrollWidth <= clientWidth` であること。
  3. `640px`, `767px`, `768px` でフッターが1行配置となり、ヒント文言非表示（`display: none`）でボタンと重ならず、ボタン高さ `>= 44px`・`scrollWidth <= clientWidth` であること。
  4. `1024px`, `1280px`, `1536px` でヒント文言が表示され、全3ボタンと衝突・縦割れ・横溢れを起こさないこと。
  5. `#form-edit-album` が全幅帯で縦スクロール可能（`scrollHeight > clientHeight` のときスクロールが機能）であり、フッター追加ボタン押下後に新規追加行の `.edit-track-name` へフォーカス＆自動スクロールが実行されること。

---

## 5. 実装タスク一覧 (順序定義)

### タスク [TASK-001]: `src/EditAlbumModal.html` のフッター再構成および `#form-edit-album` スクロール保護
- **ID**: TASK-001
- **目的**: アルバム編集モーダルの固定フッターに `#btn-footer-add-edit-track` を追加し、`<640px`〜`1536px+` の全解像度で幾何的破綻を起こさないレスポンシブ構造およびフォーム伸縮保護（`min-h-0`）を実装する。
- **入力**:
  - 上流設計書 `docs/architecture/edit_album_add_track_access_design.md`（ADR-01, ADR-02, 3.2節, 3.3節）
  - 本計画書 3.1節 DOM 構造契約
  - 現行 `src/EditAlbumModal.html`（L32, L137-142, L178-199）
- **期待される結果**:
  1. `<form id="form-edit-album">`（L32）の `class` に `min-h-0` が追加されている。
  2. ツールバー内 `#btn-add-edit-track`（L137）に `disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap flex-shrink-0`（内部 SVG に `flex-shrink-0`）が付与され、既存 ID・`type="button"`・`min-h-[44px]` が維持されている。
  3. フッターコメント（L178）が「全幅帯常時固定・フッターアクション」等の実態に即した記述へ更新されている。
  4. フッター外枠（L179）が `px-3 sm:px-4 py-3 border-t border-slate-800 bg-slate-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3 flex-shrink-0` に構成されている。
  5. 左（上段）ラッパー（`flex items-center gap-3 min-w-0 w-full sm:w-auto sm:flex-1`）内に、新設ボタン `#btn-footer-add-edit-track`（`id` → `type="button"` → `class` 順、`min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 border border-slate-700 rounded-lg transition active:scale-95 whitespace-nowrap flex-shrink-0`）と、ヒント文言コンテナ（`hidden lg:flex items-center gap-2 text-xs text-slate-400 min-w-0`、アイコン `flex-shrink-0`、テキスト `truncate`）が配置されている。
  6. 右（下段）ラッパーが `flex items-center justify-end gap-2 w-full sm:w-auto flex-shrink-0`（`md:w-auto` から `sm:w-auto` へ変更）となり、`#btn-cancel-edit-album` と `#btn-submit-edit-album` の双方に `whitespace-nowrap flex-shrink-0` が追加されている。
- **対象ファイル**: `src/EditAlbumModal.html`
- **依存関係**: なし
- **受け入れ基準**:
  - 上記 1〜6 がすべて満たされ、全 ID が `src/EditAlbumModal.html` 内で一意（重複なし）であり、全ボタンが `id` → `type="button"` → `class` 順で `min-h-[44px]` を備えている。
  - インラインイベントハンドラ（`<form>` の `onsubmit="event.preventDefault();"` 除く）が追加されていない。
- **検証方法**:
  - `src/EditAlbumModal.html` の差分確認および TASK-003 / TASK-004 の静的構造テスト。

---

### タスク [TASK-002]: `src/ScriptsApp.html` のイベント登録・`isSaving` ガード・`disabled` 同期実装
- **ID**: TASK-002
- **目的**: `#btn-footer-add-edit-track` から既存の `addEditTrackRow()` を共通呼び出しできるように接続し、保存処理中（`isSaving`）の二重操作・配列競合を UI・ロジック両面から遮断する。
- **入力**:
  - 上流設計書 `docs/architecture/edit_album_add_track_access_design.md`（FR-003, FR-004, ADR-01, ADR-03）
  - 本計画書 1.2節留意事項（特に `btnSubmit.disabled = true` 維持および null ガード要件）・3.2節メソッド仕様
  - 現行 `src/ScriptsApp.html`（L286-290, L2153-2197, L2439-2474, L2566-2628）
- **期待される結果**:
  1. `bindEvents()`（L286-290 付近）にて `#btn-footer-add-edit-track` を取得し、`if (btnFooterAddEditTrack)` ガード付きで `click` リスナーから `this.addEditTrackRow()` を呼び出すよう登録されている。
  2. `addEditTrackRow()`（L2439）の先頭行（`syncEditingTracksFromDom()` より前）で `this.store.state.isSaving` による早期リターンガードが実装されている。
  3. `handleSaveAlbumEdit()` 開始時（L2568-2576）および `finally`（L2617-2625）において、既存の `if (btnSubmit) btnSubmit.disabled = ...` / `if (btnMobileSubmit) btnMobileSubmit.disabled = ...` 記述を維持した上で、`#btn-add-edit-track` と `#btn-footer-add-edit-track` の `disabled` 状態が null ガード付きで同期制御（開始時 `true`、`finally` 時 `false`）されている。
  4. `handleImageUpload()`（L2153-2159）の `relatedBtnIds`（既存 5 要素）および `relatedBtns.forEach(...)` には変更が加えられていない。
- **対象ファイル**: `src/ScriptsApp.html`
- **依存関係**: TASK-001（DOM ID `#btn-footer-add-edit-track` 契約に依存）
- **受け入れ基準**:
  - フッターボタンとツールバーボタンの双方が同一の `addEditTrackRow()` を通し、保存中の操作ガードとエラー発生時を含む確実な状態復帰が実現されている。
  - DOM 要素が存在しないテストモック環境（`qa_comprehensive_test.js` 等）でも例外が発生しない。
- **検証方法**:
  - `src/ScriptsApp.html` の差分確認、TASK-003 の VM テスト、および既存テスト `node tests/qa_comprehensive_test.js` のパス確認。

---

### タスク [TASK-003]: `tests/run_tests.js` への単一DOM・属性契約・VM 動的挙動テスト追加
- **ID**: TASK-003
- **目的**: フッター新設ボタンを含む `EditAlbumModal` の DOM 契約、両ボタンからの行追加連動、および保存中（`isSaving`）ガード・`finally` 復帰を自動テスト化し、機能退行を防ぐ。
- **入力**:
  - TASK-001, TASK-002 完了後の `src/EditAlbumModal.html`, `src/ScriptsApp.html`
  - 本計画書 4.1節テスト方針
  - 現行 `tests/run_tests.js`（L1581-1598, L2879-2960, L3350-3367 付近）
- **期待される結果**:
  1. `tests/run_tests.js` に新規セクション `[17]` が追加され、`src/EditAlbumModal.html` および `dist/index.html` に対する以下がアサーションされている：
     - 必須 ID（`form-edit-album`, `btn-add-edit-track`, `btn-footer-add-edit-track`, `btn-cancel-edit-album`, `btn-submit-edit-album`）の各 1 箇所のみ存在（単一 DOM 契約）。
     - `<form id="form-edit-album">` の `min-h-0`、フッターの `flex-col sm:flex-row` / `flex-shrink-0`、右ラッパーの `w-full sm:w-auto`、ヒントの `hidden lg:flex` / `min-w-0` / `truncate`。
     - 関連ボタンの `id`→`class` 順・`type="button"`・`min-h-[44px]`・`whitespace-nowrap`・`flex-shrink-0`（および `#btn-footer-add-edit-track` の `w-full sm:w-auto justify-center`）。
  2. VM サンドボックス上で、`bindEvents()` を含む初期化状態からの以下が検証されている：
     - `#btn-footer-add-edit-track` クリック相当の動作および `#btn-add-edit-track` クリック相当の動作で共に新規行が末尾追加（`cdNumber`・`trackNumber + 1` 継承、カウントバッジ・DOM 更新、`.edit-track-name` への `focus()` と `scrollIntoView()` 呼出）されること。
     - `isSaving === true` のとき `addEditTrackRow()`（およびクリックハンドラ）で行が増えないこと。
     - `handleSaveAlbumEdit()` 実行中に両追加ボタンと両保存ボタンが `disabled === true` になり、成功時・エラー例外時の双方で `finally` により `disabled === false` へ復帰すること。
     - `handleImageUpload(..., 'editAlbum')` 中も `#btn-add-edit-track` と `#btn-footer-add-edit-track` が `disabled === false` を維持すること。
- **対象ファイル**: `tests/run_tests.js`
- **依存関係**: TASK-001, TASK-002 完了後（`dist/index.html` 検査を含むため実行は TASK-005 のビルド後に行う）
- **受け入れ基準**:
  - 既存テスト（`[1]`〜`[16]`）のアサーションを一切弱体化・削除せず、`[17]` が追加されている。
- **検証方法**:
  - TASK-005 での `npm run build && npm test`（または `node tests/run_tests.js`）実行により全件 PASS を確認する。

---

### タスク [TASK-004]: `tests/red_team_attack_test.js` の 44px 個別検査強化・競合耐性テスト追加
- **ID**: TASK-004
- **目的**: `EditAlbumModal.html` における 44px タッチターゲット検証の抜け穴（ファイル全体検索）を塞ぎ、新設ボタンを含めた属性順・レイアウト保護・重複 ID 不在・保存競合ガードのセキュリティ／堅牢性検証を確立する。
- **入力**:
  - TASK-001, TASK-002 完了後の `src/EditAlbumModal.html`, `src/ScriptsApp.html`
  - 本計画書 1.2節・4.2節テスト方針
  - 現行 `tests/red_team_attack_test.js`（L1000-1058, L1889-1949 付近）
- **期待される結果**:
  1. `EditAlbumModal.html` 内の操作ボタン（L1009-1016 の既存6ボタン＋新設 `#btn-footer-add-edit-track` の計7ボタン。なお画像系2ボタン `#btn-edit-album-upload`・`#btn-edit-album-drive` は L1394-1395 にて既に個別要素検査済み）について、`<button[^>]*id=["']${id}["'][^>]*class=["']([^"']*)["']` により要素個別の `class` 属性から `min-h-[44px]`（正方形アイコンボタンは `min-w-[44px]` も）および `type="button"` を検証する検査へ強化・追加されている。
  2. フッター3ボタン（`btn-footer-add-edit-track`, `btn-cancel-edit-album`, `btn-submit-edit-album`）の `whitespace-nowrap` / `flex-shrink-0`、および `btn-footer-add-edit-track` の `w-full`・`sm:w-auto`・`justify-center` が検証されている。
  3. `dist/index.html` 上での `btn-add-edit-track` / `btn-footer-add-edit-track` 重複 ID 不在、および `ScriptsApp.html` の `addEditTrackRow()` `isSaving` ガード・`handleSaveAlbumEdit()` での追加ボタン `disabled` 同期・既存 `btnSubmit.disabled = true` / `btnMobileSubmit.disabled = true` 維持が検証されている。
- **対象ファイル**: `tests/red_team_attack_test.js`
- **依存関係**: TASK-001, TASK-002 完了後
- **受け入れ基準**:
  - 既存の Red Team 検査項目（L1004-1057, L1414-1434 等）がすべて維持され、新設ボタンと関連保護要件が厳格にチェックされている。
- **検証方法**:
  - TASK-005 での `npm run build && npm test`（または `node tests/red_team_attack_test.js`）実行により指摘ゼロ（Exit Code 0）を確認する。

---

### タスク [TASK-005]: `dist/index.html` 再ビルド・全自動テスト実行・代表幅帯での実描画幾何検証
- **ID**: TASK-005
- **目的**: SSOT ビルドにより `dist/index.html` を最新化し、全自動テストスイートの完全パスおよび全代表ブレークポイントでの実描画レイアウト・動作を検証して AC-001〜AC-007 の達成を確認する。
- **入力**:
  - TASK-001〜TASK-004 完了後の `src/` および `tests/` 一式
  - 本計画書 4.3節・4.4節の検証基準および上流設計書 AC-001〜AC-007
- **期待される結果**:
  1. `npm run build`（PowerShell 環境では `npm.cmd run build`）がエラーなく成功し、`dist/index.html` が再生成される。
  2. `npm test`（`tests/run_tests.js`, `tests/red_team_attack_test.js`, `tests/qa_comprehensive_verification.js`）および `node tests/qa_comprehensive_test.js` がすべて Exit Code 0（失敗 0件）でパスする。
  3. Headless ブラウザ等で代表幅帯（`320px`, `375px`, `430px`, `640px`, `767px`, `768px`, `1024px`, `1280px`, `1536px`）を開き、本計画書 4.4節の全実測チェック項目（スクロール外からの追加操作・2段/1行切替・ヒント切替・`>= 44px`・縦割れゼロ・重なりゼロ・水平溢れゼロ・新規行フォーカス＆自動スクロール）に不合格がないことを確認する（環境制約等で実ブラウザ計測が未実施となる場合は、未実施事項を偽らず明記して Phase 4 へ引き継ぐ）。
- **対象ファイル**: `dist/index.html`（自動生成物）
- **依存関係**: TASK-001, TASK-002, TASK-003, TASK-004 完了後
- **受け入れ基準**:
  - すべての自動テストが変更後の最新状態で実行され、全件 PASS が実測出力で確認されている。
  - AC-001〜AC-007 に対する検証結果が事実ベースで報告されている。
- **検証方法**:
  - `npm.cmd run build`
  - `npm.cmd test`
  - `node tests/qa_comprehensive_test.js`
  - （利用可能な環境にて）Headless ブラウザによる代表幅帯 DOM 幾何計測スクリプト実行
