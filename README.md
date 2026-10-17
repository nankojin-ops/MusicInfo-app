# MusicInfo Manager - 音楽CD・アルバムコレクション管理 Web App

Google Apps Script (GAS) + Tailwind CSS で構築された、音楽CD・アルバム・楽曲コレクション管理システムです。  
iTunes Search / Lookup API と連携したアルバム・トラック一括インポート機能、Google Drive へのジャケット自動保存、および PC・スマートフォン双方で直感的に操作できる 3ペイン／ステップ型 UI を提供します。

---

## 🌟 主な機能

1. **3ペイン・階層型コレクションブラウジング**
   - **PC**: 「アーティスト一覧」「アルバムカード一覧」「トラック詳細・ディスク別リスト」を同一画面の3ペインで快適に閲覧。
   - **スマートフォン**: 3ステップ式画面遷移（STEP 1: アーティスト → STEP 2: アルバム → STEP 3: トラック詳細）で、片手で快適に操作可能。

2. **iTunes API 連携による一括登録 & 自動ディスク分割**
   - アルバム名やアーティスト名で iTunes Store を検索。
   - 収録曲・ディスク番号（`discNumber`）を自動抽出し、プレビュー確認後にワンクリックで一括登録。
   - 複数枚組アルバム（2枚組ベスト盤など）も「Disc 1」「Disc 2」として正確に分離して管理。

3. **Google Drive ジャケット画像自動保存**
   - iTunes から取得した 500x500 高解像度ジャケット画像を自動的に Google Drive の指定フォルダへダウンロード・保存。
   - 永続化された Web 表示用 URL をスプレッドシートへ記録し、ジャケットの拡大プレビュー（モーダル表示）にも対応。

4. **1曲単位の手動登録 & 連続入力アシスト**
   - iTunes に未登録の自主制作盤やインディーズ CD も手動で登録可能。
   - スマホ入力時は CD番号・トラック番号に自動でテンキー（`inputmode="numeric"`）を展開。
   - 「続けて次のトラックを登録する」機能により、トラック番号が自動インクリメントされ連続して素早く登録できます。

5. **高速インクリメンタル絞り込み & 全体横断検索**
   - アーティスト名での即時絞り込み。
   - ヘッダー検索バーから、曲名・アルバム名・アーティスト名・CD番号での横断検索。一致した楽曲へ即座にジャンプ。

6. **徹底したセキュリティ & パフォーマンス設計**
   - HTML エスケープによる XSS 完全防護。
   - スプレッドシートへのバッチ書き込み（`setValues`）による高速保存。
   - クライアント側インメモリツリーキャッシュによる 100ms 未満のペイン切り替えレスポンス。

---

## 📁 ディレクトリ・ファイル構成

```
MusicInfo-app/
├── docs/
│   ├── REQUIREMENTS.md         # 要件定義書 (v1.2.0)
│   ├── BASIC_DESIGN.md         # 基本設計書 (v1.1.0)
│   └── DETAILED_DESIGN.md      # 詳細設計書 (v1.1.0)
├── src/
│   ├── appsscript.json         # GAS マニフェスト (OAuthスコープ定義、V8指定)
│   │
│   │   ─── 【GAS バックエンド オブジェクト指向クラス群】 ───
│   ├── Config.js               # 設定・スクリプトプロパティ管理クラス (Config)
│   ├── SheetService.js         # スプレッドシート読み書き・初期化・データ整形クラス (SheetService)
│   ├── DriveService.js         # Google Drive画像ダウンロード・保存・URL生成クラス (DriveService)
│   ├── ItunesService.js        # iTunes API通信・500x500変換・トラック抽出 (ItunesService)
│   ├── MusicService.js         # 業務ロジック統括クラス (MusicService)
│   ├── Code.js                 # Web Appsエントリポイント (doGet, include, apiディスパッチャ)
│   │
│   │   ─── 【フロントエンド UI コンポーネント (HTML)】 ───
│   ├── index.html              # メイン骨格 (3ペイン & スマホステップレイアウト)
│   ├── Styles.html             # Tailwind CSS設定、カスタムスクロールバー、アニメーションCSS
│   ├── Navbar.html             # ヘッダー、全体検索バー、各種登録ボタン
│   ├── ArtistList.html         # STEP 1 アーティスト一覧コンポーネント
│   ├── AlbumList.html          # STEP 2 アルバムカード一覧コンポーネント
│   ├── TrackDetail.html        # STEP 3 トラック詳細・ディスク別テーブルコンポーネント
│   ├── ItunesModal.html        # iTunes一括検索・プレビュー登録モーダル
│   ├── ManualModal.html        # 手動楽曲登録フォーム (連続入力アシスト・テンキー対応)
│   ├── ImageModal.html         # アルバムアート 500x500 拡大プレビューモーダル
│   │
│   │   ─── 【フロントエンド ロジック クラス群 (JavaScript)】 ───
│   ├── ScriptsUtils.html       # XSSサニタイズ (escapeHtml)、トースト通知等 (Utils)
│   ├── ScriptsApiClient.html   # バックエンド非同期通信クライアントクラス (ApiClient)
│   ├── ScriptsState.html       # フロントエンド状態管理クラス (Store)
│   └── ScriptsApp.html         # アプリケーションコントローラークラス (App)
├── tests/                      # ローカルユニットテスト・モック検証スクリプト
└── README.md
```

---

## 📊 スプレッドシート データ構造

シート名: `MusicTracks` (初回起動時に自動作成・装飾されます)

| 列番号 | カラム名 | 説明 | 例 |
| :---: | :--- | :--- | :--- |
| **A列** | CD番号 | ディスク番号 (正整数) | `1`, `2` |
| **B列** | アルバムアーティスト名 | アルバム全体の代表アーティスト | `Official髭男dism` |
| **C列** | アルバム名 | アルバムタイトル | `Editorial` |
| **D列** | アーティスト名 | 楽曲個別のアーティスト名 | `Official髭男dism` |
| **E列** | トラック番号 | 収録トラック番号 (正整数) | `1`, `2`, `3` |
| **F列** | トラック名 | 曲名 | `Cry Baby` |
| **G列** | リリース日 | 発売日 (YYYY-MM-DD 形式) | `2021-08-18` |
| **H列** | アルバムアートURL | Google Drive 保存先Web表示用URL | `https://drive.google.com/uc?export=view&id=...` |

---

## 🚀 デプロイ・初期セットアップ手順

### 1. スプレッドシートと Google ドライブフォルダの準備
1. Google スプレッドシートを新規作成し、URL から **スプレッドシートID** を取得します。
   - URL形式: `https://docs.google.com/spreadsheets/d/【この部分がスプレッドシートID】/edit`
2. Google ドライブでジャケット画像保存用のフォルダを作成し、URL から **フォルダID** を取得します。
   - URL形式: `https://drive.google.com/drive/folders/【この部分がフォルダID】`

### 2. GAS プロジェクトの作成とコード配置
#### 方法 A: Google Apps Script エディタから手動配置
1. 作成したスプレッドシートのメニューから「拡張機能」>「Apps Script」を開きます（または独立したスタンドアロンスクリプトを新規作成）。
2. プロジェクトの「プロジェクトの設定」歯車アイコンをクリックし、「「appsscript.json」マニフェスト ファイルをエディタで表示する」にチェックを入れます。
3. `src/` 配下の全20ファイルを同名で作成・コピー＆ペーストします。
   - スクリプトファイル (`.js`): `Config`, `SheetService`, `DriveService`, `ItunesService`, `MusicService`, `Code`
   - HTMLファイル (`.html`): `index`, `Styles`, `Navbar`, `ArtistList`, `AlbumList`, `TrackDetail`, `ItunesModal`, `ManualModal`, `ImageModal`, `ScriptsUtils`, `ScriptsApiClient`, `ScriptsState`, `ScriptsApp`
   - マニフェスト: `appsscript.json`

#### 方法 B: Clasp を用いた CLI デプロイ (推奨)
本プロジェクトには `@google/clasp` が導入済みです。以下の手順で簡単にデプロイできます。

```bash
# 1. Google アカウントでログイン
npm run login
# または: clasp login

# 2. .clasp.json の設定 (.clasp.json.sample からコピーして scriptId を記入)
# cp .clasp.json.sample .clasp.json
# Windows PowerShell の場合:
Copy-Item .clasp.json.sample .clasp.json
# エディタで .clasp.json の YOUR_SCRIPT_ID_HERE を作成したGASプロジェクトのIDに書き換えます

# 3. ソースコードを GAS に一括アップロード
npm run push
# または: clasp push
```

---

### 3. スクリプトプロパティの設定
GAS エディタ画面左側の「プロジェクトの設定」（歯車アイコン）を開き、「スクリプト プロパティ」に以下を追加します。

| プロパティ名 | 設定値 | 説明 |
| :--- | :--- | :--- |
| `SPREADSHEET_ID` | `xxxxxxxxxxxxxxxxxxxx` | 準備したスプレッドシートのID（必須） |
| `DRIVE_FOLDER_ID` | `yyyyyyyyyyyyyyyyyyyy` | 準備したジャケット保存フォルダのID（必須） |
| `SHEET_NAME` | `MusicTracks` | シート名（任意・省略時デフォルト: `MusicTracks`） |

### 4. Web アプリケーションとしてデプロイ
1. GAS エディタ右上の「デプロイ」>「新しいデプロイ」をクリックします。
2. 種類の選択で「ウェブアプリ」を選択します。
3. 以下の通り設定します：
   - **次のユーザーとして実行**: `自分 (USER_DEPLOYING)`
   - **アクセスできるユーザー**: `全員 (ANYONE)`
4. 「デプロイ」をクリックし、初回認証ダイアログ（スプレッドシート、Google Drive、外部接続の権限）を承認します。
5. 発行された **ウェブアプリ URL** にアクセスすると、アプリケーションが起動します。

---

## 🧪 テストおよびローカル検証

Node.js 環境でビジネスロジックやデータモデルの構文チェック・ユニットテストおよびハッカー視点のレッドチーム破壊テストを実行できます。

```bash
# 全テスト (単体テスト 43項目 + レッドチーム攻撃テスト 56項目) の実行
npm test

# 単体テストのみ実行
npm run test:unit

# レッドチーム攻撃テストのみ実行
npm run test:redteam
```

---

## 📄 ライセンス
MIT License
