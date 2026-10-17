/**
 * MusicInfo-app フロントエンドバンドルスクリプト
 * src/ 配下の各 HTML / コンポーネント / スクリプト部品を結合し、
 * GAS で高速かつ安定して動作する単一の src/index.html を生成します。
 */
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const TEMPLATE_FILE = path.join(SRC_DIR, 'index.template.html');
const OUTPUT_FILE = path.join(SRC_DIR, 'index.html');

// もし index.template.html が無ければ、現在の index.html の原型をテンプレートとして保存
if (!fs.existsSync(TEMPLATE_FILE)) {
  const current = fs.readFileSync(OUTPUT_FILE, 'utf8');
  // include 構文が含まれているか確認
  if (current.includes("include('")) {
    fs.writeFileSync(TEMPLATE_FILE, current, 'utf8');
    console.log('Created index.template.html from current index.html');
  } else {
    console.error('index.template.html does not exist and index.html is already bundled!');
    process.exit(1);
  }
}

let template = fs.readFileSync(TEMPLATE_FILE, 'utf8');

// 1. HTML コンポーネントのインクルード（Styles, Navbar, etc.）
const htmlIncludes = [
  'Styles',
  'Navbar',
  'ArtistList',
  'AlbumList',
  'TrackDetail',
  'ItunesModal',
  'ManualModal',
  'ImageModal'
];

htmlIncludes.forEach(name => {
  const filePath = path.join(SRC_DIR, `${name}.html`);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const regex = new RegExp(`<\\?!=\\s*include\\('${name}'\\);?\\s*\\?>`, 'g');
    template = template.replace(regex, content);
  }
});

// 2. JavaScript スクリプトのインクルード（ScriptsUtils, ScriptsApiClient, ScriptsState, ScriptsApp）
// 各ファイル内の <script> および </script> を除去し、1つのクリーンなスクリプトブロックに結合
const scriptFiles = [
  'ScriptsUtils',
  'ScriptsApiClient',
  'ScriptsState',
  'ScriptsApp'
];

let bundledJs = '\n';
scriptFiles.forEach(name => {
  const filePath = path.join(SRC_DIR, `${name}.html`);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    // <script> と </script> を確実に除去
    content = content.trim();
    if (content.startsWith('<script>')) content = content.substring(8);
    if (content.endsWith('</script>')) content = content.substring(0, content.length - 9);
    content = content.trim();
    bundledJs += `\n/* ===== [${name}] ===== */\n` + content + '\n';
  }
});

// index.template.html 内のスクリプトインクルードおよび起動スクリプト全体を1つのブロックに置換
const scriptSectionRegex = /<\?!=\s*include\('ScriptsUtils'\);?\s*\?>[\s\S]*?<\/script>\s*(?=<\/body>)/i;

const startAppCode = `
/* ===== [App Launcher] ===== */
function startApp() {
  try {
    const AppClass = window.App || (typeof App !== 'undefined' ? App : null);
    if (!AppClass) {
      console.error('App クラスがロードされていません');
      const loadingText = document.getElementById('global-loading-text');
      if (loadingText) {
        loadingText.textContent = 'App クラスの読み込みに失敗しました';
        loadingText.classList.add('text-rose-400');
      }
      return;
    }
    if (!window.app) {
      window.app = new AppClass();
      window.app.init();
    }
  } catch (err) {
    console.error('アプリケーション初期化エラー:', err);
    const loadingText = document.getElementById('global-loading-text');
    if (loadingText) {
      loadingText.textContent = '起動エラー: ' + (err.message || '初期化に失敗しました');
      loadingText.classList.add('text-rose-400');
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
`;

const combinedScriptBlock = `  <!-- フロントエンド スクリプト群 (単一ブロック結合) -->
  <script>
${bundledJs}
${startAppCode}
  </script>`;

if (scriptSectionRegex.test(template)) {
  template = template.replace(scriptSectionRegex, combinedScriptBlock + '\n');
} else {
  console.warn('Could not find full script include section in template; falling back to replacement before </body>');
  template = template.replace('</body>', `${combinedScriptBlock}\n</body>`);
}

// 3. エラーハンドラと安全な起動処理を head と body に注入/更新
// headの先頭にグローバルエラーキャッチャーを追加
const globalErrorScript = `
  <script>
    // グローバル初期化エラーキャッチャー
    window.addEventListener('error', function(e) {
      console.error('[Web App Global Error]', e.message, 'at', e.filename, 'line:', e.lineno, 'col:', e.colno, e.error);
      const loadingText = document.getElementById('global-loading-text');
      if (loadingText) {
        loadingText.textContent = '初期化エラー: ' + (e.message || 'スクリプトのロードに失敗しました');
        loadingText.classList.add('text-rose-400');
      }
    });
  </script>
`;

if (!template.includes('// グローバル初期化エラーキャッチャー')) {
  template = template.replace('<head>', `<head>${globalErrorScript}`);
}

// 出力ファイル書き込み
fs.writeFileSync(OUTPUT_FILE, template, 'utf8');
console.log(`Successfully built bundled ${OUTPUT_FILE} (${template.length} characters)`);
