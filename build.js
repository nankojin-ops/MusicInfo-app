/**
 * MusicInfo-app フロントエンドバンドルスクリプト
 * src/ 配下の各 HTML / コンポーネント / スクリプト部品を結合し、
 * GitHub Pages で配信可能な単一の dist/index.html と dist/.nojekyll を生成します。
 */
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');
const TEMPLATE_FILE = path.join(SRC_DIR, 'index.template.html');
const OUTPUT_FILE = path.join(DIST_DIR, 'index.html');
const NOJEKYLL_FILE = path.join(DIST_DIR, '.nojekyll');

if (!fs.existsSync(TEMPLATE_FILE)) {
  console.error('エラー: テンプレートファイル src/index.template.html が存在しません。');
  process.exit(1);
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
  'EditAlbumModal',
  'ImageModal',
  'DriveArtworkModal',
  'DeleteConfirmModal',
  'ConnectionModal'
];

htmlIncludes.forEach(name => {
  const filePath = path.join(SRC_DIR, `${name}.html`);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const regex = new RegExp(`<\\?!=\\s*include\\('${name}'\\);?\\s*\\?>`, 'g');
    template = template.replace(regex, () => content);
  }
});

/**
 * 安全な JavaScript コメント除去ユーティリティ（ステートマシン方式）
 * 文字列リテラル（'', "", ``）および正規表現リテラルを破壊せず、
 * 単一行コメント (//) および複数行コメント (/* ... *\/) のみを除去します。
 * 改行コードは維持して行構造を保ちます。
 */
function stripComments(code) {
  let result = '';
  let i = 0;
  const len = code.length;

  const State = {
    NORMAL: 0,
    SINGLE_QUOTE: 1,
    DOUBLE_QUOTE: 2,
    TEMPLATE_LITERAL: 3,
    REGEX: 4,
    LINE_COMMENT: 5,
    BLOCK_COMMENT: 6
  };

  let state = State.NORMAL;
  let escape = false;
  let inCharClass = false;
  let lastNonWhitespace = '';
  let currentWord = '';
  let lastWord = '';

  while (i < len) {
    const ch = code[i];
    const next = i + 1 < len ? code[i + 1] : '';

    switch (state) {
      case State.NORMAL:
        if (ch === "'" && !escape) {
          state = State.SINGLE_QUOTE;
          result += ch;
        } else if (ch === '"' && !escape) {
          state = State.DOUBLE_QUOTE;
          result += ch;
        } else if (ch === '`' && !escape) {
          state = State.TEMPLATE_LITERAL;
          result += ch;
        } else if (ch === '/' && next === '/') {
          state = State.LINE_COMMENT;
          i++;
        } else if (ch === '/' && next === '*') {
          state = State.BLOCK_COMMENT;
          i++;
        } else if (ch === '/') {
          // 直前の非空白文字または直前キーワードから、正規表現リテラルか除算演算子かを判定
          const isRegexPrefix = !lastNonWhitespace ||
            /[([{\\,;:!=&|?+\-*^%~<>]/.test(lastNonWhitespace) ||
            /^(return|case|typeof|delete|void|throw|in|instanceof|yield|await)$/.test(lastWord);
          if (isRegexPrefix) {
            state = State.REGEX;
            inCharClass = false;
            escape = false;
          }
          result += ch;
        } else {
          result += ch;
        }
        break;

      case State.SINGLE_QUOTE:
        result += ch;
        if (ch === '\\') {
          escape = !escape;
        } else {
          if (ch === "'" && !escape) state = State.NORMAL;
          escape = false;
        }
        break;

      case State.DOUBLE_QUOTE:
        result += ch;
        if (ch === '\\') {
          escape = !escape;
        } else {
          if (ch === '"' && !escape) state = State.NORMAL;
          escape = false;
        }
        break;

      case State.TEMPLATE_LITERAL:
        result += ch;
        if (ch === '\\') {
          escape = !escape;
        } else {
          if (ch === '`' && !escape) state = State.NORMAL;
          escape = false;
        }
        break;

      case State.REGEX:
        result += ch;
        if (ch === '\\') {
          escape = !escape;
        } else if (escape) {
          escape = false;
        } else if (ch === '[' && !inCharClass) {
          inCharClass = true;
        } else if (ch === ']' && inCharClass) {
          inCharClass = false;
        } else if (ch === '/' && !inCharClass) {
          state = State.NORMAL;
        }
        break;

      case State.LINE_COMMENT:
        if (ch === '\n' || ch === '\r') {
          result += ch; // 改行は保持
          state = State.NORMAL;
        }
        break;

      case State.BLOCK_COMMENT:
        if (ch === '*' && next === '/') {
          state = State.NORMAL;
          i++;
        } else if (ch === '\n' || ch === '\r') {
          result += ch; // 改行は保持
        }
        break;
    }

    if (state === State.NORMAL) {
      if (/[a-zA-Z0-9_$]/.test(ch)) {
        currentWord += ch;
      } else {
        if (currentWord) {
          lastWord = currentWord;
          currentWord = '';
        }
      }
      if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') {
        lastNonWhitespace = ch;
      }
    }

    i++;
  }

  return result;
}

/**
 * Node.js テスト用の `if (typeof module !== 'undefined' && module.exports) { ... }` ガードを
 * ネストした波括弧（例: `module.exports = { A, B };`）を含めて安全に除去します。
 */
function stripModuleExportsGuards(code) {
  const guardPattern = /if\s*\(\s*typeof\s+module\s*!==\s*['"]undefined['"]\s*&&\s*module\.exports\s*\)\s*\{/g;
  let result = '';
  let lastIndex = 0;
  let match;

  while ((match = guardPattern.exec(code)) !== null) {
    result += code.slice(lastIndex, match.index);

    // match の末尾の '{' からブレース深度をカウントして対応する '}' を探す
    let i = guardPattern.lastIndex;
    let depth = 1;
    let quote = null;
    let escape = false;

    while (i < code.length && depth > 0) {
      const ch = code[i];
      if (quote) {
        if (ch === '\\') {
          escape = !escape;
        } else {
          if (ch === quote && !escape) {
            quote = null;
          }
          escape = false;
        }
      } else {
        if (ch === "'" || ch === '"' || ch === '`') {
          quote = ch;
          escape = false;
        } else if (ch === '{') {
          depth++;
        } else if (ch === '}') {
          depth--;
        }
      }
      i++;
    }

    lastIndex = i;
    guardPattern.lastIndex = i;
  }

  result += code.slice(lastIndex);
  return result;
}

// 2. JavaScript スクリプトのインクルード（ScriptsUtils, ScriptsApiClient, ScriptsState, ScriptsApp）
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
    // <script> と </script> を除去
    content = content.trim();
    if (content.startsWith('<script>')) content = content.substring(8);
    if (content.endsWith('</script>')) content = content.substring(0, content.length - 9);
    content = content.trim();

    // コメントを除去
    content = stripComments(content);

    // Node.js テスト用 module.exports ガード文を除去（ネストした {} にも対応）
    content = stripModuleExportsGuards(content);

    // 空白文字のトリム
    content = content.trim();

    bundledJs += `\n/* [${name}] */\n` + content + '\n';
  }
});

// index.template.html 内のスクリプトインクルードおよび起動スクリプト全体を1つのブロックに置換
const scriptSectionRegex = /<\?!=\s*include\('ScriptsUtils'\);?\s*\?>[\s\S]*?<\/script>\s*(?=<\/body>)/i;

const startAppCode = `
/* [App Launcher] */
function startApp() {
  try {
    const missing = [];
    if (!window.Utils && typeof Utils === 'undefined') missing.push('Utils');
    if (!window.ApiClient && typeof ApiClient === 'undefined') missing.push('ApiClient');
    if (!window.Store && typeof Store === 'undefined') missing.push('Store');
    if (!window.App && typeof App === 'undefined') missing.push('App');

    if (missing.length > 0) {
      const msg = '未ロードのクラス: ' + missing.join(', ');
      console.error(msg);
      const loadingText = document.getElementById('global-loading-text');
      if (loadingText) {
        loadingText.textContent = msg;
        loadingText.classList.add('text-rose-400');
      }
      return;
    }

    const AppClass = window.App || App;
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
  template = template.replace(scriptSectionRegex, () => combinedScriptBlock + '\n');
} else {
  console.warn('Could not find full script include section in template; falling back to replacement before </body>');
  template = template.replace('</body>', () => `${combinedScriptBlock}\n</body>`);
}

// 3. グローバルエラーキャッチャー
const globalErrorScript = `
  <script>
    // グローバルエラーキャッチャー（コンソールログ出力のみ）
    window.addEventListener('error', function(e) {
      console.error('[Web App Global Error]', e.message, 'at', e.filename, 'line:', e.lineno, 'col:', e.colno, e.error);
    });
  </script>
`;

// 既存のグローバルエラーキャッチャーがあれば置換、なければ </head> 直前に挿入
const existingCatcherRegex = /<script>\s*\/\/\s*グローバル(?:初期化)?エラーキャッチャー[\s\S]*?<\/script>/i;
if (existingCatcherRegex.test(template)) {
  template = template.replace(existingCatcherRegex, () => globalErrorScript.trim());
} else if (template.includes('</head>')) {
  template = template.replace('</head>', () => `${globalErrorScript.trim()}\n</head>`);
}

// 4. 自動生成物警告バナーの付与（直接編集の抑止）
const banner = `<!-- ========================================================================= -->
<!-- WARNING: このファイルは build.js によって自動生成されたファイルです。     -->
<!-- 直接編集しないでください。編集は src/index.template.html または部品へ。   -->
<!-- ========================================================================= -->\n`;

let outputHtml = template;
if (!outputHtml.startsWith('<!-- ========================================================================= -->')) {
  outputHtml = banner + outputHtml;
}

// dist ディレクトリ作成および出力ファイル書き込み（.nojekyll 含む）
fs.mkdirSync(DIST_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_FILE, outputHtml, 'utf8');
fs.writeFileSync(NOJEKYLL_FILE, '', 'utf8');
console.log(`Successfully built bundled ${OUTPUT_FILE} (${outputHtml.length} characters) and ${NOJEKYLL_FILE}`);
