# QA検証レポート: アルバムアート画像アップロード・Googleドライブ連携およびファイル命名規則統一

- **作成日**: 2026年10月19日
- **作成ロール**: QAエンジニア (`qa-engineer`)
- **対象機能**: アルバムアート画像アップロード・Googleドライブ連携およびファイル命名規則統一
- **入力資料**:
  - アーキテクチャ設計書: `docs/architecture/image_upload_feature_design.md`
  - 実装計画書: `docs/planning/image_upload_feature_plan.md`
  - 実装報告書: `docs/reports/image_upload_feature_implementation_report.md`
- **成果物パス**: `docs/qa/image_upload_feature_qa_report.md`

---

## 1. 検証サマリー

### 1.1 テスト実施ステータス区分
- **実行済み (Executed)**:
  - `node build.js` バンドルビルド実行（文字数: 158,805字、構文エラーなし）
  - `node tests/run_tests.js` 全209件の単体テストスイート実行（100% 成功）
  - `node tests/red_team_attack_test.js` 全202件のレッドチーム破壊的テスト実行（100% 成功）
  - 5MB容量制限の境界値テスト（5,242,880バイト合格 vs 5,242,881バイト遮断）の実証実行
  - サロゲートペア切断テスト（59文字境界での孤立サロゲート発生）の実証実行
  - MIME偽装テスト（DataURL `text/html` かつ引数 `image/jpeg` での保存バイパス）の実証実行
  - 特殊ファイル名（単一ドット `.`）のサニタイズテスト実行
- **検査済み (Inspected)**:
  - `DriveService.js` / `MusicService.js` / `Code.js` のバックエンドロジック・例外ハンドリング
  - `ScriptsUtils.html` / `ScriptsApiClient.html` のフロントエンド基盤処理
  - `DriveArtworkModal.html` / `EditAlbumModal.html` / `ManualModal.html` のDOM構造・アクセシビリティ（44pxターゲット）・Enter誤送信抑止
  - `ScriptsApp.html` のイベントリスナー登録および非同期処理・ボタンdisabled制御
- **推論済み (Inferred)**:
  - GAS実環境における `Utilities.formatDate(date, 'Asia/Tokyo', ...)` によるJSTタイムゾーン動作（`appsscript.json` のタイムゾーン設定準拠）
  - Google Drive実環境における `setSharing(ANYONE_WITH_LINK, VIEW)` による公開アクセス権限付与効果
- **未検証 (Unverified)**:
  - 実Google Apps Scriptクラウドデプロイ環境におけるブラウザ実機（iOS Safari / Android Chrome）からの実ファイルタップ操作

### 1.2 総合評価
**【要修正 (Action Required)】**

基本機能（新命名規則 `artwork_${name}_YYYYMMDDHHMM00.ext`、JST秒固定00、Google Drive複製、公開URL変換、既存テスト全411件PASS）は高い完成度で実装されています。
しかし、QAエンジニアによる批判的・破壊的検証の結果、**「MIME偽装バイパス脆弱性 (High)」** および **「アップロード中保存ボタン非活性化漏れによる競合状態 (Medium)」** を含む4件の不具合・改善課題が確認されました。これらをシニアコーダーにて修正することを推奨します。

---

## 2. 観点別テスト結果（12大検証項目）

| # | 検証観点 | 評価 | 概要・検証結果 |
| :-: | :--- | :-: | :--- |
| **1** | **機能の正確性** | **一部要修正** | 新命名規則（`artwork_${name}_YYYYMMDDHHMM00.ext`）、JST秒固定00、Google Drive複製、公開URL（`lh3.googleusercontent.com`）生成、iTunes画像保存の命名統一は正確に機能。ただしMIME判定優先順位に不備あり (BUG-001)。 |
| **2** | **エッジケース** | **要修正** | 空白文字、制御文字、特殊記号、アンダースコア連続は適切にサニタイズされて `album` にフォールバック。ただし、絵文字等のサロゲートペアが60文字境界で切り落とされると孤立サロゲートが発生する (BUG-003)。 |
| **3** | **境界条件** | **合格** | 5.0MB境界値検証において、5MBちょうど（5,242,880バイト）は許可、5MB+1バイト（5,242,881バイト）は `VALIDATION_FAILED` で確実に遮断されることを実証。 |
| **4** | **無効な入力** | **要修正** | 不正なDrive URL/ID、巨大文字列、型汚染（`null`, `undefined`, 数値, 配列）はすべて拒絶。しかし、DataURLヘッダのMIMEタイプと引数MIMEタイプの食い違い時にDataURL側が検証されない問題を確認 (BUG-001)。 |
| **5** | **エラー処理** | **合格** | Driveアクセス不可時の `DRIVE_ACCESS_DENIED` 送出、コピー失敗時のGraceful Degradation（元ファイル公開URLフォールバック）、UIエラートースト通知、スピナー解除、入力データ保持が正常に機能。 |
| **6** | **セキュリティ** | **一部要修正** | スプレッドシート数式インジェクション対策（ファイル名記号置換および `escapeFormula_` による先頭シングルクォート付与）、パストラバーサル防止、XSS防止、Enterキー誤送信抑止は合格。BUG-001のMIME偽装修正が必要。 |
| **7** | **並行性・排他制御** | **要修正** | アップロードボタン自体の二重クリックは防止されているが、画像アップロード非同期処理中にモーダル親フォームの「保存」「登録する」ボタンが非活性化されておらず、競合状態が発生する (BUG-002)。 |
| **8** | **信頼性・耐障害性** | **合格** | アップロードやDrive解決に失敗した場合でも、入力済みのアルバム名・アーティスト名・収録曲リストが消失せず、再試行が可能。 |
| **9** | **パフォーマンス** | **合格** | 5MB制限によりBase64サイズは約6.7MBとなり、GAS RPC制限（50MB）に対し十分安全。クライアント側での事前サイズ検証により無駄な通信を防止。 |
| **10** | **データ整合性** | **合格** | 公開URL `https://lh3.googleusercontent.com/d/{fileId}` はサードパーティCookie不要で永続配信可能。画像エラー時の3段階フォールバック（lh3 → thumbnail → default SVG）が機能。 |
| **11** | **後方互換性** | **合格** | 既存テキストボックス（`#edit-album-artwork-url`, `#manual-artwork-url`）への直接URL入力および `ensurePublicArtwork` による公開正規化が引き続き完全に動作。 |
| **12** | **回帰リスク** | **合格** | 既存テスト159件を含む全411件のテストスイート（単体テスト209件＋レッドチームテスト202件）が100%成功。アルバム編集、手動登録、検索統合にデグレードなし。 |

---

## 3. 発見された不具合・課題一覧 (Issue票)

### [BUG-001]: DataURLヘッダと引数mimeTypeの優先順位乖離によるMIME偽装バイパス脆弱性
- **重大度**: **High**
- **関連要件/受け入れ基準**: FR-IMG-001, NFR-SEC-001, AC-002-4
- **検証ステータス**: **実行済み**（スクラッチ検証スクリプトにて再現実証）
- **再現手順**:
  1. `saveUploadedArtwork` または `apiUploadArtwork` を呼び出す。
  2. `base64Data` に `data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==`（HTMLスクリプト）を指定する。
  3. `mimeType` 引数に許可された `'image/jpeg'` を指定する。
- **期待される動作**:
  DataURLプレフィックスで指定された `text/html` が検知され、非許可MIMEタイプとして `VALIDATION_FAILED` 例外が送出されること。または引数 `mimeType` と DataURLヘッダのMIMEタイプが食い違っている場合は不整合として拒絶されること。
- **実際の動作**:
  `DriveService.js` 221行目において `detectedMime = detectedMime || dataUrlMatch[1].trim().toLowerCase();` となっており、既に `mimeType` 引数（`image/jpeg`）が代入されているため、DataURLヘッダの `text/html` が無視され、HTMLデータが `.jpg` 拡張子の画像としてGoogle Driveに保存・公開されてしまう。
- **証拠・ログ**:
  ```
  VULNERABILITY DETECTED: DataURL text/html was saved as: artwork_TestAlbum_20261019211100.jpg
  DISCREPANCY RESULT: PNG data saved with extension: artwork_TestAlbum_20261019211100.jpg
  ```
- **考えられる原因**: (実装起因)
  `DriveService.saveUploadedArtwork` において、`detectedMime` のフォールバック順序が引数優先になっているため。
- **推奨される次の対応**: (シニアコーダー修正)
  `dataUrlMatch` が存在する場合は、DataURLヘッダのMIMEタイプを最優先とする（`detectedMime = dataUrlMatch[1].trim().toLowerCase();`）、あるいは引数 `mimeType` と DataURL のMIMEが異なる場合に `VALIDATION_FAILED` を送出するよう修正する。

---

### [BUG-002]: ローカル画像アップロード実行中の親フォーム「保存」「登録」ボタン非活性化漏れによる競合状態 (Race Condition)
- **重大度**: **Medium**
- **関連要件/受け入れ基準**: NFR-PERF-002, ADR-IMG-002, 5.3 信頼性と耐障害性
- **検証ステータス**: **検査済み**（コード静的解析により確認）
- **再現手順**:
  1. アルバム編集モーダル（または楽曲手動登録モーダル）を開く。
  2. 「ローカルから選択」ボタンを押し、数MBの画像ファイルを選択する。
  3. 即時プレビューが表示され、バックエンドへのアップロード通信（`apiUploadArtwork`）が開始される。
  4. アップロード完了通知が返る前の数秒間に、モーダル上部または下部の「保存（登録する）」ボタン（`btn-submit-edit-album`, `btn-mobile-submit-edit-album`, `btn-submit-manual-track`）を押下する。
- **期待される動作**:
  アップロード処理中は保存ボタンおよびDrive追加ボタンが `disabled` 化され、誤って未反映の古いURL（または空文字）でアルバム情報が上書き保存されないこと。
- **実際の動作**:
  `ScriptsApp.html` の `handleImageUpload` では `uploadBtn`（「ローカルから選択」ボタン）のみが `disabled` 化されており、親モーダルの「保存」「登録する」ボタンおよび「Driveから追加」ボタンは活性状態のままである。そのため、通信中にユーザーが保存を押下すると、新しい画像URLがスプレッドシートに反映されずに保存処理が先行してしまう競合状態が発生する。
- **証拠・コード箇所**:
  `src/ScriptsApp.html` 1550〜1553行目:
  ```javascript
  // アップロード中UI制御 (二重操作抑止)
  if (uploadBtn) uploadBtn.disabled = true;
  if (spinner) spinner.classList.remove('hidden');
  // ※ 保存ボタン (btnSubmitEdit, btnMobileSubmitEdit, btnSubmitManual) の制御が存在しない
  ```
- **考えられる原因**: (実装起因)
  アップロードボタン単体の排他制御のみを実装し、親モーダルのフォーム送信ボタンの非活性化制御が漏れていた。
- **推奨される次の対応**: (シニアコーダー修正)
  `handleImageUpload` の開始時にモーダルの保存ボタン群（`#btn-submit-edit-album`, `#btn-mobile-submit-edit-album`, `#btn-submit-manual-track`）および Drive追加ボタンを `disabled` 化し、`finally` ブロックで復帰させる。

---

### [BUG-003]: 長大マルチバイト（絵文字・異体字）アルバム名切断時の孤立サロゲート（Malformed UTF-16）発生リスク
- **重大度**: **Medium**
- **関連要件/受け入れ基準**: FR-IMG-003, ADR-IMG-001, AC-001-2
- **検証ステータス**: **実行済み**（スクラッチ検証スクリプトにて再現実証）
- **再現手順**:
  1. アルバム名として 59文字の半角英数 ＋ 絵文字（例: `A...A🍣`）を指定する。
  2. `DriveService.sanitizeFileName(name)` を実行する。
- **期待される動作**:
  生成されたファイル名文字列が完全なUnicode文字列（`isWellFormed() === true`）であること。
- **実際の動作**:
  `cleaned.substring(0, 60)` により、サロゲートペアの1コード単位（上位サロゲート `\uD83C`）のみが残存し、末尾が孤立サロゲートとなる。その結果、文字列が Malformed Unicode（`isWellFormed() === false`）となり、環境によっては文字化けやシリアライズエラーを誘発するリスクがある。
- **証拠・ログ**:
  ```
  surrogateCut length: 60 ends with code: d83c
  is well formed: false
  ```
- **考えられる原因**: (実装起因)
  JavaScriptの `substring` がコード単位（UTF-16 code units）で切断するため、サロゲートペア境界が考慮されていない。
- **推奨される次の対応**: (シニアコーダー修正)
  `sanitizeFileName` において、末尾が上位サロゲート（`[\uD800-\uDBFF]$`）である場合にそれを除去する処理を追加する（例: `.replace(/[\uD800-\uDBFF]$/, '')`）。

---

### [BUG-004]: アルバム名が単一ドット "." の場合のファイル名生成
- **重大度**: **Low**
- **関連要件/受け入れ基準**: FR-IMG-003, AC-001-3
- **検証ステータス**: **実行済み**（スクラッチ検証スクリプトにて確認）
- **再現手順**:
  1. アルバム名に `"."` のみを指定して `generateArtworkFileName('.', 'jpg')` を実行する。
- **期待される動作**:
  空文字や記号のみの入力と同様に、安全なフォールバック `'album'` が適用され、`artwork_album_YYYYMMDDHHMM00.jpg` となること。
- **実際の動作**:
  `cleaned` が `.` のまま残り、`artwork_._YYYYMMDDHHMM00.jpg` が生成される。
- **考えられる原因**: (実装起因)
  `replace(/\.\.+/g, '_')` では2個以上の連続ドットはアンダースコアに置換されるが、単一ドット `.` は置換対象に含まれていない。
- **推奨される次の対応**: (シニアコーダー修正)
  サニタイズ後の文字列が単一ドット `.` の場合も `'album'` にフォールバックするよう微修正する。

---

## 4. エスカレーション事項

### アーキテクト・テックリードへのエスカレーション
- **アーキテクチャ・設計上の変更要否**: **不要 (No escalation required)**
  上流のシステムアーキテクチャ設計（ADR-IMG-001〜004）および実装計画自体に破綻はありません。
  今回発見された4件のIssue（BUG-001〜BUG-004）は、いずれも実装レベルでのガードロジック・排他制御の強化によって完全に解消可能です。

### 次の推奨アクション
- **シニアコーダー (`senior-coder`)**:
  - `src/DriveService.js`:
    - BUG-001: DataURLのMIMEタイプを最優先とする（DataURLと引数の食い違いを検知・正規化）
    - BUG-003: 60文字切り詰め後の孤立サロゲート除去（`replace(/[\uD800-\uDBFF]$/, '')`）
    - BUG-004: 単一ドット `.` のサニタイズ（`album` フォールバック）
  - `src/ScriptsApp.html`:
    - BUG-002: `handleImageUpload` 実行時の保存ボタン（`btnSubmitEdit`, `btnMobileSubmitEdit`, `btnSubmitManual`）およびDrive追加ボタンの `disabled` / 活性化制御の追加
  - `build.js` 再ビルドおよびテストスイート実行。
- 修正完了後、QAエンジニアによるリテストを実施。
