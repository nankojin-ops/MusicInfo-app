# 音楽管理Webアプリケーション 詳細設計書

- **文書バージョン**: 1.0.0
- **作成日**: 2026年10月17日
- **作成ロール**: テックリード／詳細設計者 (`detailed_designer`)
- **準拠要件定義書**: `docs/REQUIREMENTS.md` (v1.2.0)
- **準拠基本設計書**: `docs/BASIC_DESIGN.md` (v1.0.0)
- **ステータス**: 実装準備完了（Gate 2 成果物）

---

## 目次

1. [詳細設計方針・アーキテクチャ詳細](#1-詳細設計方針アーキテクチャ詳細)
   - 1.1 文書の位置づけとプログラマーへの実装方針
   - 1.2 技術スタックと実行制約
   - 1.3 ディレクトリ・ファイル構成と役割分担
2. [データ型定義およびスキーマ仕様（TypeScript / JSDoc）](#2-データ型定義およびスキーマ仕様)
   - 2.1 共通レスポンス型（`ApiResponse<T>`）
   - 2.2 スプレッドシートフラットデータ型（`RawTrackRow`）
   - 2.3 クライアント内部階層データ型（`MusicCatalog`, `ArtistData`, `AlbumData`, `DiscGroup`, `TrackDetail`）
   - 2.4 iTunes API 連携データ型（`ItunesAlbumSummary`, `ItunesAlbumDetail`, `ItunesTrack`）
   - 2.5 API リクエストペイロード型（`BatchSavePayload`, `SingleTrackPayload`）
   - 2.6 フロントエンド状態管理型（`AppState`）
3. [マニフェストファイル詳細設計（`src/appsscript.json`）](#3-マニフェストファイル詳細設計)
   - 3.1 完全なマニフェストJSON仕様
   - 3.2 宣言スコープと解説
4. [バックエンド詳細関数仕様（`src/Code.js`）](#4-バックエンド詳細関数仕様)
   - 4.1 定数・設定値定義
   - 4.2 `doGet(e)`
   - 4.3 `getScriptProperty_(key, defaultValue)`
   - 4.4 `getOrCreateSheet_()`
   - 4.5 `apiGetAllData()`
   - 4.6 `apiSearchItunes(query)`
   - 4.7 `apiLookupItunesAlbum(collectionId)`
   - 4.8 `apiSaveAlbumBatch(payload)`
   - 4.9 `apiSaveTrackSingle(trackPayload)`
   - 4.10 バックエンド内部ヘルパー関数仕様
5. [フロントエンド詳細設計（`src/index.html`）](#5-フロントエンド詳細設計)
   - 5.1 DOM構造・レイアウト構成
   - 5.2 Tailwind CSS クラス適用・デザインシステム仕様
   - 5.3 状態管理オブジェクト（`state`）と初期化フロー（`initApp()`）
   - 5.4 レスポンシブ切り替えロジック（`setMobileStep(step)`）
   - 5.5 レンダリングロジック（アーティスト・アルバム・トラック・パンくず・戻るバー）
   - 5.6 全体クイック検索・インクリメンタルフィルタリング
   - 5.7 iTunes検索・一括登録モーダル処理ロジック
   - 5.8 手動楽曲登録フォーム処理ロジック（連続登録アシスト・テンキー制御）
   - 5.9 アルバムアート拡大モーダル処理ロジック
   - 5.10 共通ユーティリティ（XSS対策・トースト通知・二重送信防止）
6. [エラーコード体系と例外ハンドリング](#6-エラーコード体系と例外ハンドリング)
   - 6.1 エラーコードマスタ一覧
   - 6.2 バックエンド共通エラーハンドリング機構
   - 6.3 フロントエンドエラーハンドリングとUIフィードバック
7. [非機能・セキュリティ・最適化詳細仕様](#7-非機能セキュリティ最適化詳細仕様)
   - 7.1 XSS完全防護仕様
   - 7.2 二重送信防止・連打抑止仕様
   - 7.3 Google Drive アクセス権限および永続URL生成仕様
   - 7.4 パフォーマンス最適化仕様
   - 7.5 モバイルタッチ操作性・仮想キーボード最適化仕様
8. [テスト・検証仕様（単体・結合・破壊的検証）](#8-テスト検証仕様)
   - 8.1 境界値・異常値入力テストケース（ハッカー視点検証）
   - 8.2 外部API・ネットワーク障害耐性テストケース
   - 8.3 スプレッドシート・Drive 制約検証テストケース
   - 8.4 レスポンシブ・タッチ動作検証テストケース

---

## 1. 詳細設計方針・アーキテクチャ詳細

### 1.1 文書の位置づけとプログラマーへの実装方針
本書は、承認済みの要件定義書（`docs/REQUIREMENTS.md` v1.2.0）および基本設計書（`docs/BASIC_DESIGN.md` v1.0.0）をブレークダウンし、**プログラマーが一発で迷いなく完全なコードを実装できる水準**で記述された詳細設計書である。

#### プログラマーへの必須遵守事項
1. **コードの完全性**:
   - バックエンド（`src/Code.js`）およびフロントエンド（`src/index.html`）において、「TODO」「省略」「...」「後で実装」等の不完全な記述を一切排除し、完全なプロダクション品質のコードを記述すること。
2. **単一責任と依存関係の最小化**:
   - フロントエンドは外部バンドラ（WebpackやVite等）を介さず、GASの `HtmlService` にそのまま配備できる単一の `src/index.html`（Tailwind CSS CDN + インラインJavaScript + インラインSVGアイコン）として自己完結させる。
3. **安全性の徹底**:
   - すべての動的文字列挿入に対してサニタイズ処理（`escapeHtml`）を実施し、XSS（クロスサイトスクリプティング）を100%防止すること。
   - スクリプトプロパティ（スプレッドシートID、フォルダID）はクライアント側に絶対に露出させないこと。

### 1.2 技術スタックと実行制約
| 分類 | 採用技術 | バージョン/規約 | 技術制約と設計上の考慮 |
| :--- | :--- | :--- | :--- |
| **サーバー実行基盤** | Google Apps Script (V8) | Modern ECMAScript (ES2020+) | 1回の実行時間上限（最大6分）。外部HTTP通信は `UrlFetchApp` を使用。 |
| **マニフェスト** | `appsscript.json` | - | DriveおよびSpreadsheetへの明示的OAuthスコープ定義。V8ランタイム宣言。 |
| **フロントエンド** | HTML5 / Vanilla JS | ES2020+ | クライアントサイドでのDOM生成。外部フレームワーク（React/Vue）不使用。 |
| **スタイリング** | Tailwind CSS (Play CDN) | 3.x CDN | レスポンシブプレフィックス（`md:`）による完全レスポンシブ。 |
| **アイコン** | インラインSVG (Heroicons準拠) | - | 外部フォント（FontAwesome等）の読み込み遅延やブロックを排除。 |
| **通信プロトコル** | `google.script.run` | 非同期RPC | 戻り値はプレーンなJavaScriptオブジェクトまたはJSONシリアライズ可能値。 |

### 1.3 ディレクトリ・ファイル構成と役割分担
```
MusicInfo-app/
├── docs/
│   ├── REQUIREMENTS.md       # 要件定義書 (v1.2.0)
│   ├── BASIC_DESIGN.md       # 基本設計書 (v1.0.0)
│   └── DETAILED_DESIGN.md    # 詳細設計書 (本書)
├── src/
│   ├── appsscript.json       # GASプロジェクト構成・権限定義マニフェスト
│   ├── Code.js               # バックエンドサーバーロジック（エントリポイント、API、連携処理）
│   └── index.html            # フロントエンドSPA（HTML5 + Tailwind CSS + クライアントJS）
└── README.md
```

---

## 2. データ型定義およびスキーマ仕様

### 2.1 共通レスポンス型（`ApiResponse<T>`）
GASバックエンドとフロントエンド間の通信は、必ず以下の統一フォーマットに準拠する。

```typescript
interface ApiResponse<T = any> {
  success: boolean;       // 処理が正常に完了したか
  data?: T;               // 正常終了時のペイロード
  error?: string;         // 異常終了時のユーザー向けエラーメッセージ
  code?: string;          // エラー分類コード (例: "CONFIG_NOT_FOUND")
  timestamp: string;      // ISO 8601 形式の処理時刻
}
```

### 2.2 スプレッドシートフラットデータ型（`RawTrackRow`）
スプレッドシート（シート名: `MusicTracks`）のA〜H列に格納される1レコードの定義。

```typescript
interface RawTrackRow {
  cdNumber: number;          // A列: CD番号 (ディスク番号: 1以上の整数)
  albumArtist: string;       // B列: アルバムアーティスト名 (最大255文字)
  albumName: string;         // C列: アルバム名 (最大255文字)
  trackArtist: string;       // D列: トラックアーティスト名 (最大255文字)
  trackNumber: number;       // E列: トラック番号 (1以上の整数)
  trackName: string;         // F列: トラック名 (最大255文字)
  releaseDate: string;       // G列: リリース日 (YYYY-MM-DD または空文字)
  artworkUrl: string;        // H列: アルバムアートURL (Google Drive Web表示URLまたは空文字)
}
```

### 2.3 クライアント内部階層データ型
クライアント起動時にフラットデータから構築されるインメモリ階層キャッシュ構造。

```typescript
interface TrackDetail {
  cdNumber: number;
  trackNumber: number;
  trackName: string;
  trackArtist: string;
}

interface DiscGroup {
  cdNumber: number;
  tracks: TrackDetail[];     // trackNumber 昇順
}

interface AlbumData {
  albumName: string;
  albumArtist: string;
  releaseDate: string;
  artworkUrl: string;
  totalTracks: number;
  discs: Record<number, DiscGroup>; // キーは cdNumber
}

interface ArtistData {
  artistName: string;
  albumCount: number;
  albums: Record<string, AlbumData>; // キーは albumName
}

// クライアント側インデックスツリー全体
type MusicCatalog = Record<string, ArtistData>; // キーは artistName
```

### 2.4 iTunes API 連携データ型

```typescript
// iTunes Search API のアルバム概要情報
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

// iTunes Lookup API から抽出されたトラック情報
interface ItunesTrack {
  cdNumber: number;          // iTunesの discNumber からマッピング
  trackNumber: number;       // iTunesの trackNumber
  trackName: string;         // iTunesの trackName
  trackArtist: string;       // iTunesの artistName
}

// iTunes Lookup API で解決されたアルバム完全情報
interface ItunesAlbumDetail {
  collectionId: number;
  albumName: string;
  albumArtist: string;
  releaseDate: string;
  artworkUrl100: string;
  artworkUrl500: string;
  trackCount: number;
  tracks: ItunesTrack[];     // cdNumber昇順, trackNumber昇順
}
```

### 2.5 API リクエストペイロード型

```typescript
// apiSaveAlbumBatch の引数ペイロード
interface BatchSavePayload {
  albumName: string;
  albumArtist: string;
  releaseDate: string;
  artworkUrl500?: string;    // iTunesの高解像度アートURL
  tracks: Array<{
    cdNumber: number;
    trackNumber: number;
    trackName: string;
    trackArtist: string;
  }>;
}

// apiSaveTrackSingle の引数ペイロード
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

### 2.6 フロントエンド状態管理型（`AppState`）

```typescript
interface AppState {
  allTracks: RawTrackRow[];
  musicCatalog: MusicCatalog;
  artistList: string[];            // ソート済みアーティスト名配列
  selectedArtist: string | null;   // 現在選択中のアーティスト名
  selectedAlbum: string | null;    // 現在選択中のアルバム名
  mobileStep: 1 | 2 | 3;           // スマホ画面ステップ (1: アーティスト, 2: アルバム, 3: トラック)
  searchQuery: string;             // 全体検索クエリ
  artistFilter: string;            // アーティスト絞り込みクエリ
  isLoading: boolean;              // 初期ロード状態
  isSaving: boolean;               // API保存実行中フラグ（二重送信防止用）
  
  // iTunesモーダル状態
  itunesKeyword: string;
  itunesSearchResults: ItunesAlbumSummary[];
  selectedItunesAlbum: ItunesAlbumDetail | null;
  isSearchingItunes: boolean;
  isLoadingItunesDetail: boolean;
  
  // 手動登録フォーム状態
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
  
  // 画像拡大モーダル
  zoomImageUrl: string | null;
  zoomImageTitle: string;
}
```

---

## 3. マニフェストファイル詳細設計（`src/appsscript.json`）

### 3.1 完全なマニフェストJSON仕様
Google Apps Script が最新の V8 ランタイムで動作し、必要な最小限の OAuth スコープのみを要求するように厳密に定義する。

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

### 3.2 宣言スコープと解説
1. `https://www.googleapis.com/auth/spreadsheets`:
   - スプレッドシート（`SpreadsheetApp`）の読み込み、および新規シート・データ行の自動追加に必須。
2. `https://www.googleapis.com/auth/drive`:
   - Google ドライブ（`DriveApp`）の指定フォルダへのジャケット画像の作成、および公開共有設定（`setSharing`）に必須。
3. `https://www.googleapis.com/auth/script.external_request`:
   - `UrlFetchApp` による iTunes Search / Lookup API への HTTPS 通信、およびジャケット画像バイナリ（Blob）のダウンロードに必須。
4. `executeAs: "USER_DEPLOYING"`:
   - スプレッドシートやドライブへのアクセス権限を持たない一般閲覧者に対しても、デプロイ実行者の権限で安全に機能を提供。

---

## 4. バックエンド詳細関数仕様（`src/Code.js`）

### 4.1 定数・設定値定義
```javascript
/**
 * システム共通定数定義
 */
const CONFIG = {
  PROP_KEYS: {
    SPREADSHEET_ID: 'SPREADSHEET_ID',
    DRIVE_FOLDER_ID: 'DRIVE_FOLDER_ID',
    SHEET_NAME: 'SHEET_NAME'
  },
  DEFAULT_SHEET_NAME: 'MusicTracks',
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
  ITUNES_API: {
    SEARCH_ENDPOINT: 'https://itunes.apple.com/search',
    LOOKUP_ENDPOINT: 'https://itunes.apple.com/lookup',
    DEFAULT_COUNTRY: 'jp',
    DEFAULT_MEDIA: 'music',
    DEFAULT_ENTITY_ALBUM: 'album',
    DEFAULT_ENTITY_SONG: 'song',
    SEARCH_LIMIT: 25
  }
};
```

---

### 4.2 `doGet(e)`
Web Appsとしてのエントリポイント。HTMLテンプレートを評価し、レスポンシブ用の viewport およびセキュリティヘッダーを付与して返却する。

- **シグネチャ**: `doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.HTML.HtmlOutput`
- **処理ロジック**:
  1. `HtmlService.createTemplateFromFile('index')` を呼び出す。
  2. テンプレートを評価（`.evaluate()`）。
  3. ページタイトルを `'MusicInfo Manager - 音楽CD・アルバムコレクション管理'` に設定。
  4. メタタグを設定:
     `output.addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')`
  5. X-Frame-Options モードを設定:
     `output.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)`
  6. `output` を返却する。

---

### 4.3 `getScriptProperty_(key, defaultValue)`
スクリプトプロパティを取得し、未設定時のバリデーションを行う内部共通関数。

- **シグネチャ**: `getScriptProperty_(key: string, defaultValue?: string): string`
- **引数**:
  - `key`: プロパティ名（`SPREADSHEET_ID`, `DRIVE_FOLDER_ID`, `SHEET_NAME` 等）
  - `defaultValue`: 任意値が未設定の場合に返却するデフォルト文字列（省略可）
- **戻り値**: 取得された設定値文字列
- **処理ステップ**:
  1. `PropertiesService.getScriptProperties().getProperty(key)` を取得。
  2. 値が存在し、トリム後の文字列長が 0 より大きい場合はその値を返却。
  3. 値が存在せず `defaultValue` が指定されている場合は `defaultValue` を返却。
  4. 値が存在せず `defaultValue` もない場合（必須キーの場合）、以下の例外をスロー:
     ```javascript
     const err = new Error(`スクリプトプロパティ [${key}] が設定されていません。プロジェクトの設定 > スクリプト プロパティから追加してください。`);
     err.code = 'CONFIG_NOT_FOUND';
     throw err;
     ```

---

### 4.4 `getOrCreateSheet_()`
対象スプレッドシートおよびデータシートを取得する。シートが存在しない場合は自動作成し、ヘッダーを挿入・固定する。

- **シグネチャ**: `getOrCreateSheet_(): GoogleAppsScript.Spreadsheet.Sheet`
- **戻り値**: 操作対象の `Sheet` オブジェクト
- **処理ステップ**:
  1. `getScriptProperty_(CONFIG.PROP_KEYS.SPREADSHEET_ID)` を呼び出し、スプレッドシートIDを取得。
  2. `SpreadsheetApp.openById(ssId)` でスプレッドシートを開く。アクセス失敗時は例外 `SPREADSHEET_ACCESS_ERROR` をスロー。
  3. `getScriptProperty_(CONFIG.PROP_KEYS.SHEET_NAME, CONFIG.DEFAULT_SHEET_NAME)` でシート名を取得。
  4. `ss.getSheetByName(sheetName)` でシートの存在確認。
  5. シートが存在しない場合:
     - `ss.insertSheet(sheetName)` で新規作成。
     - 1行目にヘッダーを書き込み: `sheet.getRange(1, 1, 1, CONFIG.SHEET_HEADERS.length).setValues([CONFIG.SHEET_HEADERS])`
     - ヘッダー装飾: 背景色 `#1E293B`（ダークスレート）、文字色 `#F8FAFC`（白）、太字 `setFontWeight('bold')`
     - 行固定: `sheet.setFrozenRows(1)`
  6. シートが存在する場合:
     - `sheet.getLastRow() === 0` の場合は同様にヘッダーを書き込み固定。
  7. 取得または初期化した `sheet` を返却。

---

### 4.5 `apiGetAllData()`
スプレッドシートに蓄積された全楽曲レコードを一括取得し、オブジェクト配列として返却する。

- **シグネチャ**: `apiGetAllData(): ApiResponse<{ tracks: RawTrackRow[], totalTracks: number, loadedAt: string }>`
- **処理ステップ**:
  1. `try ... catch` ブロックを開始。
  2. `getOrCreateSheet_()` を呼び出し対象シートを取得。
  3. `const lastRow = sheet.getLastRow();` を取得。
  4. `lastRow <= 1`（ヘッダー行のみ、または空シート）の場合:
     - `{ success: true, data: { tracks: [], totalTracks: 0, loadedAt: new Date().toISOString() }, timestamp: new Date().toISOString() }` を即時返却。
  5. `sheet.getRange(2, 1, lastRow - 1, 8).getValues()` で全データ行を取得。
  6. 各行データをオブジェクトに整形:
     ```javascript
     const tracks = rows.map((row) => {
       let releaseDateStr = '';
       if (row[6] instanceof Date) {
         releaseDateStr = Utilities.formatDate(row[6], 'Asia/Tokyo', 'yyyy-MM-dd');
       } else if (row[6]) {
         releaseDateStr = String(row[6]).trim().substring(0, 10);
       }
       return {
         cdNumber: Number(row[0]) || 1,
         albumArtist: String(row[1] || '').trim(),
         albumName: String(row[2] || '').trim(),
         trackArtist: String(row[3] || '').trim(),
         trackNumber: Number(row[4]) || 1,
         trackName: String(row[5] || '').trim(),
         releaseDate: releaseDateStr,
         artworkUrl: String(row[7] || '').trim()
       };
     });
     ```
  7. 返却値:
     ```javascript
     return {
       success: true,
       data: {
         tracks: tracks,
         totalTracks: tracks.length,
         loadedAt: new Date().toISOString()
       },
       timestamp: new Date().toISOString()
     };
     ```
  8. 例外発生時:
     - エラーログを記録（`console.error(err)`）。
     - `{ success: false, error: err.message, code: err.code || 'DATA_FETCH_ERROR', timestamp: new Date().toISOString() }` を返却。

---

### 4.6 `apiSearchItunes(query)`
iTunes Search API を呼び出し、キーワードに一致するアルバム候補を最大25件検索する。

- **シグネチャ**: `apiSearchItunes(query: string): ApiResponse<{ albums: ItunesAlbumSummary[] }>`
- **引数**:
  - `query`: 検索キーワード文字列（アーティスト名、アルバム名など）
- **バリデーション**:
  - `query` が未定義、または空白トリム後の文字数が 0 の場合はエラーコード `EMPTY_SEARCH_QUERY` でエラー返却。
- **処理ステップ**:
  1. クエリ文字列をサニタイズ・トリムし、`encodeURIComponent` でエスケープ。
  2. URL構築:
     ```
     https://itunes.apple.com/search?term=${encodedQuery}&country=jp&media=music&entity=album&limit=25
     ```
  3. `UrlFetchApp.fetch(url, { muteHttpExceptions: true })` を実行。
  4. HTTPレスポンスコードを検証。200以外の場合は `ITUNES_API_NETWORK_ERROR` をスロー。
  5. レスポンスボディを JSON パース。
  6. `results` 配列から `wrapperType === 'collection'` の要素のみを抽出・整形:
     ```javascript
     const albums = results
       .filter(item => item.wrapperType === 'collection')
       .map(item => {
         const rawDate = item.releaseDate ? String(item.releaseDate) : '';
         const formattedDate = rawDate.length >= 10 ? rawDate.substring(0, 10) : '';
         return {
           collectionId: item.collectionId,
           albumName: item.collectionName || '不明なアルバム',
           albumArtist: item.artistName || '不明なアーティスト',
           artworkUrl100: item.artworkUrl100 || '',
           artworkUrl500: convertArtworkUrl500_(item.artworkUrl100 || ''),
           releaseDate: formattedDate,
           trackCount: item.trackCount || 0,
           primaryGenreName: item.primaryGenreName || ''
         };
       });
     ```
  7. `{ success: true, data: { albums: albums }, timestamp: new Date().toISOString() }` を返却。
  8. 例外発生時は `ITUNES_API_ERROR` としてエラー返却。

---

### 4.7 `apiLookupItunesAlbum(collectionId)`
iTunes Lookup API を呼び出し、選択されたアルバムの全収録曲・CD番号（`discNumber`）を抽出する。

- **シグネチャ**: `apiLookupItunesAlbum(collectionId: number | string): ApiResponse<{ albumDetail: ItunesAlbumDetail }>`
- **引数**:
  - `collectionId`: iTunesのコレクションID（アルバムID）
- **バリデーション**:
  - `collectionId` が数値としてパースできない場合は `INVALID_COLLECTION_ID` でエラー返却。
- **処理ステップ**:
  1. URL構築:
     ```
     https://itunes.apple.com/lookup?id=${collectionId}&entity=song&country=jp
     ```
  2. `UrlFetchApp.fetch(url, { muteHttpExceptions: true })` を実行。
  3. レスポンスコード200の検証。
  4. JSON パース。
  5. `results[0]`（アルバムコレクション本体）を取得。存在しない場合は `ALBUM_NOT_FOUND` をスロー。
  6. `results.slice(1)`（トラック群）をフィルタリング（`item.wrapperType === 'track'`）。
  7. 各トラックから以下をマッピング:
     - `cdNumber`: `Number(item.discNumber) || 1` （★確定仕様: ディスク番号をCD番号とする）
     - `trackNumber`: `Number(item.trackNumber) || 1`
     - `trackName`: `String(item.trackName || '').trim()`
     - `trackArtist`: `String(item.artistName || results[0].artistName || '').trim()`
  8. トラック配列を整列: `cdNumber` 昇順 → `trackNumber` 昇順。
  9. アルバム詳細オブジェクトを構成:
     ```javascript
     const albumDetail = {
       collectionId: results[0].collectionId,
       albumName: results[0].collectionName || '',
       albumArtist: results[0].artistName || '',
       releaseDate: (results[0].releaseDate || '').substring(0, 10),
       artworkUrl100: results[0].artworkUrl100 || '',
       artworkUrl500: convertArtworkUrl500_(results[0].artworkUrl100 || ''),
       trackCount: tracks.length,
       tracks: tracks
     };
     ```
  10. 正常レスポンスを返却。

---

### 4.8 `apiSaveAlbumBatch(payload)`
iTunesから取得したアルバム情報（全トラック＋ジャケット画像）を一括保存する。

- **シグネチャ**: `apiSaveAlbumBatch(payload: BatchSavePayload): ApiResponse<{ count: number, savedAlbum: string, artworkUrl: string }>`
- **引数 `payload` のバリデーション**:
  - `payload.albumName`: 必須、文字列長 1〜255。
  - `payload.albumArtist`: 必須、文字列長 1〜255。
  - `payload.tracks`: 必須、配列要素数 1 以上。
  - 各トラックの `cdNumber`, `trackNumber`, `trackName` の存在確認。
  - バリデーション失敗時はエラーコード `VALIDATION_FAILED` でエラー返却。
- **処理ステップ**:
  1. **Google Driveへの画像保存処理**:
     - `payload.artworkUrl500` が指定されている場合、`downloadAndSaveArtwork_(payload.artworkUrl500, payload.albumName)` を呼び出す。
     - Google Drive 上の Web 表示用 URL（`https://drive.google.com/uc?export=view&id={fileId}`）を取得。
     - 画像のダウンロードまたは保存に失敗した場合は、エラーログを記録し、`artworkUrl` を空文字として処理を継続（画像の保存失敗でアルバム全体の登録を中断させないリカバリ設計）。
  2. **スプレッドシートへの書き込み**:
     - `getOrCreateSheet_()` でシートを取得。
     - 各トラックをスプレッドシートの行形式（配列）へ変換:
       ```javascript
       const rows = payload.tracks.map(t => [
         Number(t.cdNumber) || 1,
         String(payload.albumArtist).trim(),
         String(payload.albumName).trim(),
         String(t.trackArtist || payload.albumArtist).trim(),
         Number(t.trackNumber) || 1,
         String(t.trackName).trim(),
         String(payload.releaseDate || '').trim(),
         driveArtworkUrl
       ]);
       ```
     - 挿入開始行を算出: `const lastRow = sheet.getLastRow();`
     - **バッチ一括書き込み（性能最適化）**:
       `sheet.getRange(lastRow + 1, 1, rows.length, 8).setValues(rows);`
  3. 返却値:
     ```javascript
     return {
       success: true,
       data: {
         count: rows.length,
         savedAlbum: payload.albumName,
         artworkUrl: driveArtworkUrl
       },
       timestamp: new Date().toISOString()
     };
     ```

---

### 4.9 `apiSaveTrackSingle(trackPayload)`
手動登録フォームから送信された1トラック分のデータをスプレッドシートに追記する。

- **シグネチャ**: `apiSaveTrackSingle(trackPayload: SingleTrackPayload): ApiResponse<{ savedTrack: RawTrackRow }>`
- **引数バリデーション**:
  - `cdNumber`: 必須、数値（1以上の整数）。
  - `albumArtist`: 必須、非空文字列。
  - `albumName`: 必須、非空文字列。
  - `trackArtist`: 必須、非空文字列。
  - `trackNumber`: 必須、数値（1以上の整数）。
  - `trackName`: 必須、非空文字列。
  - バリデーション違反時は `VALIDATION_FAILED` を返却。
- **処理ステップ**:
  1. `getOrCreateSheet_()` でシートを取得。
  2. 登録レコード配列を作成:
     ```javascript
     const row = [
       Number(trackPayload.cdNumber),
       String(trackPayload.albumArtist).trim(),
       String(trackPayload.albumName).trim(),
       String(trackPayload.trackArtist).trim(),
       Number(trackPayload.trackNumber),
       String(trackPayload.trackName).trim(),
       String(trackPayload.releaseDate || '').trim(),
       String(trackPayload.artworkUrl || '').trim()
     ];
     ```
  3. `sheet.appendRow(row);` を実行してスプレッドシート末尾へ書き込み。
  4. 正常レスポンスを返却。

---

### 4.10 バックエンド内部ヘルパー関数仕様

#### ① `convertArtworkUrl500_(url100)`
```javascript
/**
 * 100x100bb URL を 500x500bb URL へ高解像度化
 * @param {string} url100 
 * @returns {string} url500
 */
function convertArtworkUrl500_(url100) {
  if (!url100) return '';
  return url100.replace(/100x100bb\.(jpg|png|webp)/i, '500x500bb.$1');
}
```

#### ② `sanitizeFileName_(name)`
```javascript
/**
 * Google Drive保存用のファイル名をサニタイズ
 * @param {string} name 
 * @returns {string}
 */
function sanitizeFileName_(name) {
  if (!name) return 'artwork';
  return name.replace(/[\/\\:\*\?"<>\| \r\n\t]/g, '_').substring(0, 60);
}
```

#### ③ `downloadAndSaveArtwork_(imageUrl, albumName)`
```javascript
/**
 * 画像バイナリを取得してGoogle Drive指定フォルダへ保存し、Web表示用URLを発行する
 * @param {string} imageUrl 
 * @param {string} albumName 
 * @returns {string} Web表示用URL
 */
function downloadAndSaveArtwork_(imageUrl, albumName) {
  if (!imageUrl) return '';
  const folderId = getScriptProperty_(CONFIG.PROP_KEYS.DRIVE_FOLDER_ID);
  
  let folder;
  try {
    folder = DriveApp.getFolderById(folderId);
  } catch (e) {
    const err = new Error(`指定されたGoogle ドライブフォルダID [${folderId}] にアクセスできません。フォルダが存在し権限があるか確認してください。`);
    err.code = 'DRIVE_FOLDER_ERROR';
    throw err;
  }

  const response = UrlFetchApp.fetch(imageUrl, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    console.warn(`画像のダウンロードに失敗しました (HTTP ${response.getResponseCode()}): ${imageUrl}`);
    return '';
  }

  const blob = response.getBlob();
  const safeName = sanitizeFileName_(albumName);
  const fileName = `artwork_${safeName}_${Date.now()}.jpg`;
  blob.setName(fileName);
  blob.setContentType('image/jpeg');

  const file = folder.createFile(blob);
  // 全員閲覧可能に共有設定
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // 案A Web表示用永続URLの生成
  return `https://drive.google.com/uc?export=view&id=${file.getId()}`;
}
```

---

## 5. フロントエンド詳細設計（`src/index.html`）

### 5.1 DOM構造・レイアウト構成
単一の `src/index.html` 内に HTML5、Tailwind CSS Play CDN、SVGアイコン、およびアプリケーションロジックを配置する。

#### 全体DOMツリー概要
```html
<!DOCTYPE html>
<html lang="ja" class="h-full bg-slate-900 text-slate-100 antialiased">
<head>
  <!-- meta, title, Tailwind CDN, カスタムCSS -->
</head>
<body class="h-full flex flex-col overflow-hidden">
  <!-- 1. グローバルヘッダー (PC / スマホ共通) -->
  <header id="app-header" class="h-14 border-b border-slate-800 bg-slate-950 flex items-center justify-between px-4 z-20">
    <!-- ロゴ・タイトル -->
    <!-- クイック検索バー (PC表示) -->
    <!-- アクションボタン群 (+手動登録, +iTunes検索, リロード) -->
  </header>

  <!-- 2. モバイル用サブバー (クイック検索 & ステップナビゲーション) -->
  <div id="mobile-nav-bar" class="md:hidden border-b border-slate-800 bg-slate-900/90 backdrop-blur px-3 py-2 flex flex-col gap-2">
    <!-- スマホ用全体検索バー -->
    <!-- ステップ階層「< 戻る」ボタン ＆ パンくずバー (Step 2, 3 のみ表示) -->
  </div>

  <!-- 3. メインコンテンツ領域 (3ペインコンテナ) -->
  <main class="flex-1 overflow-hidden relative grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-800">
    <!-- PANE 1: アーティスト一覧 (PC: col-span-3, スマホ: Step 1) -->
    <section id="pane-artists" class="h-full flex flex-col overflow-hidden md:col-span-3 bg-slate-900">
      <!-- アーティスト検索ボックス -->
      <!-- アーティストリスト (タップターゲット44px確保) -->
    </section>

    <!-- PANE 2: アルバム選択 (PC: col-span-4, スマホ: Step 2) -->
    <section id="pane-albums" class="h-full flex flex-col overflow-hidden md:col-span-4 bg-slate-900/50">
      <!-- 選択中アーティストバナー -->
      <!-- アルバムカードグリッド / リスト -->
    </section>

    <!-- PANE 3: トラック詳細情報 (PC: col-span-5, スマホ: Step 3) -->
    <section id="pane-tracks" class="h-full flex flex-col overflow-y-auto md:col-span-5 bg-slate-950 p-4">
      <!-- アルバムヘッダー (ジャケット120x120, メタ情報, 曲追加ボタン) -->
      <!-- ディスク別グループヘッダー (Disc 1: CD番号: 1) -->
      <!-- トラック一覧 (スマホ縦積み / PC対応レイアウト) -->
    </section>
  </main>

  <!-- 4. モーダル群 -->
  <!-- A. iTunes検索一括登録モーダル (PC: 中央ダイアログ, スマホ: フルスクリーン/ボトムシート) -->
  <div id="modal-itunes" class="hidden fixed inset-0 z-50 ...">...</div>

  <!-- B. 手動楽曲登録フォームモーダル -->
  <div id="modal-manual" class="hidden fixed inset-0 z-50 ...">...</div>

  <!-- C. アルバムアート拡大モーダル (500x500 高精細表示) -->
  <div id="modal-zoom" class="hidden fixed inset-0 z-50 ...">...</div>

  <!-- 5. トースト通知UI -->
  <div id="toast-container" class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"></div>

  <!-- 6. クライアントJavaScript -->
  <script>...</script>
</body>
</html>
```

---

### 5.2 Tailwind CSS クラス適用・デザインシステム仕様
ダークテーマを基調とし、Tailwind CSS の標準カラーパレットを採用。

- **背景色**:
  - ベース: `bg-slate-900`
  - ヘッダー・最深部: `bg-slate-950`
  - パネル・カード背景: `bg-slate-800` / `bg-slate-800/60`
  - ホバー・アクティブ: `hover:bg-slate-700/50` / `active:bg-slate-700`
- **文字色**:
  - プライマリテキスト: `text-slate-100`
  - セカンダリテキスト: `text-slate-400`
  - ミュートテキスト: `text-slate-500`
  - アクセント: `text-indigo-400`
- **アクセントカラー（ボタン・バッジ）**:
  - メインアクション: `bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm`
  - セカンダリアクション: `bg-slate-700 hover:bg-slate-600 text-slate-200`
  - キャンセル・閉じる: `border border-slate-700 hover:bg-slate-800 text-slate-300`
  - バッジ: `bg-indigo-500/20 text-indigo-300 text-xs px-2 py-0.5 rounded-full`
- **レスポンシブブレークポイント**:
  - スマートフォン（`md:` 未満）: 各ペインに対して `pane-artists`, `pane-albums`, `pane-tracks` の `display` 制御クラス（`hidden md:flex`）を JavaScript で動的に切り替える。
  - PC（`md:` 以上: 768px〜）: 常に 3ペインが `grid-cols-12` で横並び表示される。

---

### 5.3 状態管理オブジェクト（`state`）と初期化フロー

```javascript
const state = {
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
  
  // 手動フォーム保持データ
  manualFormState: {
    cdNumber: 1,
    albumArtist: '',
    albumName: '',
    trackArtist: '',
    trackNumber: 1,
    trackName: '',
    releaseDate: '',
    artworkUrl: ''
  }
};
```

#### 初期化フロー（`initApp()`）
1. スピナーローディングを表示。
2. `google.script.run.withSuccessHandler(onDataLoaded).withFailureHandler(onDataError).apiGetAllData()` を呼び出す。
3. `onDataLoaded(response)`:
   - `response.success` が `true` の場合:
     - `state.allTracks = response.data.tracks;`
     - `buildMusicCatalog();` を実行して `musicCatalog` および `artistList` をインデックス化。
     - PC表示（`window.innerWidth >= 768`）の場合、`artistList` の先頭アーティストおよびその先頭アルバムを自動選択状態にする。
     - モバイル表示（`window.innerWidth < 768`）の場合、`setMobileStep(1)` を設定。
     - 全ペインの再レンダリングを実行。
   - `response.success` が `false` の場合:
     - エラーモーダルまたはトーストでエラーメッセージを表示。
4. ウィンドウリサイズイベントリスナー（`handleResize`）を登録。

---

### 5.4 レスポンシブ切り替えロジック（`setMobileStep(step)`）

スマートフォン表示時、1画面に1ステップのみを表示するための厳密なDOMクラス制御ロジック。

```javascript
/**
 * スマホ表示用ステップ切り替え制御
 * @param {1 | 2 | 3} step 
 */
function setMobileStep(step) {
  state.mobileStep = step;
  
  // PC表示 (md: 768px以上) では全てのペインを表示
  if (window.innerWidth >= 768) {
    document.getElementById('pane-artists').classList.remove('hidden');
    document.getElementById('pane-albums').classList.remove('hidden');
    document.getElementById('pane-tracks').classList.remove('hidden');
    document.getElementById('mobile-nav-bar').classList.add('hidden');
    return;
  }

  // スマホ表示時
  const paneArtists = document.getElementById('pane-artists');
  const paneAlbums = document.getElementById('pane-albums');
  const paneTracks = document.getElementById('pane-tracks');
  const mobileNav = document.getElementById('mobile-nav-bar');

  // 一旦すべて非表示
  paneArtists.classList.add('hidden');
  paneAlbums.classList.add('hidden');
  paneTracks.classList.add('hidden');

  if (step === 1) {
    paneArtists.classList.remove('hidden');
    mobileNav.classList.remove('hidden');
    renderMobileNav();
  } else if (step === 2) {
    paneAlbums.classList.remove('hidden');
    mobileNav.classList.remove('hidden');
    renderMobileNav();
  } else if (step === 3) {
    paneTracks.classList.remove('hidden');
    mobileNav.classList.remove('hidden');
    renderMobileNav();
  }
}
```

---

### 5.5 レンダリングロジック詳細

#### ① `buildMusicCatalog()`
スプレッドシートのフラット行配列から、高速参照用のツリー構造（`MusicCatalog`）を生成する。
```javascript
function buildMusicCatalog() {
  const catalog = {};
  
  state.allTracks.forEach(t => {
    const artist = t.albumArtist || '不明なアーティスト';
    const album = t.albumName || '不明なアルバム';
    const cdNum = Number(t.cdNumber) || 1;

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
    // 最新のアートURLやリリース日があれば補完
    if (!albumObj.artworkUrl && t.artworkUrl) albumObj.artworkUrl = t.artworkUrl;
    if (!albumObj.releaseDate && t.releaseDate) albumObj.releaseDate = t.releaseDate;

    if (!albumObj.discs[cdNum]) {
      albumObj.discs[cdNum] = {
        cdNumber: cdNum,
        tracks: []
      };
    }

    albumObj.discs[cdNum].tracks.push({
      cdNumber: cdNum,
      trackNumber: Number(t.trackNumber) || 1,
      trackName: t.trackName || '',
      trackArtist: t.trackArtist || artist
    });
    albumObj.totalTracks++;
  });

  // 各アルバム内のトラックを trackNumber 順にソート
  Object.values(catalog).forEach(artistData => {
    Object.values(artistData.albums).forEach(albumData => {
      Object.values(albumData.discs).forEach(disc => {
        disc.tracks.sort((a, b) => a.trackNumber - b.trackNumber);
      });
    });
  });

  state.musicCatalog = catalog;
  // 五十音・英数昇順ソート
  state.artistList = Object.keys(catalog).sort((a, b) => a.localeCompare(b, 'ja'));
}
```

#### ② `renderArtists()`
- 絞り込みフィルター（`state.artistFilter`）に基づいて `artistList` を抽出。
- 各行はボタン要素とし、**最小タップターゲット高さ 48px** を確保。
- 選択中アーティストには `bg-indigo-600/30 border-l-4 border-indigo-500 text-white` を適用。
- クリック/タップ時:
  - `state.selectedArtist = artistName;`
  - 該当アーティストの先頭アルバムを自動選択。
  - スマホ時: `setMobileStep(2)` を実行。

#### ③ `renderAlbums()`
- `state.selectedArtist` が存在しない場合は「アーティストを選択してください」のプレースホルダーを表示。
- 存在する場合、カードグリッド（PC: 2列、スマホ: 1〜2列）でレンダリング。
- 各カード:
  - 80×80 または 100×100 のジャケット画像（`loading="lazy"` 付与）。画像なし時はSVGプレースホルダー。
  - アルバム名（太字、`truncate`）。
  - リリース年（`releaseDate.substring(0,4)`）および収録曲数バッジ。
  - タップターゲット 44px 以上。
- クリック/タップ時:
  - `state.selectedAlbum = albumName;`
  - スマホ時: `setMobileStep(3)` を実行。
  - トラック詳細ペインを再描画。

#### ④ `renderTracks()`（モバイル縦積み完全対応）
- 選択中アルバム情報（ジャケット画像、タイトル、アーティスト、発売日、総曲数）を描画。
- 「このアルバムに曲を追加」ボタン（押下で手動登録モーダルが開き、アルバム情報が事前入力される）。
- ジャケット画像をタップすると拡大モーダルを表示（`openImageZoomModal`）。
- **複数枚組（ディスク番号）対応**:
  - `discs` のキー（CD番号）を数値昇順で走査。
  - 複数ディスクが存在する場合、または2枚組以上の場合、「**Disc {cdNumber} (CD番号: {cdNumber})**」の明確なヘッダーを表示。
- **スマホ向け縦積みレイアウト**:
  ```html
  <div class="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-slate-800/70 active:bg-slate-800 border-b border-slate-800/60 last:border-b-0 min-h-[44px]">
    <div class="flex-shrink-0 w-8 h-8 rounded bg-slate-800 flex items-center justify-center text-xs font-mono text-slate-400">
      #${track.trackNumber}
    </div>
    <div class="flex-1 min-w-0">
      <div class="text-sm font-medium text-slate-100 truncate">${escapeHtml(track.trackName)}</div>
      <div class="text-xs text-slate-400 truncate">${escapeHtml(track.trackArtist)}</div>
    </div>
  </div>
  ```
  横スクロールを一切発生させず、スマートフォンの親指操作で快適に閲覧可能。

#### ⑤ `renderMobileNav()`
スマホ表示時（`mobileStep >= 2`）の上部ナビゲーション。
- Step 2 の場合: 「`< アーティスト一覧に戻る`」ボタン。
- Step 3 の場合: 「`< アルバム一覧に戻る`」ボタンおよび「`アーティスト名 > アルバム名`」のパンくず。
- ボタンの最小高さを **44px** 確保し、誤操作を防止。

---

### 5.6 全体クイック検索・インクリメンタルフィルタリング
- ヘッダーの検索バーに入力時、`debounce(handleQuickSearch, 200)` を実行。
- メモリ内の `state.allTracks` に対し、大文字小文字・全角半角を正規化して以下の項目をインクリメンタル検索:
  - `albumArtist`, `albumName`, `trackName`, `trackArtist`, `cdNumber`
- 検索結果がヒットした場合、ドロップダウンサジェストリストを即座に表示。
- サジェスト項目をタップすると、対象の `selectedArtist` および `selectedAlbum` に状態を更新し、直ちに Step 3（トラック詳細）へジャンプして該当曲をハイライト表示。

---

### 5.7 iTunes検索・一括登録モーダル処理ロジック

#### 処理シーケンスとUIステート
1. **モーダル表示（`openItunesModal()`）**:
   - 検索ワード入力欄にフォーカス。スマホではフルスクリーン展開。
2. **検索実行（`searchItunes()`）**:
   - 検索ボタンを disabled にし、スピナー表示。二重送信抑止。
   - `google.script.run.withSuccessHandler(onItunesSearchSuccess).withFailureHandler(onItunesSearchError).apiSearchItunes(query)`
   - 候補一覧（ジャケット、タイトル、アーティスト、曲数、リリース年）を表示。
3. **アルバム選択とプレビュー（`selectItunesAlbum(collectionId)`）**:
   - 選択されたアルバムの Lookup API を呼び出し。
   - 500×500 高精細ジャケット、CD番号（`discNumber`）、全収録曲のプレビューリストを描画。
   - 「このアルバムを一括登録」ボタンを活性化。
4. **一括登録実行（`executeBatchSave()`）**:
   - 多重クリック防止（`state.isSaving = true`, ボタン disabled 化、ボタン内テキスト「Google Driveに画像を保存・登録中...」）。
   - `google.script.run.withSuccessHandler(onBatchSaveSuccess).withFailureHandler(onBatchSaveError).apiSaveAlbumBatch(payload)`
   - 成功時:
     - モーダルを閉じる。
     - 登録されたアルバムデータをローカルの `state.allTracks` に追加し、キャッシュを再構築。
     - トースト通知（「{アルバム名} を登録しました（全{曲数}曲）」）を表示。
     - 登録したアルバムを自動選択状態にし、トラック詳細画面へ遷移。
   - 失敗時:
     - エラートーストを表示し、ボタンの disabled を解除。

---

### 5.8 手動楽曲登録フォーム処理ロジック

自主制作CD・同人音源の登録において、複数曲をストレスなく連続登録できるアシスト機能を提供する。

#### 連続入力アシスト（「登録して続けて入力」）仕様
1. **初期値設定**:
   - CD番号: `1`
   - トラック番号: `1`
   - アルバム選択状態から「このアルバムに曲を追加」で開いた場合は、CD番号・アルバムアーティスト・アルバム名・リリース日・アートURLを初期値として引き継ぐ。
2. **テンキー対応**:
   - CD番号およびトラック番号には `type="number" inputmode="numeric" min="1"` を明示。
3. **「登録して続けて入力」押下時の挙動**:
   - 必須入力バリデーション（全項目チェック）。
   - ボタンを disabled にし、`apiSaveTrackSingle` を呼び出し。
   - 登録成功時:
     - 登録データをローカルキャッシュに追加。
     - **CD番号、アルバムアーティスト名、アルバム名、リリース日、アートURLはフォーム上に保持**。
     - **トラック番号を自動で `+1` インクリメント**（例: 1 → 2）。
     - **トラック名入力欄のみをクリア**。
     - トラック名入力欄に自動フォーカス（`document.getElementById('manual-track-name').focus()`）。
     - トースト通知（「#1 を登録しました。続けて #2 を入力してください」）を表示。
4. **「登録して閉じる」押下時**:
   - 登録成功後にモーダルを閉じ、トラック詳細画面を再描画。

---

### 5.9 アルバムアート拡大モーダル処理ロジック
- ジャケット画像をクリック/タップすると `openImageZoomModal(url, title)` が発動。
- オーバーレイ背景（`bg-black/90`）を表示。
- 画像要素に `src=url` をセットし、`max-w-[90vw] max-h-[85vh] object-contain` で高精細表示。
- オーバーレイ上のどこをタップしても即座にモーダルを閉じる（`closeImageZoomModal()`）。

---

### 5.10 共通ユーティリティ（XSS対策・トースト・二重送信防止）

#### ① XSSサニタイズ（`escapeHtml`）
スプレッドシートやAPIから取得したすべての動的文字列の挿入に本関数を適用する。
```javascript
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

#### ② トースト通知（`showToast`）
```javascript
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const bgClass = type === 'error' ? 'bg-rose-600' : (type === 'success' ? 'bg-emerald-600' : 'bg-slate-800 border border-slate-700');
  toast.className = `${bgClass} text-white px-4 py-3 rounded-lg shadow-xl text-sm flex items-center gap-2 transform transition-all duration-300 translate-y-2 opacity-0 pointer-events-auto max-w-sm`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  
  // アニメーション表示
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  // 3.5秒後に自動消去
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
```

#### ③ デバウンス（`debounce`）
```javascript
function debounce(func, wait = 200) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}
```

---

## 6. エラーコード体系と例外ハンドリング

### 6.1 エラーコードマスタ一覧
バックエンド・フロントエンド共通で利用するエラーコード、システムメッセージ、およびユーザー向け案内文の定義。

| エラーコード | 概要 | ユーザー向けメッセージ | 推奨リカバリ対応 |
| :--- | :--- | :--- | :--- |
| `CONFIG_NOT_FOUND` | スクリプトプロパティ未設定 | 「初期設定が必要です。スプレッドシートIDまたはドライブフォルダIDが設定されていません。」 | プロジェクト設定よりプロパティを設定する手順を表示。 |
| `SPREADSHEET_ACCESS_ERROR` | スプレッドシート接続失敗 | 「スプレッドシートを開くことができませんでした。IDとアクセス権限を確認してください。」 | スプレッドシートIDの誤字や共有権限の確認を案内。 |
| `DRIVE_FOLDER_ERROR` | ドライブフォルダ接続失敗 | 「Google ドライブフォルダへのアクセスに失敗しました。フォルダIDを確認してください。」 | フォルダIDの確認および権限の確認を案内。 |
| `ITUNES_API_NETWORK_ERROR` | iTunes API通信失敗 | 「iTunes APIとの通信に失敗しました。時間をおいて再試行してください。」 | ネットワーク状況の確認、再試行ボタンの提供。 |
| `EMPTY_SEARCH_QUERY` | 検索キーワード空 | 「検索キーワードを入力してください。」 | 検索ボックスをハイライト・フォーカス。 |
| `INVALID_COLLECTION_ID` | アルバムID不正 | 「アルバム情報の取得に失敗しました（無効なID）。」 | 候補一覧から再度アルバムを選択させる。 |
| `ALBUM_NOT_FOUND` | アルバム情報未存在 | 「該当するアルバム情報が見つかりませんでした。」 | 別のキーワードでの検索を案内。 |
| `VALIDATION_FAILED` | 入力バリデーション不正 | 「必須項目を入力してください。（アルバム名、曲名など）」 | 未入力・不正な入力項目を赤枠ハイライト。 |
| `DATA_FETCH_ERROR` | データ取得全般エラー | 「データの取得中にエラーが発生しました。」 | 再読み込みボタンを表示。 |
| `SYSTEM_ERROR` | その他予期しない例外 | 「システムエラーが発生しました。しばらく経ってから再度お試しください。」 | エラー詳細ログをコンソールに出力。 |

### 6.2 バックエンド共通エラーハンドリング機構
`src/Code.js` の公開API関数（`api*`）は、すべて最上位の `try ... catch` で例外を捕捉し、以下の共通構造を返却する。これにより、クライアント側の `withFailureHandler` に依存せず、一貫したJSONレスポンスとして安全に処理できる。

```javascript
try {
  // メイン処理
} catch (err) {
  console.error(`[API ERROR] ${err.toString()}`, err.stack);
  return {
    success: false,
    error: err.message || '予期しないエラーが発生しました。',
    code: err.code || 'SYSTEM_ERROR',
    timestamp: new Date().toISOString()
  };
}
```

### 6.3 フロントエンドエラーハンドリングとUIフィードバック
- **API通信エラー時**:
  - レスポンスの `success === false` を検知した際、`showToast(response.error, 'error')` を実行。
  - プロパティ未設定（`CONFIG_NOT_FOUND`）の場合、画面中央に「初期設定ガイド」モーダルまたはバナーを表示し、`SPREADSHEET_ID` と `DRIVE_FOLDER_ID` の設定手順を案内。
- **フォームバリデーションエラー時**:
  - 不正な input 要素に `border-rose-500 focus:ring-rose-500` クラスを付与し、当該要素へスクロールおよびフォーカス。

---

## 7. 非機能・セキュリティ・最適化詳細仕様

### 7.1 XSS完全防護仕様
- ユーザー入力値（手動登録）および外部API取得値（iTunes）の両方を「信用できないデータ」として扱う。
- `innerHTML` への変数展開は必ず `escapeHtml()` を通す。
- 属性値への代入（`title="..."`, `src="..."`）においてもクォートのエスケープを徹底。
- `javascript:` 疑似スキームによるURL攻撃を防ぐため、`artworkUrl` を `<a>` や `<img>` の `src` にセットする際は、プロトコルが `https://` または `http://` で始まること、あるいは空文字であることを検証する。

### 7.2 二重送信防止・連打抑止仕様
1. **状態フラグによる排他制御**:
   - `state.isSaving` または `state.isSearchingItunes` が `true` の間は、同一アクションの再実行を即時 `return` で無視する。
2. **DOMレベルでの無効化**:
   - ボタン押下時に直ちに `button.disabled = true` を設定し、`opacity-50 cursor-not-allowed` スタイルを適用。
   - ボタン内に SVG スピナーを表示し、処理が進行中であることを視覚的にフィードバック。
   - 通信完了時（成功・失敗問わず）に `finally` 相当の処理で disabled を解除。

### 7.3 Google Drive アクセス権限および永続URL生成仕様
- **共有設定**:
  - ファイル保存直後に `file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);` を明示的に実行。
- **URL形式**:
  - `https://drive.google.com/uc?export=view&id=${file.getId()}` を採用。
  - この形式により、HTMLService内および外部ブラウザから認証なしで高解像度画像を安定して直接参照・表示可能となる。

### 7.4 パフォーマンス最適化仕様
1. **スプレッドシート書き込みのバッチ化**:
   - 10〜30曲のトラックをループ内で `appendRow` せず、`sheet.getRange(startRow, 1, rows.length, 8).setValues(rows)` で1回のRPCで完了させる。
2. **DOM断片（DocumentFragment）による一括描画**:
   - リストやカードグリッドのレンダリング時、ループごとに `innerHTML +=` を行わず、単一のHTML文字列結合または `DocumentFragment` を用いて1回のDOM挿入で完了させ、リフロー・リペイントを最小化する。
3. **画像遅延読み込み**:
   - すべてのアルバムアートサムネイルに `loading="lazy"` を付与し、画面外の画像読み込みを遅延。

### 7.5 モバイルタッチ操作性・仮想キーボード最適化仕様
1. **タップ領域 44px 基準**:
   - アーティストリストの各行、アルバムカード、各種操作ボタンは最小 `min-h-[44px]` および適切なパディング（`py-2.5 px-3`）を維持。
2. **テンキー自動起動**:
   - CD番号・トラック番号の入力要素に `<input type="number" inputmode="numeric" pattern="[0-9]*">` を設定。
3. **キーボード表示時の視認性維持**:
   - 各入力欄の `focus` イベント時に `element.scrollIntoView({ behavior: 'smooth', block: 'center' })` を呼び出し、仮想キーボードによる入力欄の隠蔽を回避。

---

## 8. テスト・検証仕様（単体・結合・破壊的検証）

### 8.1 境界値・異常値入力テストケース（ハッカー視点検証）

| テストID | テスト観点 | 入力値・操作 | 期待される動作・仕様 |
| :--- | :--- | :--- | :--- |
| **TC-SEC-001** | XSS脆弱性検証 | 曲名に `<script>alert('XSS')</script>` を手動登録 | 文字列がエスケープされ、スクリプトが実行されずにそのままテキストとして表示されること。 |
| **TC-SEC-002** | HTMLタグ・属性挿入 | アルバム名に `First Love" onmouseover="alert(1)` を入力 | `&quot;` に置換され、HTML属性の改変が発生しないこと。 |
| **TC-VAL-001** | CD番号・トラック番号境界値 (最小値) | CD番号に `1`, トラック番号に `1` を入力 | 正常に登録・ソート表示されること。 |
| **TC-VAL-002** | CD番号・トラック番号境界値 (ゼロ・負数) | CD番号またはトラック番号に `0` または `-1` を入力 | クライアントおよびサーバー側のバリデーションで弾かれ、エラーメッセージが表示されること。 |
| **TC-VAL-003** | 数値項目への文字列・全角入力 | CD番号に `abc` や全角 `１` を入力 | `Number()` または正規表現チェックで弾かれるか、半角数値に安全に変換されること。 |
| **TC-VAL-004** | 超長文文字列入力 | 曲名・アルバム名に 1,000 文字の文字列を入力 | スプレッドシートに正常に保存され、一覧画面では `truncate`（三重点省略）されてレイアウトが崩れないこと。 |
| **TC-VAL-005** | 特殊文字・絵文字 | アルバム名に `🎵🎉 [Special Edition] / Disc & Track` を入力 | 絵文字・記号が文字化けせず保存され、ファイル名サニタイズでもエラーが発生しないこと。 |

### 8.2 外部API・ネットワーク障害耐性テストケース

| テストID | テスト観点 | 状況・操作 | 期待される動作・仕様 |
| :--- | :--- | :--- | :--- |
| **TC-NET-001** | iTunes API通信タイムアウト | 外部通信が極度に遅延または遮断された状態で検索実行 | バックエンドでタイムアウトを検知し、クライアントに `ITUNES_API_NETWORK_ERROR` を返却、UIが復帰すること。 |
| **TC-NET-002** | iTunes 該当結果ゼロ | 存在しないランダム文字列 `xyzabc999qqq` で検索 | 「検索結果が見つかりませんでした」のメッセージが表示され、UIが破綻しないこと。 |
| **TC-NET-003** | Lookup API でトラック0件 | トラック情報が存在しない不正な collectionId を指定 | `ALBUM_NOT_FOUND` エラーが返却され、プレビュー画面でクラッシュしないこと。 |
| **TC-NET-004** | 画像URLが404エラー | iTunesから返された画像URLが存在しない・ダウンロード失敗 | 警告ログを記録した上で画像URLを空文字とし、アルバムのトラック登録自体は正常完了すること。 |

### 8.3 スプレッドシート・Drive 制約検証テストケース

| テストID | テスト観点 | 状況・操作 | 期待される動作・仕様 |
| :--- | :--- | :--- | :--- |
| **TC-GAS-001** | プロパティ未設定 | `SPREADSHEET_ID` が空の状態でアプリ起動 | 親切な初期設定エラーガイド画面が表示され、設定方法が案内されること。 |
| **TC-GAS-002** | シート未作成状態からの自動初期化 | スプレッドシートに対象シート（`MusicTracks`）が存在しない | 自動的に新規シートが作成され、8項目のヘッダー行が書き込まれ固定されること。 |
| **TC-GAS-003** | 大量曲数の一括登録 | 30曲以上収録された2枚組・3枚組アルバムを一括登録 | バッチ書き込みによりGAS実行時間制限（6分）を大幅に下回る数秒〜十数秒で完了すること。 |
| **TC-GAS-004** | 多重クリック・連打試験 | 「一括登録」ボタンを1秒間に連続5回クリック | 初回クリックでボタンが無効化され、多重実行やスプレッドシートの重複行登録が発生しないこと。 |

### 8.4 レスポンシブ・タッチ動作検証テストケース

| テストID | テスト観点 | 端末・幅 | 期待される動作・仕様 |
| :--- | :--- | :--- | :--- |
| **TC-RES-001** | スマートフォン標準画面 | iPhone SE / 13 (375px〜390px) | 1画面1ステップで表示され、横スクロールが一切発生しないこと。 |
| **TC-RES-002** | ステップナビゲーション往復 | スマホ幅で Step 1 → 2 → 3 → 2 → 1 | 「戻る」ボタンおよびパンくずで迷わずスムーズに階層を往復できること。 |
| **TC-RES-003** | 仮想キーボード表示 | スマホで手動登録フォーム入力 | 入力欄がキーボードで隠れず、自動で視認位置へスクロールすること。 |
| **TC-RES-004** | PC大画面横並び | PC (1280px以上) | アーティスト・アルバム・トラックの3ペインが横並びで俯瞰表示されること。 |
| **TC-RES-005** | ウィンドウ動的リサイズ | ブラウザ幅を 1024px から 360px へ変更 | 3ペイン表示からステップ表示へ即座に破綻なく切り替わること。 |

---

## 9. 実装フェーズへの引き継ぎまとめ

本詳細設計書は、プログラマーが迷いなく即座に `src/appsscript.json`, `src/Code.js`, `src/index.html` を一発でコーディングできるよう、以下のすべての情報を網羅した：

1. **マニフェスト完全仕様**: V8ランタイム、OAuthスコープ定義。
2. **バックエンド完全関数仕様**: `doGet`, `getScriptProperty_`, `getOrCreateSheet_`, `apiGetAllData`, `apiSearchItunes`, `apiLookupItunesAlbum`, `apiSaveAlbumBatch`, `apiSaveTrackSingle` の完全なJSDoc、型、入出力スキーマ、ステップバイステップ処理、ヘルパー群。
3. **フロントエンド完全設計**: 状態管理、Tailwind CSS適用、DOMツリー、レスポンシブ切り替えロジック（`setMobileStep`）、レンダリング関数、iTunes一括登録、手動連続登録アシスト、XSSサニタイズ。
4. **堅牢性・セキュリティ・テスト仕様**: エラーコード体系、二重送信抑止、Drive永続URL、境界値・破壊的検証マトリクス。

これより、開発チームおよびプログラマーは本設計書に従い、コード実装（Coding / Implementation フェーズ）を開始することができる。
