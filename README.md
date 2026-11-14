# MusicInfo-app

音楽情報（アーティスト・アルバム・トラック・ジャケット画像）を管理する Web アプリケーションです。  
**GitHub Pages で配信される静的シングル HTML フロントエンド（ハイブリッドモード対応）** と、**Google Apps Script (GAS) JSON API バックエンド** を疎結合に連携させる構成を採用しています。

## 主な特徴

- **ハイブリッドモード動作**:
  - **デモ / ローカルモード（初期状態）**: 外部通信や GAS 設定なしですぐに試用でき、初回起動時に内蔵デモデータ（3 アーティスト・4 アルバム・複数 Disc 構成・外部通信不要の SVG Data URI ジャケット）をブラウザの `localStorage` に展開して閲覧・編集・ローカル保存できます。
  - **GAS API 連携モード**: 画面右上の接続設定ボタン（モードバッジ）から GAS Web アプリの `/exec` URL と `API_TOKEN` を設定すると、Google スプレッドシート・Google ドライブ・iTunes Search API・MusicBrainz / Cover Art Archive API を利用した永続管理に切り替わります。
- **3 ペイン・レスポンシブ UI**: アーティスト一覧 → アルバム一覧 → トラック詳細の 3 ペイン構成（モバイルではステップ切替 UI、タップ領域 44px 以上確保）。
- **単一ファイル自動バンドル**: `npm run build`（`build.js`）により HTML / CSS / JavaScript を 1 つの `dist/index.html`（および `dist/.nojekyll`）へ出力し、GitHub Actions で GitHub Pages へ自動テスト＆自動デプロイします。

---

## ディレクトリ構成

```text
MusicInfo-app/
├── .github/
│   └── workflows/
│       └── deploy-pages.yml          # GitHub Pages 自動ビルド・テスト・デプロイワークフロー
├── dist/                             # ビルド生成物（Git 追跡対象外 / CI で Pages 公開）
│   ├── index.html                    # バンドル済み単一ページアプリケーション
│   └── .nojekyll                     # Jekyll 処理無効化マーカー
├── src/                              # ソースコード一式
│   ├── appsscript.json               # GAS マニフェスト（access: ANYONE_ANONYMOUS）
│   ├── Code.js                       # GAS エントリーポイント (doGet ヘルスチェック, doPost JSON API ディスパッチャ)
│   ├── Config.js                     # 環境設定・スクリプトプロパティ管理 (API_TOKEN 等)
│   ├── SheetService.js               # スプレッドシート CRUD / 排他制御 / キャッシュ管理
│   ├── DriveService.js               # Google ドライブ 画像保存・複製・公開 URL 管理
│   ├── ItunesService.js              # iTunes Search API 連携
│   ├── MusicBrainzService.js         # MusicBrainz & Cover Art Archive API 連携
│   ├── MusicService.js               # バックエンド業務ロジック統合サービス
│   ├── index.template.html           # フロントエンドルートテンプレート（build.js 用）
│   ├── Styles.html                   # カスタム CSS・レスポンシブスタイル定義
│   ├── Navbar.html                   # ナビゲーションバー（モードバッジ・接続設定ボタン含む）
│   ├── ArtistList.html               # 左ペイン：アーティスト一覧
│   ├── AlbumList.html                # 中央ペイン：アルバム一覧・一括削除選択 UI
│   ├── TrackDetail.html              # 右ペイン：トラック詳細・ディスク別表示
│   ├── ModalForm.html                # 楽曲登録 / iTunes・MusicBrainz 検索 / アルバム編集モーダル
│   ├── DriveArtworkModal.html        # Google ドライブ画像取り込みモーダル
│   ├── DeleteConfirmModal.html       # アルバム一括削除確認モーダル
│   ├── ConnectionModal.html          # GAS 接続設定・接続テスト・モード切替モーダル
│   ├── ScriptsApiClient.html         # 通信ファサード (ConnectionConfigStore / HttpJsonTransport / LocalDemoTransport)
│   ├── ScriptsUtils.html             # サニタイズ・画像リサイズ・トースト通知等の共通ユーティリティ
│   ├── ScriptsState.html             # フロントエンド状態管理 Store
│   └── ScriptsApp.html               # UI イベント・描画・ハイブリッドモード制御コントローラー
├── tests/                            # Node.js 自動テストスイート
│   ├── run_tests.js                  # 単体テスト・API 契約・バンドル整合性・ハイブリッド統合テスト
│   ├── red_team_attack_test.js       # セキュリティ・プロトタイプ汚染・XSS・UI 耐性 Red Team テスト
│   └── qa_comprehensive_verification.js # QA 包括検証テスト
├── build.js                          # dist/index.html & dist/.nojekyll 生成スクリプト
├── package.json                      # npm スクリプト定義 (build / test / prepush 等)
├── .claspignore                      # clasp push 時の除外設定（dist/**, .github/**, src/*.html を除外）
└── .gitignore                        # dist/, node_modules/, .clasprc.json 等の Git 除外設定
```

> **補足**: 旧構成の `src/index.html` および GAS 側 `HtmlService` 配信（`include`）は廃止されました。フロントエンドは `dist/index.html` へ統一されています。

---

## セットアップ手順

### 1. GAS バックエンドのセットアップ（GAS 連携を使う場合）

GitHub Pages 上のデモ／ローカルモードだけを利用する場合、GAS の構築は不要です。スプレッドシートや Google ドライブと連携する場合は、以下の手順で GAS バックエンドを構築します。

1. **Google スプレッドシートと Google ドライブフォルダを用意する**
   - データ保存用のスプレッドシートを作成し、URL から `SPREADSHEET_ID` を控えます。
   - ジャケット画像保存用の Google ドライブフォルダを作成し、URL から `DRIVE_FOLDER_ID` を控えます。
2. **GAS プロジェクトへバックエンドコードを反映する**
   - `.claspignore` により `dist/**`・`.github/**`・`src/*.html` は自動的に除外され、バックエンド用 `.js` と `src/appsscript.json` のみがプッシュされます。
   ```bash
   npx clasp push
   ```
3. **スクリプトプロパティを設定する**
   - GAS エディタの「プロジェクトの設定」→「スクリプト プロパティ」に以下を登録します。

| プロパティ名 | 必須 | 説明 | 例・デフォルト値 |
| :--- | :---: | :--- | :--- |
| `SPREADSHEET_ID` | **必須** | 楽曲データを保存するスプレッドシート ID | `1AbCdEf...` |
| `DRIVE_FOLDER_ID` | **必須** | ジャケット画像を保存するドライブフォルダ ID | `1XyZaBc...` |
| `API_TOKEN` | **連携時必須** | 外部 HTTP JSON API (`doPost`) 認証用の推測困難なトークン。**未設定時は安全のため API が無効 (`API_DISABLED`) になります** | 長いランダム文字列（32文字以上推奨） |
| `SHEET_NAME` | 任意 | 使用するシートタブ名 | `MusicTracks` |
| `MUSICBRAINZ_ENABLED` | 任意 | MusicBrainz API 連携の有効/無効 (`"false"` で無効) | `true` |
| `MUSICBRAINZ_USER_AGENT` | 任意 | MusicBrainz API リクエスト時の User-Agent | `MusicInfoApp/1.0 (...)` |

4. **GAS Web アプリとしてデプロイする**
   - GAS エディタの「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」を選択します。
   - **次のユーザーとして実行**: `自分` (`USER_DEPLOYING`)
   - **アクセスできるユーザー**: `全員（匿名含む）` (`ANYONE_ANONYMOUS`)
   - デプロイ後に発行される **ウェブアプリ URL（末尾 `/exec`）** を控えます。
   - ※ 外部からアクセス可能にする一方、実データの読み書きはすべて `doPost` 内の `API_TOKEN` 定数時間照合により保護されます。

---

### 2. GitHub Pages 公開設定

本リポジトリは GitHub Actions（`.github/workflows/deploy-pages.yml`）による自動デプロイに対応しています。

1. GitHub リポジトリの **Settings** → **Pages** を開きます。
2. **Build and deployment** の **Source** を **GitHub Actions** に変更します。
3. `main` ブランチへプッシュ（または Actions タブから `Deploy Frontend to GitHub Pages` を `workflow_dispatch` で手動実行）すると、自動ビルド・自動テスト実行後に `dist/` が GitHub Pages へ公開されます。

---

### 3. アプリ画面からの接続設定手順

1. 公開した GitHub Pages URL（またはローカルサーバー）を開くと、初期状態は **「デモ/ローカル」** モードで起動します。
2. 画面右上のステータスバッジ（「デモ/ローカル」ボタン）をクリックし、接続設定モーダルを開きます。
3. **GAS Web App URL**（`https://script.google.com/macros/s/.../exec` または Google Workspace ドメインの `/a/macros/<domain>/s/.../exec`）と **API_TOKEN** を入力します。
4. **「接続テスト」** で疎通・認証を確認した後、**「保存して接続」** を押すと **「GAS連携中」** モードへ切り替わり、スプレッドシートのデータが読み込まれます。

> **セキュリティ上の注意**: 接続設定（URL と `API_TOKEN`）およびローカルモードのデータはブラウザの `localStorage` に保存されます。共有 PC・公共端末で利用した場合は、作業終了時に接続設定モーダルから **「設定をリセット（ローカルへ戻る）」** を実行してください。

---

## ローカル開発・テスト手順

本プロジェクトのビルドとテストは外部 npm パッケージへの実行時依存を持たず、Node.js 標準モジュールのみで実行できます（テスト用 `npm install` や `npm ci` は不要です）。

```bash
# 1. フロントエンドをビルドし、dist/index.html と dist/.nojekyll を生成
npm run build

# 2. 単体テストおよび Red Team セキュリティテストを実行
npm test

# 3. QA 包括検証テストを実行
node tests/qa_comprehensive_verification.js

# 4. 生成された dist/ をローカル HTTP サーバーで確認
npx serve dist
```
