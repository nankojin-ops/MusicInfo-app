/**
 * Google Driveストレージ管理およびアートワーク保存クラス
 */
class DriveService {
  /**
   * @param {Config} config 
   */
  constructor(config) {
    this.config = config;
  }

  /**
   * 外部画像URLからバイナリを取得し、Google Driveの指定フォルダへ保存
   * @param {string} imageUrl500 500x500画像URL
   * @param {string} albumName アルバム名
   * @returns {string} Google DriveのWeb表示用永続URL（失敗時は空文字）
   */
  downloadAndSaveArtwork(imageUrl500, albumName) {
    if (!imageUrl500 || !String(imageUrl500).trim()) {
      return '';
    }

    const folderId = this.config.getDriveFolderId();
    let folder;
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (e) {
      console.error(`Google Driveフォルダ(ID: ${folderId})の取得に失敗しました:`, e);
      const err = new Error(`Google Driveフォルダ(ID: ${folderId})にアクセスできません: ${e.message}`);
      err.code = 'DRIVE_FOLDER_ERROR';
      throw err;
    }

    try {
      const response = UrlFetchApp.fetch(imageUrl500, {
        muteHttpExceptions: true
      });

      const statusCode = response.getResponseCode();
      if (statusCode !== 200) {
        console.warn(`画像ダウンロード失敗 (HTTP ${statusCode}): ${imageUrl500}`);
        return '';
      }

      const blob = response.getBlob();
      const fileName = this.generateArtworkFileName(albumName, 'jpg');

      blob.setName(fileName);
      blob.setContentType('image/jpeg');

      const file = folder.createFile(blob);
      this.setPublicSharing(file);

      return this.generateWebUrl(file.getId());
    } catch (e) {
      console.warn(`画像保存中にエラーが発生しました（スキップします）: ${e.message}`);
      return '';
    }
  }

  /**
   * ファイルにリンク共有閲覧権限を付与
   * @param {GoogleAppsScript.Drive.File} file 
   */
  setPublicSharing(file) {
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {
      console.warn(`ファイルの共有設定付与に失敗しました: ${e.message}`);
    }
  }

  /**
   * Web上で直接表示可能なURLを生成
   * @param {string} fileId 
   * @returns {string}
   */
  generateWebUrl(fileId) {
    if (!fileId) return '';
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
  }

  /**
   * Google Driveの各種URLまたは文字列からファイルIDを抽出
   * @param {string} url 
   * @returns {string|null}
   */
  extractDriveFileId(url) {
    if (!url || typeof url !== 'string') return null;
    const str = url.trim();
    if (!str) return null;

    // 1. /file/d/{id}
    const fileDMatch = str.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i);
    if (fileDMatch) return fileDMatch[1];

    // 2. id={id} クエリパラメータ (uc?id=, open?id=, thumbnail?id= 等)
    const idParamMatch = str.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
    if (idParamMatch) return idParamMatch[1];

    // 3. googleusercontent.com/d/{id}
    const dMatch = str.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/i);
    if (dMatch) return dMatch[1];

    // 4. 純粋なファイルID (25文字以上の英数字記号)
    if (/^[a-zA-Z0-9_-]{25,}$/.test(str)) {
      return str;
    }

    return null;
  }

  /**
   * モバイル・サードパーティCookie遮断環境に最適化された完全公開URLを生成
   * @param {string} fileId Google Drive ファイルID
   * @returns {string} https://lh3.googleusercontent.com/d/{fileId}
   */
  generatePublicUrl(fileId) {
    if (!fileId) return '';
    return `https://lh3.googleusercontent.com/d/${fileId}`;
  }

  /**
   * 手動登録または更新されたアルバムアートURLを検査・正規化し、
   * スマホ未認証環境からでも確実に表示可能な完全公開URLを返却する
   * 
   * @param {string} rawUrl ユーザー入力URL
   * @param {string} albumName アルバム名 (ファイル命名・ログ用)
   * @returns {string} 正規化された完全公開URL
   */
  ensurePublicArtwork(rawUrl, albumName) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    const trimmed = rawUrl.trim();
    if (!trimmed) return '';

    // 1. Google Drive の URL またはファイルID の場合
    const driveId = this.extractDriveFileId(trimmed);
    if (driveId) {
      if (typeof DriveApp !== 'undefined') {
        try {
          const file = DriveApp.getFileById(driveId);
          this.setPublicSharing(file);
        } catch (e) {
          console.warn(`Driveファイルの共有設定変更に失敗しました (ID: ${driveId}): ${e.message}`);
        }
      }
      return this.generatePublicUrl(driveId);
    }

    // 2. 外部Web画像URL (http/https でDrive以外) の場合
    if (/^https?:\/\//i.test(trimmed)) {
      if (typeof DriveApp !== 'undefined' && typeof UrlFetchApp !== 'undefined') {
        try {
          const savedUrl = this.downloadAndSaveArtwork(trimmed, albumName);
          if (savedUrl) {
            const savedId = this.extractDriveFileId(savedUrl);
            return savedId ? this.generatePublicUrl(savedId) : savedUrl;
          }
        } catch (e) {
          console.warn(`外部画像のGoogle Drive保存に失敗しました: ${e.message}`);
        }
      }
      return trimmed;
    }

    // 3. その他・不明な形式
    return trimmed;
  }

  /**
   * 新命名規則に基づくアルバムアート画像ファイル名生成
   * フォーマット: artwork_${sanitizedAlbumName}_${YYYYMMDDHHMM00}.${extension}
   * 
   * @param {string} albumName - アルバム名
   * @param {string} [extension='jpg'] - 拡張子 ('jpg' | 'png' | 'webp')
   * @param {Date} [date=new Date()] - 基準日時
   * @returns {string} 生成されたファイル名
   */
  generateArtworkFileName(albumName, extension = 'jpg', date = new Date()) {
    const sanitized = this.sanitizeFileName(albumName);
    const ext = String(extension || 'jpg').toLowerCase().replace(/^\./, '');

    let dateStr = '';
    if (typeof Utilities !== 'undefined' && Utilities.formatDate) {
      dateStr = Utilities.formatDate(date, 'Asia/Tokyo', "yyyyMMddHHmm'00'");
    } else {
      // Node.js テスト環境向けフォールバック (JST / UTC+9)
      const jstTime = new Date(date.getTime() + (9 * 60 + date.getTimezoneOffset()) * 60000);
      const y = jstTime.getFullYear();
      const m = String(jstTime.getMonth() + 1).padStart(2, '0');
      const d = String(jstTime.getDate()).padStart(2, '0');
      const h = String(jstTime.getHours()).padStart(2, '0');
      const min = String(jstTime.getMinutes()).padStart(2, '0');
      dateStr = `${y}${m}${d}${h}${min}00`;
    }

    return `artwork_${sanitized}_${dateStr}.${ext}`;
  }

  /**
   * Base64形式のローカル画像バイナリを専用Driveフォルダへ保存
   * 
   * @param {string} base64Data - Base64データ (DataURL形式可)
   * @param {string} mimeType - MIMEタイプ ('image/jpeg', 'image/png', 'image/webp')
   * @param {string} albumName - アルバム名
   * @returns {{ fileId: string, publicUrl: string, fileName: string }}
   */
  saveUploadedArtwork(base64Data, mimeType, albumName) {
    if (!base64Data || typeof base64Data !== 'string') {
      const err = new Error('画像データが指定されていません。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }

    let pureBase64 = base64Data.trim();
    const paramMime = (mimeType || '').trim().toLowerCase();

    // DataURLプレフィックスの抽出・分離
    let headerMime = null;
    const dataUrlMatch = pureBase64.match(/^data:([^;]+);base64,(.+)$/s);
    if (dataUrlMatch) {
      headerMime = dataUrlMatch[1].trim().toLowerCase();
      pureBase64 = dataUrlMatch[2].trim();
    }

    // MIMEタイプ検証 (BUG-001)
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];

    // 引数 mimeType が指定されている場合、許可リスト検証
    if (paramMime && !allowedMimes.includes(paramMime)) {
      const err = new Error('対応形式はJPEG、PNG、WebPのみです。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }

    // DataURLヘッダが存在する場合の検証および引数との整合性検証
    if (headerMime) {
      if (!allowedMimes.includes(headerMime)) {
        const err = new Error('対応形式はJPEG、PNG、WebPのみです。');
        err.code = 'VALIDATION_FAILED';
        throw err;
      }
      if (paramMime && headerMime !== paramMime) {
        const err = new Error('MIMEタイプの指定が一致しません。');
        err.code = 'VALIDATION_FAILED';
        throw err;
      }
    }

    // 最終決定MIMEタイプ (DataURLヘッダ優先)
    const detectedMime = headerMime || paramMime;
    if (!detectedMime || !allowedMimes.includes(detectedMime)) {
      const err = new Error('対応形式はJPEG、PNG、WebPのみです。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }

    // 拡張子マッピング
    const extMapping = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const ext = extMapping[detectedMime] || 'jpg';

    // Base64デコード
    let bytes;
    if (typeof Utilities !== 'undefined' && Utilities.base64Decode) {
      bytes = Utilities.base64Decode(pureBase64);
    } else if (typeof Buffer !== 'undefined') {
      bytes = Buffer.from(pureBase64, 'base64');
    } else {
      const err = new Error('Base64デコーダが利用できません。');
      err.code = 'SYSTEM_ERROR';
      throw err;
    }

    // 5MB容量制限チェック
    const maxSize = 5 * 1024 * 1024;
    if (bytes.length > maxSize) {
      const err = new Error('画像サイズは5MB以内にしてください。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }

    // Google Drive フォルダ取得
    const folderId = this.config.getDriveFolderId();
    let folder;
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (e) {
      console.error(`Google Driveフォルダ(ID: ${folderId})の取得に失敗しました:`, e);
      const err = new Error(`Google Driveフォルダ(ID: ${folderId})にアクセスできません: ${e.message}`);
      err.code = 'DRIVE_FOLDER_ERROR';
      throw err;
    }

    // ファイル名生成およびBlob作成
    const fileName = this.generateArtworkFileName(albumName, ext);
    let blob;
    if (typeof Utilities !== 'undefined' && Utilities.newBlob) {
      blob = Utilities.newBlob(bytes, detectedMime, fileName);
    } else {
      blob = {
        getName: () => fileName,
        getContentType: () => detectedMime,
        getBytes: () => bytes
      };
    }

    const file = folder.createFile(blob);
    this.setPublicSharing(file);

    const fileId = file.getId();
    const publicUrl = this.generatePublicUrl(fileId);

    return {
      fileId: fileId,
      publicUrl: publicUrl,
      fileName: fileName
    };
  }

  /**
   * Google Drive上の画像ファイルをインポートし、専用管理フォルダへ新命名規則で複製・公開設定
   * 
   * @param {string} driveUrlOrId - DriveのURLまたはファイルID
   * @param {string} albumName - アルバム名
   * @param {boolean} [copyToAppFolder=true] - 管理フォルダへ複製するかどうか
   * @returns {{ fileId: string, publicUrl: string, fileName: string }}
   */
  importArtworkFromDrive(driveUrlOrId, albumName, copyToAppFolder = true) {
    if (!driveUrlOrId || typeof driveUrlOrId !== 'string' || !driveUrlOrId.trim()) {
      const err = new Error('Google DriveのURLまたはファイルIDを指定してください。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }

    const driveId = this.extractDriveFileId(driveUrlOrId);
    if (!driveId) {
      const err = new Error('有効なGoogle DriveのURLまたはファイルIDではありません。');
      err.code = 'INVALID_DRIVE_ID';
      throw err;
    }

    let srcFile;
    try {
      srcFile = DriveApp.getFileById(driveId);
    } catch (e) {
      console.warn(`Driveファイル取得失敗 (ID: ${driveId}):`, e);
      const err = new Error('Google Driveファイルにアクセスできません: ' + e.message);
      err.code = 'DRIVE_ACCESS_DENIED';
      throw err;
    }

    const srcMime = (srcFile.getMimeType ? srcFile.getMimeType() : '').toLowerCase();
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(srcMime)) {
      const err = new Error('指定されたファイルは対応している画像形式 (JPEG, PNG, WebP) ではありません。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }

    const extMapping = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const ext = extMapping[srcMime] || 'jpg';
    const newFileName = this.generateArtworkFileName(albumName, ext);

    let finalFile = srcFile;
    let copied = false;

    if (copyToAppFolder !== false) {
      try {
        const folderId = this.config.getDriveFolderId();
        const appFolder = DriveApp.getFolderById(folderId);
        finalFile = srcFile.makeCopy(newFileName, appFolder);
        copied = true;
      } catch (copyErr) {
        console.warn(`Driveファイルの複製に失敗したため、元ファイルの共有設定を試みます: ${copyErr.message}`);
        finalFile = srcFile;
        copied = false;
      }
    }

    this.setPublicSharing(finalFile);
    const fileId = finalFile.getId();
    const publicUrl = this.generatePublicUrl(fileId);
    const finalFileName = copied ? newFileName : (finalFile.getName ? finalFile.getName() : newFileName);

    return {
      fileId: fileId,
      publicUrl: publicUrl,
      fileName: finalFileName
    };
  }

  /**
   * ファイル名禁止文字をサニタイズ
   * @param {string} name 
   * @returns {string}
   */
  sanitizeFileName(name) {
    if (!name) return 'album';
    const cleaned = String(name)
      .replace(/\0/g, '')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .replace(/\.\.+/g, '_')
      .replace(/[\/\\:\*\?"<>\| \r\n\t=@]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    let truncated = cleaned.substring(0, 60);

    // 孤立上位サロゲート（Malformed UTF-16）の除去 (BUG-003)
    truncated = truncated.replace(/[\uD800-\uDBFF]$/, '');
    truncated = truncated.replace(/^_+|_+$/g, '');

    // 単一ドットまたはドットのみで構成されている場合の安全なフォールバック (BUG-004)
    if (!truncated || /^\.+$/.test(truncated)) {
      return 'album';
    }

    return truncated;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DriveService;
}
