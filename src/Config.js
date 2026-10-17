/**
 * 設定管理およびシステム定数クラス
 */
class Config {
  constructor() {
    const props = (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties)
      ? PropertiesService.getScriptProperties().getProperties()
      : {};
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Config;
}
