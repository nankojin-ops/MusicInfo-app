# 音楽管理Webアプリケーション 詳細設計書

- **文書バージョン**: 1.1.0
- **作成日**: 2026年10月17日
- **最終更新日**: 2026年10月17日
- **作成ロール**: テックリード／詳細設計者 (`detailed_designer`)
- **準拠要件定義書**: `docs/REQUIREMENTS.md` (v1.2.0)
- **準拠基本設計書**: `docs/BASIC_DESIGN.md` (v1.1.0)
- **ステータス**: オブジェクト指向・役割毎ファイル分割詳細化完了（プログラマー実装用完全仕様）

---

## 目次

1. [詳細設計方針およびファイル構造仕様](#1-詳細設計方針およびファイル構造仕様)
   - 1.1 設計思想（オブジェクト指向カプセル化と単一責任原則、コンポーネント指向フロントエンド）
   - 1.2 ファイル構成一覧と依存関係マップ
   - 1.3 コーディング規約とV8 / HTMLService 実行規約
2. [データモデル・型定義・定数定義（TypeScript / JSDoc）](#2-データモデル型定義定数定義)
   - 2.1 共通通信レスポンス型（`ApiResponse<T>`）
   - 2.2 スプレッドシート永続化エンティティ型（`RawTrackRow`）
   - 2.3 フロントエンド階層ツリーモデル型（`MusicCatalog`, `ArtistData`, `AlbumData`, `DiscGroup`, `TrackDetail`）
   - 2.4 iTunes API データ連携型（`ItunesAlbumSummary`, `ItunesAlbumDetail`, `ItunesTrack`）
   - 2.5 API リクエストペイロード型（`BatchSavePayload`, `SingleTrackPayload`）
   - 2.6 フロントエンド状態モデル型（`StoreState`）
3. [マニフェスト設定詳細仕様（`src/appsscript.json`）](#3-マニフェスト設定詳細仕様)
   - 3.1 完全なマニフェストJSON
   - 3.2 宣言OAuthスコープと権限解説
4. [バックエンド詳細設計（GAS / ES6+ Class設計）](#4-バックエンド詳細設計)
   - 4.1 設定管理クラス: `src/Config.js`（`Config`）
   - 4.2 スプレッドシート永続化クラス: `src/SheetService.js`（`SheetService`）
   - 4.3 Google Drive ストレージ管理クラス: `src/DriveService.js`（`DriveService`）
   - 4.4 iTunes API クライアントクラス: `src/ItunesService.js`（`ItunesService`）
   - 4.5 業務ロジック統括サービス: `src/MusicService.js`（`MusicService`）
   - 4.6 Web Apps エントリーポイント & RPCルーター: `src/Code.js`
5. [フロントエンド詳細設計（コンポーネント & スタイル）](#5-フロントエンド詳細設計)
   - 5.1 メイン骨格コンテナ: `src/index.html`
   - 5.2 スタイル定義 & カスタムCSS: `src/Styles.html`
   - 5.3 ナビゲーションバー: `src/Navbar.html`
   - 5.4 STEP 1 アーティスト一覧コンポーネント: `src/ArtistList.html`
   - 5.5 STEP 2 アルバム一覧コンポーネント: `src/AlbumList.html`
   - 5.6 STEP 3 トラック詳細・ディスク別一覧コンポーネント: `src/TrackDetail.html`
   - 5.7 iTunes 検索・一括登録モーダルコンポーネント: `src/ItunesModal.html`
   - 5.8 手動楽曲登録モーダルコンポーネント: `src/ManualModal.html`
   - 5.9 アルバムアート拡大モーダルコンポーネント: `src/ImageModal.html`
6. [フロントエンド ロジック層詳細設計（JavaScript Classes）](#6-フロントエンド-ロジック層詳細設計)
   - 6.1 共通ユーティリティヘルパー: `src/ScriptsUtils.html`（`Utils`）
   - 6.2 通信クライアントクラス: `src/ScriptsApiClient.html`（`ApiClient`）
   - 6.3 状態管理クラス: `src/ScriptsState.html`（`Store`）
   - 6.4 アプリケーションコントローラークラス: `src/ScriptsApp.html`（`App`）
7. [エラーコード体系と例外処理詳細設計](#7-エラーコード体系と例外処理詳細設計)
   - 7.1 エラーコードマスタ仕様
   - 7.2 バックエンド例外ハンドリング仕様
   - 7.3 フロントエンドエラー通知 & リカバリ仕様
8. [セキュリティ・パフォーマンス・レスポンシブ最適化仕様](#8-セキュリティパフォーマンスレスポンシブ最適化仕様)
   - 8.1 XSS完全防護・サニタイズ仕様
   - 8.2 Google Drive 永続URLとWeb表示仕様
   - 8.3 スプレッドシート バッチ書き込み & クライアントキャッシュ性能最適化
   - 8.4 スマホUI/UX・44pxタッチターゲット・テンキー入力制御
9. [プログラマー向け実装チェックリスト＆単体・結合テストケース](#9-プログラマー向け実装チェックリスト単体結合テストケース)

---

## 1. 詳細設計方針およびファイル構造仕様

### 1.1 設計思想（オブジェクト指向カプセル化と単一責任原則、コンポーネント指向フロントエンド）

本詳細設計書は、基本設計書（`docs/BASIC_DESIGN.md` v1.1.0）のアーキテクチャ方針に基づき、**「1ファイルに集約せず、役割ごとに明確に分割されたファイル群」** の完全な実装仕様を定義する。

#### ① バックエンドのオブジェクト指向設計（GAS V8）
- **単一責任原則（SRP）**: 設定（`Config`）、データ入出力（`SheetService`）、ファイル保存（`DriveService`）、外部API通信（`ItunesService`）をそれぞれ独立したクラスに隔離し、それらを業務ロジック層（`MusicService`）が協調させる。
- **薄いエントリーポイント（Facade / Router）**: `Code.js` は外部とのインターフェース（`doGet`, `include`, グローバルRPC関数）のみを担当し、すべてのドメインロジックを `MusicService` へ委譲する。
- **完全な例外カプセル化**: すべてのRPC関数は最上位で例外を安全に捕捉し、`ApiResponse<T>` 形式でフロントエンドへ均一なエラーレスポンスを返却する。

#### ② フロントエンドのコンポーネント指向設計（GAS include方式）
- **UIコンポーネント分割**: メイン骨格（`index.html`）、スタイル（`Styles.html`）、ヘッダー（`Navbar.html`）、3ペイン画面（`ArtistList.html`, `AlbumList.html`, `TrackDetail.html`）、モーダル群（`ItunesModal.html`, `ManualModal.html`, `ImageModal.html`）へHTMLを分割。
- **ロジックの3層分離**:
  - `Utils`: 副作用を持たない純粋なヘルパー関数群（HTMLエスケープ、日付整形、デバウンス、トースト表示）。
  - `ApiClient`: `google.script.run` の非同期RPC呼び出しをPromise化し、エラーハンドリングを一元化。
  - `Store`: 単一の信頼できる情報源（Single Source of Truth）としてアプリケーション状態とインデックスツリーをリアクティブに管理。
  - `App`: DOMイベントリスナーの登録、`Store` の更新要求、画面再描画（レンダリング）ディスパッチを統括するコントローラー。

### 1.2 ファイル構成一覧と依存関係マップ

```
MusicInfo-app/
├── docs/
│   ├── REQUIREMENTS.md           # 要件定義書 (v1.2.0)
│   ├── BASIC_DESIGN.md           # 基本設計書 (v1.1.0)
│   └── DETAILED_DESIGN.md        # 詳細設計書 (本書 v1.1.0)
├── src/
│   ├── appsscript.json           # GAS マニフェスト (OAuthスコープ定義、V8指定)
│   │
│   │   ─── 【GAS バックエンド オブジェクト指向クラス群】 ───
│   ├── Config.js                 # 設定・スクリプトプロパティ管理クラス (Config)
│   ├── SheetService.js           # スプレッドシート読み書き・初期化・データ整形クラス (SheetService)
│   ├── DriveService.js           # Google Drive画像ダウンロード・保存・URL生成クラス (DriveService)
│   ├── ItunesService.js          # iTunes Search & Lookup API通信・500x500変換・トラック抽出 (ItunesService)
│   ├── MusicService.js           # 業務ロジック統括クラス (MusicService)
│   ├── Code.js                   # Web Appsエントリポイント (doGet, include, apiディスパッチャ)
│   │
│   │   ─── 【フロントエンド UI コンポーネント (HTML)】 ───
│   ├── index.html                # メイン骨格 (3ペイン & スマホステップレイアウト、include呼出)
│   ├── Styles.html               # Tailwind CSS設定、カスタムスクロールバー、ユーティリティCSS
│   ├── Navbar.html               # ヘッダー、全体検索バー、手動/iTunes登録ボタン
│   ├── ArtistList.html           # STEP 1 アーティスト一覧コンポーネント (インクリメンタル絞り込み)
│   ├── AlbumList.html            # STEP 2 アルバムカード一覧コンポーネント (戻るボタン含む)
│   ├── TrackDetail.html          # STEP 3 トラック詳細・ディスク別テーブルコンポーネント (パンくず含む)
│   ├── ItunesModal.html          # iTunes一括検索・プレビュー登録モーダル
│   ├── ManualModal.html          # 手動楽曲登録フォーム (連続入力アシスト・テンキー対応)
│   ├── ImageModal.html           # アルバムアート 500x500 拡大プレビューモーダル
│   │
│   │   ─── 【フロントエンド ロジック クラス群 (JavaScript)】 ───
│   ├── ScriptsUtils.html         # XSSサニタイズ (escapeHtml)、トースト通知等のユーティリティ (Utils)
│   ├── ScriptsApiClient.html     # バックエンド非同期通信クライアントクラス (ApiClient)
│   ├── ScriptsState.html         # フロントエンド状態管理クラス (Store)
│   └── ScriptsApp.html           # アプリケーションコントローラークラス (App)
└── README.md
```

#### クライアントインクルード順序の依存性規約
`index.html` 内でのスクリプト読み込み順序は、以下の依存関係を満たすため厳密に固定する：
1. `ScriptsUtils.html`（依存なし）
2. `ScriptsApiClient.html`（依存なし）
3. `ScriptsState.html`（依存なし）
4. `ScriptsApp.html`（`Utils`, `ApiClient`, `Store` に依存）

### 1.3 コーディング規約とV8 / HTMLService 実行規約
- **ECMAScript標準**: ES2020+。GAS V8ランタイムおよび最新ブラウザネイティブの構文（`class`, `const`, `let`, `async/await`, アロー関数, オプショナルチェイニング `?.`, ヌル合体演算子 `??`）を使用。
- **JSDoc**: すべてのクラス、メソッド、公開関数に引数の型、戻り値の型、および例外の説明を記載。
- **無省略実装**: プログラマーは実装ファイルに `// ...後で実装...` や `// 省略` などのコメントを残さず、本詳細設計書に記載されたアルゴリズムを忠実に完全記述すること。

---

## 2. データモデル・型定義・定数定義（TypeScript / JSDoc）

### 2.1 共通通信レスポンス型（`ApiResponse<T>`）

バックエンドの全RPC関数が返却する統一エンベロープ型。

```typescript
interface ApiResponse<T = any> {
  success: boolean;       // 処理成否 (true: 成功, false: 失敗)
  data?: T;               // 成功時のペイロードデータ
  error?: string;         // 失敗時のユーザー向けエラーメッセージ
  code?: string;          // エラー識別コード (例: "CONFIG_NOT_FOUND", "VALIDATION_FAILED")
  timestamp: string;      // 処理完了時刻 (ISO 8601 形式)
}
```

### 2.2 スプレッドシート永続化エンティティ型（`RawTrackRow`）

スプレッドシート（シート名: `MusicTracks`）のA〜H列と1対1に対応するレコード型。

```typescript
interface RawTrackRow {
  cdNumber: number;          // A列: CD番号（ディスク番号: 1以上の正整数）
  albumArtist: string;       // B列: アルバムアーティスト名（最大255文字）
  albumName: string;         // C列: アルバム名（最大255文字）
  trackArtist: string;       // D列: トラックアーティスト名（最大255文字）
  trackNumber: number;       // E列: トラック番号（1以上の正整数）
  trackName: string;         // F列: トラック名（最大255文字）
  releaseDate: string;       // G列: リリース日（YYYY-MM-DD 形式または空文字）
  artworkUrl: string;        // H列: Google Drive Web表示URLまたは空文字
}
```

### 2.3 フロントエンド階層ツリーモデル型

フラットな `RawTrackRow[]` からクライアント内部で構築される高速参照用インデックスツリー。

```typescript
// トラック情報
interface TrackDetail {
  cdNumber: number;
  trackNumber: number;
  trackName: string;
  trackArtist: string;
}

// ディスク別グループ（CD 1, CD 2 ...）
interface DiscGroup {
  cdNumber: number;
  tracks: TrackDetail[];     // trackNumber 昇順で整列
}

// アルバム情報
interface AlbumData {
  albumName: string;
  albumArtist: string;
  releaseDate: string;
  artworkUrl: string;
  totalTracks: number;
  discs: Record<number, DiscGroup>; // キーは cdNumber
}

// アーティスト情報
interface ArtistData {
  artistName: string;
  albumCount: number;
  albums: Record<string, AlbumData>; // キーは albumName
}

// カタログツリー全体
type MusicCatalog = Record<string, ArtistData>; // キーは artistName
```

### 2.4 iTunes API データ連携型

```typescript
// iTunes Search API アルバム概要
interface ItunesAlbumSummary {
  collectionId: number;
  albumName: string;
  albumArtist: string;
  artworkUrl100: string;
  artworkUrl500: string;
  releaseDate: string;       // YYYY-MM-DD
  trackCount: number;
  primaryGenreName?: string;
}

// iTunes Lookup API から抽出されたトラック
interface ItunesTrack {
  cdNumber: number;          // iTunes discNumber からマッピング
  trackNumber: number;       // iTunes trackNumber
  trackName: string;         // iTunes trackName
  trackArtist: string;       // iTunes artistName
}

// iTunes Lookup API アルバム完全情報
interface ItunesAlbumDetail {
  collectionId: number;
  albumName: string;
  albumArtist: string;
  releaseDate: string;
  artworkUrl100: string;
  artworkUrl500: string;
  trackCount: number;
  tracks: ItunesTrack[];     // cdNumber 昇順、trackNumber 昇順でソート
}
```

### 2.5 API リクエストペイロード型

```typescript
// apiSaveAlbumBatch ペイロード
interface BatchSavePayload {
  albumName: string;
  albumArtist: string;
  releaseDate: string;
  artworkUrl500?: string;    // iTunes 500x500 画像URL
  tracks: Array<{
    cdNumber: number;
    trackNumber: number;
    trackName: string;
    trackArtist: string;
  }>;
}

// apiSaveTrackSingle ペイロード
interface SingleTrackPayload {
  cdNumber: number;
  albumArtist: string;
  albumName: string;
  trackArtist: string;
  trackNumber: number;
  trackName: string;
  releaseDate?: string;
  artworkUrl?: string;
}
```

### 2.6 フロントエンド状態モデル型（`StoreState`）

```typescript
interface StoreState {
  allTracks: RawTrackRow[];
  musicCatalog: MusicCatalog;
  artistList: string[];            // ソート済みアーティスト名一覧
  selectedArtist: string | null;   // 現在選択中のアーティスト名
  selectedAlbum: string | null;    // 現在選択中のアルバム名
  mobileStep: 1 | 2 | 3;           // スマホ表示用ステップ (1: アーティスト, 2: アルバム, 3: トラック)
  searchQuery: string;             // 全体検索キーワード
  artistFilter: string;            // STEP 1 アーティスト絞り込みキーワード
  isLoading: boolean;              // 全体ローディング状態
  isSaving: boolean;               // API保存実行中フラグ（二重送信防止）
  
  // iTunesモーダル状態
  itunesKeyword: string;
  itunesSearchResults: ItunesAlbumSummary[];
  selectedItunesAlbum: ItunesAlbumDetail | null;
  isSearchingItunes: boolean;
  isLoadingItunesDetail: boolean;
  
  // 手動入力保持値（連続入力アシスト用）
  manualForm: {
    cdNumber: number;
    albumArtist: string;
    albumName: string;
    trackArtist: string;
    trackNumber: number;
    trackName: string;
    releaseDate: string;
    artworkUrl: string;
  };
  
  // 画像拡大モーダル状態
  zoomImageUrl: string | null;
  zoomImageTitle: string;
}
```

---

## 3. マニフェスト設定詳細仕様（`src/appsscript.json`）

### 3.1 完全なマニフェストJSON

```json
{
  "timeZone": "Asia/Tokyo",
  "dependencies": {
    "enabledAdvancedServices": []
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE"
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/script.external_request"
  ]
}
```

### 3.2 宣言OAuthスコープと権限解説
- `https://www.googleapis.com/auth/spreadsheets`: `SheetService` がスプレッドシート（`SpreadsheetApp`）をオープンし、シート作成・ヘッダー装飾・行書き込みを行うために必要。
- `https://www.googleapis.com/auth/drive`: `DriveService` が指定フォルダへジャケット画像ファイル（`DriveApp.File`）を作成し、`setSharing` で公開閲覧権限を設定するために必要。
- `https://www.googleapis.com/auth/script.external_request`: `ItunesService` および `DriveService` が `UrlFetchApp` を用いて Apple iTunes API 通信および画像バイナリをダウンロードするために必要。
- `executeAs: "USER_DEPLOYING"`: Web Apps デプロイユーザーの権限で実行することで、一般利用者がスプレッドシートやドライブの直接アクセス権を持たなくても安全に操作可能とする。

---

## 4. バックエンド詳細設計（GAS / ES6+ Class設計）

### 4.1 設定管理クラス: `src/Config.js`（`Config`）

#### 【責務】
スクリプトプロパティ（`PropertiesService.getScriptProperties()`）から設定値を読み込み、未設定時のエラー検知、および定数値（ヘッダー定義、iTunesエンドポイント等）を集中管理する。

#### 【完全な実装仕様】

```javascript
/**
 * 設定管理およびシステム定数クラス
 */
class Config {
  constructor() {
    const props = PropertiesService.getScriptProperties().getProperties();
    this.spreadsheetId = (props.SPREADSHEET_ID || '').trim();
    this.driveFolderId = (props.DRIVE_FOLDER_ID || '').trim();
    this.sheetName = (props.SHEET_NAME || 'MusicTracks').trim();
  }

  /**
   * スプレッドシートIDを取得（未設定時は例外送出）
   * @returns {string}
   */
  getSpreadsheetId() {
    if (!this.spreadsheetId) {
      const err = new Error('スクリプトプロパティ [SPREADSHEET_ID] が設定されていません。プロジェクトの設定から追加してください。');
      err.code = 'CONFIG_SPREADSHEET_ID_MISSING';
      throw err;
    }
    return this.spreadsheetId;
  }

  /**
   * Google DriveフォルダIDを取得（未設定時は例外送出）
   * @returns {string}
   */
  getDriveFolderId() {
    if (!this.driveFolderId) {
      const err = new Error('スクリプトプロパティ [DRIVE_FOLDER_ID] が設定されていません。プロジェクトの設定から追加してください。');
      err.code = 'CONFIG_DRIVE_FOLDER_ID_MISSING';
      throw err;
    }
    return this.driveFolderId;
  }

  /**
   * シート名を取得
   * @returns {string}
   */
  getSheetName() {
    return this.sheetName;
  }

  /**
   * 必須設定が揃っているか検証
   * @returns {boolean}
   */
  validate() {
    return Boolean(this.spreadsheetId && this.driveFolderId);
  }

  /**
   * 定数定義の取得
   */
  static get CONSTANTS() {
    return {
      SHEET_HEADERS: [
        'CD番号',
        'アルバムアーティスト名',
        'アルバム名',
        'アーティスト名',
        'トラック番号',
        'トラック名',
        'リリース日',
        'アルバムアートURL'
      ],
      ITUNES: {
        SEARCH_URL: 'https://itunes.apple.com/search',
        LOOKUP_URL: 'https://itunes.apple.com/lookup',
        DEFAULT_COUNTRY: 'jp',
        DEFAULT_MEDIA: 'music',
        ENTITY_ALBUM: 'album',
        ENTITY_SONG: 'song',
        LIMIT: 25
      }
    };
  }
}
```

---

### 4.2 スプレッドシート永続化クラス: `src/SheetService.js`（`SheetService`）

#### 【責務】
スプレッドシート（`SpreadsheetApp`）へのアクセスを完全に隠蔽するリポジトリクラス。
- シートの存在確認と自動作成・ヘッダー装飾（ダークスレート背景 `#1E293B`、白文字、太字、1行固定）。
- 全データ行の読み込みと `RawTrackRow[]` へのマッピング（日付フォーマットの正規化含む）。
- iTunes一括登録用の複数行バッチ書き込み（`setValues`）。
- 手動1曲登録用の1行追記（`appendRow`）。

#### 【メソッド仕様】

##### ① `constructor(config)`
- **引数**: `config: Config`

##### ② `getOrCreateSheet(): GoogleAppsScript.Spreadsheet.Sheet`
- **処理ロジック**:
  1. `SpreadsheetApp.openById(this.config.getSpreadsheetId())` でスプレッドシートを開く。
  2. シート名 `this.config.getSheetName()` でシートを取得。
  3. 存在しない場合は `ss.insertSheet(name)` で作成し、`this.initHeaderIfEmpty(sheet)` を呼び出す。
  4. 存在する場合、`sheet.getLastRow() === 0` であれば `this.initHeaderIfEmpty(sheet)` を呼び出す。
  5. `sheet` を返却する。

##### ③ `initHeaderIfEmpty(sheet)`
- **処理ロジック**:
  1. ヘッダー配列 `Config.CONSTANTS.SHEET_HEADERS` を取得。
  2. `sheet.getRange(1, 1, 1, headers.length).setValues([headers])` を実行。
  3. スタイル適用:
     - 背景色: `#1E293B`
     - 文字色: `#F8FAFC`
     - フォント太さ: `bold`
     - 水平配置: `center`
  4. `sheet.setFrozenRows(1)` で1行目を固定表示に設定。

##### ④ `fetchAllTracks(): RawTrackRow[]`
- **処理ロジック**:
  1. `const sheet = this.getOrCreateSheet();`
  2. `const lastRow = sheet.getLastRow();`
  3. `lastRow <= 1`（データなし）の場合は空配列 `[]` を返却。
  4. `const rows = sheet.getRange(2, 1, lastRow - 1, 8).getValues();` で全行取得。
  5. 各行を `RawTrackRow` に変換:
     - `cdNumber`: `Number(row[0]) || 1`
     - `albumArtist`: `String(row[1] || '').trim()`
     - `albumName`: `String(row[2] || '').trim()`
     - `trackArtist`: `String(row[3] || '').trim()`
     - `trackNumber`: `Number(row[4]) || 1`
     - `trackName`: `String(row[5] || '').trim()`
     - `releaseDate`: `row[6] instanceof Date ? Utilities.formatDate(row[6], 'Asia/Tokyo', 'yyyy-MM-dd') : String(row[6] || '').trim().substring(0, 10)`
     - `artworkUrl`: `String(row[7] || '').trim()`
  6. 変換後の配列を返却。

##### ⑤ `insertTracksBatch(tracks, albumMeta, driveArtworkUrl): number`
- **引数**:
  - `tracks`: `Array<{ cdNumber: number, trackNumber: number, trackName: string, trackArtist: string }>`
  - `albumMeta`: `{ albumName: string, albumArtist: string, releaseDate: string }`
  - `driveArtworkUrl`: `string`
- **処理ロジック**:
  1. `tracks` が空の場合は 0 を返却。
  2. `tracks` を 2次元配列 `rows`（行データ）に変換:
     ```javascript
     const rows = tracks.map(t => [
       Number(t.cdNumber) || 1,
       String(albumMeta.albumArtist).trim(),
       String(albumMeta.albumName).trim(),
       String(t.trackArtist || albumMeta.albumArtist).trim(),
       Number(t.trackNumber) || 1,
       String(t.trackName).trim(),
       String(albumMeta.releaseDate || '').trim(),
       String(driveArtworkUrl || '').trim()
     ]);
     ```
  3. `const sheet = this.getOrCreateSheet();`
  4. `const startRow = sheet.getLastRow() + 1;`
  5. `sheet.getRange(startRow, 1, rows.length, 8).setValues(rows);`
  6. 挿入件数 `rows.length` を返却。

##### ⑥ `appendSingleTrack(trackPayload): RawTrackRow`
- **引数**: `trackPayload: SingleTrackPayload`
- **処理ロジック**:
  1. 1行配列を生成:
     ```javascript
     const row = [
       Number(trackPayload.cdNumber) || 1,
       String(trackPayload.albumArtist).trim(),
       String(trackPayload.albumName).trim(),
       String(trackPayload.trackArtist).trim(),
       Number(trackPayload.trackNumber) || 1,
       String(trackPayload.trackName).trim(),
       String(trackPayload.releaseDate || '').trim(),
       String(trackPayload.artworkUrl || '').trim()
     ];
     ```
  2. `const sheet = this.getOrCreateSheet();`
  3. `sheet.appendRow(row);`
  4. 追加したオブジェクト形式の `RawTrackRow` を返却。

---

### 4.3 Google Drive ストレージ管理クラス: `src/DriveService.js`（`DriveService`）

#### 【責務】
外部URLからの画像バイナリ取得、Driveフォルダ取得、ファイル作成、公開閲覧権限付与、およびWeb表示用URLの生成を担当する。

#### 【メソッド仕様】

##### ① `constructor(config)`
- **引数**: `config: Config`

##### ② `downloadAndSaveArtwork(imageUrl500, albumName): string`
- **引数**:
  - `imageUrl500`: `string`（iTunesから取得した 500x500 画像URL）
  - `albumName`: `string`（アルバム名）
- **戻り値**: Google Drive の Web表示用永続URL（失敗時は空文字 `""`）
- **処理ロジック**:
  1. `imageUrl500` が空の場合は空文字 `""` を返却。
  2. `DriveApp.getFolderById(this.config.getDriveFolderId())` で保存先フォルダを取得。取得失敗時は例外送出。
  3. `UrlFetchApp.fetch(imageUrl500, { muteHttpExceptions: true })` を実行。
  4. HTTPステータスが 200 でない場合、警告ログを出力し空文字 `""` を返却（登録全体の障害にしない）。
  5. `const blob = response.getBlob();`
  6. ファイル名を安全に生成: `artwork_${this.sanitizeFileName(albumName)}_${Date.now()}.jpg`
  7. `blob.setName(fileName);` および `blob.setContentType('image/jpeg');`
  8. `const file = folder.createFile(blob);`
  9. `this.setPublicSharing(file);` を呼び出し閲覧権限を設定。
  10. `return this.generateWebUrl(file.getId());` を返却。

##### ③ `setPublicSharing(file)`
- **処理ロジック**:
  `file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);`

##### ④ `generateWebUrl(fileId): string`
- **戻り値**: `https://drive.google.com/uc?export=view&id=${fileId}`

##### ⑤ `sanitizeFileName(name): string`
- **処理ロジック**:
  1. `if (!name) return 'album';`
  2. 禁止記号 `[\/\\:\*\?"<>\| \r\n\t]` をアンダースコア `_` に置換。
  3. 最大長 60 文字で切り詰めて返却。

---

### 4.4 iTunes API クライアントクラス: `src/ItunesService.js`（`ItunesService`）

#### 【責務】
Apple iTunes Search API および Lookup API との通信、検索クエリ生成、500x500画像URLへの正規表現置換、およびレスポンスから `discNumber`（CD番号）を含むトラック配列の抽出を担当する。

#### 【メソッド仕様】

##### ① `searchAlbums(term): ItunesAlbumSummary[]`
- **引数**: `term: string`（検索キーワード）
- **処理ロジック**:
  1. `term` をトリムし、空文字の場合は空配列 `[]` を返却。
  2. クエリパラメータを組み立て:
     `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=jp&media=music&entity=album&limit=25`
  3. `UrlFetchApp.fetch(url, { muteHttpExceptions: true })` を実行。
  4. レスポンスコードが 200 以外の場合は例外送出（コード: `ITUNES_API_NETWORK_ERROR`）。
  5. JSONパースを行い、`results` から `wrapperType === 'collection'` の要素を抽出:
     ```javascript
     return results
       .filter(item => item.wrapperType === 'collection')
       .map(item => ({
         collectionId: item.collectionId,
         albumName: item.collectionName || '不明なアルバム',
         albumArtist: item.artistName || '不明なアーティスト',
         artworkUrl100: item.artworkUrl100 || '',
         artworkUrl500: this.convertTo500x500ArtworkUrl(item.artworkUrl100 || ''),
         releaseDate: item.releaseDate ? String(item.releaseDate).substring(0, 10) : '',
         trackCount: item.trackCount || 0,
         primaryGenreName: item.primaryGenreName || ''
       }));
     ```

##### ② `lookupAlbumSongs(collectionId): ItunesAlbumDetail`
- **引数**: `collectionId: number | string`
- **処理ロジック**:
  1. URL生成: `https://itunes.apple.com/lookup?id=${collectionId}&entity=song&country=jp`
  2. `UrlFetchApp.fetch(url, { muteHttpExceptions: true })` を実行。
  3. レスポンスコード 200 の検証。
  4. JSONパースを行い、`results` 配列を取得。要素数 0 の場合は例外スロー（`ALBUM_NOT_FOUND`）。
  5. `results[0]`（アルバムコレクション本体）の取得。
  6. `results.slice(1)` から `item.wrapperType === 'track'` の楽曲を抽出。
  7. 各楽曲のマッピング:
     - `cdNumber`: `Number(item.discNumber) || 1` （★重要: discNumberをCD番号に設定）
     - `trackNumber`: `Number(item.trackNumber) || 1`
     - `trackName`: `String(item.trackName || '').trim()`
     - `trackArtist`: `String(item.artistName || results[0].artistName || '').trim()`
  8. トラック配列をソート: `a.cdNumber - b.cdNumber || a.trackNumber - b.trackNumber`
  9. `ItunesAlbumDetail` オブジェクトを構築して返却:
     ```javascript
     return {
       collectionId: results[0].collectionId,
       albumName: results[0].collectionName || '',
       albumArtist: results[0].artistName || '',
       releaseDate: (results[0].releaseDate || '').substring(0, 10),
       artworkUrl100: results[0].artworkUrl100 || '',
       artworkUrl500: this.convertTo500x500ArtworkUrl(results[0].artworkUrl100 || ''),
       trackCount: tracks.length,
       tracks: tracks
     };
     ```

##### ③ `convertTo500x500ArtworkUrl(url100): string`
- **引数**: `url100: string`
- **処理ロジック**:
  `if (!url100) return '';`
  `return url100.replace(/100x100bb\.(jpg|png|webp)/i, '500x500bb.$1');`

---

### 4.5 業務ロジック統括サービス: `src/MusicService.js`（`MusicService`）

#### 【責務】
すべての業務ユースケース（データ一括取得、iTunesアルバム検索、iTunesトラック検索、iTunesアルバム一括保存トランザクション、手動1曲追加）を統括するオーケストレーター。

#### 【メソッド仕様】

##### ① `constructor(config, sheetService, driveService, itunesService)`
- 各依存サービスクラスのインスタンスを受け取り、プライベートプロパティに保持。

##### ② `getAllMusicData()`
- **処理ロジック**:
  1. `const tracks = this.sheetService.fetchAllTracks();`
  2. 返却データオブジェクト:
     ```javascript
     return {
       tracks: tracks,
       totalTracks: tracks.length,
       loadedAt: new Date().toISOString()
     };
     ```

##### ③ `searchItunesAlbums(keyword)`
- **処理ロジック**:
  1. `if (!keyword || !keyword.trim()) throw new Error('検索キーワードを入力してください。');`
  2. `const albums = this.itunesService.searchAlbums(keyword);`
  3. `return { albums: albums };`

##### ④ `lookupItunesAlbum(collectionId)`
- **処理ロジック**:
  1. `if (!collectionId) throw new Error('コレクションIDが無効です。');`
  2. `const detail = this.itunesService.lookupAlbumSongs(collectionId);`
  3. `return { albumDetail: detail };`

##### ⑤ `saveAlbumFromItunes(payload)`
- **引数**: `payload: BatchSavePayload`
- **バリデーション**:
  - `payload.albumName` が空でないこと
  - `payload.albumArtist` が空でないこと
  - `payload.tracks` が1件以上の配列であること
  - 不正時はエラーコード `VALIDATION_FAILED` で例外送出。
- **処理ロジック**:
  1. 画像の保存:
     ```javascript
     let driveArtworkUrl = '';
     if (payload.artworkUrl500) {
       driveArtworkUrl = this.driveService.downloadAndSaveArtwork(payload.artworkUrl500, payload.albumName);
     }
     ```
  2. スプレッドシートへのバッチ保存:
     ```javascript
     const count = this.sheetService.insertTracksBatch(payload.tracks, {
       albumName: payload.albumName,
       albumArtist: payload.albumArtist,
       releaseDate: payload.releaseDate
     }, driveArtworkUrl);
     ```
  3. 結果オブジェクトの返却:
     ```javascript
     return {
       count: count,
       savedAlbum: payload.albumName,
       artworkUrl: driveArtworkUrl
     };
     ```

##### ⑥ `saveSingleTrack(trackPayload)`
- **引数**: `trackPayload: SingleTrackPayload`
- **バリデーション**:
  - `cdNumber >= 1`
  - `albumArtist`, `albumName`, `trackArtist`, `trackName` が非空文字列
  - `trackNumber >= 1`
- **処理ロジック**:
  1. `const saved = this.sheetService.appendSingleTrack(trackPayload);`
  2. `return { savedTrack: saved };`

---

### 4.6 Web Apps エントリーポイント & RPCルーター: `src/Code.js`

#### 【責務】
GASのWeb Apps仕様を満たすエントリポイント関数（`doGet`）、HTMLServiceテンプレート用インクルードヘルパー（`include`）、および `google.script.run` から呼び出されるグローバルRPCエンドポイント群を定義する。

#### 【完全な実装コード仕様】

```javascript
/**
 * Web Apps エントリーポイント
 * @param {GoogleAppsScript.Events.DoGet} e
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('MusicInfo Manager - 音楽CD・アルバムコレクション管理')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * HTMLService テンプレート内インクルードヘルパー
 * @param {string} filename 
 * @returns {string} ファイルの内容HTML文字列
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * サービス依存関係を解決して MusicService を生成するファクトリ関数
 * @returns {MusicService}
 */
function getMusicService() {
  const config = new Config();
  const sheetService = new SheetService(config);
  const driveService = new DriveService(config);
  const itunesService = new ItunesService();
  return new MusicService(config, sheetService, driveService, itunesService);
}

/**
 * 【RPC】全データ取得API
 * @returns {ApiResponse}
 */
function apiGetAllData() {
  try {
    const data = getMusicService().getAllMusicData();
    return { success: true, data: data, timestamp: new Date().toISOString() };
  } catch (err) {
    console.error('apiGetAllData エラー:', err);
    return { success: false, error: err.message, code: err.code || 'DATA_FETCH_ERROR', timestamp: new Date().toISOString() };
  }
}

/**
 * 【RPC】iTunesアルバム検索API
 * @param {string} keyword 
 * @returns {ApiResponse}
 */
function apiSearchItunes(keyword) {
  try {
    const data = getMusicService().searchItunesAlbums(keyword);
    return { success: true, data: data, timestamp: new Date().toISOString() };
  } catch (err) {
    console.error('apiSearchItunes エラー:', err);
    return { success: false, error: err.message, code: err.code || 'ITUNES_SEARCH_ERROR', timestamp: new Date().toISOString() };
  }
}

/**
 * 【RPC】iTunesアルバム収録曲Lookup API
 * @param {number|string} collectionId 
 * @returns {ApiResponse}
 */
function apiLookupItunesAlbum(collectionId) {
  try {
    const data = getMusicService().lookupItunesAlbum(collectionId);
    return { success: true, data: data, timestamp: new Date().toISOString() };
  } catch (err) {
    console.error('apiLookupItunesAlbum エラー:', err);
    return { success: false, error: err.message, code: err.code || 'ITUNES_LOOKUP_ERROR', timestamp: new Date().toISOString() };
  }
}

/**
 * 【RPC】iTunesアルバム一括保存API
 * @param {BatchSavePayload} payload 
 * @returns {ApiResponse}
 */
function apiSaveAlbumBatch(payload) {
  try {
    const data = getMusicService().saveAlbumFromItunes(payload);
    return { success: true, data: data, timestamp: new Date().toISOString() };
  } catch (err) {
    console.error('apiSaveAlbumBatch エラー:', err);
    return { success: false, error: err.message, code: err.code || 'BATCH_SAVE_ERROR', timestamp: new Date().toISOString() };
  }
}

/**
 * 【RPC】手動1曲追加API
 * @param {SingleTrackPayload} track 
 * @returns {ApiResponse}
 */
function apiSaveTrackSingle(track) {
  try {
    const data = getMusicService().saveSingleTrack(track);
    return { success: true, data: data, timestamp: new Date().toISOString() };
  } catch (err) {
    console.error('apiSaveTrackSingle エラー:', err);
    return { success: false, error: err.message, code: err.code || 'SINGLE_SAVE_ERROR', timestamp: new Date().toISOString() };
  }
}
```

---

## 5. フロントエンド詳細設計（コンポーネント & スタイル）

### 5.1 メイン骨格コンテナ: `src/index.html`

#### 【責務】
HTML5構造、Tailwind CDN読み込み、各HTMLファイル（コンポーネントおよびスクリプト）のインクルード、およびエントリーポイント起動を担当。

#### 【完全な実装骨格】

```html
<!DOCTYPE html>
<html lang="ja" class="h-full bg-slate-950 text-slate-100">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>MusicInfo Manager - 音楽CD・アルバムコレクション管理</title>
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- スタイル定義インクルード -->
  <?!= include('Styles'); ?>
</head>
<body class="h-full flex flex-col overflow-hidden font-sans antialiased select-none bg-slate-950 text-slate-100">

  <!-- グローバルローディングオーバーレイ -->
  <div id="global-loading" class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 transition-opacity duration-200">
    <div class="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    <p id="global-loading-text" class="text-slate-300 font-medium text-sm">データを読み込み中...</p>
  </div>

  <!-- ナビゲーションバー (ヘッダー) インクルード -->
  <?!= include('Navbar'); ?>

  <!-- メイン3ペインコンテナ -->
  <main class="flex-1 overflow-hidden relative grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-800">
    <!-- STEP 1: アーティスト一覧 (PC: 3列, スマホ: Step 1) -->
    <?!= include('ArtistList'); ?>

    <!-- STEP 2: アルバムカード一覧 (PC: 4列, スマホ: Step 2) -->
    <?!= include('AlbumList'); ?>

    <!-- STEP 3: トラック詳細・ディスク別テーブル (PC: 5列, スマホ: Step 3) -->
    <?!= include('TrackDetail'); ?>
  </main>

  <!-- 各種モーダルインクルード -->
  <?!= include('ItunesModal'); ?>
  <?!= include('ManualModal'); ?>
  <?!= include('ImageModal'); ?>

  <!-- トースト通知コンテナ -->
  <div id="toast-container" class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"></div>

  <!-- フロントエンド スクリプト群インクルード（順序厳守） -->
  <?!= include('ScriptsUtils'); ?>
  <?!= include('ScriptsApiClient'); ?>
  <?!= include('ScriptsState'); ?>
  <?!= include('ScriptsApp'); ?>

  <script>
    // アプリケーション起動
    document.addEventListener('DOMContentLoaded', () => {
      window.app = new App();
      window.app.init();
    });
  </script>
</body>
</html>
```

---

### 5.2 スタイル定義 & カスタムCSS: `src/Styles.html`

#### 【責務】
Tailwind CSSの設定拡張、カスタムスクロールバー、タップ操作時の青い枠消去、およびアニメーションCSSの定義。

#### 【完全な実装仕様】

```html
<style>
  /* スマホでのタップハイライト無効化 */
  * {
    -webkit-tap-highlight-color: transparent;
  }

  /* カスタムスクロールバー */
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: #334155;
    border-radius: 9999px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: #475569;
  }

  /* 2行以上のテキスト省略 */
  .line-clamp-1 {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* フェードインアニメーション */
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-fadeIn {
    animation: fadeIn 0.15s ease-out forwards;
  }

  /* モーダル表示アニメーション */
  @keyframes modalScale {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
  .animate-modalScale {
    animation: modalScale 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
</style>
```

---

### 5.3 ナビゲーションバー: `src/Navbar.html`

#### 【責務】
アプリケーションタイトル、全体クイック横断検索バー、iTunes登録モーダル起動ボタン、手動登録モーダル起動ボタン、再読み込みボタンを配置。

#### 【HTML構造・ID・クラス定義】

```html
<header id="app-header" class="h-14 border-b border-slate-800 bg-slate-950 flex items-center justify-between px-3 md:px-4 z-20 flex-shrink-0">
  <!-- ロゴ & タイトル -->
  <div class="flex items-center gap-2.5">
    <div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path>
      </svg>
    </div>
    <span class="font-bold text-base md:text-lg tracking-tight bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
      MusicInfo
    </span>
  </div>

  <!-- PC用 全体クイック横断検索バー -->
  <div class="hidden md:flex flex-1 max-w-md mx-6">
    <div class="relative w-full">
      <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
        </svg>
      </div>
      <input type="text" id="header-search-input" placeholder="曲名、アルバム、アーティスト、CD番号で検索..."
        class="w-full pl-9 pr-8 py-1.5 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition">
      <button id="header-search-clear" class="hidden absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-200">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    </div>
  </div>

  <!-- 右側ボタングループ -->
  <div class="flex items-center gap-1.5 md:gap-2">
    <!-- 手動登録ボタン -->
    <button id="btn-open-manual-modal" class="inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 text-xs md:text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition active:scale-95">
      <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
      </svg>
      <span class="hidden sm:inline">手動登録</span>
      <span class="sm:hidden">手動</span>
    </button>

    <!-- iTunes検索で登録ボタン -->
    <button id="btn-open-itunes-modal" class="inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 text-xs md:text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-sm transition active:scale-95">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
      </svg>
      <span class="hidden sm:inline">iTunesから一括登録</span>
      <span class="sm:hidden">iTunes登録</span>
    </button>

    <!-- 再読み込みボタン -->
    <button id="btn-reload-data" title="スプレッドシートから再読み込み" class="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
      </svg>
    </button>
  </div>
</header>
```

---

### 5.4 STEP 1 アーティスト一覧コンポーネント: `src/ArtistList.html`

#### 【責務】
アーティスト一覧の表示、アーティスト名でのインクリメンタル絞り込み、件数バッジ表示、アーティスト選択イベントの発火。

#### 【HTML構造・ID・クラス定義】

```html
<section id="pane-artists" class="h-full flex flex-col overflow-hidden md:col-span-3 bg-slate-900 border-r border-slate-800">
  <!-- スマホ用全体検索バー (STEP 1のみ表示) -->
  <div class="md:hidden p-2.5 border-b border-slate-800 bg-slate-950">
    <div class="relative w-full">
      <input type="text" id="mobile-search-input" placeholder="曲名、アルバム、アーティスト横断検索..."
        class="w-full pl-8 pr-8 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500">
      <div class="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
        </svg>
      </div>
    </div>
  </div>

  <!-- アーティスト検索フィルター & カウンター -->
  <div class="p-3 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between gap-2 flex-shrink-0">
    <div class="relative flex-1">
      <input type="text" id="artist-filter-input" placeholder="アーティストを絞り込み..."
        class="w-full pl-8 pr-7 py-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition">
      <div class="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-500">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
        </svg>
      </div>
      <button id="artist-filter-clear" class="hidden absolute inset-y-0 right-0 pr-2 flex items-center text-slate-500 hover:text-slate-300">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    </div>
    <span id="artist-count-badge" class="px-2 py-0.5 bg-slate-800 text-slate-400 text-xs rounded-full font-mono flex-shrink-0">
      0件
    </span>
  </div>

  <!-- アーティストリストスクロールエリア -->
  <div id="artist-list-container" class="flex-1 overflow-y-auto divide-y divide-slate-800/40">
    <!-- 動的レンダリング: <div class="artist-item ..."> -->
  </div>

  <!-- 空状態プレースホルダー -->
  <div id="artist-empty-state" class="hidden p-6 text-center text-slate-500 text-xs">
    一致するアーティストがいません
  </div>
</section>
```

---

### 5.5 STEP 2 アルバム一覧コンポーネント: `src/AlbumList.html`

#### 【責務】
選択されたアーティストのアルバムカード一覧表示、スマホ表示時の「< アーティスト一覧へ戻る」ナビゲーションバーの提供、アルバム選択イベントの発火。

#### 【HTML構造・ID・クラス定義】

```html
<section id="pane-albums" class="h-full flex flex-col overflow-hidden md:col-span-4 bg-slate-900/60 border-r border-slate-800">
  <!-- スマホ用 戻るナビゲーションバー (STEP 2表示時) -->
  <div id="albums-mobile-back-bar" class="md:hidden px-3 py-2 border-b border-slate-800 bg-slate-950 flex items-center justify-between flex-shrink-0">
    <button id="btn-back-to-artists" class="inline-flex items-center gap-1.5 py-1 px-2 -ml-1 text-xs font-medium text-indigo-400 hover:text-indigo-300 active:scale-95 transition">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
      </svg>
      <span>アーティスト一覧</span>
    </button>
    <span class="text-xs text-slate-500 font-mono">STEP 2 / 3</span>
  </div>

  <!-- アーティスト名ヘッダー (PC / スマホ共通) -->
  <div class="p-3 border-b border-slate-800/80 bg-slate-900/40 flex items-center justify-between flex-shrink-0">
    <div class="flex items-center gap-2 overflow-hidden">
      <span class="text-xs uppercase tracking-wider text-slate-400 font-semibold">Artist:</span>
      <h2 id="albums-header-artist-name" class="text-sm font-bold text-slate-200 truncate">未選択</h2>
    </div>
    <span id="album-count-badge" class="px-2 py-0.5 bg-slate-800 text-slate-400 text-xs rounded-full font-mono flex-shrink-0">
      0作品
    </span>
  </div>

  <!-- アルバムカードグリッドスクロールエリア -->
  <div id="album-grid-container" class="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-3 content-start">
    <!-- 動的レンダリング: <div class="album-card ..."> -->
  </div>

  <!-- 空状態プレースホルダー -->
  <div id="album-empty-state" class="hidden flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500">
    <svg class="w-10 h-10 mb-2 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
    </svg>
    <p class="text-xs">アーティストを選択すると<br>アルバムが表示されます</p>
  </div>
</section>
```

---

### 5.6 STEP 3 トラック詳細・ディスク別一覧コンポーネント: `src/TrackDetail.html`

#### 【責務】
選択されたアルバムのメタデータ（大判ジャケット、タイトル、アーティスト、リリース日、総トラック数）、およびディスク別（`Disc 1`, `Disc 2` ...）の縦積み楽曲リストを表示。スマホ横スクロールを排除し、タップでジャケット拡大モーダルを起動する。

#### 【HTML構造・ID・クラス定義】

```html
<section id="pane-tracks" class="h-full flex flex-col overflow-y-auto md:col-span-5 bg-slate-950 p-3 md:p-5">
  <!-- スマホ用 戻るナビゲーションバー (STEP 3表示時) -->
  <div id="tracks-mobile-back-bar" class="md:hidden -mx-3 -mt-3 mb-3 px-3 py-2 border-b border-slate-800 bg-slate-950 flex items-center justify-between sticky top-0 z-10">
    <button id="btn-back-to-albums" class="inline-flex items-center gap-1.5 py-1 px-2 -ml-1 text-xs font-medium text-indigo-400 hover:text-indigo-300 active:scale-95 transition">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
      </svg>
      <span>アルバム一覧</span>
    </button>
    <span class="text-xs text-slate-500 font-mono">STEP 3 / 3</span>
  </div>

  <!-- パンくずリスト (PC表示) -->
  <div id="track-breadcrumb" class="hidden md:flex items-center gap-2 text-xs text-slate-400 mb-4 flex-shrink-0">
    <span id="breadcrumb-artist" class="hover:text-slate-200 cursor-pointer">アーティスト</span>
    <span>/</span>
    <span id="breadcrumb-album" class="text-slate-200 font-semibold truncate">アルバム名</span>
  </div>

  <!-- アルバムヘッダーカード -->
  <div id="track-album-header" class="bg-slate-900 border border-slate-800/80 rounded-xl p-3 md:p-4 mb-4 flex gap-3 md:gap-4 items-center flex-shrink-0 shadow-lg">
    <!-- ジャケット画像（タップで拡大） -->
    <div class="relative group cursor-pointer flex-shrink-0" id="btn-zoom-track-artwork">
      <img id="track-header-artwork" src="" alt="Album Artwork"
        class="w-20 h-20 md:w-28 md:h-28 rounded-lg object-cover bg-slate-800 border border-slate-700/60 shadow">
      <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center transition">
        <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"></path>
        </svg>
      </div>
    </div>

    <!-- アルバムメタデータ -->
    <div class="flex-1 min-w-0">
      <h1 id="track-header-album-name" class="text-base md:text-xl font-bold text-slate-100 truncate mb-1">
        アルバム未選択
      </h1>
      <p id="track-header-artist-name" class="text-xs md:text-sm text-indigo-400 font-medium truncate mb-2">
        -
      </p>
      <div class="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
        <span id="track-header-release-date" class="bg-slate-800 px-2 py-0.5 rounded">
          -
        </span>
        <span id="track-header-total-tracks" class="bg-slate-800 px-2 py-0.5 rounded">
          0曲
        </span>
      </div>
    </div>

    <!-- 1曲手動追加ボタン -->
    <div class="flex-shrink-0 hidden sm:block">
      <button id="btn-add-track-to-album" class="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition" title="このアルバムに曲を追加">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
        </svg>
      </button>
    </div>
  </div>

  <!-- ディスク別楽曲コンテナ（Disc 1, Disc 2 ...） -->
  <div id="track-discs-container" class="space-y-4">
    <!-- 動的レンダリング: DiscGroup ごとにカード・テーブルを描画 -->
  </div>

  <!-- 空状態プレースホルダー -->
  <div id="track-empty-state" class="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
    <svg class="w-12 h-12 mb-3 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path>
    </svg>
    <p class="text-sm">アルバムを選択すると<br>収録トラック一覧が表示されます</p>
  </div>
</section>
```

---

### 5.7 iTunes 検索・一括登録モーダルコンポーネント: `src/ItunesModal.html`

#### 【責務】
Apple iTunes Search API からのアルバム検索、検索候補一覧の表示、選択アルバムのLookup（`discNumber` 自動マッピング）プレビュー表示、および Google Drive & スプレッドシートへの一括登録トリガー。

#### 【HTML構造・ID・クラス定義】

```html
<div id="modal-itunes" class="hidden fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-slate-950/80 backdrop-blur-sm">
  <div class="w-full max-w-4xl h-[92vh] md:h-[85vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-modalScale">
    
    <!-- モーダルヘッダー -->
    <div class="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950 flex-shrink-0">
      <div class="flex items-center gap-2">
        <div class="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center text-white">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
          </svg>
        </div>
        <h3 class="text-sm md:text-base font-bold text-slate-100">iTunes からアルバムを一括登録</h3>
      </div>
      <button id="btn-close-itunes-modal" class="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    </div>

    <!-- 検索入力バー -->
    <div class="p-3 border-b border-slate-800 bg-slate-900/90 flex gap-2 flex-shrink-0">
      <input type="text" id="itunes-search-input" placeholder="アーティスト名、アルバム名を入力..."
        class="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500">
      <button id="btn-itunes-search-submit" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-lg transition active:scale-95 flex items-center gap-1.5 flex-shrink-0">
        <span id="itunes-search-btn-text">検索</span>
        <div id="itunes-search-spinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      </button>
    </div>

    <!-- メインコンテンツ 2ペイン（左: 検索結果一覧 / 右: トラックプレビュー） -->
    <div class="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-800">
      
      <!-- 検索結果リスト (PC: col-span-5) -->
      <div id="itunes-results-container" class="h-full overflow-y-auto md:col-span-5 divide-y divide-slate-800/60 p-1">
        <!-- 候補リスト動的生成 -->
        <div id="itunes-results-placeholder" class="p-8 text-center text-slate-500 text-xs">
          キーワードを入力して検索してください
        </div>
      </div>

      <!-- トラックプレビューパネル (PC: col-span-7) -->
      <div id="itunes-preview-panel" class="h-full overflow-y-auto md:col-span-7 bg-slate-950/60 p-4 flex flex-col">
        <div id="itunes-preview-empty" class="flex-1 flex flex-col items-center justify-center text-center text-slate-500 text-xs">
          左のリストからアルバムを選択すると<br>収録曲プレビューが表示されます
        </div>

        <div id="itunes-preview-content" class="hidden flex-1 flex flex-col">
          <!-- プレビューヘッダー -->
          <div class="flex gap-3 items-center mb-4 pb-3 border-b border-slate-800 flex-shrink-0">
            <img id="itunes-preview-artwork" src="" class="w-16 h-16 rounded-lg object-cover bg-slate-800 border border-slate-700">
            <div class="min-w-0 flex-1">
              <h4 id="itunes-preview-album" class="text-sm md:text-base font-bold text-slate-100 truncate"></h4>
              <p id="itunes-preview-artist" class="text-xs text-indigo-400 font-medium truncate"></p>
              <p id="itunes-preview-meta" class="text-xs text-slate-500 font-mono mt-0.5"></p>
            </div>
          </div>

          <!-- プレビュートラックテーブル -->
          <div class="flex-1 overflow-y-auto pr-1">
            <table class="w-full text-left text-xs text-slate-300">
              <thead class="sticky top-0 bg-slate-900 text-slate-400 uppercase text-[10px] font-mono border-b border-slate-800">
                <tr>
                  <th class="py-1 px-1.5 w-10 text-center">CD</th>
                  <th class="py-1 px-1.5 w-10 text-center">No</th>
                  <th class="py-1 px-2">曲名</th>
                  <th class="py-1 px-2">アーティスト</th>
                </tr>
              </thead>
              <tbody id="itunes-preview-tracks-tbody" class="divide-y divide-slate-800/40">
                <!-- 動的生成 -->
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>

    <!-- モーダルフッター -->
    <div class="px-4 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between flex-shrink-0">
      <span id="itunes-selected-summary" class="text-xs text-slate-400 font-mono truncate mr-2">
        アルバムを選択してください
      </span>
      <div class="flex items-center gap-2">
        <button id="btn-cancel-itunes-modal" class="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 border border-slate-800 hover:bg-slate-800 rounded-lg transition">
          キャンセル
        </button>
        <button id="btn-submit-itunes-batch" disabled class="px-4 py-1.5 text-xs font-semibold bg-indigo-600 disabled:bg-slate-800 disabled:text-slate-600 hover:bg-indigo-500 text-white rounded-lg shadow transition flex items-center gap-1.5">
          <span id="itunes-batch-btn-text">このアルバムを一括登録</span>
          <div id="itunes-batch-spinner" class="hidden w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        </button>
      </div>
    </div>

  </div>
</div>
```

---

### 5.8 手動楽曲登録モーダルコンポーネント: `src/ManualModal.html`

#### 【責務】
1曲単位での手動登録フォーム。スマートフォンでのテンキー入力支援（`inputmode="numeric"`）、および「続けて次のトラックを登録する」連続登録アシストチェックボックスを搭載。

#### 【HTML構造・ID・クラス定義】

```html
<div id="modal-manual" class="hidden fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4 bg-slate-950/80 backdrop-blur-sm">
  <div class="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-modalScale">
    
    <!-- ヘッダー -->
    <div class="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950 flex-shrink-0">
      <h3 class="text-sm md:text-base font-bold text-slate-100 flex items-center gap-2">
        <svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
        </svg>
        楽曲を手動登録
      </h3>
      <button id="btn-close-manual-modal" class="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    </div>

    <!-- フォーム本体 -->
    <form id="form-manual-track" class="p-4 space-y-3 overflow-y-auto max-h-[75vh]">
      
      <!-- アルバムアーティスト -->
      <div>
        <label class="block text-xs font-semibold text-slate-300 mb-1">アルバムアーティスト名 <span class="text-rose-500">*</span></label>
        <input type="text" id="manual-album-artist" required placeholder="例: Official髭男dism"
          class="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs md:text-sm text-slate-200 focus:outline-none focus:border-indigo-500">
      </div>

      <!-- アルバム名 -->
      <div>
        <label class="block text-xs font-semibold text-slate-300 mb-1">アルバム名 <span class="text-rose-500">*</span></label>
        <input type="text" id="manual-album-name" required placeholder="例: Editorial"
          class="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs md:text-sm text-slate-200 focus:outline-none focus:border-indigo-500">
      </div>

      <!-- CD番号 & トラック番号 (横並び) -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1">CD番号 (Disc) <span class="text-rose-500">*</span></label>
          <input type="number" id="manual-cd-number" min="1" value="1" required inputmode="numeric" pattern="[0-9]*"
            class="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs md:text-sm text-slate-200 font-mono focus:outline-none focus:border-indigo-500">
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1">トラック番号 <span class="text-rose-500">*</span></label>
          <input type="number" id="manual-track-number" min="1" value="1" required inputmode="numeric" pattern="[0-9]*"
            class="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs md:text-sm text-slate-200 font-mono focus:outline-none focus:border-indigo-500">
        </div>
      </div>

      <!-- トラック名 -->
      <div>
        <label class="block text-xs font-semibold text-slate-300 mb-1">トラック名 (曲名) <span class="text-rose-500">*</span></label>
        <input type="text" id="manual-track-name" required placeholder="例: Cry Baby"
          class="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs md:text-sm text-slate-200 focus:outline-none focus:border-indigo-500">
      </div>

      <!-- トラックアーティスト -->
      <div>
        <label class="block text-xs font-semibold text-slate-300 mb-1">トラックアーティスト名 <span class="text-rose-500">*</span></label>
        <input type="text" id="manual-track-artist" required placeholder="アルバムアーティストと同一の場合は自動設定"
          class="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs md:text-sm text-slate-200 focus:outline-none focus:border-indigo-500">
      </div>

      <!-- リリース日 & アートワークURL (任意) -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label class="block text-xs text-slate-400 mb-1">リリース日 (任意)</label>
          <input type="date" id="manual-release-date"
            class="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500">
        </div>
        <div>
          <label class="block text-xs text-slate-400 mb-1">アートワークURL (任意)</label>
          <input type="url" id="manual-artwork-url" placeholder="https://..."
            class="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500">
        </div>
      </div>

      <!-- 連続登録チェックボックス -->
      <div class="pt-2 flex items-center gap-2">
        <input type="checkbox" id="manual-continuous-check" class="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-700 focus:ring-0">
        <label for="manual-continuous-check" class="text-xs text-slate-300 cursor-pointer">
          登録後もフォームを開いたまま、次の曲番号（+1）で連続登録する
        </label>
      </div>

    </form>

    <!-- フッター -->
    <div class="px-4 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-end gap-2 flex-shrink-0">
      <button id="btn-cancel-manual-modal" class="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 border border-slate-800 hover:bg-slate-800 rounded-lg transition">
        キャンセル
      </button>
      <button id="btn-submit-manual-track" class="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow transition flex items-center gap-1.5">
        <span id="manual-submit-btn-text">登録する</span>
        <div id="manual-submit-spinner" class="hidden w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      </button>
    </div>

  </div>
</div>
```

---

### 5.9 アルバムアート拡大モーダルコンポーネント: `src/ImageModal.html`

#### 【責務】
アルバムジャケット画像（500x500 高精細画像）の拡大プレビュー表示、ESCキーやオーバーレイクリックでのクローズ。

#### 【HTML構造・ID・クラス定義】

```html
<div id="modal-image" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
  <div class="relative max-w-lg w-full flex flex-col items-center animate-modalScale">
    
    <!-- 閉じるボタン -->
    <button id="btn-close-image-modal" class="absolute -top-10 right-0 text-slate-400 hover:text-white p-1 rounded-full transition">
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
      </svg>
    </button>

    <!-- 高解像度ジャケット画像 -->
    <img id="image-modal-img" src="" alt="Album Artwork Large"
      class="w-full max-h-[75vh] object-contain rounded-xl shadow-2xl border border-slate-700/80 bg-slate-900">

    <!-- タイトルキャプション -->
    <div class="mt-3 text-center">
      <h4 id="image-modal-title" class="text-sm font-bold text-slate-200 truncate max-w-md"></h4>
    </div>
  </div>
</div>
```

---

## 6. フロントエンド ロジック層詳細設計（JavaScript Classes）

### 6.1 共通ユーティリティヘルパー: `src/ScriptsUtils.html`（`Utils`）

#### 【責務】
HTMLエスケープ（XSS防止）、日付整形、関数のデバウンス、トースト通知表示、グローバルローディング表示の提供。

#### 【完全な実装コード仕様】

```html
<script>
/**
 * ユーティリティヘルパークラス
 */
class Utils {
  /**
   * HTML特殊文字のエスケープ処理 (XSS対策)
   * @param {string} str 
   * @returns {string}
   */
  static escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(str).replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * ISO日付文字列を YYYY-MM-DD に整形
   * @param {string|Date} dateVal 
   * @returns {string}
   */
  static formatDate(dateVal) {
    if (!dateVal) return '';
    if (dateVal instanceof Date) {
      const y = dateVal.getFullYear();
      const m = String(dateVal.getMonth() + 1).padStart(2, '0');
      const d = String(dateVal.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return String(dateVal).substring(0, 10);
  }

  /**
   * 関数デバウンス
   * @param {Function} func 
   * @param {number} wait 
   * @returns {Function}
   */
  static debounce(func, wait = 250) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  /**
   * トースト通知を表示
   * @param {string} message 
   * @param {'success'|'error'|'info'|'warning'} type 
   * @param {number} duration 
   */
  static showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const colorMap = {
      success: 'bg-emerald-600 border-emerald-500 text-white',
      error: 'bg-rose-600 border-rose-500 text-white',
      warning: 'bg-amber-600 border-amber-500 text-white',
      info: 'bg-indigo-600 border-indigo-500 text-white'
    };

    const colorClass = colorMap[type] || colorMap.info;
    toast.className = `px-4 py-2.5 rounded-lg shadow-xl text-xs md:text-sm font-medium border flex items-center gap-2 animate-fadeIn pointer-events-auto transition-all ${colorClass}`;
    toast.innerHTML = `<span>${this.escapeHtml(message)}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 200);
    }, duration);
  }

  /**
   * グローバルローディングの表示/非表示
   * @param {boolean} show 
   * @param {string} text 
   */
  static toggleGlobalLoading(show, text = '処理中...') {
    const el = document.getElementById('global-loading');
    const txtEl = document.getElementById('global-loading-text');
    if (!el) return;

    if (show) {
      if (txtEl) txtEl.textContent = text;
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  }
}
</script>
```

---

### 6.2 通信クライアントクラス: `src/ScriptsApiClient.html`（`ApiClient`）

#### 【責務】
`google.script.run` のRPC呼び出しをPromiseでラップし、タイムアウトやバックエンド例外を標準化して返却する。

#### 【完全な実装コード仕様】

```html
<script>
/**
 * GAS 非同期通信クライアントクラス
 */
class ApiClient {
  /**
   * google.script.run の関数呼び出しをPromise化
   * @param {string} functionName 
   * @param  {...any} args 
   * @returns {Promise<any>}
   */
  callGAS(functionName, ...args) {
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        // ローカルモック用フォールバック
        console.warn(`[Mock] google.script.run.${functionName} 呼び出し:`, args);
        return reject(new Error('google.script.run は GAS 環境でのみ動作します。'));
      }

      google.script.run
        .withSuccessHandler((response) => {
          if (response && response.success === false) {
            const err = new Error(response.error || 'サーバーエラーが発生しました');
            err.code = response.code;
            reject(err);
          } else {
            resolve(response ? response.data : null);
          }
        })
        .withFailureHandler((error) => {
          console.error(`GAS RPC 失敗 [${functionName}]:`, error);
          reject(new Error(error.message || '通信エラーが発生しました'));
        })[functionName](...args);
    });
  }

  /**
   * スプレッドシート全楽曲データ取得
   * @returns {Promise<{ tracks: RawTrackRow[], totalTracks: number, loadedAt: string }>}
   */
  getAllData() {
    return this.callGAS('apiGetAllData');
  }

  /**
   * iTunes アルバム検索
   * @param {string} keyword 
   * @returns {Promise<{ albums: ItunesAlbumSummary[] }>}
   */
  searchItunes(keyword) {
    return this.callGAS('apiSearchItunes', keyword);
  }

  /**
   * iTunes アルバム収録曲Lookup
   * @param {number|string} collectionId 
   * @returns {Promise<{ albumDetail: ItunesAlbumDetail }>}
   */
  lookupItunesAlbum(collectionId) {
    return this.callGAS('apiLookupItunesAlbum', collectionId);
  }

  /**
   * iTunes アルバム一括保存
   * @param {BatchSavePayload} payload 
   * @returns {Promise<{ count: number, savedAlbum: string, artworkUrl: string }>}
   */
  saveAlbumBatch(payload) {
    return this.callGAS('apiSaveAlbumBatch', payload);
  }

  /**
   * 手動1曲追加
   * @param {SingleTrackPayload} track 
   * @returns {Promise<{ savedTrack: RawTrackRow }>}
   */
  saveTrackSingle(track) {
    return this.callGAS('apiSaveTrackSingle', track);
  }
}
</script>
```

---

### 6.3 状態管理クラス: `src/ScriptsState.html`（`Store`）

#### 【責務】
単一状態モデル `StoreState` を保持し、フラット行からの階層ツリー（`MusicCatalog`）の構築、アーティスト絞り込み、全体横断検索、選択状態の保持を担当する。

#### 【完全な実装コード仕様】

```html
<script>
/**
 * フロントエンド状態管理クラス
 */
class Store {
  constructor() {
    this.state = {
      allTracks: [],
      musicCatalog: {},
      artistList: [],
      selectedArtist: null,
      selectedAlbum: null,
      mobileStep: 1, // 1: アーティスト, 2: アルバム, 3: トラック
      searchQuery: '',
      artistFilter: '',
      isLoading: false,
      isSaving: false,

      // iTunesモーダル
      itunesSearchResults: [],
      selectedItunesAlbum: null,

      // 手動登録フォーム状態
      manualForm: {
        cdNumber: 1,
        albumArtist: '',
        albumName: '',
        trackArtist: '',
        trackNumber: 1,
        trackName: '',
        releaseDate: '',
        artworkUrl: ''
      },

      // 画像拡大
      zoomImageUrl: null,
      zoomImageTitle: ''
    };
  }

  /**
   * 全トラック配列をセットしカタログツリーを構築
   * @param {RawTrackRow[]} tracks 
   */
  setTracks(tracks) {
    this.state.allTracks = Array.isArray(tracks) ? tracks : [];
    this.buildCatalog();
  }

  /**
   * フラット配列から MusicCatalog ツリーを構築
   */
  buildCatalog() {
    const catalog = {};

    this.state.allTracks.forEach((t) => {
      const artist = t.albumArtist || '不明なアーティスト';
      const album = t.albumName || '不明なアルバム';
      const cdNo = Number(t.cdNumber) || 1;

      if (!catalog[artist]) {
        catalog[artist] = {
          artistName: artist,
          albumCount: 0,
          albums: {}
        };
      }

      if (!catalog[artist].albums[album]) {
        catalog[artist].albums[album] = {
          albumName: album,
          albumArtist: artist,
          releaseDate: t.releaseDate || '',
          artworkUrl: t.artworkUrl || '',
          totalTracks: 0,
          discs: {}
        };
        catalog[artist].albumCount++;
      }

      const albumObj = catalog[artist].albums[album];
      if (t.releaseDate && !albumObj.releaseDate) albumObj.releaseDate = t.releaseDate;
      if (t.artworkUrl && !albumObj.artworkUrl) albumObj.artworkUrl = t.artworkUrl;

      if (!albumObj.discs[cdNo]) {
        albumObj.discs[cdNo] = {
          cdNumber: cdNo,
          tracks: []
        };
      }

      albumObj.discs[cdNo].tracks.push({
        cdNumber: cdNo,
        trackNumber: Number(t.trackNumber) || 1,
        trackName: t.trackName || '無題',
        trackArtist: t.trackArtist || artist
      });

      albumObj.totalTracks++;
    });

    // 各ディスク内のトラックをトラック番号順にソート
    Object.values(catalog).forEach((artistData) => {
      Object.values(artistData.albums).forEach((albumData) => {
        Object.values(albumData.discs).forEach((discGroup) => {
          discGroup.tracks.sort((a, b) => a.trackNumber - b.trackNumber);
        });
      });
    });

    this.state.musicCatalog = catalog;
    this.state.artistList = Object.keys(catalog).sort((a, b) => a.localeCompare(b, 'ja'));
  }

  /**
   * フィルターされたアーティスト名一覧を取得
   * @returns {string[]}
   */
  getFilteredArtists() {
    const filter = this.state.artistFilter.trim().toLowerCase();
    if (!filter) return this.state.artistList;
    return this.state.artistList.filter(artist => artist.toLowerCase().includes(filter));
  }

  /**
   * 現在選択中アーティストのアルバム配列を取得
   * @returns {AlbumData[]}
   */
  getAlbumsForSelectedArtist() {
    if (!this.state.selectedArtist || !this.state.musicCatalog[this.state.selectedArtist]) {
      return [];
    }
    const albumsObj = this.state.musicCatalog[this.state.selectedArtist].albums;
    return Object.values(albumsObj).sort((a, b) => {
      // リリース日降順、無ければアルバム名昇順
      if (a.releaseDate && b.releaseDate) return b.releaseDate.localeCompare(a.releaseDate);
      return a.albumName.localeCompare(b.albumName, 'ja');
    });
  }

  /**
   * 現在選択中のアルバムデータを取得
   * @returns {AlbumData|null}
   */
  getSelectedAlbumData() {
    if (!this.state.selectedArtist || !this.state.selectedAlbum) return null;
    const artist = this.state.musicCatalog[this.state.selectedArtist];
    if (!artist) return null;
    return artist.albums[this.state.selectedAlbum] || null;
  }

  /**
   * 全体クイック横断検索
   * @param {string} query 
   * @returns {RawTrackRow[]}
   */
  searchAcrossAllTracks(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return [];
    return this.state.allTracks.filter((t) => {
      return (
        (t.trackName && t.trackName.toLowerCase().includes(q)) ||
        (t.albumName && t.albumName.toLowerCase().includes(q)) ||
        (t.albumArtist && t.albumArtist.toLowerCase().includes(q)) ||
        (t.trackArtist && t.trackArtist.toLowerCase().includes(q)) ||
        String(t.cdNumber) === q
      );
    });
  }
}
</script>
```

---

### 6.4 アプリケーションコントローラークラス: `src/ScriptsApp.html`（`App`）

#### 【責務】
`Store`, `ApiClient`, `Utils` を協調させ、DOMイベントのバインド、画面描画、モーダル制御、画面ステップ遷移、およびAPI連携を実行する。

#### 【完全な実装コード仕様】

```html
<script>
/**
 * アプリケーションコントローラークラス
 */
class App {
  constructor() {
    this.store = new Store();
    this.api = new ApiClient();
  }

  /**
   * アプリケーション初期化
   */
  async init() {
    this.bindEvents();
    this.handleResize();
    await this.loadInitialData();
  }

  /**
   * 全DOMイベントリスナーの登録
   */
  bindEvents() {
    // ウィンドウリサイズ
    window.addEventListener('resize', Utils.debounce(() => this.handleResize(), 150));

    // PC用 全体クイック検索
    const headerSearch = document.getElementById('header-search-input');
    const headerClear = document.getElementById('header-search-clear');
    if (headerSearch) {
      headerSearch.addEventListener('input', Utils.debounce((e) => {
        this.handleGlobalSearch(e.target.value);
        if (headerClear) headerClear.classList.toggle('hidden', !e.target.value);
      }, 200));
    }
    if (headerClear) {
      headerClear.addEventListener('click', () => {
        if (headerSearch) headerSearch.value = '';
        headerClear.classList.add('hidden');
        this.handleGlobalSearch('');
      });
    }

    // スマホ用 全体クイック検索
    const mobileSearch = document.getElementById('mobile-search-input');
    if (mobileSearch) {
      mobileSearch.addEventListener('input', Utils.debounce((e) => {
        this.handleGlobalSearch(e.target.value);
      }, 200));
    }

    // STEP 1 アーティスト絞り込み
    const artistFilter = document.getElementById('artist-filter-input');
    const artistFilterClear = document.getElementById('artist-filter-clear');
    if (artistFilter) {
      artistFilter.addEventListener('input', (e) => {
        this.store.state.artistFilter = e.target.value;
        if (artistFilterClear) artistFilterClear.classList.toggle('hidden', !e.target.value);
        this.renderArtistList();
      });
    }
    if (artistFilterClear) {
      artistFilterClear.addEventListener('click', () => {
        if (artistFilter) artistFilter.value = '';
        artistFilterClear.classList.add('hidden');
        this.store.state.artistFilter = '';
        this.renderArtistList();
      });
    }

    // ナビゲーション戻るボタン
    const btnBackToArtists = document.getElementById('btn-back-to-artists');
    if (btnBackToArtists) {
      btnBackToArtists.addEventListener('click', () => this.setMobileStep(1));
    }
    const btnBackToAlbums = document.getElementById('btn-back-to-albums');
    if (btnBackToAlbums) {
      btnBackToAlbums.addEventListener('click', () => this.setMobileStep(2));
    }

    // 再読み込みボタン
    const btnReload = document.getElementById('btn-reload-data');
    if (btnReload) {
      btnReload.addEventListener('click', () => this.loadInitialData());
    }

    // iTunes モーダル開閉
    const btnOpenItunes = document.getElementById('btn-open-itunes-modal');
    if (btnOpenItunes) btnOpenItunes.addEventListener('click', () => this.openItunesModal());
    const btnCloseItunes = document.getElementById('btn-close-itunes-modal');
    if (btnCloseItunes) btnCloseItunes.addEventListener('click', () => this.closeItunesModal());
    const btnCancelItunes = document.getElementById('btn-cancel-itunes-modal');
    if (btnCancelItunes) btnCancelItunes.addEventListener('click', () => this.closeItunesModal());

    // iTunes 検索実行
    const btnSearchItunes = document.getElementById('btn-itunes-search-submit');
    const inputSearchItunes = document.getElementById('itunes-search-input');
    if (btnSearchItunes) btnSearchItunes.addEventListener('click', () => this.executeItunesSearch());
    if (inputSearchItunes) {
      inputSearchItunes.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.executeItunesSearch();
      });
    }

    // iTunes 一括登録確定
    const btnSubmitItunes = document.getElementById('btn-submit-itunes-batch');
    if (btnSubmitItunes) btnSubmitItunes.addEventListener('click', () => this.submitItunesBatch());

    // 手動登録 モーダル開閉
    const btnOpenManual = document.getElementById('btn-open-manual-modal');
    if (btnOpenManual) btnOpenManual.addEventListener('click', () => this.openManualModal());
    const btnCloseManual = document.getElementById('btn-close-manual-modal');
    if (btnCloseManual) btnCloseManual.addEventListener('click', () => this.closeManualModal());
    const btnCancelManual = document.getElementById('btn-cancel-manual-modal');
    if (btnCancelManual) btnCancelManual.addEventListener('click', () => this.closeManualModal());

    // アルバム詳細内の「+ 曲追加」ボタン
    const btnAddTrackToAlbum = document.getElementById('btn-add-track-to-album');
    if (btnAddTrackToAlbum) {
      btnAddTrackToAlbum.addEventListener('click', () => {
        const curAlbum = this.store.getSelectedAlbumData();
        if (curAlbum) {
          this.openManualModal({
            albumArtist: curAlbum.albumArtist,
            albumName: curAlbum.albumName,
            releaseDate: curAlbum.releaseDate,
            artworkUrl: curAlbum.artworkUrl,
            cdNumber: 1,
            trackNumber: curAlbum.totalTracks + 1
          });
        } else {
          this.openManualModal();
        }
      });
    }

    // 手動登録 送信
    const btnSubmitManual = document.getElementById('btn-submit-manual-track');
    if (btnSubmitManual) btnSubmitManual.addEventListener('click', () => this.submitManualTrack());

    // アルバムアート拡大
    const btnZoomArtwork = document.getElementById('btn-zoom-track-artwork');
    if (btnZoomArtwork) {
      btnZoomArtwork.addEventListener('click', () => {
        const album = this.store.getSelectedAlbumData();
        if (album && album.artworkUrl) {
          this.openImageModal(album.artworkUrl, `${album.albumArtist} - ${album.albumName}`);
        }
      });
    }
    const btnCloseImage = document.getElementById('btn-close-image-modal');
    if (btnCloseImage) btnCloseImage.addEventListener('click', () => this.closeImageModal());

    // ESCキーで全モーダル閉じる
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeItunesModal();
        this.closeManualModal();
        this.closeImageModal();
      }
    });
  }

  /**
   * スプレッドシートからの全データ初期ロード
   */
  async loadInitialData() {
    Utils.toggleGlobalLoading(true, 'スプレッドシートから楽曲カタログを取得中...');
    try {
      const data = await this.api.getAllData();
      this.store.setTracks(data.tracks || []);

      // PC表示時、先頭アーティスト・アルバムを自動選択
      if (window.innerWidth >= 768 && this.store.state.artistList.length > 0) {
        if (!this.store.state.selectedArtist) {
          const firstArtist = this.store.state.artistList[0];
          this.store.state.selectedArtist = firstArtist;
          const albums = this.store.getAlbumsForSelectedArtist();
          if (albums.length > 0) {
            this.store.state.selectedAlbum = albums[0].albumName;
          }
        }
      }

      this.renderAll();
      Utils.showToast(`${this.store.state.allTracks.length} 件の楽曲を読み込みました`, 'success');
    } catch (err) {
      console.error(err);
      Utils.showToast(`データ取得失敗: ${err.message}`, 'error', 6000);
    } finally {
      Utils.toggleGlobalLoading(false);
    }
  }

  /**
   * 全ペインの再描画
   */
  renderAll() {
    this.renderArtistList();
    this.renderAlbumList();
    this.renderTrackDetail();
  }

  /**
   * STEP 1 アーティスト一覧の描画
   */
  renderArtistList() {
    const container = document.getElementById('artist-list-container');
    const badge = document.getElementById('artist-count-badge');
    const emptyState = document.getElementById('artist-empty-state');
    if (!container) return;

    const filtered = this.store.getFilteredArtists();
    if (badge) badge.textContent = `${filtered.length}件`;

    if (filtered.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }
    if (emptyState) emptyState.classList.add('hidden');

    const html = filtered.map((artist) => {
      const artistData = this.store.state.musicCatalog[artist];
      const albumCount = artistData ? artistData.albumCount : 0;
      const isSelected = this.store.state.selectedArtist === artist;
      const activeClass = isSelected
        ? 'bg-indigo-600/20 border-l-4 border-indigo-500 text-indigo-200'
        : 'hover:bg-slate-800/60 text-slate-300 border-l-4 border-transparent';

      return `
        <div class="artist-item px-3 py-2.5 flex items-center justify-between cursor-pointer transition select-none min-h-[44px] ${activeClass}"
             data-artist="${Utils.escapeHtml(artist)}">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xs md:text-sm font-medium truncate">${Utils.escapeHtml(artist)}</span>
          </div>
          <div class="flex items-center gap-1.5 flex-shrink-0">
            <span class="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">${albumCount}作</span>
            <svg class="w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
            </svg>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;

    // クリックイベント
    container.querySelectorAll('.artist-item').forEach((el) => {
      el.addEventListener('click', () => {
        const artist = el.getAttribute('data-artist');
        this.selectArtist(artist);
      });
    });
  }

  /**
   * アーティスト選択時
   * @param {string} artist 
   */
  selectArtist(artist) {
    this.store.state.selectedArtist = artist;
    const albums = this.store.getAlbumsForSelectedArtist();
    this.store.state.selectedAlbum = albums.length > 0 ? albums[0].albumName : null;

    this.renderArtistList();
    this.renderAlbumList();
    this.renderTrackDetail();

    // スマホ時は STEP 2 へ画面遷移
    if (window.innerWidth < 768) {
      this.setMobileStep(2);
    }
  }

  /**
   * STEP 2 アルバムカード一覧の描画
   */
  renderAlbumList() {
    const container = document.getElementById('album-grid-container');
    const headerName = document.getElementById('albums-header-artist-name');
    const countBadge = document.getElementById('album-count-badge');
    const emptyState = document.getElementById('album-empty-state');
    if (!container) return;

    const artist = this.store.state.selectedArtist;
    if (!artist) {
      if (headerName) headerName.textContent = '未選択';
      if (countBadge) countBadge.textContent = '0作品';
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (headerName) headerName.textContent = artist;
    const albums = this.store.getAlbumsForSelectedArtist();
    if (countBadge) countBadge.textContent = `${albums.length}作品`;

    if (albums.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }
    if (emptyState) emptyState.classList.add('hidden');

    const html = albums.map((album) => {
      const isSelected = this.store.state.selectedAlbum === album.albumName;
      const borderClass = isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-slate-800 hover:border-slate-700';
      const artwork = album.artworkUrl || '';

      return `
        <div class="album-card group cursor-pointer bg-slate-900 border ${borderClass} rounded-xl p-2.5 flex flex-col transition hover:bg-slate-800/80 active:scale-95 select-none"
             data-album="${Utils.escapeHtml(album.albumName)}">
          <div class="aspect-square w-full rounded-lg bg-slate-800 overflow-hidden mb-2 relative">
            ${artwork ? `
              <img src="${Utils.escapeHtml(artwork)}" alt="art" class="w-full h-full object-cover transition duration-300 group-hover:scale-105" loading="lazy">
            ` : `
              <div class="w-full h-full flex items-center justify-center text-slate-700">
                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path>
                </svg>
              </div>
            `}
            <div class="absolute bottom-1 right-1 px-1.5 py-0.5 bg-slate-950/80 backdrop-blur rounded text-[10px] font-mono text-slate-300">
              ${album.totalTracks}曲
            </div>
          </div>
          <h4 class="text-xs font-bold text-slate-200 line-clamp-2 leading-tight mb-1 group-hover:text-indigo-300 transition">
            ${Utils.escapeHtml(album.albumName)}
          </h4>
          <span class="text-[11px] text-slate-500 font-mono">
            ${album.releaseDate ? Utils.formatDate(album.releaseDate) : '日付なし'}
          </span>
        </div>
      `;
    }).join('');

    container.innerHTML = html;

    container.querySelectorAll('.album-card').forEach((el) => {
      el.addEventListener('click', () => {
        const albumName = el.getAttribute('data-album');
        this.selectAlbum(albumName);
      });
    });
  }

  /**
   * アルバム選択時
   * @param {string} albumName 
   */
  selectAlbum(albumName) {
    this.store.state.selectedAlbum = albumName;
    this.renderAlbumList();
    this.renderTrackDetail();

    // スマホ時は STEP 3 へ画面遷移
    if (window.innerWidth < 768) {
      this.setMobileStep(3);
    }
  }

  /**
   * STEP 3 トラック詳細・ディスク別一覧の描画
   */
  renderTrackDetail() {
    const album = this.store.getSelectedAlbumData();
    const discsContainer = document.getElementById('track-discs-container');
    const emptyState = document.getElementById('track-empty-state');
    const headerCard = document.getElementById('track-album-header');
    if (!discsContainer) return;

    if (!album) {
      if (headerCard) headerCard.classList.add('hidden');
      discsContainer.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    if (headerCard) headerCard.classList.remove('hidden');

    // パンくず
    const bcArtist = document.getElementById('breadcrumb-artist');
    const bcAlbum = document.getElementById('breadcrumb-album');
    if (bcArtist) {
      bcArtist.textContent = album.albumArtist;
      bcArtist.onclick = () => {
        if (window.innerWidth < 768) this.setMobileStep(1);
      };
    }
    if (bcAlbum) bcAlbum.textContent = album.albumName;

    // ヘッダー情報
    const hArt = document.getElementById('track-header-artwork');
    const hAlbum = document.getElementById('track-header-album-name');
    const hArtist = document.getElementById('track-header-artist-name');
    const hDate = document.getElementById('track-header-release-date');
    const hTotal = document.getElementById('track-header-total-tracks');

    if (hArt) {
      hArt.src = album.artworkUrl || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%23475569" stroke-width="1.5"><rect width="24" height="24" fill="%231e293b"/><circle cx="12" cy="12" r="4"/></svg>';
    }
    if (hAlbum) hAlbum.textContent = album.albumName;
    if (hArtist) hArtist.textContent = album.albumArtist;
    if (hDate) hDate.textContent = album.releaseDate ? `発売: ${Utils.formatDate(album.releaseDate)}` : '発売日未設定';
    if (hTotal) hTotal.textContent = `全 ${album.totalTracks} 曲`;

    // ディスク順に描画
    const sortedDiscs = Object.values(album.discs).sort((a, b) => a.cdNumber - b.cdNumber);

    const html = sortedDiscs.map((disc) => {
      const rows = disc.tracks.map((t) => `
        <div class="px-3 py-2 flex items-center justify-between hover:bg-slate-800/50 transition border-b border-slate-800/40 last:border-b-0 min-h-[44px]">
          <div class="flex items-center gap-3 min-w-0 pr-2">
            <span class="w-6 text-center text-xs font-mono font-semibold text-slate-500 flex-shrink-0">
              ${t.trackNumber}
            </span>
            <div class="min-w-0">
              <p class="text-xs md:text-sm font-medium text-slate-200 truncate">
                ${Utils.escapeHtml(t.trackName)}
              </p>
              ${t.trackArtist !== album.albumArtist ? `
                <p class="text-[11px] text-slate-400 truncate">${Utils.escapeHtml(t.trackArtist)}</p>
              ` : ''}
            </div>
          </div>
          <span class="text-[10px] text-slate-500 font-mono uppercase bg-slate-800/60 px-1.5 py-0.5 rounded flex-shrink-0">
            Track ${t.trackNumber}
          </span>
        </div>
      `).join('');

      return `
        <div class="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden shadow">
          <div class="px-3 py-2 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-indigo-500"></span>
              <h3 class="text-xs md:text-sm font-bold text-slate-200 font-mono">Disc ${disc.cdNumber}</h3>
              <span class="text-[11px] text-slate-400 font-mono">(CD番号: ${disc.cdNumber})</span>
            </div>
            <span class="text-xs text-slate-400 font-mono">${disc.tracks.length} 曲</span>
          </div>
          <div class="divide-y divide-slate-800/40">
            ${rows}
          </div>
        </div>
      `;
    }).join('');

    discsContainer.innerHTML = html;
  }

  /**
   * モバイルステップ切り替え
   * @param {1|2|3} step 
   */
  setMobileStep(step) {
    this.store.state.mobileStep = step;
    if (window.innerWidth >= 768) return;

    const pArtists = document.getElementById('pane-artists');
    const pAlbums = document.getElementById('pane-albums');
    const pTracks = document.getElementById('pane-tracks');

    if (pArtists) pArtists.classList.toggle('hidden', step !== 1);
    if (pAlbums) pAlbums.classList.toggle('hidden', step !== 2);
    if (pTracks) pTracks.classList.toggle('hidden', step !== 3);
  }

  /**
   * リサイズ時のペイン表示制御
   */
  handleResize() {
    const pArtists = document.getElementById('pane-artists');
    const pAlbums = document.getElementById('pane-albums');
    const pTracks = document.getElementById('pane-tracks');

    if (window.innerWidth >= 768) {
      if (pArtists) pArtists.classList.remove('hidden');
      if (pAlbums) pAlbums.classList.remove('hidden');
      if (pTracks) pTracks.classList.remove('hidden');
    } else {
      this.setMobileStep(this.store.state.mobileStep);
    }
  }

  /**
   * 全体クイック横断検索
   * @param {string} query 
   */
  handleGlobalSearch(query) {
    if (!query || !query.trim()) {
      this.store.state.artistFilter = '';
      this.renderAll();
      return;
    }

    const matchedTracks = this.store.searchAcrossAllTracks(query);
    if (matchedTracks.length === 0) {
      Utils.showToast(`「${query}」に一致する楽曲は見つかりませんでした`, 'info', 2000);
      return;
    }

    // 最初に見つかった曲のアーティストとアルバムへジャンプ
    const firstMatch = matchedTracks[0];
    this.store.state.selectedArtist = firstMatch.albumArtist;
    this.store.state.selectedAlbum = firstMatch.albumName;
    this.renderAll();

    Utils.showToast(`「${query}」で ${matchedTracks.length} 件一致しました`, 'success', 2500);

    if (window.innerWidth < 768) {
      this.setMobileStep(3);
    }
  }

  /**
   * iTunes モーダル表示
   */
  openItunesModal() {
    const modal = document.getElementById('modal-itunes');
    if (modal) modal.classList.remove('hidden');
    const input = document.getElementById('itunes-search-input');
    if (input) {
      input.value = this.store.state.selectedArtist || '';
      input.focus();
    }
  }

  closeItunesModal() {
    const modal = document.getElementById('modal-itunes');
    if (modal) modal.classList.add('hidden');
  }

  /**
   * iTunes 検索実行
   */
  async executeItunesSearch() {
    const input = document.getElementById('itunes-search-input');
    const keyword = input ? input.value.trim() : '';
    if (!keyword) {
      Utils.showToast('検索キーワードを入力してください', 'warning');
      return;
    }

    const btnText = document.getElementById('itunes-search-btn-text');
    const spinner = document.getElementById('itunes-search-spinner');
    if (btnText) btnText.classList.add('hidden');
    if (spinner) spinner.classList.remove('hidden');

    try {
      const res = await this.api.searchItunes(keyword);
      this.store.state.itunesSearchResults = res.albums || [];
      this.renderItunesResults();
    } catch (err) {
      Utils.showToast(`iTunes検索エラー: ${err.message}`, 'error');
    } finally {
      if (btnText) btnText.classList.remove('hidden');
      if (spinner) spinner.classList.add('hidden');
    }
  }

  /**
   * iTunes 検索結果描画
   */
  renderItunesResults() {
    const container = document.getElementById('itunes-results-container');
    if (!container) return;

    const list = this.store.state.itunesSearchResults;
    if (list.length === 0) {
      container.innerHTML = '<div class="p-8 text-center text-slate-500 text-xs">該当するアルバムが見つかりませんでした</div>';
      return;
    }

    const html = list.map((item) => `
      <div class="itunes-result-item p-2.5 hover:bg-slate-800/60 cursor-pointer flex gap-2.5 items-center transition"
           data-id="${item.collectionId}">
        <img src="${Utils.escapeHtml(item.artworkUrl100)}" class="w-12 h-12 rounded object-cover bg-slate-800 flex-shrink-0" loading="lazy">
        <div class="min-w-0 flex-1">
          <h5 class="text-xs font-bold text-slate-200 truncate">${Utils.escapeHtml(item.albumName)}</h5>
          <p class="text-[11px] text-slate-400 truncate">${Utils.escapeHtml(item.albumArtist)}</p>
          <div class="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
            <span>${item.releaseDate ? item.releaseDate.substring(0, 4) : ''}</span>
            <span>${item.trackCount}曲</span>
            <span>${Utils.escapeHtml(item.primaryGenreName || '')}</span>
          </div>
        </div>
      </div>
    `).join('');

    container.innerHTML = html;

    container.querySelectorAll('.itunes-result-item').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-id');
        this.selectItunesAlbumForPreview(id);
      });
    });
  }

  /**
   * iTunes アルバム選択・収録曲Lookupプレビュー
   * @param {string|number} collectionId 
   */
  async selectItunesAlbumForPreview(collectionId) {
    const empty = document.getElementById('itunes-preview-empty');
    const content = document.getElementById('itunes-preview-content');
    const submitBtn = document.getElementById('btn-submit-itunes-batch');

    Utils.toggleGlobalLoading(true, 'iTunesから収録曲とディスク情報を取得中...');
    try {
      const res = await this.api.lookupItunesAlbum(collectionId);
      const detail = res.albumDetail;
      this.store.state.selectedItunesAlbum = detail;

      if (empty) empty.classList.add('hidden');
      if (content) content.classList.remove('hidden');

      const art = document.getElementById('itunes-preview-artwork');
      const alb = document.getElementById('itunes-preview-album');
      const artName = document.getElementById('itunes-preview-artist');
      const meta = document.getElementById('itunes-preview-meta');
      const tbody = document.getElementById('itunes-preview-tracks-tbody');
      const summary = document.getElementById('itunes-selected-summary');

      if (art) art.src = detail.artworkUrl100;
      if (alb) alb.textContent = detail.albumName;
      if (artName) artName.textContent = detail.albumArtist;
      if (meta) meta.textContent = `${detail.releaseDate} • 全 ${detail.tracks.length} 曲`;
      if (summary) summary.textContent = `選択中: ${detail.albumName} (${detail.tracks.length} 曲)`;

      if (tbody) {
        tbody.innerHTML = detail.tracks.map((t) => `
          <tr class="hover:bg-slate-800/40">
            <td class="py-1 px-1.5 text-center font-mono text-indigo-400 font-bold">${t.cdNumber}</td>
            <td class="py-1 px-1.5 text-center font-mono text-slate-500">${t.trackNumber}</td>
            <td class="py-1 px-2 font-medium text-slate-200 truncate max-w-[150px]">${Utils.escapeHtml(t.trackName)}</td>
            <td class="py-1 px-2 text-slate-400 truncate max-w-[100px]">${Utils.escapeHtml(t.trackArtist)}</td>
          </tr>
        `).join('');
      }

      if (submitBtn) submitBtn.disabled = false;
    } catch (err) {
      Utils.showToast(`プレビュー取得失敗: ${err.message}`, 'error');
    } finally {
      Utils.toggleGlobalLoading(false);
    }
  }

  /**
   * iTunes アルバム一括保存実行
   */
  async submitItunesBatch() {
    const detail = this.store.state.selectedItunesAlbum;
    if (!detail) return;

    if (this.store.state.isSaving) return; // 二重送信防止
    this.store.state.isSaving = true;

    const btnText = document.getElementById('itunes-batch-btn-text');
    const spinner = document.getElementById('itunes-batch-spinner');
    const submitBtn = document.getElementById('btn-submit-itunes-batch');

    if (btnText) btnText.classList.add('hidden');
    if (spinner) spinner.classList.remove('hidden');
    if (submitBtn) submitBtn.disabled = true;

    Utils.toggleGlobalLoading(true, 'Google Driveへジャケット保存およびスプレッドシートへ一括書き込み中...');

    try {
      const payload = {
        albumName: detail.albumName,
        albumArtist: detail.albumArtist,
        releaseDate: detail.releaseDate,
        artworkUrl500: detail.artworkUrl500,
        tracks: detail.tracks
      };

      const res = await this.api.saveAlbumBatch(payload);
      Utils.showToast(`「${detail.albumName}」(${res.count}曲) を一括登録しました！`, 'success', 4000);

      this.closeItunesModal();
      await this.loadInitialData();

      // 追加したアルバムを選択
      this.store.state.selectedArtist = detail.albumArtist;
      this.store.state.selectedAlbum = detail.albumName;
      this.renderAll();
      if (window.innerWidth < 768) this.setMobileStep(3);

    } catch (err) {
      Utils.showToast(`登録エラー: ${err.message}`, 'error', 6000);
    } finally {
      this.store.state.isSaving = false;
      Utils.toggleGlobalLoading(false);
      if (btnText) btnText.classList.remove('hidden');
      if (spinner) spinner.classList.add('hidden');
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  /**
   * 手動登録モーダル表示
   * @param {object} preset 
   */
  openManualModal(preset = {}) {
    const modal = document.getElementById('modal-manual');
    if (modal) modal.classList.remove('hidden');

    const artistInput = document.getElementById('manual-album-artist');
    const albumInput = document.getElementById('manual-album-name');
    const cdInput = document.getElementById('manual-cd-number');
    const trackNoInput = document.getElementById('manual-track-number');
    const trackNameInput = document.getElementById('manual-track-name');
    const trackArtistInput = document.getElementById('manual-track-artist');
    const dateInput = document.getElementById('manual-release-date');
    const artInput = document.getElementById('manual-artwork-url');

    if (artistInput) artistInput.value = preset.albumArtist || this.store.state.selectedArtist || '';
    if (albumInput) albumInput.value = preset.albumName || this.store.state.selectedAlbum || '';
    if (cdInput) cdInput.value = preset.cdNumber || 1;
    if (trackNoInput) trackNoInput.value = preset.trackNumber || 1;
    if (trackNameInput) trackNameInput.value = '';
    if (trackArtistInput) trackArtistInput.value = preset.albumArtist || this.store.state.selectedArtist || '';
    if (dateInput) dateInput.value = preset.releaseDate || '';
    if (artInput) artInput.value = preset.artworkUrl || '';

    if (trackNameInput) trackNameInput.focus();
  }

  closeManualModal() {
    const modal = document.getElementById('modal-manual');
    if (modal) modal.classList.add('hidden');
  }

  /**
   * 手動楽曲登録送信
   */
  async submitManualTrack() {
    const form = document.getElementById('form-manual-track');
    if (form && !form.checkValidity()) {
      form.reportValidity();
      return;
    }

    if (this.store.state.isSaving) return;
    this.store.state.isSaving = true;

    const btnText = document.getElementById('manual-submit-btn-text');
    const spinner = document.getElementById('manual-submit-spinner');
    if (btnText) btnText.classList.add('hidden');
    if (spinner) spinner.classList.remove('hidden');

    const cdNumber = Number(document.getElementById('manual-cd-number').value) || 1;
    const albumArtist = document.getElementById('manual-album-artist').value.trim();
    const albumName = document.getElementById('manual-album-name').value.trim();
    const trackArtist = (document.getElementById('manual-track-artist').value || albumArtist).trim();
    const trackNumber = Number(document.getElementById('manual-track-number').value) || 1;
    const trackName = document.getElementById('manual-track-name').value.trim();
    const releaseDate = document.getElementById('manual-release-date').value.trim();
    const artworkUrl = document.getElementById('manual-artwork-url').value.trim();
    const continuous = document.getElementById('manual-continuous-check').checked;

    try {
      const payload = {
        cdNumber,
        albumArtist,
        albumName,
        trackArtist,
        trackNumber,
        trackName,
        releaseDate,
        artworkUrl
      };

      await this.api.saveTrackSingle(payload);
      Utils.showToast(`Track ${trackNumber}: ${trackName} を登録しました`, 'success');

      await this.loadInitialData();
      this.store.state.selectedArtist = albumArtist;
      this.store.state.selectedAlbum = albumName;
      this.renderAll();

      if (continuous) {
        // 次の曲番号へインクリメントしてフォーカス
        const trackNoEl = document.getElementById('manual-track-number');
        const trackNameEl = document.getElementById('manual-track-name');
        if (trackNoEl) trackNoEl.value = trackNumber + 1;
        if (trackNameEl) {
          trackNameEl.value = '';
          trackNameEl.focus();
        }
      } else {
        this.closeManualModal();
        if (window.innerWidth < 768) this.setMobileStep(3);
      }

    } catch (err) {
      Utils.showToast(`手動登録エラー: ${err.message}`, 'error');
    } finally {
      this.store.state.isSaving = false;
      if (btnText) btnText.classList.remove('hidden');
      if (spinner) spinner.classList.add('hidden');
    }
  }

  /**
   * アルバムアート拡大表示
   * @param {string} url 
   * @param {string} title 
   */
  openImageModal(url, title) {
    const modal = document.getElementById('modal-image');
    const img = document.getElementById('image-modal-img');
    const titleEl = document.getElementById('image-modal-title');
    if (!modal || !img) return;

    img.src = url;
    if (titleEl) titleEl.textContent = title;
    modal.classList.remove('hidden');
  }

  closeImageModal() {
    const modal = document.getElementById('modal-image');
    if (modal) modal.classList.add('hidden');
  }
}
</script>
```

---

## 7. エラーコード体系と例外処理詳細設計

### 7.1 エラーコードマスタ仕様

| エラーコード | 発生元 | 原因とユーザー向けメッセージ |
| :--- | :--- | :--- |
| `CONFIG_SPREADSHEET_ID_MISSING` | `Config.js` | スクリプトプロパティ `SPREADSHEET_ID` が未設定です。 |
| `CONFIG_DRIVE_FOLDER_ID_MISSING` | `Config.js` | スクリプトプロパティ `DRIVE_FOLDER_ID` が未設定です。 |
| `SPREADSHEET_OPEN_ERROR` | `SheetService.js` | スプレッドシートが開けません。IDと権限を確認してください。 |
| `DRIVE_FOLDER_ERROR` | `DriveService.js` | 指定のGoogle Driveフォルダにアクセスできません。 |
| `ITUNES_API_NETWORK_ERROR` | `ItunesService.js` | Apple iTunes API との通信に失敗しました (HTTP Status!=200)。 |
| `ALBUM_NOT_FOUND` | `ItunesService.js` | 指定されたアルバム情報が見つかりません。 |
| `VALIDATION_FAILED` | `MusicService.js` | 入力パラメータが不正です（必須項目欠落、数値範囲不正等）。 |
| `DATA_FETCH_ERROR` | `Code.js` | データ取得処理中に予期せぬ例外が発生しました。 |
| `BATCH_SAVE_ERROR` | `Code.js` | 一括登録処理中に予期せぬ例外が発生しました。 |
| `SINGLE_SAVE_ERROR` | `Code.js` | 手動登録処理中に予期せぬ例外が発生しました。 |

### 7.2 バックエンド例外ハンドリング仕様
- すべてのパブリックRPC関数（`Code.js` 内の `api*`）において、最上位を `try ... catch` で包含。
- 発生した例外は `console.error` に完全なスタックトレースを記録。
- クライアントには常に HTTP 200 を返し、`ApiResponse` オブジェクトの `{ success: false, error: err.message, code: err.code }` 形式で伝達。

### 7.3 フロントエンドエラー通知 & リカバリ仕様
- `ApiClient.js` は `response.success === false` を検知すると Promise を reject する。
- コントローラー `App.js` は、`catch` ブロックにて `Utils.showToast(err.message, 'error')` を呼び出し、赤色バナーでユーザーに直感的にフィードバック。
- ローディングインジケーター（スピナーやグローバルオーバーレイ）は `finally` 句で確実に非表示化し、画面のフリーズを完全に防止。

---

## 8. セキュリティ・パフォーマンス・レスポンシブ最適化仕様

### 8.1 XSS完全防護・サニタイズ仕様
- スプレッドシートや外部APIから取得した全ての文字列データ（`trackName`, `albumName`, `albumArtist`, `trackArtist`）は、innerHTMLに埋め込む直前に必ず `Utils.escapeHtml()` を通す。
- 属性値（`data-artist`, `data-album`, `alt`）に挿入する場合もダブルクオート等を安全にエスケープ。

### 8.2 Google Drive 永続URLとWeb表示仕様
- 保存されたファイルは `DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW` を設定。
- Web上で直接 `<img>` タグの `src` として参照可能な永続URL形式:
  `https://drive.google.com/uc?export=view&id={fileId}`
- iTunes画像のダウンロード失敗時は、アルバム登録全体をエラーにせず、画像URLを空文字として処理を継続（耐障害性設計）。

### 8.3 スプレッドシート バッチ書き込み & クライアントキャッシュ性能最適化
- **バッチ一括書き込み**: `insertTracksBatch` は全トラックを行配列に変換し、1回の `setValues()` で書き込む。数十曲のアルバムでもGAS実行時間 1〜2秒程度で完了。
- **インメモリキャッシュ**: アプリ起動時に取得したフラット配列を `Store` 内でツリー化。ペインの切り替えやアーティスト絞り込みはブラウザ内メモリ操作のみで完結し、応答速度は100ms未満を維持。

### 8.4 スマホUI/UX・44pxタッチターゲット・テンキー入力制御
- **タップターゲット**: アーティスト一覧行、アルバムカード、トラック行、戻るボタンのタップ領域を最低 44px 確保。
- **横スクロール完全排除**: ディスク別テーブルはカード型の縦積みレイアウトとし、モバイル画面幅（375px〜）でも横スクロールを発生させない。
- **テンキー最適化**: 手動登録モーダルの「CD番号」「トラック番号」入力欄には `inputmode="numeric" pattern="[0-9]*"` を指定し、スマホの数値テンキーを自動展開。

---

## 9. プログラマー向け実装チェックリスト＆単体・結合テストケース

### 9.1 実装チェックリスト

| 対象ファイル | チェック項目 | 合否 |
| :--- | :--- | :--- |
| `src/appsscript.json` | V8、Asia/Tokyo、および3つのOAuthスコープが正しく記述されているか | [ ] |
| `src/Config.js` | プロパティ未設定時にわかりやすい例外が送出されるか | [ ] |
| `src/SheetService.js` | ヘッダーの自動初期化・固定・装飾、およびバッチ一括書き込みが実装されているか | [ ] |
| `src/DriveService.js` | ファイル名サニタイズ、公開共有設定、Web表示URLの生成が網羅されているか | [ ] |
| `src/ItunesService.js` | 500x500置換、および `discNumber` からのCD番号マッピングが正確か | [ ] |
| `src/MusicService.js` | 各サービスを調停し、トランザクション整合性を保って処理しているか | [ ] |
| `src/Code.js` | 全ての `api*` 関数が例外をキャッチし `ApiResponse` 形式で返却しているか | [ ] |
| `src/index.html` | includeの呼び出し順序が依存関係通りになっているか | [ ] |
| `src/Styles.html` | スクロールバー装飾、タップハイライト無効化、アニメーションが定義されているか | [ ] |
| `src/Navbar.html` | 全体クイック検索、各種登録ボタンが配置されているか | [ ] |
| `src/ArtistList.html` | 44pxターゲット、絞り込み、件数バッジが動作するか | [ ] |
| `src/AlbumList.html` | 正方形カード、スマホ戻るバーが配置されているか | [ ] |
| `src/TrackDetail.html` | 大判アート、Disc別セクション、横スクロールなしリストが描画されるか | [ ] |
| `src/ItunesModal.html` | 候補検索、Lookupプレビュー、一括保存が連携しているか | [ ] |
| `src/ManualModal.html` | テンキー入力、連続登録アシストが動作するか | [ ] |
| `src/ImageModal.html` | 500x500画像が大きく表示され、ESCキーで閉じられるか | [ ] |
| `src/ScriptsUtils.html` | `escapeHtml` がすべての特殊記号をエスケープしているか | [ ] |
| `src/ScriptsApiClient.html` | `google.script.run` のPromise化とエラー検出が正確か | [ ] |
| `src/ScriptsState.html` | `MusicCatalog` ツリー生成とソートが正しく行われているか | [ ] |
| `src/ScriptsApp.html` | 全イベントがバインドされ、初期ロードから画面更新まで破綻なく連動するか | [ ] |

### 9.2 単体・結合テストケース

| ID | テスト分類 | 操作・検証内容 | 期待結果 |
| :--- | :--- | :--- | :--- |
| **TC-01** | 初期化 | スプレッドシートが空の状態でアプリを起動 | `MusicTracks` シートと8列のヘッダーが自動作成され、空の状態で起動する。 |
| **TC-02** | iTunes検索 | 存在しない適当なキーワード（例: `xyz999aaa`）で検索 | エラーにならず「該当するアルバムが見つかりませんでした」と表示される。 |
| **TC-03** | 複数枚組 | 2枚組以上のアルバム（例: ベストアルバム）を一括登録 | Disc 1, Disc 2 がそれぞれのCD番号として正しくスプレッドシートに保存・表示される。 |
| **TC-04** | 手動連続登録 | 「続けて登録」をONにして1曲目を登録 | 登録成功後、CD番号・アルバム情報を保持したままトラック番号が+1され入力待ちになる。 |
| **TC-05** | XSS攻撃検証 | 曲名に `<script>alert('xss')</script>` を入力して手動登録 | 文字列として安全にエスケープされ、スクリプトは実行されない。 |
| **TC-06** | スマホ遷移 | 幅 375px（iPhone等）でアーティスト→アルバム→トラックとタップ | 各ステップで1画面ずつ遷移し、「< 戻る」ボタンで前画面へ復帰できる。 |
| **TC-07** | 全体クイック検索 | ヘッダー検索に曲名の一部を入力 | 一致する楽曲のアルバム詳細画面へ自動的にジャンプし、該当トラックを確認できる。 |
| **TC-08** | 二重送信防止 | 一括登録ボタンをダブルクリック・連打 | 初回クリックで即座にボタンが無効化・スピナー表示となり、重複レコードは登録されない。 |
