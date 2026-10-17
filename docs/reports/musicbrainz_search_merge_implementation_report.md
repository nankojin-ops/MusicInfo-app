# MusicBrainz API 検索結果マージおよび一括登録ボタン名称変更 — 実装完了レポート

- **作成日**: 2026-10-18
- **担当**: シニアコーダー (`senior-coder`)
- **準拠設計書**: [`docs/architecture/musicbrainz_search_merge_design.md`](file:///e:/Antigravity/MusicInfo-app/docs/architecture/musicbrainz_search_merge_design.md)
- **準拠実装計画書**: [`docs/planning/musicbrainz_search_merge_plan.md`](file:///e:/Antigravity/MusicInfo-app/docs/planning/musicbrainz_search_merge_plan.md)
- **ステータス**: 完了（全受け入れ基準 AC-1〜AC-18 達成・全自動テスト 341件 100% PASS）

---

## 1. 実装サマリー（タスク別完了報告）

### TASK-001: 設定管理の拡張（[`src/Config.js`](file:///e:/Antigravity/MusicInfo-app/src/Config.js)）
- スクリプトプロパティから `MUSICBRAINZ_USER_AGENT` および `MUSICBRAINZ_ENABLED`（`'false'` または `'0'` のとき無効、未設定時はデフォルト有効 `true`）を読み込むようコンストラクタを拡張しました。
- `getMusicBrainzUserAgent()` および `isMusicBrainzEnabled()` ゲッターメソッドを追加しました。
- `Config.CONSTANTS.MUSICBRAINZ` 定数ブロック（`RELEASE_ENDPOINT`, `COVER_ART_ENDPOINT`, `SEARCH_LIMIT`, `DEFAULT_USER_AGENT`, `MIN_INTERVAL_MS`, `RETRY_DELAY_MS`, `CACHE_KEY_LAST_REQ`）を定義しました。

### TASK-002: MusicBrainz API クライアントの新規実装（[`src/MusicBrainzService.js`](file:///e:/Antigravity/MusicInfo-app/src/MusicBrainzService.js)）
- `MusicBrainzService` クラスを新規作成し、以下の機能を実装しました。
  - **レート制限遵守（1 req/sec）**: `CacheService.getScriptCache()` と `Utilities.sleep()` を組み合わせた `enforceRateLimit_()` / `recordRequestTimestamp_()` により、直前リクエストから `1100ms` 未満の連続呼び出し時に自動待機します。
  - **HTTP 503 自動リトライ**: `executeWithRetryFromInitialResponse()` および `lookupRelease()` にて、HTTP 503 応答時に `1100ms` 待機後、最大1回自動リトライを行います。
  - **Lucene クエリサニタイズ**: `sanitizeSearchQuery(rawTerm)` にて Lucene 特殊記号（`+ - && || ! ( ) { } [ ] ^ " ~ * ? : \ /`）のエスケープ、空白正規化、最大100文字制限を実装しました。
  - **MBID 厳密検証**: `isValidMbid(mbid)` にて UUID v4 等 36文字ハイフン区切り16進数（`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`）を検証し、不正値を HTTP 通信前に遮断します。
  - **アーティストクレジット連結**: `formatArtistCredit(credits)` にて `name || artist.name` と `joinphrase` を連結して複数アーティスト表記を正確に復元します。
  - **Cover Art Archive 連携**: `cover-art-archive.front === true` の場合のみ `https://coverartarchive.org/release/{mbid}/front-250`（サムネイル）および `front-500`（保存用高解像度）の URL を生成します。
  - **Release Lookup**: `lookupRelease(mbid)` にてマルチメディア（CD + DVD/Blu-ray 等）の `cdNumber`・`mediumFormat`・`trackNumber`・`trackName`・`trackArtist` を抽出し、収録曲切り詰め検知フラグ `truncated` を算出します。

### TASK-003: iTunes API クライアントの並列リクエスト対応拡張（[`src/ItunesService.js`](file:///e:/Antigravity/MusicInfo-app/src/ItunesService.js)）
- 既存の `searchAlbums(term)` / `lookupAlbumSongs(collectionId)` の後方互換性を完全維持したまま、`UrlFetchApp.fetchAll()` 用のリクエスト記述子を生成する `buildSearchRequest(term)` と、`HTTPResponse` を `AlbumSearchItem[]`（`source: 'itunes'`, `sourceId: String(collectionId)` 付与）に変換する `parseSearchResponse(response)` を追加しました。

### TASK-004: 統合検索・重複排除・マージおよびシート書式保護（[`src/MusicService.js`](file:///e:/Antigravity/MusicInfo-app/src/MusicService.js), [`src/SheetService.js`](file:///e:/Antigravity/MusicInfo-app/src/SheetService.js)）
- [`src/MusicService.js`](file:///e:/Antigravity/MusicInfo-app/src/MusicService.js):
  - コンストラクタの第5引数にオプショナルな `musicBrainzService = null` を追加し、省略時も安全に動作するよう拡張しました。
  - `searchAlbums(keyword)`: `UrlFetchApp.fetchAll()` による iTunes / MusicBrainz 並列検索（フォールバック付き）、片系障害時の Graceful Degradation（成功側のみで結果返却＋`sources` ステータス通知）、両系失敗時の `ALBUM_SEARCH_ALL_FAILED` 送出を実装しました。
  - `mergeAlbumSearchResults(itunesAlbums, mbAlbums)` & `normalizeForComparison_(str)`: Unicode NFKC 正規化・小文字化・記号除去（記号のみタイトルは NFKC+小文字化文字列へフォールバック）を用いた4条件すべて一致時のみの厳密重複排除（iTunes 優先保持）と、iTunes ブロック先頭＋MusicBrainz ブロック `score` 降順ソートを実装しました。
  - `lookupMusicBrainzRelease(mbid)`: MBID 検証と `MusicBrainzService.lookupRelease(mbid)` の呼び出しを実装しました。
- [`src/SheetService.js`](file:///e:/Antigravity/MusicInfo-app/src/SheetService.js):
  - `insertTracksBatch()` および `updateAlbumBatch()` において、G列（リリース日列）の書き込み範囲に対し `dateRange.setNumberFormat('@')`（プレーンテキスト書式）を設定し、MusicBrainz 特有の部分日付（`YYYY` や `YYYY-MM`）が Google スプレッドシートの自動日付変換で変形しないよう保護しました。

### TASK-005: GAS 公開 RPC エンドポイントの追加（[`src/Code.js`](file:///e:/Antigravity/MusicInfo-app/src/Code.js)）
- `getMusicService()` で `MusicBrainzService` を生成・注入するよう更新しました。
- 新規公開 RPC 関数 `apiSearchAlbums(keyword)` および `apiLookupMusicBrainzRelease(mbid)` を追加し、`module.exports` にもエクスポートしました。
- 既存の `apiSearchItunesAlbums` / `apiLookupItunesAlbum` / `apiSaveAlbumBatch` のシグネチャと動作を完全維持しました。

### TASK-006: フロントエンド UI 文言変更・出典バッジ・Lookup 分岐（[`src/Navbar.html`](file:///e:/Antigravity/MusicInfo-app/src/Navbar.html), [`src/ItunesModal.html`](file:///e:/Antigravity/MusicInfo-app/src/ItunesModal.html), [`src/ScriptsApiClient.html`](file:///e:/Antigravity/MusicInfo-app/src/ScriptsApiClient.html), [`src/ScriptsState.html`](file:///e:/Antigravity/MusicInfo-app/src/ScriptsState.html), [`src/ScriptsApp.html`](file:///e:/Antigravity/MusicInfo-app/src/ScriptsApp.html)）
- **ボタン・モーダル名称変更**:
  - [`src/Navbar.html`](file:///e:/Antigravity/MusicInfo-app/src/Navbar.html): PC表示を `アルバム検索・一括登録`、スマホ表示を `一括登録`、`title` 属性を `iTunes / MusicBrainz からアルバムを検索して一括登録` に変更しました。
  - [`src/ItunesModal.html`](file:///e:/Antigravity/MusicInfo-app/src/ItunesModal.html): モーダルタイトルを `アルバムを検索して一括登録` に変更し、`iTunes / MusicBrainz` バッジを追加しました。
- **API クライアント・状態管理**:
  - [`src/ScriptsApiClient.html`](file:///e:/Antigravity/MusicInfo-app/src/ScriptsApiClient.html): `searchAlbums(keyword)` と `lookupMusicBrainzRelease(mbid)` を追加しました。
  - [`src/ScriptsState.html`](file:///e:/Antigravity/MusicInfo-app/src/ScriptsState.html): `searchSources: null` を初期状態に追加しました。
- **描画・操作フロー拡張（[`src/ScriptsApp.html`](file:///e:/Antigravity/MusicInfo-app/src/ScriptsApp.html)）**:
  - `executeItunesSearch()`: `ApiClient.searchAlbums(keyword)` を呼び出し、片系失敗時にはソフト警告トーストを表示しつつ検索結果を描画します。
  - `renderItunesResults()`: 各候補に `iTunes`（インディゴ色）または `MusicBrainz`（アンバー色）の出典バッジを表示し、MusicBrainz 候補にはフォーマット・国コード・枚数・レーベル・補足説明（`disambiguation`）をすべて `Utils.escapeHtml` でエスケープして表示します。また、検索結果サムネイルの `<img>` タグからインライン `onerror` 属性を撤廃し、`img.onerror = () => Utils.handleImageError(img)` によるプログラマティックバインドに統一しました。
  - `selectItunesAlbumForPreview(sourceId, source)`: `source === 'musicbrainz'` の場合は `ApiClient.lookupMusicBrainzRelease(sourceId)`、それ以外は `ApiClient.lookupItunesAlbum(sourceId)` に分岐し、プレビュー画面にメディア種別バッジ（`mediumFormat`）や `truncated` 警告バナーを表示します。
  - `openEditAlbumModal()` / `handleSaveAlbumEdit()`: `<input type="date">` に入らない部分日付（`YYYY` / `YYYY-MM`）を `originalReleaseDate` として保持し、日付欄が未変更のまま保存された場合に元の部分日付が消失しないよう保護しました。

### TASK-007: 単一ファイルバンドル再生成およびドキュメント更新（[`src/index.html`](file:///e:/Antigravity/MusicInfo-app/src/index.html), [`README.md`](file:///e:/Antigravity/MusicInfo-app/README.md)）
- [`README.md`](file:///e:/Antigravity/MusicInfo-app/README.md) に MusicBrainz / Cover Art Archive 統合検索仕様、スクリプトプロパティ（`MUSICBRAINZ_USER_AGENT`, `MUSICBRAINZ_ENABLED`）、および新しいボタン名称を記載しました。
- `node build.js` を実行し、[`src/index.html`](file:///e:/Antigravity/MusicInfo-app/src/index.html) を再生成しました。

### TASK-008: 単体テスト・統合テスト・レッドチーム検証の拡充（[`tests/run_tests.js`](file:///e:/Antigravity/MusicInfo-app/tests/run_tests.js), [`tests/red_team_attack_test.js`](file:///e:/Antigravity/MusicInfo-app/tests/red_team_attack_test.js)）
- [`tests/run_tests.js`](file:///e:/Antigravity/MusicInfo-app/tests/run_tests.js) に `Config`、`MusicBrainzService`、`MusicService`（4条件重複排除・ソート順・片系失敗フォールバック・機能スイッチ）、`SheetService`（G列 `'@'` 書式設定）、`Code.js`、UI 文言検証テストを追加しました。
- [`tests/red_team_attack_test.js`](file:///e:/Antigravity/MusicInfo-app/tests/red_team_attack_test.js) に MBID インジェクション耐性、Lucene クエリ構文インジェクション耐性、悪意ある MusicBrainz JSON ペイロード（XSS・数式インジェクション・空オブジェクト欠損）耐性、フロントエンド XSS 防御テストを追加しました。

---

## 2. 変更・新規作成ファイル一覧

| ファイルパス | 変更種別 | 主な変更内容 |
| :--- | :--- | :--- |
| [`src/Config.js`](file:///e:/Antigravity/MusicInfo-app/src/Config.js) | 変更 | `MUSICBRAINZ_USER_AGENT`, `MUSICBRAINZ_ENABLED` プロパティ読込・ゲッター・定数追加 |
| [`src/MusicBrainzService.js`](file:///e:/Antigravity/MusicInfo-app/src/MusicBrainzService.js) | 新規 | MusicBrainz API / Cover Art Archive クライアント（レート制限・503リトライ・Luceneエスケープ・MBID検証） |
| [`src/ItunesService.js`](file:///e:/Antigravity/MusicInfo-app/src/ItunesService.js) | 変更 | `buildSearchRequest`, `parseSearchResponse` 追加、`source: 'itunes'` 付与 |
| [`src/MusicService.js`](file:///e:/Antigravity/MusicInfo-app/src/MusicService.js) | 変更 | `searchAlbums`, `mergeAlbumSearchResults`, `normalizeForComparison_`, `lookupMusicBrainzRelease` 追加 |
| [`src/SheetService.js`](file:///e:/Antigravity/MusicInfo-app/src/SheetService.js) | 変更 | リリース日列（G列）への `setNumberFormat('@')` 設定追加 |
| [`src/Code.js`](file:///e:/Antigravity/MusicInfo-app/src/Code.js) | 変更 | `apiSearchAlbums`, `apiLookupMusicBrainzRelease` RPC エンドポイント追加 |
| [`src/Navbar.html`](file:///e:/Antigravity/MusicInfo-app/src/Navbar.html) | 変更 | ヘッダーボタン文言を `アルバム検索・一括登録`（PC）/ `一括登録`（SP）に変更 |
| [`src/ItunesModal.html`](file:///e:/Antigravity/MusicInfo-app/src/ItunesModal.html) | 変更 | モーダル見出しを `アルバムを検索して一括登録` に変更、出典表記バッジ追加 |
| [`src/ScriptsApiClient.html`](file:///e:/Antigravity/MusicInfo-app/src/ScriptsApiClient.html) | 変更 | `searchAlbums`, `lookupMusicBrainzRelease` RPC ラッパー追加 |
| [`src/ScriptsState.html`](file:///e:/Antigravity/MusicInfo-app/src/ScriptsState.html) | 変更 | `searchSources` 状態プロパティ追加 |
| [`src/ScriptsApp.html`](file:///e:/Antigravity/MusicInfo-app/src/ScriptsApp.html) | 変更 | 統合検索呼び出し、出典バッジ・MB補足情報描画、source別Lookup分岐、部分日付保護、インラインonerror排除 |
| [`src/index.html`](file:///e:/Antigravity/MusicInfo-app/src/index.html) | 再生成 | `node build.js` による単一ファイルバンドル更新 |
| [`README.md`](file:///e:/Antigravity/MusicInfo-app/README.md) | 変更 | MusicBrainz 統合検索仕様・スクリプトプロパティ・ボタン名称のドキュメント反映 |
| [`tests/run_tests.js`](file:///e:/Antigravity/MusicInfo-app/tests/run_tests.js) | 変更 | MusicBrainz・統合検索・重複排除・UI文言の単体テスト追加（計167件） |
| [`tests/red_team_attack_test.js`](file:///e:/Antigravity/MusicInfo-app/tests/red_team_attack_test.js) | 変更 | MBID/Lucene/JSON/XSS/数式インジェクション破壊的テスト追加（計159件） |

---

## 3. ビルドおよび自動テスト検証結果

### 3.1 実行コマンドと結果サマリー

| 検証項目 | 実行コマンド | 結果 | 詳細 |
| :--- | :--- | :--- | :--- |
| バンドルビルド | `node build.js` | **成功 (Exit 0)** | `src/index.html` 生成完了 |
| 単体・統合・構文テスト | `node tests/run_tests.js` | **167件 PASS / 0件 FAIL** | AC-1〜AC-18・VM構文解析すべて合格 |
| レッドチーム破壊的テスト | `node tests/red_team_attack_test.js` | **159件 PASS / 0件 FAIL** | 指摘・脆弱性 0件 |
| QA包括的回帰テスト | `node tests/qa_comprehensive_test.js` | **15件 PASS / 0件 FAIL** | 既存機能・回帰テストすべて合格 |

### 3.2 受け入れ基準（AC-1〜AC-18）達成状況
- **AC-1（統合検索）**: `MusicService.searchAlbums` が iTunes と MusicBrainz の両方を並列検索し統合配列を返却することを検証済み。
- **AC-2（表示順序）**: 先頭に iTunes 結果（API 返却順）、続けて MusicBrainz 結果（`score` 降順、同スコア時は元の順序維持）で整列されることを検証済み。
- **AC-3（厳密重複排除・4条件）**: 正規化タイトル一致時でもアーティスト不一致・トラック数不一致・リリース年不一致・両方年空文字のいずれかに該当する場合は別エントリとして両方を残し、4条件完全一致時のみ iTunes 側を優先保持することを検証済み。
- **AC-4 / AC-5（障害分離・全失敗エラー）**: 片系失敗時は成功側のみで結果を返却し、両方失敗時は `ALBUM_SEARCH_ALL_FAILED` を返すことを検証済み。
- **AC-6 / AC-7（出典バッジ・Lookup分岐）**: 検索結果カードに出典バッジと MusicBrainz 補足情報が表示され、`source` に応じて Lookup API が正しく分岐することを検証済み。
- **AC-8（マルチフォーマット・切り詰め警告）**: CD+DVD 等の複数メディアで `cdNumber` と `mediumFormat` が保持され、25曲超時の `truncated` 警告が機能することを検証済み。
- **AC-9 / AC-10（ジャケット画像・フォールバック）**: `cover-art-archive.front === true` 時の CAA URL 生成、`front === false` 時のデフォルト SVG 表示、およびインライン `onerror` ゼロを検証済み。
- **AC-11 / AC-12（機能スイッチ・レート制限・503リトライ）**: `MUSICBRAINZ_ENABLED=false` 時のスキップ動作、User-Agent ヘッダ付与、1100ms レート制限、HTTP 503 自動リトライを検証済み。
- **AC-13 / AC-14 / AC-15（クエリエスケープ・MBID検証・既存互換）**: Lucene 特殊文字エスケープ、不正 MBID の事前拒否、既存 RPC エンドポイントの完全互換を検証済み。
- **AC-16 / AC-17 / AC-18（UI名称変更・バンドル反映）**: ヘッダーボタン（PC: `アルバム検索・一括登録` / SP: `一括登録`）およびモーダル見出し（`アルバムを検索して一括登録`）の変更と、`src/index.html` への完全反映・旧文言残存ゼロを検証済み。

---

## 4. 計画からの逸脱・未解決事項

- **計画からの逸脱**: なし。アーキテクチャ設計書および実装計画書（`TASK-001`〜`TASK-008`）の通りに完全実装しました。
- **未解決の課題・技術的負債**: なし。
