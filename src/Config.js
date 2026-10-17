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
    this.musicBrainzUserAgent = (props.MUSICBRAINZ_USER_AGENT || '').trim() || Config.CONSTANTS.MUSICBRAINZ.DEFAULT_USER_AGENT;
    const rawMbEnabled = props.MUSICBRAINZ_ENABLED !== undefined && props.MUSICBRAINZ_ENABLED !== null
      ? String(props.MUSICBRAINZ_ENABLED).trim().toLowerCase()
      : '';
    this.musicBrainzEnabled = (rawMbEnabled === 'false' || rawMbEnabled === '0')
      ? false
      : Boolean(Config.CONSTANTS.MUSICBRAINZ.ENABLED);
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
   * MusicBrainz API 通信用 User-Agent を取得
   * @returns {string}
   */
  getMusicBrainzUserAgent() {
    return this.musicBrainzUserAgent;
  }

  /**
   * MusicBrainz 連携が有効かどうかを取得
   * @returns {boolean}
   */
  isMusicBrainzEnabled() {
    return this.musicBrainzEnabled;
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
      },
      MUSICBRAINZ: {
        BASE_URL: 'https://musicbrainz.org/ws/2',
        RELEASE_ENDPOINT: 'https://musicbrainz.org/ws/2/release',
        CAA_BASE_URL: 'https://coverartarchive.org/release',
        DEFAULT_USER_AGENT: 'MusicInfoApp/1.0 ( https://github.com/nankojin-ops/MusicInfo-app )',
        LIMIT: 25,
        MIN_INTERVAL_MS: 1100,
        RETRY_DELAY_MS: 1100,
        MAX_RETRIES: 1,
        CACHE_KEY_LAST_REQ: 'MUSICBRAINZ_LAST_REQUEST_TS',
        ENABLED: true
      }
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Config;
}
