# QA検証レポート: アルバム検索への MusicBrainz 結果マージ & 一括登録ボタン名称変更

- **文書バージョン**: 1.0.0
- **作成日**: 2026年10月18日
- **作成ロール**: QAエンジニア (`qa-engineer`)
- **参照設計書**: [`docs/architecture/musicbrainz_search_merge_design.md`](file:///e:/Antigravity/MusicInfo-app/docs/architecture/musicbrainz_search_merge_design.md)
- **参照計画書**: [`docs/planning/musicbrainz_search_merge_plan.md`](file:///e:/Antigravity/MusicInfo-app/docs/planning/musicbrainz_search_merge_plan.md)
- **参照報告書**: [`docs/reports/musicbrainz_search_merge_implementation_report.md`](file:///e:/Antigravity/MusicInfo-app/docs/reports/musicbrainz_search_merge_implementation_report.md)
- **成果物パス**: [`docs/qa/musicbrainz_search_merge_qa_report.md`](file:///e:/Antigravity/MusicInfo-app/docs/qa/musicbrainz_search_merge_qa_report.md)

---

## 1. 検証サマリー

### 1.1 テスト実施ステータス
- **実行済み**:
  - 単体テスト・統合テスト & VM構文検証: `node tests/run_tests.js` (**167件中 167件 PASS**)
  - レッドチーム破壊的テスト・脆弱性検証: `node tests/red_team_attack_test.js` (**159件中 159件 PASS**)
  - QAエンジニア包括的障害・境界値・動的DOM検証スイート: `node tests/qa_comprehensive_test.js` (**24件中 24件 PASS**)
    - `MusicBrainzService` MBID厳密検証（UUID境界長・アンダースコア・非文字列・パストラバーサル遮断）
    - Luceneクエリ構文インジェクション・制御文字サニタイズ検証
    - HTTP 404 / 500 / 503（1回限定リトライ回復・2回連続503での打ち切り） / 不正JSON応答時のエラーステータス検証
    - マルチメディア構成（CD/DVD/Blu-ray/Vinyl）・`recording` タイトル/クレジットフォールバック・`truncated` 検知検証
    - `MusicService.searchAlbums` の `UrlFetchApp.fetchAll` 並列実行・片側503リトライ・`fetchAll` 例外時の個別呼び出しフォールバック検証
    - 重複判定4条件のコーナーケース（記号のみタイトル `+` vs `＋` / `+` vs `=`、MB内複数版保持、`trackCount <= 0` 時の誤統合防止）検証
    - フロントエンド `App` 動的シミュレーション（片側失敗時の警告トースト表示、検索ボタン `disabled` 制御、XSSエスケープ描画、出典別Lookup API振り分け、部分日付 `YYYY`/`YYYY-MM` のアルバム編集時保護および意図的変更時の更新）
- **検査済み**:
  - バックエンド全変更ファイル（[`src/Config.js`](file:///e:/Antigravity/MusicInfo-app/src/Config.js), [`src/MusicBrainzService.js`](file:///e:/Antigravity/MusicInfo-app/src/MusicBrainzService.js), [`src/ItunesService.js`](file:///e:/Antigravity/MusicInfo-app/src/ItunesService.js), [`src/MusicService.js`](file:///e:/Antigravity/MusicInfo-app/src/MusicService.js), [`src/SheetService.js`](file:///e:/Antigravity/MusicInfo-app/src/SheetService.js), [`src/Code.js`](file:///e:/Antigravity/MusicInfo-app/src/Code.js)）のコード静的解析および障害モード洗い出し
  - フロントエンド全変更ファイル（[`src/Navbar.html`](file:///e:/Antigravity/MusicInfo-app/src/Navbar.html), [`src/ItunesModal.html`](file:///e:/Antigravity/MusicInfo-app/src/ItunesModal.html), [`src/ScriptsApiClient.html`](file:///e:/Antigravity/MusicInfo-app/src/ScriptsApiClient.html), [`src/ScriptsState.html`](file:///e:/Antigravity/MusicInfo-app/src/ScriptsState.html), [`src/ScriptsApp.html`](file:///e:/Antigravity/MusicInfo-app/src/ScriptsApp.html)）のイベント結線・DOM操作・XSS対策検査
  - ビルド成果物 [`src/index.html`](file:///e:/Antigravity/MusicInfo-app/src/index.html) のバンドル整合性・旧文言不在・インライン `onerror` 不在検査
  - [`README.md`](file:///e:/Antigravity/MusicInfo-app/README.md) のドキュメント整合性検査
- **推論済み**:
  - Google スプレッドシート実機における `dateRange.setNumberFormat('@')` 適用後の `setValues` による部分日付（`'2021-08'`, `'2021'`）の自動 `Date` 変換抑止（Google Apps Script Range API の仕様に基づく）
  - Cover Art Archive (`coverartarchive.org`) の `307 Temporary Redirect` に対する `UrlFetchApp.fetch`（デフォルト `followRedirects: true`）の追従動作
- **未検証**:
  - 実際の GAS デプロイ環境（Google 共有 IP プール）から MusicBrainz WS v2 への実通信における User-Agent 到達形式および HTTP 503 発生頻度（設計書 BLK-1 / BLK-2 / U-2：デプロイ後の実機確認対象）

### 1.2 総合評価
**【合格 (Signed Off)】**
- **理由**:
  「コードがどのように壊れ得るか」の観点から、変更対象の全14ファイル（バックエンド6、フロントエンド5、バンドル生成物1、ドキュメント1、テストスイート群）に対して徹底的なコード監査と計350件の自動テスト（単体167件 + レッドチーム159件 + QA包括24件）を実施した。
  その結果、Critical / High / Medium / Low のいずれの重大度においても未解決の不具合や脆弱性は検出されず、設計書の全受け入れ基準（AC-1〜AC-19）および全非機能要件（NFR-MB-POLICY-001, NFR-MB-RATE-001, NFR-SEC-001〜004, NFR-REL-001, NFR-COMPAT-001）に完全準拠していることを確認した。

---

## 2. 観点別テスト結果（12大検証項目）

| # | 検証項目 | 判定 | 検証内容・障害モード検証詳細 |
| :-: | :--- | :-: | :--- |
| 1 | **機能の正確性** | **合格** | iTunes + MusicBrainz 統合検索、出典バッジ表示、4条件厳格一致による重複排除、iTunes先頭＋MBスコア降順ソート、出典別Lookup振り分け、一括登録、ボタン・モーダル名称変更のすべてが仕様通り動作することを確認。 |
| 2 | **エッジケース** | **合格** | 記号のみのアルバム名（`+`, `=`, `＋`）、全角・半角・空白混在タイトル、部分日付（`YYYY`, `YYYY-MM`）、日付欠損、アナログ盤トラック番号（`"A1"`, `"B1"`）、複数メディア（CD+DVD/Blu-ray）、`track.title` 欠損時の `recording.title` / `Track N` フォールバック、カバーアート未登録（`front: false`）時の空文字処理をすべて検証。 |
| 3 | **境界条件** | **合格** | MBID UUID 36文字境界（35文字・37文字の拒絶）、アルバム名・アーティスト名・曲名255文字境界、`trackCount: 0` 時の誤統合抑止、HTTP 503 リトライ上限（最大1回＝計2リクエストで打ち切り）、連続リクエスト間隔 `1,100ms` 境界を検証。 |
| 4 | **無効な入力** | **合格** | 空文字・空白のみ・制御文字のみの検索キーワード、非UUID形式のMBID（数値、パストラバーサル `../../`、クエリ汚染 `?inc=...`、XSS文字列）、壊れたJSONレスポンス、空オブジェクト `{}` 混入配列に対してクラッシュせず適切に遮断またはスキップすることを確認。 |
| 5 | **エラー処理** | **合格** | 片側API失敗時（HTTP 500/503、ネットワーク例外、JSONパースエラー）に例外で全体を落とさず、成功側の結果返却＋`sources.<name>.ok = false`＋フロント警告トースト表示へ優雅に縮退（Graceful Degradation）することを確認。両側失敗時のみ `ALBUM_SEARCH_ALL_FAILED` を送出し検索ボタンを復帰させることを確認。 |
| 6 | **セキュリティ** | **合格** | ① XSS防止（NFR-SEC-001）: MB固有メタ情報（`format`, `country`, `label`, `disambiguation`）および `data-source`/`data-id` を含む全動的出力に `Utils.escapeHtml` が適用され、インライン `onerror` 属性は0件。② MBID検証（NFR-SEC-002）: UUID正規表現検証を通信前に実施しSSRF/パス改ざんを遮断。③ クエリインジェクション防止（NFR-SEC-003）: Lucene特殊文字エスケープ＋`dismax=true`＋`encodeURIComponent` の三重防御。④ 式インジェクション防止（NFR-SEC-004）: 保存・更新の全経路で `escapeFormula_` が適用済み。 |
| 7 | **並行性** | **合格** | 検索実行中の `#btn-itunes-search-submit` 無効化、一括保存・手動保存・アルバム編集時の `isSaving` フラグ排他制御、および `SheetService.updateAlbumBatch` の `LockService` 排他ロックを確認。 |
| 8 | **信頼性** | **合格** | `UrlFetchApp.fetchAll` 自体が例外を投げた場合の個別順次呼び出しへのフォールバック、`CacheService` 未定義/失敗時のインスタンス変数 `lastRequestTs_` へのフォールバック、CAAサムネイル404時の `img.onerror` → デフォルトSVGへの確実なフォールバックを確認。 |
| 9 | **パフォーマンス** | **合格** | `UrlFetchApp.fetchAll` による iTunes / MusicBrainz 並列リクエスト化により、直列呼び出しによる待ち時間加算を回避。一覧段階でのN+1 Lookupやサーバー側画像取得を行わない設計を遵守。 |
| 10 | **データ整合性** | **合格** | `SheetService.insertTracksBatch` / `updateAlbumBatch` におけるG列 `setNumberFormat('@')` 適用により、MBの部分日付（`2021-08`）が勝手に `2021-08-01` に変質することを防止。さらにアルバム編集モーダル（`<input type="date">`）で日付未変更のまま保存した際に元の部分日付が消失しない保護機構（`editingOriginalReleaseDate` / `editingReleaseDateChanged`）が正確に機能することを動的検証。 |
| 11 | **後方互換性** | **合格** | スプレッドシートの列構成（A〜H列）不変。`MusicService` コンストラクタ第5引数省略可能。既存RPC（`apiSearchItunes`, `apiLookupItunesAlbum`, `apiSaveAlbumBatch`）およびDOM ID（`modal-itunes` 等）を完全維持。 |
| 12 | **回帰リスク** | **合格** | 既存のiTunes検索・プレビュー・一括登録、手動1曲登録（連続登録含む）、アルバム一括編集、Google Drive画像公開URL正規化、横断検索、リリース日ソートの全既存テストが退行なく100%パスすることを確認。 |

---

## 3. 受け入れ基準（AC-1〜AC-19）および非機能要件 照合結果

### 3.1 受け入れ基準（AC-1〜AC-19）照合表

| ID | 受け入れ基準内容 | 検証区分 | 判定 | 根拠・検証証跡 |
| :--- | :--- | :---: | :-: | :--- |
| **AC-1** | キーワード検索で、iTunes と MB の結果が 1 つのリストに表示され、各項目に出典バッジが表示される | 実行済み | **合格** | `MusicService.searchAlbums` テストおよび `ScriptsApp.renderItunesResults` 動的テストで確認 |
| **AC-2** | 並び順が「iTunes（API 返却順）→ MB（score 降順、同点は元の順序）」である | 実行済み | **合格** | `run_tests.js` [4.1] `sortedMerged` 検証で順序維持・降順ソートを確認 |
| **AC-3** | ADR-004 の 4 条件をすべて満たす MB 項目は表示されず、1 条件でも異なれば表示される | 実行済み | **合格** | `run_tests.js` [4.1] ①〜⑥ および `qa_comprehensive_test.js` [6] で全境界条件を確認 |
| **AC-4** | 片側失敗時、成功側の結果のみ表示され、失敗した出典の警告トーストが出る | 実行済み | **合格** | `run_tests.js` [4.1] および `qa_comprehensive_test.js` [7] でサーバー応答と警告トースト発火を確認 |
| **AC-5** | 両方失敗時はエラートーストが表示され、モーダルは操作可能な状態に戻る | 実行済み | **合格** | `ALBUM_SEARCH_ALL_FAILED` 送出および `finally` での検索ボタン `disabled = false` 復帰を確認 |
| **AC-6** | MB 項目選択時、`media.position`・`track.position`・曲名・アーティストがプレビューに CD→トラック順で表示され、複数ディスクが正しく分離される | 実行済み | **合格** | `run_tests.js` [3.1]（Vinyl `"A1"` 対策・CD/DVD分離）および `qa_comprehensive_test.js` [5][7] で確認 |
| **AC-7** | MB 項目を一括登録すると A〜H 列に追加され、`front=true` 時は Drive 保存 URL、`false` 時は H 列空で登録成功する | 実行済み | **合格** | `run_tests.js` [3.1] および `red_team_attack_test.js` [6.3] で保存データ構造を確認 |
| **AC-8** | 不正な MBID で `apiLookupMusicBrainzRelease` を呼ぶと `VALIDATION_FAILED` となり外部呼び出しは行われない | 実行済み | **合格** | `run_tests.js` [3.1][4.1]・`red_team_attack_test.js` [6.1]・`qa_comprehensive_test.js` [5] で通信0回を確認 |
| **AC-9** | MB 由来の文字列に `<script>` 等を含むモックデータを与えてもエスケープ表示される | 実行済み | **合格** | `red_team_attack_test.js` [6.4] および `qa_comprehensive_test.js` [7] で `&lt;script&gt;` 変換を確認 |
| **AC-10** | MB 一覧サムネイルが 404 の場合、既定のジャケット SVG にフォールバックする（インライン `onerror` 属性を使わない） | 実行済み | **合格** | `run_tests.js` [9] でインライン `onerror` 0件、`ScriptsApp.html` L765-767 でプログラマティックバインドを確認 |
| **AC-11** | 機能スイッチで MB を無効化すると、検索結果が iTunes のみとなり、挙動が変更前と同等である | 実行済み | **合格** | `run_tests.js` [1][4.1] で `MUSICBRAINZ_ENABLED='false'` 時の MB スキップ（通信0回）を確認 |
| **AC-12** | 1 回の検索/プレビュー操作で MB へのリクエストは最大 2 回（初回＋503 時リトライ 1 回）、連続呼び出し時に 1 秒以上の間隔が確保される | 実行済み | **合格** | `run_tests.js` [3.1] および `qa_comprehensive_test.js` [5] で `attemptAlways503 === 2` と `sleep` 待機を確認 |
| **AC-13** | 全 MB リクエストに `User-Agent`（アプリ名・バージョン・連絡先を含む）が指定されている | 実行済み | **合格** | `run_tests.js` [3.1] で `MusicInfoApp/1.0 ( https://github.com/nankojin-ops/MusicInfo-app )` 付与を確認 |
| **AC-14** | iTunes 項目の選択・プレビュー・一括登録が変更前と同じ結果になる | 実行済み | **合格** | `run_tests.js` [3][4] および `qa_comprehensive_test.js` [4] で既存経路の完全互換を確認 |
| **AC-15** | `npm test`（`run_tests.js` + `red_team_attack_test.js`）が全件成功し、新規テストが追加されている | 実行済み | **合格** | `run_tests.js` (167件) + `red_team_attack_test.js` (159件) + `qa_comprehensive_test.js` (24件) 全件PASS |
| **AC-16** | ヘッダーボタンが PC「アルバム検索・一括登録」／SP「一括登録」に変わり、320px 幅で折り返し・はみ出ししない | 検査済み | **合格** | `Navbar.html` L48-49 で `hidden sm:inline` / `sm:hidden` による出し分けと短縮表記（4文字）を確認 |
| **AC-17** | モーダル見出し・ローディング文言・エラートーストが設計書 §3.5 のとおり更新されている | 実行済み | **合格** | `ItunesModal.html` L12-13, `ScriptsApp.html` L676-682, L789-791 の文言更新を確認 |
| **AC-18** | `npm run build` 実行後の `src/index.html` に新文言が反映され、旧文言が残っていない | 実行済み | **合格** | `run_tests.js` [9] で `src/index.html` 内の新文言存在および旧文言3種の完全不在を確認 |
| **AC-19** | `README.md` の機能説明・ファイル構成・手動配置ファイル一覧に MusicBrainz 連携と `MusicBrainzService.js` が反映されている | 検査済み | **合格** | `README.md` L14-22, L56, L113-116（全22ファイル）, L147-148 の記載を確認 |

### 3.2 非機能要件（NFR）照合表

| 要件ID | 要件名 | 判定 | 検証結果 |
| :--- | :--- | :-: | :--- |
| **NFR-MB-POLICY-001** | API 利用規約順守（UA付与） | **合格** | `MusicBrainzService.buildSearchRequest` および `lookupRelease` の全リクエストに連絡先URL入り `User-Agent` と `Accept: application/json` を付与。スクリプトプロパティでの上書きにも対応。 |
| **NFR-MB-RATE-001** | レート制限順守（1 req/秒以下） | **合格** | `CacheService` + インスタンス変数 + `Utilities.sleep` により前回リクエストから最低 `1,100ms` の間隔を強制。1検索＝1リクエスト、1プレビュー＝1リクエスト（N+1呼び出しなし）を厳守。 |
| **NFR-SEC-001** | XSS 防止 | **合格** | 全外部文字列に `Utils.escapeHtml` を適用。インライン `onerror` 属性は不使用。 |
| **NFR-SEC-002** | 入力検証（MBID / source） | **合格** | `isValidMbid` で UUID 形式（`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`）を厳格検証し、不正時は外部通信前に `VALIDATION_FAILED` を送出。 |
| **NFR-SEC-003** | クエリ構文インジェクション防止 | **合格** | `sanitizeSearchQuery` で制御文字除去＋Luceneメタ文字エスケープを行い、`dismax=true` と `encodeURIComponent` を併用。 |
| **NFR-SEC-004** | 式インジェクション防止 | **合格** | `MusicService` および `SheetService` で `escapeFormula_` により先頭 `=`, `@`, `+`, `-` を `'` プレフィックスで無害化。 |
| **NFR-REL-001** | 障害分離 | **合格** | MusicBrainz 側のエラー・タイムアウト・503レート制限発生時も iTunes 検索結果の表示および登録を一切阻害しない構造を確認。 |
| **NFR-COMPAT-001** | データ互換性 | **合格** | スプレッドシートの A〜H 列スキーマ（全8列）を完全維持。 |

---

## 4. 発見された不具合・課題一覧 (Issue票)

**検出された不具合: 0件**（Critical: 0, High: 0, Medium: 0, Low: 0）

> [!NOTE]
> **GAS デプロイ後の実機確認推奨事項（設計書 §1.7 BLK-1 / BLK-2 / U-2 対応）**
> ローカル Node.js 環境では Google Apps Script 固有の送信元 IP プールおよび `UrlFetchApp` の実通信ヘッダ挙動を再現できないため、`npm run push` による GAS デプロイ後に以下の4点を確認することを推奨します（万一 GAS 共有 IP 起因で MusicBrainz が 503 を返した場合でも、片側障害フォールバックにより iTunes 検索結果が表示され、スクリプトプロパティ `MUSICBRAINZ_ENABLED=false` で即時無効化できる安全設計となっています）。
> 1. **BLK-1**: Web App から検索を実行し、MusicBrainz の検索候補（アンバー色の `MusicBrainz` バッジ）が表示されること。
> 2. **BLK-2**: 数回検索を実行し、503 警告トーストが頻発しないこと。
> 3. **U-2**: カバーアートが存在する MusicBrainz 候補を一括登録し、Google Drive フォルダにジャケット画像が保存・表示されること。
> 4. **Q-5**: 部分日付（`YYYY` または `YYYY-MM`）の MusicBrainz 候補を一括登録し、スプレッドシート G 列で `YYYY-MM-01` に自動変換されず文字列として保持されること。

---

## 5. エスカレーション事項

- **エスカレーション事項**: **なし**（アーキテクチャ設計および実装計画に対する不整合・設計欠陥は認められないため、次工程のコードレビュアーによる最終監査へ進行可能）
