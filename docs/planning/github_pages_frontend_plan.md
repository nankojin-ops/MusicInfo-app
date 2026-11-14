# 実装計画・タスク仕様書: フロントエンドの GitHub Pages リリース対応

- **文書バージョン**: 1.0.0
- **作成日**: 2026年11月14日
- **作成ロール**: テックリード (`tech-lead`)
- **上流設計書**: `docs/architecture/github_pages_frontend_design.md` (v2.0.0 Gate 1 確定版)
- **成果物パス**: `docs/planning/github_pages_frontend_plan.md`

---

## 1. アーキテクチャレビュー所見

### 1.1 実現可能性評価: 【高い (Feasible)】
確定アーキテクチャ設計書（`docs/architecture/github_pages_frontend_design.md` v2.0.0）を現行コードベース（`build.js`, `src/`, `tests/`, `.gitignore`, `.claspignore`, `package.json`）と照合・批判的に検証した結果、全要件（FR-GH-001〜006, NFR-GH-*, AC-GH-001〜006）は既存構造と整合しつつ実装可能であると評価する。

1. **ハイブリッド起動＋トランスポート抽象化の妥当性 (ADR-001)**:
   - `ScriptsApiClient.html` の `ApiClient` が既に 11 個の明確な Promise 返却メソッド（`getAllData` 〜 `deleteAlbumsBatch`）へ集約されているため、`HttpJsonTransport` と `LocalDemoTransport` の 2 アダプタ構成へ置換しても `ScriptsApp.html` の業務・描画ロジック（約 2,486 行）への侵襲を最小限に抑えられる。
   - GAS Web App が `OPTIONS` プリフライトに対応できない制約に対し、`ANYONE_ANONYMOUS` + CORS 単純リクエスト（`POST`, `Content-Type: text/plain;charset=utf-8`, `credentials: 'omit'`, ボディ内 JSON トークン）を採用した判断は適切である。
2. **`dist/` 一本化と GAS API 専用化の妥当性 (ADR-002)**:
   - `src/Code.js` の業務ロジックは `MusicService` 以下に完全分離されており、`doGet(e)` の `HtmlService` 返却と `include()` を廃止して JSON API 専用（`doGet` ヘルスチェック + `doPost` ディスパッチャ）に再編する構成は極めてクリーンである。
3. **GitHub Actions 自動デプロイ構成の妥当性 (ADR-003)**:
   - 既存の `build.js` および `tests/run_tests.js` / `tests/red_team_attack_test.js` はすべて Node.js 標準モジュール（`fs`, `path`, `vm`, `assert`）のみで動作するため、`.gitignore` で `package-lock.json` が除外されている前提でも、`actions/setup-node` のみで CI を安定稼働できる。

---

### 1.2 留意事項・技術リスクと対策

上流設計書と現行コードのギャップおよび実装上の落とし穴を精査した結果、以下の 8 点を実装計画上の重要対策事項として定義する：

1. **`build.js` の `module.exports` 除去正規表現のネスト `{}` 破損リスク**:
   - **【事実】** 現行の `build.js`（L221）は `content.replace(/if\s*\(typeof module\s*!==\s*['"]undefined['"]\s*&&\s*module\.exports\)\s*\{[\s\S]*?\}/g, '')` となっている。
   - **リスク**: `[\s\S]*?` が最短一致のため、`ScriptsApiClient.html` 内で複数クラスを `module.exports = { ApiClient, HttpJsonTransport, LocalDemoTransport };` のようにオブジェクトリテラルでエクスポートすると、内側の `}` で一致が終了し、外側の `}` が `dist/index.html` に残留して **`SyntaxError`** を引き起こす。
   - **対策**: `build.js` の `module.exports` ガード除去処理を、ブレース深度をカウントする安全なブロック除去ヘルパーに改善し、さらに `ScriptsApiClient.html` 側もネスト波括弧を避けたエクスポート形式（または安全除去を前提とした明確な末尾ガード）に統一する。また `build.js` L14-23 の `src/index.html` フォールバック生成処理は廃止し、`index.template.html` 不在時は即座にエラー終了する仕様に改める。
2. **`build.js` の `stripComments()` におけるテンプレートリテラル内 `${...}` 制約**:
   - **【事実】** `build.js` の `stripComments()`（L57-196）はテンプレートリテラル内で `${...}` への状態遷移を持たないため、`` `...` `` 内の文字はすべて文字列として素通しされる。
   - **対策**: 既存スクリプト同様にフロントエンド JS 内のテンプレートリテラル `${...}` 式内部には `//` や `/*` コメントを含めない規約とする。
3. **`src/index.html` の Git 追跡解除と `.claspignore` / `.gitignore` の同期**:
   - **【事実】** 現在 `src/index.html` は Git 管理下（`git ls-files src/index.html` で確認済み）にあり、`.claspignore` は `src/index.template.html` のみを除外している。
   - **対策**: `src/index.html` をリポジトリから削除（`git rm` 相当）し、`.gitignore` に `dist/`（および再生成防止として `src/index.html`）を追加、`.claspignore` に `dist/**`, `.github/**`, `src/*.html` を追加して GAS へバックエンド `.js` と `appsscript.json` のみがアップロードされるようにする。
4. **`src/index.template.html` の `<base target="_top">` 削除と GitHub Pages サブパス配信互換性**:
   - **【事実】** 現行 `src/index.template.html` L4 に GAS iframe 用の `<base target="_top">` が存在する。また GitHub Pages 公開 URL は `https://<user>.github.io/MusicInfo-app/` のようなサブパス配下になる。
   - **対策**: `<base target="_top">` を削除し、ルート `/favicon.ico` への 404 リクエスト抑止のためインライン SVG Data URI の `<link rel="icon">` を `<head>` に配置する。静的バンドル自体は単一 `dist/index.html` 完結のためサブパス依存はなく、相対パス問題は発生しない。
5. **`doPost(e)` の引数展開とプロトタイプ汚染／不正型防御**:
   - **【事実】** 既存 `Code.js` の 11 個の `api*` 関数のうち 4 つ（`apiSearchAlbums`, `apiSearchItunes`, `apiLookupItunesAlbum`, `apiLookupMusicBrainzRelease`）はプリミティブ引数（`keyword`, `collectionId`, `mbid`）を直接受け取り、残り 7 つは引数なしまたはオブジェクト引数を受け取る（特に `ApiClient.deleteAlbumsBatch(albums)` は配列を受け取って `{ albums }` に変換している）。
   - **対策**: HTTP JSON API の `payload` は原則オブジェクト（`getAllData` は `null`/省略）で統一しつつ、`doPost(e)` のディスパッチャで `action` ごとに引数を厳密抽出する。この際、配列や空オブジェクトが `String({})` -> `"[object Object]"` として誤検索される事故を防ぐ抽出規則を適用し、さらに `action` のルックアップには `Object.prototype.hasOwnProperty.call` を必須として `"toString"` や `"constructor"` 等のプロトタイプ参照攻撃を完全に遮断する。
6. **GAS Web App URL バリデーションと Google Workspace 独自ドメイン形式**:
   - **留意事項**: 上流設計書 §3.2 D では `https://script.google.com/macros/s/.../exec` 形式が例示されているが、Google Workspace アカウントで発行される GAS Web App URL は `https://script.google.com/a/macros/<domain>/s/<deploymentId>/exec` 形式となる場合がある。
   - **対策**: URL バリデーションでは `https://script.google.com/macros/s/<id>/exec` に加え `https://script.google.com/a/macros/<domain>/s/<id>/exec` も正規形式として許可し、一方で `/dev`（開発用 URL）、`http://`、および外部任意ドメインへのトークン送信は厳格に拒否する。
7. **GAS 未認証設定ミス（HTML ログイン画面返却）時のエラー診断性**:
   - **リスク**: GAS デプロイの「アクセスできるユーザー」が `ANYONE`（Google ログイン必須）のままだった場合、`fetch()` がログインページの HTML を返し `response.json()` が `SyntaxError` となる。
   - **対策**: `HttpJsonTransport` で非 JSON レスポンス（HTML 等）を受信した場合、「GAS Web App のデプロイ設定で『アクセスできるユーザー』が『全員（匿名含む）』になっているか確認してください」という具体的な診断メッセージを返却する。
8. **GitHub Actions 上での `build` → `test` 実行順序**:
   - **重要制約**: `dist/` は `.gitignore` で除外されるため、CI チェックアウト直後には `dist/index.html` が存在しない。`tests/run_tests.js` はビルド済み `dist/index.html` を検証するため、ワークフローでは **必ず `npm run build` の後に `npm test` を実行** する（`package.json` の `prepush` と同一順序）。また `npm ci` は `package-lock.json` 不在のため使用しない。

---

### 1.3 アーキテクチャへのエスカレーション有無: 【エスカレーション不要】
上記の留意事項・対策はいずれも上流設計書の決定事項（DEC-001〜004, ADR-001〜003, NFR-GH-*）の枠内で解決可能であり、アーキテクチャの再設計・エスカレーションは不要である。

---

## 2. 影響範囲・変更対象ファイル一覧

### 2.1 変更・新規作成・削除ファイル一覧

| レイヤー | 対象ファイル | 変更種別 | 変更概要 |
| :--- | :--- | :---: | :--- |
| **Build System** | `build.js` | 修正 | - 出力先を `src/index.html` から `dist/index.html` + `dist/.nojekyll` へ変更<br>- `src/index.html` からのテンプレート生成フォールバックを廃止<br>- `htmlIncludes` に `'ConnectionModal'` を追加<br>- `module.exports` ガード除去をネスト波括弧対応に強化 |
| **Template / Head** | `src/index.template.html` | 修正 | - `<base target="_top">` を削除<br>- インライン SVG Data URI による `<link rel="icon">` を追加<br>- `<?!= include('ConnectionModal'); ?>` を追加 |
| **Generated Artifact** | `src/index.html` | **削除** | - Git 管理および `src/` 配下から削除（出力先 `dist/index.html` 一本化） |
| **Git / Clasp Config** | `.gitignore` | 修正 | - `dist/` および `src/index.html` を追加 |
| **Git / Clasp Config** | `.claspignore` | 修正 | - `dist/**`, `.github/**`, `src/*.html` を追加（GAS へ `.js` と `appsscript.json` のみ送信） |
| **GAS Manifest** | `src/appsscript.json` | 修正 | - `webapp.access` を `"ANYONE"` から `"ANYONE_ANONYMOUS"` へ変更 |
| **GAS Config** | `src/Config.js` | 修正 | - `API_TOKEN` の読み込み・`getApiToken()` / `hasApiToken()` の追加<br>- HTML 配信廃止に伴う `allowEmbedding` / `isEmbeddingAllowed()` の削除整理 |
| **GAS Entrypoint** | `src/Code.js` | 修正 | - `doGet(e)` の `HtmlService` 配信を廃止し、API ヘルスチェック JSON 返却へ変更<br>- `include(filename)` 関数を削除<br>- `doPost(e)`（サイズ上限検証・JSON検証・定数時間トークン認証・11アクションディスパッチャ）および `createJsonResponse_()` / `constantTimeEqual_()` を追加<br>- `module.exports` を新公開関数に整合更新 |
| **Frontend Client** | `src/ScriptsApiClient.html` | 修正 | - `google.script.run` 呼び出しを廃止<br>- `ConnectionConfigStore`, `HttpJsonTransport`, `LocalDemoTransport` を実装し、`ApiClient` 11 メソッドのインターフェース互換を維持 |
| **Frontend UI** | `src/Navbar.html` | 修正 | - 動作モードバッジ（デモ/ローカル vs GAS連携中）兼「接続設定」ボタン（`#btn-open-connection-modal`）を追加（WCAG 44px・320px 幅対応）<br>- `#btn-reload-data` のツールチップ文言調整 |
| **Frontend Modal** | `src/ConnectionModal.html` | **新規作成** | - GAS Web App URL・`API_TOKEN` 設定、パスワード表示トグル、接続テスト、保存して切替、ローカルモードへリセット、デモデータ初期化、共有端末警告、Enter 誤送信抑止、WCAG 44px ボタンを備えた接続設定モーダル |
| **Frontend Controller** | `src/ScriptsApp.html` | 修正 | - 接続設定モーダル開閉・接続テスト・設定保存・設定リセット・デモ初期化イベント追加<br>- `loadInitialData()` のモード対応（認証/通信エラー時の接続設定誘導、`LOCAL_MODE_UNSUPPORTED` 時の案内表示）<br>- モード切替時の `Store` 選択状態リセットと完全再描画<br>- `Escape` キーでのモーダルクローズ対象追加 |
| **CI/CD** | `.github/workflows/deploy-pages.yml` | **新規作成** | - `main` プッシュ / `workflow_dispatch` で `npm run build` -> `npm test` -> `actions/upload-pages-artifact` (`./dist`) -> `actions/deploy-pages` を実行 |
| **Unit & Integration Test** | `tests/run_tests.js` | 修正 | - `src/index.html` 参照を `dist/index.html` へ移行<br>- セクション `[8.1]`, `[12.1]`, `[12.2]` を新仕様（`doPost`, `API_TOKEN`, JSON `doGet`）へ更新<br>- `doPost`・`LocalDemoTransport`・`HttpJsonTransport`・`ApiClient`・`ConnectionModal` の単体/結合テストを追加 |
| **Security / Red Team Test** | `tests/red_team_attack_test.js` | 修正 | - `doPost`（トークン偽装・未設定・プロトタイプ汚染・サイズ超過・認証失敗時の非DBアクセス）、`HttpJsonTransport` URL 検証、`LocalDemoTransport` 破損/XSS、`ConnectionModal` 44px & Enter抑止、`dist/index.html` 機密非混入の攻撃テストを追加 |
| **Auxiliary QA Test** | `tests/qa_comprehensive_verification.js` | 修正 | - L41-76 の `isEmbeddingAllowed()` テストを `Config.hasApiToken()` / `getApiToken()` 検証へ整合更新 |
| **Documentation** | `README.md` | 修正 | - GitHub Pages 公開版 + GAS API バックエンド構成に合わせたディレクトリ図・セットアップ手順・デプロイ手順・テスト手順の更新 |

### 2.2 無変更ファイル（既存再利用）
- `src/SheetService.js`, `src/DriveService.js`, `src/ItunesService.js`, `src/MusicBrainzService.js`, `src/MusicService.js`: バックエンド業務ロジックは変更不要。
- `src/Styles.html`, `src/ArtistList.html`, `src/AlbumList.html`, `src/TrackDetail.html`, `src/ItunesModal.html`, `src/ManualModal.html`, `src/EditAlbumModal.html`, `src/ImageModal.html`, `src/DriveArtworkModal.html`, `src/DeleteConfirmModal.html`, `src/ScriptsUtils.html`, `src/ScriptsState.html`: 既存 UI および `Store` / `Utils` は原則変更不要（`Utils` の `escapeHtml` / `resizeImage` / `validateImageFile` をそのまま再利用）。
- `package.json`: `build`, `test`, `prepush` スクリプト定義は新構成とそのまま整合するため変更不要。

### 2.3 依存関係・後方互換性への考慮事項
1. **GAS 直接アクセスの仕様変更（意図的破壊変更・DEC-003 確定事項）**:
   - GAS の `/exec` URL へブラウザで直接 GET アクセスした際は HTML 画面ではなくヘルスチェック JSON が返却される。
2. **GAS スクリプトプロパティの後方互換性**:
   - 既存プロパティ（`SPREADSHEET_ID`, `DRIVE_FOLDER_ID`, `SHEET_NAME`, `MUSICBRAINZ_USER_AGENT`, `MUSICBRAINZ_ENABLED`）の仕様は一切変更しない。
   - `ALLOW_EMBEDDING` がスクリプトプロパティに残っていても害はないが、コード上は無視される。
   - 新規プロパティ `API_TOKEN` が未設定の場合は Secure by Default 原則により `doPost(e)` が `API_DISABLED` を返すため、ユーザーは既存の GAS デプロイを新バージョンへ更新した後に `API_TOKEN` を設定し、`ANYONE_ANONYMOUS` としてデプロイする必要がある。
3. **フロントエンド 11 メソッド互換性**:
   - `ApiClient` の公開メソッド名・引数型・Promise 解決値の構造（`response.data` をそのまま返す契約）は維持するため、`ScriptsApp.html` 内の登録・検索・編集・削除フローのコアロジックは変更不要である。

---

## 3. インターフェース・データ構造仕様

### 3.1 GAS バックエンド HTTP JSON API 仕様 (`src/Code.js`, `src/Config.js`)

#### A. `Config` 拡張メソッド (`src/Config.js`)
```typescript
class Config {
  private apiToken: string; // props.API_TOKEN を String(...).trim() した値 (未設定時 '')

  /**
   * API_TOKEN が設定済み（空文字でない）か判定する
   */
  hasApiToken(): boolean;

  /**
   * API_TOKEN を取得する（未設定・空文字の場合は err.code = 'API_DISABLED' を送出）
   */
  getApiToken(): string;
}
```
- `allowEmbedding` フィールドおよび `isEmbeddingAllowed()` メソッドは削除する。

#### B. `doGet(e)` レスポンス構造
```typescript
interface HealthCheckResponse {
  success: true;
  data: {
    service: 'MusicInfo-app';
    role: 'api-only';
    status: 'ok';
    apiConfigured: boolean; // config.hasApiToken() の結果のみ（トークン値は出力禁止）
  };
  timestamp: string; // ISO-8601
}
```
- 返却方式: `ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)`。

#### C. `doPost(e)` リクエスト / レスポンス / 検証順序

```typescript
interface JsonApiRequest {
  action: AllowedAction;
  token: string;
  payload?: unknown;
}

type AllowedAction =
  | 'getAllData'
  | 'searchAlbums'
  | 'searchItunes'
  | 'lookupItunesAlbum'
  | 'lookupMusicBrainzRelease'
  | 'saveAlbumBatch'
  | 'saveTrackSingle'
  | 'updateAlbumBatch'
  | 'uploadArtwork'
  | 'resolveDriveArtwork'
  | 'deleteAlbumsBatch';

interface JsonApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  timestamp: string;
}

interface JsonApiErrorResponse {
  success: false;
  error: string;
  code: string;
  timestamp: string;
}
```

- **`doPost(e)` 検証ステップ（厳守順序）**:
  1. **リクエスト存在・サイズ上限検証**:
     - `e && e.postData && typeof e.postData.contents === 'string'` が偽、または空文字（`trim()` 後）の場合 → `INVALID_REQUEST`。
     - `e.postData.contents.length > 10 * 1024 * 1024`（10MB 文字数上限）の場合 → `INVALID_REQUEST`。
  2. **JSON パース・構造検証**:
     - `JSON.parse(e.postData.contents)` を `try/catch` で実行。失敗時 → `INVALID_REQUEST`。
     - パース結果が非 null かつ `typeof body === 'object' && !Array.isArray(body)` でない場合 → `INVALID_REQUEST`。
  3. **サーバー側 `API_TOKEN` 設定確認 (Secure by Default)**:
     - `Config` から `expectedToken` を取得。未設定または空文字の場合 → **`API_DISABLED`**（メッセージ: `'サーバー側に API_TOKEN が設定されていないため、外部 API アクセスは無効化されています。'`）。
  4. **トークン検証 (定数時間比較)**:
     - `body.token` が非空文字列でない、または `constantTimeEqual_(body.token, expectedToken)` が `false` の場合 → **`UNAUTHORIZED`**。
     - `constantTimeEqual_(a, b)` は両引数が `string` であることを確認後、`maxLen = Math.max(a.length, b.length)` まで `diff |= (charCodeAt_or_0(a, i) ^ charCodeAt_or_0(b, i))`（初期値 `diff = a.length ^ b.length`）を回し、途中リターンしない。
  5. **アクション検証（ホワイトリスト & プロトタイプ汚染防御）**:
     - `typeof body.action !== 'string'` または `!Object.prototype.hasOwnProperty.call(ACTION_HANDLERS, body.action)` の場合 → **`UNKNOWN_ACTION`**。
  6. **引数マッピング・業務 RPC 実行**:
     - `ACTION_HANDLERS[body.action](body.payload)` を呼び出し、戻り値（既存の `{ success, data, error, code, timestamp }` 形式）を `createJsonResponse_()` で返却する。

- **11 アクションと `payload` マッピング仕様**:

| `action` | フロント送信 `payload` 標準形 | `Code.js` ハンドラでの抽出ルール | 呼び出し先 RPC |
| :--- | :--- | :--- | :--- |
| `getAllData` | `null` / 省略 | 引数なし | `apiGetAllData()` |
| `searchAlbums` | `{ keyword: string }` | `extractScalarArg_(p, 'keyword')` | `apiSearchAlbums(keyword)` |
| `searchItunes` | `{ keyword: string }` | `extractScalarArg_(p, 'keyword')` | `apiSearchItunes(keyword)` |
| `lookupItunesAlbum` | `{ collectionId: number \| string }` | `extractScalarArg_(p, 'collectionId')` | `apiLookupItunesAlbum(collectionId)` |
| `lookupMusicBrainzRelease` | `{ mbid: string }` | `extractScalarArg_(p, 'mbid')` | `apiLookupMusicBrainzRelease(mbid)` |
| `saveAlbumBatch` | `BatchSavePayload` | `p` をそのまま渡す | `apiSaveAlbumBatch(p)` |
| `saveTrackSingle` | `SingleTrackPayload` | `p` をそのまま渡す | `apiSaveTrackSingle(p)` |
| `updateAlbumBatch` | `AlbumEditPayload` | `p` をそのまま渡す | `apiUpdateAlbumBatch(p)` |
| `uploadArtwork` | `UploadArtworkPayload` | `p` をそのまま渡す | `apiUploadArtwork(p)` |
| `resolveDriveArtwork` | `ResolveDrivePayload` | `p` をそのまま渡す | `apiResolveDriveArtwork(p)` |
| `deleteAlbumsBatch` | `{ albums: Array<AlbumIdentityKey> }` | `p` をそのまま渡す | `apiDeleteAlbumsBatch(p)` |

  - `extractScalarArg_(payload, key)` の振る舞い：
    - `payload` がプレーンオブジェクト（`payload !== null && typeof payload === 'object' && !Array.isArray(payload)`）なら `payload[key]` を返す（キー未定義なら `undefined`）。
    - `payload` が `string` または `number` ならそのまま返す（後方・単体 API 呼び出し柔軟性）。
    - それ以外（`null`, `undefined`, `Array`, `boolean` 等）は `''`（または `undefined`）を返し、`"[object Object]"` 等への暗黙変換を防止する。

---

### 3.2 フロントエンド 接続設定 & トランスポート仕様 (`src/ScriptsApiClient.html`)

#### A. `localStorage` キーとデータ構造
1. **`musicinfo_connection_config`**（接続設定キー）:
   ```typescript
   type AppConnectionMode = 'local_demo' | 'http_api';

   interface ConnectionConfig {
     mode: AppConnectionMode; // デフォルト: 'local_demo'
     endpointUrl: string;     // 正規化済み GAS Web App /exec URL (未設定時 '')
     apiToken: string;        // ユーザーが入力した API_TOKEN (未設定時 '')
   }
   ```
   - **Endpoint URL 許可正規表現**:
     `/^https:\/\/script\.google\.com\/(a\/macros\/[^/]+\/)?macros\/s\/[a-zA-Z0-9_-]+\/exec$/`
   - 不正 JSON や不正構造が保存されていた場合は安全な初期値 `{ mode: 'local_demo', endpointUrl: '', apiToken: '' }` にフォールバックする。
   - `mode === 'http_api'` であっても `endpointUrl` または `apiToken` が欠落・不正な場合は、安全側として `local_demo` 扱いまたは有効設定なしと判定する。

2. **`musicinfo_local_tracks`**（ローカルデモ楽曲データキー）:
   ```typescript
   interface LocalTracksStorage {
     version: 1;
     tracks: Array<RawTrackRow>;
     updatedAt: string;
   }
   ```
   - 初回アクセス時（キーが未存在 `null` の場合のみ）：内蔵デモデータ（3 アーティスト・4 アルバム・複数 Disc 構成を含む計 12〜15 曲程度、アートワークは外部通信に依存しない SVG Data URI ジャケット）で初期化する。
   - ユーザーが全アルバムを削除した場合は `tracks: []` を保存し、勝手にデモデータを再投入しない（「デモデータをリセット」操作時のみ再投入）。
   - `QuotaExceededError`（`err.name === 'QuotaExceededError'` / `err.code === 22` / `err.code === 1014`）捕捉時は、直前のメモリ/ストレージ状態を壊さず `err.code = 'LOCAL_STORAGE_QUOTA_EXCEEDED'` のユーザー向けエラーを送出する。

#### B. トランスポート クラス構成・公開シグネチャ

```typescript
interface Transport {
  getAllData(): Promise<{ tracks: Array<RawTrackRow>; totalTracks: number; loadedAt: string }>;
  searchAlbums(keyword: string): Promise<AlbumSearchResponse>;
  searchItunes(keyword: string): Promise<{ albums: Array<ItunesAlbumSummary> }>;
  lookupItunesAlbum(collectionId: number | string): Promise<{ albumDetail: ItunesAlbumDetail }>;
  lookupMusicBrainzRelease(mbid: string): Promise<{ albumDetail: AlbumDetail }>;
  saveAlbumBatch(payload: BatchSavePayload): Promise<{ count: number; savedAlbum: string; artworkUrl: string }>;
  saveTrackSingle(track: SingleTrackPayload): Promise<{ savedTrack: RawTrackRow }>;
  updateAlbumBatch(payload: AlbumEditPayload): Promise<AlbumEditResult>;
  uploadArtwork(payload: UploadArtworkPayload): Promise<{ fileId: string; publicUrl: string; fileName: string }>;
  resolveDriveArtwork(payload: ResolveDrivePayload): Promise<{ fileId: string; publicUrl: string; fileName: string }>;
  deleteAlbumsBatch(payload: { albums: Array<AlbumIdentityKey> }): Promise<DeleteAlbumsResult>;
}
```

1. **`HttpJsonTransport`**:
   - コンストラクタ: `constructor(configProvider, options = {})`（`fetchFn` や `timeoutMs` (既定 45000ms) を DI 可能にして単体テスト容易性を確保）。
   - `callAction(action, payload = null, overrideConfig = null)`:
     - `fetch(endpointUrl, { method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token: apiToken, payload }), signal })`
     - レスポンス本文を `text()` で取得し、`JSON.parse` を試みる。失敗時は `status` や HTML 判定を踏まえ、GAS 公開範囲設定（`ANYONE_ANONYMOUS`）の確認を促す `INVALID_RESPONSE` エラーを送出する。
     - `parsed.success === false` の場合、`Error(parsed.error)` に `err.code = parsed.code` を付与して reject する。
   - `checkHealth(endpointUrl)` *(任意確認用)*: `GET` によりヘルスチェック JSON を検証。

2. **`LocalDemoTransport`**:
   - コンストラクタ: `constructor(storageAdapter = null)`（`localStorage` 不在環境向けにメモリ Map フォールバック、かつテストからモックストレージ注入可能）。
   - **各メソッドの挙動**:
     - `getAllData`: 保存済みトラックを読み込み、各行をサニタイズ（型正規化）して返却。
     - `searchAlbums` / `searchItunes` / `lookupItunesAlbum` / `lookupMusicBrainzRelease` / `resolveDriveArtwork`:
       `err.code = 'LOCAL_MODE_UNSUPPORTED'` のエラーを reject（メッセージ: 機能に応じた明確な GAS 接続案内）。
     - `saveAlbumBatch`: `albumName`, `albumArtist`, `tracks` の必須・文字長（255）・正整数検証後にトラック群を追記保存。`artworkUrl500` があれば `artworkUrl` として保持。
     - `saveTrackSingle`: 必須・文字長・正整数検証後に 1 行追記保存。
     - `updateAlbumBatch`: `targetKey`, `album`, `tracks`（1曲以上・同一CD内トラック番号重複禁止）を検証し、旧行を置換保存。対象不在時は `NOT_FOUND`。
     - `uploadArtwork`: DataURL ヘッダおよび `mimeType` を検証（`image/jpeg`, `image/png`, `image/webp` のみ許可、`image/svg+xml` や `text/html` 等の非許可形式は `VALIDATION_FAILED`）。サイズがローカル保存上限（例: Base64 文字列長 `1.5 * 1024 * 1024` 文字、約 1MB 相当）を超過する場合は `VALIDATION_FAILED` を返し、正常時は DataURL 自体を `publicUrl` として返却する。
     - `deleteAlbumsBatch`: 対象キー検証後、該当行を除外して保存し統計値を返却。
   - `resetDemoData()`: 内蔵デモデータで `musicinfo_local_tracks` を初期化する。

3. **`ApiClient`**:
   - 既存 11 メソッド（`deleteAlbumsBatch(albums)` は内部で `{ albums }` へラップ）を維持し、現在のモードが `http_api`（かつ有効な URL・トークンあり）なら `HttpJsonTransport`、そうでなければ `LocalDemoTransport` へ委譲する。
   - 接続設定・モード制御用メソッド：
     - `getMode()`: `'local_demo' | 'http_api'`
     - `getConnectionConfig()`: `{ mode, endpointUrl, apiToken }`
     - `isHttpApiMode()`: `boolean`
     - `validateEndpointUrl(url)`: `{ valid: boolean, normalizedUrl?: string, error?: string }`
     - `testConnection(endpointUrl, apiToken)`: 一時的に `HttpJsonTransport` で `getAllData` を実行し、疎通・認証・データ件数（`totalTracks`）を確認する。
     - `saveAndActivateHttpConfig(endpointUrl, apiToken)`: URL/トークン検証後に保存し、`http_api` へ切り替え。
     - `resetToLocalMode()`: `musicinfo_connection_config` をクリア（または `local_demo` 化）してローカルモードへ復帰。
     - `resetLocalDemoData()`: `LocalDemoTransport.resetDemoData()` を呼び出す。

---

### 3.3 UI DOM ID 契約 (`src/Navbar.html`, `src/ConnectionModal.html`)

- **`src/Navbar.html` 追加要素**:
  - `id="btn-open-connection-modal"`（ボタン本体、`min-h-[44px]` 確保）
  - `id="connection-mode-badge"`（バッジテキスト表示領域: 例 `デモ/ローカル` / `GAS連携中`）
  - `id="connection-mode-dot"`（状態インジケータ丸印: amber vs emerald）
- **`src/ConnectionModal.html` 必須要素**:
  - `id="modal-connection"`（モーダルルートコンテナ）
  - `id="form-connection"`（`onsubmit="event.preventDefault();"`）
  - `id="btn-close-connection-modal"`（`min-h-[44px] min-w-[44px]`）
  - `id="connection-current-mode-badge"`（モーダル内の現在モード表示）
  - `id="connection-endpoint-url"`（`<input type="url">`）
  - `id="connection-api-token"`（`<input type="password">`）
  - `id="btn-toggle-token-visibility"`（`min-h-[44px] min-w-[44px]`）
  - `id="connection-status-message"`（接続テスト結果／エラー表示領域）
  - `id="btn-test-connection"`（`min-h-[44px]` + スピナー `.connection-test-spinner`）
  - `id="btn-save-connection"`（`min-h-[44px]` + スピナー `.connection-save-spinner`）
  - `id="btn-reset-connection"`（`min-h-[44px]`）
  - `id="btn-reset-demo-data"`（`min-h-[44px]`）
  - `id="btn-cancel-connection-modal"`（`min-h-[44px]`）

---

## 4. テスト戦略

### 4.1 単体テスト方針 (`tests/run_tests.js`)
1. **バックエンド設定・API 層 (`Config.js`, `Code.js`)**:
   - `Config`: `API_TOKEN` の未設定・空文字・空白トリム・有効値における `hasApiToken()` / `getApiToken()` の挙動を検証する。
   - `Code.doGet`: `ContentService` モック下で `success: true`, `role: 'api-only'`, `apiConfigured` の真偽値が出力され、トークン値や機密 ID が一切含まれないことを検証する。
   - `Code.doPost`:
     - `API_TOKEN` 未設定時に必ず `API_DISABLED` を返すこと。
     - トークン未指定・不一致時に `UNAUTHORIZED` を返し、`SpreadsheetApp` / `DriveApp` が呼ばれないこと。
     - `constantTimeEqual_` が長さ違い・先頭違い・末尾違い・完全一致で正しく真偽判定すること。
     - 不正 JSON・配列 JSON・空ボディ・10MB 超過時に `INVALID_REQUEST` を返すこと。
     - 未定義アクションや `"toString"` / `"constructor"` 指定時に `UNKNOWN_ACTION` を返すこと。
     - 全 11 アクション（特に引数なし `getAllData`、オブジェクト/スカラ双方の `searchAlbums` / `lookupItunesAlbum` / `lookupMusicBrainzRelease`、オブジェクト引数 `saveAlbumBatch` / `deleteAlbumsBatch` 等）が正しく対応 RPC に委譲されること。
   - GAS V8 単一グローバルスコープ試験（`[8.1]`）: `include` 廃止に合わせ `doGet`, `doPost`, 全 11 `api*` 関数の共存を全読み込み順パターンで検証する。
2. **フロントエンド トランスポート層 (`ScriptsApiClient.html`)**:
   - `vm` サンドボックスに `ScriptsUtils.html` / `ScriptsApiClient.html` を読み込み、モック `localStorage` とモック `fetch` で以下を検証：
     - `google.script.run` への参照が一切存在しないこと。
     - デフォルト起動で `local_demo` モードになり、`getAllData()` が初期デモデータを返すこと。
     - `saveAlbumBatch`, `saveTrackSingle`, `updateAlbumBatch`, `deleteAlbumsBatch` が `localStorage` へ永続化され再取得に反映されること。
     - 全アルバム削除後に `getAllData()` を呼んでもデモデータが勝手復活せず 0 件が維持され、`resetLocalDemoData()` でのみデモデータが復元されること。
     - `searchAlbums` / `searchItunes` / `lookupItunesAlbum` / `lookupMusicBrainzRelease` / `resolveDriveArtwork` がローカルモード時に `LOCAL_MODE_UNSUPPORTED` を返すこと。
     - `uploadArtwork` が許可 MIME で DataURL を返し、SVG/HTML 等を拒否すること。
     - `localStorage` 破損 JSON 時でもクラッシュせず復旧し、`QuotaExceededError` 時に `LOCAL_STORAGE_QUOTA_EXCEEDED` を返すこと。
     - `HttpJsonTransport` が正規 GAS URL（`/macros/s/.../exec` および `/a/macros/<domain>/s/.../exec`）のみ許可し、`/dev` や `http://` や外部ドメインを拒否すること。
     - `HttpJsonTransport` が `method: 'POST'`, `Content-Type: text/plain;charset=utf-8`, `credentials: 'omit'`, カスタムヘッダなし、ボディ JSON `{ action, token, payload }` で送信すること。
3. **ビルド成果物検証 (`dist/index.html`, `dist/.nojekyll`)**:
   - `src/index.html` が存在しないこと、`dist/index.html` と `dist/.nojekyll` が存在すること。
   - `dist/` 配下に `*.js` や `appsscript.json` が含まれないこと。
   - `dist/index.html` 内の全 `<script>` ブロックが `vm.Script` で構文エラーなくパースでき、`ApiClient`, `HttpJsonTransport`, `LocalDemoTransport`, `Store`, `Utils`, `App` が利用可能であること。
   - `<base target="_top">`、インライン `onerror=`、`google.script.run` が `dist/index.html` に含まれないこと。
   - `ConnectionModal` および `Navbar` モード表示要素の全 ID が `dist/index.html` に含まれること。

### 4.2 結合テスト・セキュリティ / Red Team テスト方針 (`tests/red_team_attack_test.js`)
1. **`doPost(e)` セキュリティ攻撃耐性**:
   - プロトタイプ汚染キー（`__proto__`, `constructor`, `toString`, `valueOf`）を `action` に注入しても `UNKNOWN_ACTION` で拒否されること。
   - `token` に配列 `[]`・オブジェクト `{}`・数値・`null`・先頭一致部分文字列等を注入しても `UNAUTHORIZED` で拒否され、`SpreadsheetApp` / `DriveApp` 呼び出し回数が 0 であること。
   - `searchAlbums` 等にオブジェクト `{}` や配列 `["x"]` を `payload` として渡しても `"[object Object]"` 検索が走らず `VALIDATION_FAILED` で遮断されること。
2. **フロントエンド境界・XSS・アクセシビリティ検証**:
   - `HttpJsonTransport` URL インジェクション（`javascript:alert(1)`, `https://script.google.com.evil.com/macros/s/id/exec`, `https://script.google.com/macros/s/id/dev`）の拒否。
   - `LocalDemoTransport` への悪意ある破損 `localStorage` データ注入耐性、および SVG DataURL による画像アップロード偽装拒否。
   - `ConnectionModal.html` / `Navbar.html` の `onsubmit="event.preventDefault();"` および全ボタンの `min-h-[44px]` タッチターゲット検証。
   - `dist/index.html` 内に `API_TOKEN`、スプレッドシート ID、Drive フォルダ ID 等のハードコード秘密情報が存在しないこと。

### 4.3 回帰テスト観点
- 既存の `SheetService`, `DriveService`, `ItunesService`, `MusicBrainzService`, `MusicService`, `Utils`, `Store`, `ScriptsApp` の全テストケース（単体テスト＋Red Team テスト 247 件相当）が引き続き 100% パスすること。
- ローカル静的サーバー（例: `npx serve dist` または Node `http` サーバー）で `dist/index.html` を配信し、ブラウザ上で初期デモ起動 → 3ペイン操作 → 手動登録 → 編集 → 削除 → 接続設定モーダル表示の一連フローに未捕捉コンソールエラーが出ないこと。

---

## 5. 実装タスク一覧 (順序定義)

### タスク [TASK-001]: ビルド出力の一本化 (`dist/`) とテンプレート・ignore 設定の整備
- **ID**: TASK-001
- **目的**: ビルド出力を `src/index.html` から GitHub Pages 用の `dist/index.html`（+ `dist/.nojekyll`）へ一本化し、不要となった `src/index.html` を削除するとともに `.gitignore` / `.claspignore` および `src/index.template.html` を新環境へ適合させる。
- **入力**:
  - `build.js`, `src/index.template.html`, `src/index.html`, `.gitignore`, `.claspignore`
  - 設計書 ADR-002, FR-GH-005, §1.2 留意事項 1, 3, 4
- **期待される結果**:
  - `build.js`:
    - 出力先を `dist/index.html` に変更し、`fs.mkdirSync(DIST_DIR, { recursive: true })` の上で `dist/.nojekyll`（空ファイル）を毎回生成する。
    - `index.template.html` 不在時の `src/index.html` フォールバック分岐を削除し、`index.template.html` が無ければエラー終了する。
    - Node.js テスト用 `module.exports` ガード除去処理を、ネストした波括弧 `{ ... }` を含むブロックでも壊さず安全に除去できるよう（ブレースカウント方式等）改修する。
  - `src/index.template.html`:
    - `<base target="_top">` を削除する。
    - `<head>` 内にインライン SVG Data URI の `<link rel="icon" type="image/svg+xml" href="...">` を追加する。
  - `src/index.html` を削除（`git rm` 相当）する。
  - `.gitignore` に `dist/` および `src/index.html` を追加する。
  - `.claspignore` に `dist/**`, `.github/**`, `src/*.html` を追加する。
- **対象ファイル**:
  - `build.js`
  - `src/index.template.html`
  - `src/index.html` (削除)
  - `.gitignore`
  - `.claspignore`
- **依存関係**: なし（先行タスクなし）
- **受け入れ基準**:
  - `node build.js` 実行で `dist/index.html` と `dist/.nojekyll` が生成され、`src/index.html` が生成されないこと。
  - `dist/index.html` に `<base target="_top">` が含まれず、`<link rel="icon"` が含まれること。
  - `dist/index.html` 内の全 `<script>` ブロックが `vm.Script` で構文エラーなくパースできること。
  - `dist/` に `*.js` / `appsscript.json` が生成されないこと。
- **検証方法**:
  - `node build.js` を実行し、`dist/index.html` と `dist/.nojekyll` の存在および `src/index.html` 不在を確認する。
  - `git status` で `.gitignore` が `dist/` を無視していることを確認する。

---

### タスク [TASK-002]: GAS 設定管理 (`Config.js`) とマニフェスト (`appsscript.json`) の更新
- **ID**: TASK-002
- **目的**: `Config` クラスへ `API_TOKEN` 管理機能を追加し、HTML 配信廃止に伴う `ALLOW_EMBEDDING` を整理するとともに、`appsscript.json` の Web アプリ公開範囲を `ANYONE_ANONYMOUS` へ変更する。
- **入力**:
  - `src/Config.js`, `src/appsscript.json`
  - 設計書 DEC-002, NFR-GH-SEC-001, §3.1 A
- **期待される結果**:
  - `src/Config.js`:
    - コンストラクタで `props.API_TOKEN` を安全に文字列化・`trim()` して `this.apiToken` に保持する。
    - `hasApiToken()`（boolean）および `getApiToken()`（未設定/空文字時は `err.code = 'API_DISABLED'` の `Error` を送出）を実装する。
    - `allowEmbedding` フィールドおよび `isEmbeddingAllowed()` メソッドを削除する。
  - `src/appsscript.json`:
    - `webapp.access` を `"ANYONE"` から `"ANYONE_ANONYMOUS"` に変更する（`executeAs: "USER_DEPLOYING"` および `oauthScopes` 3 件は維持）。
- **対象ファイル**:
  - `src/Config.js`
  - `src/appsscript.json`
- **依存関係**: なし
- **受け入れ基準**:
  - `Config` が `API_TOKEN` 未設定・空文字・空白のみで `hasApiToken() === false` かつ `getApiToken()` が `API_DISABLED` を送出すること。
  - `Config` が有効な `API_TOKEN` 設定時に前後空白をトリムして返却すること。
  - `src/appsscript.json` が有効な JSON であり、`webapp.access === "ANYONE_ANONYMOUS"` であること。
- **検証方法**:
  - `node -e "new (require('./src/Config'))()"` および JSON パース確認（正式テストは TASK-007 にて実施）。

---

### タスク [TASK-003]: GAS バックエンドの JSON API 専用化 (`Code.js`)
- **ID**: TASK-003
- **目的**: `src/Code.js` から `HtmlService` フロントエンド配信および `include()` を廃止し、API ヘルスチェック用 `doGet(e)` と、`API_TOKEN` 認証・サイズ上限検証・11 アクションルーティングを備えた `doPost(e)` を実装する。
- **入力**:
  - `src/Code.js`, `src/Config.js` (TASK-002)
  - 設計書 FR-GH-004, NFR-GH-SEC-001, NFR-GH-SEC-002, §3.1 B, C
- **期待される結果**:
  - `include(filename)` 関数を削除する。
  - `doGet(e)` は `Config.hasApiToken()` を取得し、`createJsonResponse_()` により `{ success: true, data: { service: 'MusicInfo-app', role: 'api-only', status: 'ok', apiConfigured }, timestamp }` を返却する（機密情報・トークン値・実データは一切含めない）。
  - `doPost(e)` は §3.1 C の厳守順序（リクエスト存在・10MB 上限検証 → JSON パース・非配列オブジェクト検証 → `Config.hasApiToken()` 未設定時 `API_DISABLED` → `constantTimeEqual_()` による定数時間比較、不一致時 `UNAUTHORIZED` → `Object.prototype.hasOwnProperty.call` による許可リスト 11 アクション検証、リスト外時 `UNKNOWN_ACTION` → 業務 `api*` 実行）を実装し、`createJsonResponse_()` で JSON を返却する。
  - `extractScalarArg_(payload, key)` により、`searchAlbums`, `searchItunes`, `lookupItunesAlbum`, `lookupMusicBrainzRelease` のオブジェクト/スカラ双方の安全な引数抽出を行い、配列や空オブジェクトの暗黙文字列化を防ぐ。
  - 末尾の `module.exports` から `include` を削除し、`doPost`（および必要に応じて単体テスト対象ヘルパー `constantTimeEqual_` 等）を追加する。
  - GAS V8 単一グローバルスコープ互換性（トップレベル `const` 重複禁止や `ConfigCls` 解決パターン）を維持する。
- **対象ファイル**:
  - `src/Code.js`
- **依存関係**: TASK-002
- **受け入れ基準**:
  - `Code.js` 内に `HtmlService` および `include` が残存しないこと。
  - `API_TOKEN` 未設定または不正トークンでの `doPost` 呼び出し時に `getMusicService()`（スプレッドシート/Drive）が一切実行されないこと。
  - 全 11 アクションが `doPost` 経由で既存 `api*` 関数と同一レスポンス形式を返すこと。
- **検証方法**:
  - `new vm.Script` 構文チェック、および GAS V8 グローバルスコープ読込シミュレーションでの正常動作確認（TASK-007 テストで網羅検証）。

---

### タスク [TASK-004]: フロントエンド `ApiClient` 刷新と 2 トランスポート実装 (`ScriptsApiClient.html`)
- **ID**: TASK-004
- **目的**: `google.script.run` 依存を完全に廃止し、`ConnectionConfigStore`、`HttpJsonTransport`、`LocalDemoTransport` および互換ファサード `ApiClient` を `src/ScriptsApiClient.html` に実装する。
- **入力**:
  - `src/ScriptsApiClient.html`, `src/ScriptsUtils.html`
  - 設計書 FR-GH-001, FR-GH-003, NFR-GH-COMPAT-001, §3.2
- **期待される結果**:
  - `google.script.run` 参照を完全に削除する。
  - `ConnectionConfigStore` が `localStorage` (`musicinfo_connection_config`) の安全読み書き（アクセス例外時はメモリフォールバック、JSON 破損時は安全初期値フォールバック）、エンドポイント URL 検証（`/macros/s/.../exec` および `/a/macros/<domain>/s/.../exec` 許可、`/dev` や `http://` 等拒否）、設定クリアを提供する。
  - `HttpJsonTransport` が `POST` + `mode: 'cors'` + `credentials: 'omit'` + `redirect: 'follow'` + `Content-Type: text/plain;charset=utf-8`（カスタムヘッダなし、ボディ JSON `{ action, token, payload }`）およびタイムアウト制御（`AbortController` 45 秒）で通信し、非 JSON（HTML 等）受信時は `ANYONE_ANONYMOUS` 確認を促すエラーを返す。
  - `LocalDemoTransport` が内蔵デモデータ（3 アーティスト・4 アルバム・複数 Disc 含む・SVG Data URI ジャケット）による初回初期化、`localStorage` (`musicinfo_local_tracks`) 上での CRUD（`getAllData`, `saveAlbumBatch`, `saveTrackSingle`, `updateAlbumBatch`, `deleteAlbumsBatch`）、ローカル画像アップロードの MIME/サイズ検証＋DataURL 返却、`QuotaExceededError` 捕捉、および外部検索/Drive 連携メソッドでの `LOCAL_MODE_UNSUPPORTED` 返却を行う。
  - `ApiClient` が既存 11 メソッドのシグネチャ・Promise 契約を維持しつつ、アクティブモードに応じて両トランスポートへ委譲し、加えてモード取得・接続テスト（`testConnection`）・保存切替・ローカルリセット用メソッドを提供する。
  - 末尾の `module.exports` ガードが `build.js` による除去と Node.js テスト読み込みの両方で問題なく動作すること。
- **対象ファイル**:
  - `src/ScriptsApiClient.html`
- **依存関係**: TASK-001, TASK-003
- **受け入れ基準**:
  - `ScriptsApiClient.html` 内に `google.script.run` が存在しないこと。
  - `build.js` でバンドルした `dist/index.html` に `module.exports` の残骸や構文エラーが出ないこと。
  - Node.js `vm` サンドボックス上で `LocalDemoTransport` およびモック `fetch` 付き `HttpJsonTransport` の全契約が動作すること。
- **検証方法**:
  - `node build.js` によるバンドル構文検証および TASK-007 の `ApiClient` 単体テスト実行。

---

### タスク [TASK-005]: 接続設定モーダル (`ConnectionModal.html`) とモード表示 UI (`Navbar.html`) の構築
- **ID**: TASK-005
- **目的**: ナビゲーションバーに現在の動作モード表示バッジ兼接続設定ボタンを追加し、GAS 接続設定・テスト・保存・リセット・デモ初期化を行う接続設定モーダルを新設してテンプレートとビルドへ組み込む。
- **入力**:
  - `src/Navbar.html`, `src/index.template.html`, `build.js`, 既存モーダル群（`src/DriveArtworkModal.html`, `src/DeleteConfirmModal.html` のダークテーマ・WCAG 44px 規約）
  - 設計書 FR-GH-002, NFR-GH-SEC-002, §3.3
- **期待される結果**:
  - `src/Navbar.html`:
    - 右側ボタングループにモード表示バッジ兼接続設定ボタン（`#btn-open-connection-modal`, `#connection-mode-dot`, `#connection-mode-badge`）を追加し、幅 320px 等のモバイル画面でも折り返し崩れせず、かつ `min-h-[44px]` のタップ領域を確保する。
    - `#btn-reload-data` の `title` を「データを再読み込み」等にモード中立な表現へ調整する。
  - `src/ConnectionModal.html` (新規作成):
    - §3.3 で定義した全 ID を備え、`form` に `onsubmit="event.preventDefault();"` を設定し、全操作ボタンに `min-h-[44px]` を付与する。
    - `API_TOKEN` 入力欄は `type="password"`（`autocomplete="off"`）とし、表示トグルボタンと共有端末向け注意喚起（`localStorage` 保存とリセット推奨）を明記する。
    - GAS 側準備手順（`ANYONE_ANONYMOUS` デプロイと `API_TOKEN` プロパティ設定）の簡易ガイドを記載する。
  - `src/index.template.html` に `<?!= include('ConnectionModal'); ?>` を追加し、`build.js` の `htmlIncludes` 配列に `'ConnectionModal'` を追加する。
- **対象ファイル**:
  - `src/ConnectionModal.html` (新規作成)
  - `src/Navbar.html`
  - `src/index.template.html`
  - `build.js`
- **依存関係**: TASK-001, TASK-004
- **受け入れ基準**:
  - `node build.js` 後の `dist/index.html` に `modal-connection` および全関連 DOM ID が含まれること。
  - `ConnectionModal.html` の `form` に `onsubmit="event.preventDefault();"` が設定され、全アクションボタンに `min-h-[44px]` が設定されていること。
- **検証方法**:
  - `node build.js` 実行後、`dist/index.html` 内の DOM ID および CSS クラスを検証する。

---

### タスク [TASK-006]: アプリケーションコントローラーのハイブリッドモード連携改修 (`ScriptsApp.html`)
- **ID**: TASK-006
- **目的**: `App` クラスがハイブリッドモード（`local_demo` / `http_api`）の切替、接続設定モーダル操作、エラー時の接続設定誘導、およびローカルモード時の制限案内をシームレスに処理できるよう改修する。
- **入力**:
  - `src/ScriptsApp.html`, `src/ScriptsApiClient.html` (TASK-004), `src/ConnectionModal.html` (TASK-005)
  - 設計書 FR-GH-001, FR-GH-002, §3.1, AC-GH-002, AC-GH-003
- **期待される結果**:
  - `init()` で `updateConnectionStatusUI()` を実行し、`Navbar` のモードバッジとモーダル内表示を同期した上で `loadInitialData()` を実行する。
  - `bindEvents()` に接続設定モーダル関連イベント（開く・閉じる・背景クリック・トークン表示切替・接続テスト・保存して接続・設定リセット・デモデータ初期化）を追加し、`Escape` キーハンドラに `closeConnectionModal()` を追加する。
  - `loadInitialData()` のローディング文言をモード別に切り替え、`http_api` モードで認証エラー（`API_DISABLED` / `UNAUTHORIZED`）または通信エラーが発生した場合はエラー内容と接続設定モーダルを開く案内（または設定モーダル自動オープン等の明確な復旧導線）を提供する。
  - モード切替（ローカル→GAS、GAS→ローカル、デモ初期化）実行時は、`this.store.state.selectedArtist = null; this.store.state.selectedAlbum = null; this.store.state.isAlbumSelectMode = false; this.store.state.selectedAlbumKeysForDeletion.clear();` のように選択状態をリセットした上で `await this.loadInitialData()` を呼び出し、モード間のデータ混在を確実に防止する。
  - `executeItunesSearch()` / `selectItunesAlbumForPreview()` / `submitDriveArtwork()` 等で `err.code === 'LOCAL_MODE_UNSUPPORTED'` を受け取った場合、接続設定から GAS 連携が必要な旨を分かりやすくトースト通知する。
  - `loadInitialData()` / `handleSaveAlbumEdit()` / `executeDeleteAlbums()` 等での一部固定文言（「スプレッドシート〜」）は実態に即した表現またはモードに応じた表現へ調整しつつ、既存テストのアサーション（`'handleSaveAlbumEdit'` / `'アルバム更新エラー'` 等）を壊さないよう配慮する。
- **対象ファイル**:
  - `src/ScriptsApp.html`
- **依存関係**: TASK-004, TASK-005
- **受け入れ基準**:
  - 未接続状態（`local_demo`）で `App.init()` がエラーなく完了し、デモデータが 3 ペインに描画されること。
  - 接続設定モーダルから URL とトークンを検証・保存すると `http_api` モードへ切り替わり、選択状態がクリアされて GAS データが再読み込みされること。
  - 設定リセットで即座に `local_demo` モードへ戻り、ローカルデータが再読み込みされること。
- **検証方法**:
  - `node build.js` 実行および TASK-007 の動的シミュレーションテスト、静的ローカルサーバー（`npx serve dist` 等）での手動スモーク確認。

---

### タスク [TASK-007]: テストスイートの全面整合更新と新規テスト拡充
- **ID**: TASK-007
- **目的**: 既存のユニットテスト・セキュリティテストを `dist/index.html` および GAS JSON API 専用仕様へ移行し、さらに `doPost` 認証・`LocalDemoTransport` / `HttpJsonTransport`・接続設定 UI・Red Team 攻撃耐性のテストを追加する。
- **入力**:
  - `tests/run_tests.js`, `tests/red_team_attack_test.js`, `tests/qa_comprehensive_verification.js`
  - TASK-001〜006 の成果物
  - 設計書 NFR-GH-TEST-001, AC-GH-001〜006, 計画書 §4
- **期待される結果**:
  - `tests/run_tests.js`:
    - `src/index.html` 参照箇所（セクション `[9]`, `[10.3]`, `[10.4]`, `[11.6]`, `[12.9]`）を `dist/index.html` へ統一移行し、`src/index.html` が存在しないこと・`dist/.nojekyll` が存在すること・`dist/` にバックエンド `.js` や `appsscript.json` が混入していないこと・`dist/index.html` に `google.script.run` / `<base target="_top">` / 機密情報が含まれないことを検証する。
    - `[8.1]` の `typeof include === 'function'` を `typeof doPost === 'function'` へ更新する。
    - `[12.1]` を `Config` の `API_TOKEN`（`hasApiToken()` / `getApiToken()`）検証へ更新する。
    - `[12.2]` を `Code.doGet` の API ヘルスチェック JSON 検証へ更新する。
    - `Code.doPost` の全 11 アクション・認証・異常系検証セクション、および `ScriptsApiClient.html`（`LocalDemoTransport` / `HttpJsonTransport` / `ApiClient` / `ConnectionConfigStore`）検証セクション、接続設定モーダル・モードバッジ存在検証を新規追加する。
  - `tests/red_team_attack_test.js`:
    - `Code.doPost` 攻撃耐性テスト（`API_DISABLED`, `UNAUTHORIZED`, プロトタイプ汚染 `action`, ペイロードサイズ超過, 認証失敗時 DB 非アクセス, 配列/オブジェクト混入でのスカラ引数汚染防止）を追加する。
    - `HttpJsonTransport` URL インジェクション耐性、`LocalDemoTransport` 破損ストレージ・SVG/HTML アップロード拒否、`ConnectionModal.html` / `Navbar.html` の WCAG 44px & `onsubmit="event.preventDefault();"` 検証、`dist/index.html` の機密情報・`google.script.run` 不在検証を追加する。
  - `tests/qa_comprehensive_verification.js`:
    - `[QA-1]` の `isEmbeddingAllowed()` テストを `Config.hasApiToken()` / `getApiToken()` 境界値検証へ整合更新する。
- **対象ファイル**:
  - `tests/run_tests.js`
  - `tests/red_team_attack_test.js`
  - `tests/qa_comprehensive_verification.js`
- **依存関係**: TASK-001, TASK-002, TASK-003, TASK-004, TASK-005, TASK-006
- **受け入れ基準**:
  - `node build.js && node tests/run_tests.js && node tests/red_team_attack_test.js`（および `node tests/qa_comprehensive_verification.js`）が全件 100% PASS（終了コード 0）すること。
- **検証方法**:
  - `node build.js` 実行後、`node tests/run_tests.js`、`node tests/red_team_attack_test.js`、`node tests/qa_comprehensive_verification.js` を順次実行して全件 PASS を確認する。

---

### タスク [TASK-008]: GitHub Actions ワークフロー構築と `README.md` 運用ドキュメント更新
- **ID**: TASK-008
- **目的**: GitHub Pages への自動テスト・ビルド・デプロイワークフロー（`.github/workflows/deploy-pages.yml`）を作成し、`README.md` のディレクトリ構成・セットアップ手順・GAS デプロイ手順・GitHub Pages 公開手順を最新化する。
- **入力**:
  - `.github/workflows/deploy-pages.yml` (新規), `README.md`, `package.json`
  - 設計書 FR-GH-006, ADR-003, §1.5 前提事項
- **期待される結果**:
  - `.github/workflows/deploy-pages.yml`:
    - トリガー: `push` (`branches: ["main"]`) および `workflow_dispatch`。
    - `permissions`: `contents: read`, `pages: write`, `id-token: write`。
    - `concurrency`: `group: "pages"`, `cancel-in-progress: false`。
    - `build` ジョブ: `actions/checkout@v4` -> `actions/setup-node@v4` (`node-version: '20'`) -> `npm run build` -> `npm test`（`npm ci` は使わず、必ず `build` -> `test` の順で実行） -> `actions/configure-pages@v5` -> `actions/upload-pages-artifact@v3` (`path: ./dist`)。
    - `deploy` ジョブ（`needs: build`, `environment: name: github-pages, url: ${{ steps.deployment.outputs.page_url }}`）: `actions/deploy-pages@v4`。
  - `README.md`:
    - ハイブリッドモード（初期デモ/ローカル利用＋GAS 連携）の解説追加。
    - ディレクトリ構成図の最新化（`dist/`, `.github/workflows/deploy-pages.yml`, `ConnectionModal.html`, `DriveArtworkModal.html`, `DeleteConfirmModal.html`, `src/index.html` 廃止反映）。
    - スクリプトプロパティ表への `API_TOKEN` 追加（および `ALLOW_EMBEDDING` 削除）。
    - GAS Web アプリデプロイ手順の更新（`ANYONE_ANONYMOUS`、`.js` + `appsscript.json` のみデプロイ、`clasp push` で HTML は除外）。
    - GitHub Pages 公開設定手順（`Settings > Pages > Source: GitHub Actions`）と画面からの接続設定手順、およびローカル検証手順（`npm run build && npm test`、`npx serve dist`）を明記。
- **対象ファイル**:
  - `.github/workflows/deploy-pages.yml` (新規作成)
  - `README.md`
- **依存関係**: TASK-007
- **受け入れ基準**:
  - `.github/workflows/deploy-pages.yml` の YAML 構文・権限・`build -> test -> upload-pages-artifact -> deploy-pages` 順序が正しいこと。
  - `README.md` 内に旧仕様（GAS `HtmlService` 配信や `src/index.html` 直接配置、`ANYONE` のみの前提記述）と矛盾する手順が残っていないこと。
- **検証方法**:
  - ワークフローファイルの構造・キー検証、および `npm run build && npm test`（PowerShell 環境では `node build.js && node tests/run_tests.js && node tests/red_team_attack_test.js`）の最終全件 PASS を確認する。
