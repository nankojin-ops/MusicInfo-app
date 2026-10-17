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
      const sanitizedName = this.sanitizeFileName(albumName);
      const fileName = `artwork_${sanitizedName}_${Date.now()}.jpg`;

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
      .replace(/[\/\\:\*\?"<>\| \r\n\t]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    return cleaned.substring(0, 60) || 'album';
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DriveService;
}
