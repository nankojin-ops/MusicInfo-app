/**
 * JSON レスポンスを生成するヘルパー
 * @param {Object} obj
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function createJsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * エラー用 JSON レスポンスを生成するヘルパー
 * @param {string} message
 * @param {string} code
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function createErrorResponse_(message, code) {
  return createJsonResponse_({
    success: false,
    error: message,
    code: code,
    timestamp: new Date().toISOString()
  });
}

/**
 * タイミング攻撃に耐性のある定数時間文字列比較
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function constantTimeEqual_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i++) {
    const codeA = i < a.length ? a.charCodeAt(i) : 0;
    const codeB = i < b.length ? b.charCodeAt(i) : 0;
    diff |= (codeA ^ codeB);
  }
  return diff === 0;
}

/**
 * オブジェクトまたはスカラから単一スカラ引数（string | number）を安全に抽出
 * 配列やネストオブジェクトの "[object Object]" 暗黙文字列化を防止する
 * @param {unknown} payload
 * @param {string} key
 * @returns {string|number}
 */
function extractScalarArg_(payload, key) {
  let val = payload;
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    val = Object.prototype.hasOwnProperty.call(payload, key) ? payload[key] : undefined;
  }
  if (typeof val === 'string' || typeof val === 'number') {
    return val;
  }
  return '';
}

/**
 * Web Apps GET エントリーポイント（API ヘルスチェック専用）
 * @param {GoogleAppsScript.Events.DoGet} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doGet(e) {
  let apiConfigured = false;
  try {
    const ConfigCls = (typeof Config !== 'undefined') ? Config : (typeof require !== 'undefined' ? require('./Config') : null);
    if (ConfigCls) {
      const config = new ConfigCls();
      apiConfigured = (typeof config.hasApiToken === 'function') && config.hasApiToken();
    }
  } catch (err) {
    console.warn('Config読み込みエラー (doGet):', err);
  }

  return createJsonResponse_({
    success: true,
    data: {
      service: 'MusicInfo-app',
      role: 'api-only',
      status: 'ok',
      apiConfigured: apiConfigured
    },
    timestamp: new Date().toISOString()
  });
}

/**
 * Web Apps POST エントリーポイント（JSON API ディスパッチャ）
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  const MAX_PAYLOAD_CHARS = 10 * 1024 * 1024; // 10MB 文字数上限

  // 1. リクエスト存在・サイズ上限検証
  if (!e || !e.postData || typeof e.postData.contents !== 'string') {
    return createErrorResponse_('リクエストボディが空です。', 'INVALID_REQUEST');
  }
  const rawContents = e.postData.contents;
  if (!rawContents.trim()) {
    return createErrorResponse_('リクエストボディが空です。', 'INVALID_REQUEST');
  }
  if (rawContents.length > MAX_PAYLOAD_CHARS) {
    return createErrorResponse_('リクエストサイズが上限（10MB）を超えています。', 'INVALID_REQUEST');
  }

  // 2. JSON パース・構造検証
  let body;
  try {
    body = JSON.parse(rawContents);
  } catch (parseErr) {
    return createErrorResponse_('リクエストボディの JSON 形式が不正です。', 'INVALID_REQUEST');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return createErrorResponse_('リクエストボディは JSON オブジェクトである必要があります。', 'INVALID_REQUEST');
  }

  // 3. サーバー側 API_TOKEN 設定確認 (Secure by Default)
  let config;
  try {
    const ConfigCls = (typeof Config !== 'undefined') ? Config : (typeof require !== 'undefined' ? require('./Config') : null);
    if (!ConfigCls) {
      return createErrorResponse_('設定クラスを初期化できません。', 'API_DISABLED');
    }
    config = new ConfigCls();
  } catch (cfgErr) {
    console.error('Config初期化エラー (doPost):', cfgErr);
    return createErrorResponse_('設定の読み込みに失敗しました。', 'API_DISABLED');
  }

  if (typeof config.hasApiToken !== 'function' || !config.hasApiToken()) {
    return createErrorResponse_('サーバー側に API_TOKEN が設定されていないため、外部 API アクセスは無効化されています。', 'API_DISABLED');
  }
  const expectedToken = config.getApiToken();

  // 4. トークン検証（定数時間比較）
  if (typeof body.token !== 'string' || body.token.length === 0 || !constantTimeEqual_(body.token, expectedToken)) {
    return createErrorResponse_('認証に失敗しました。API_TOKEN が未指定または一致しません。', 'UNAUTHORIZED');
  }

  // 5. アクション検証（ホワイトリスト & プロトタイプ汚染防御）
  const ACTION_HANDLERS = {
    getAllData: () => apiGetAllData(),
    searchAlbums: (p) => apiSearchAlbums(extractScalarArg_(p, 'keyword')),
    searchItunes: (p) => apiSearchItunes(extractScalarArg_(p, 'keyword')),
    lookupItunesAlbum: (p) => apiLookupItunesAlbum(extractScalarArg_(p, 'collectionId')),
    lookupMusicBrainzRelease: (p) => apiLookupMusicBrainzRelease(extractScalarArg_(p, 'mbid')),
    saveAlbumBatch: (p) => apiSaveAlbumBatch(p),
    saveTrackSingle: (p) => apiSaveTrackSingle(p),
    updateAlbumBatch: (p) => apiUpdateAlbumBatch(p),
    uploadArtwork: (p) => apiUploadArtwork(p),
    resolveDriveArtwork: (p) => apiResolveDriveArtwork(p),
    deleteAlbumsBatch: (p) => apiDeleteAlbumsBatch(p)
  };

  if (typeof body.action !== 'string' || !Object.prototype.hasOwnProperty.call(ACTION_HANDLERS, body.action)) {
    return createErrorResponse_(`未定義のアクションが指定されました: ${String(body.action || '')}`, 'UNKNOWN_ACTION');
  }

  // 6. 業務 RPC 実行
  try {
    const result = ACTION_HANDLERS[body.action](body.payload);
    return createJsonResponse_(result);
  } catch (err) {
    console.error(`doPost アクション実行エラー [${body.action}]:`, err);
    return createErrorResponse_(err.message || 'API実行中に予期しないエラーが発生しました。', err.code || 'INTERNAL_ERROR');
  }
}

/**
 * サービス依存関係を解決して MusicService を生成するファクトリ関数
 * @returns {MusicService}
 */
function getMusicService() {
  const ConfigCls = (typeof Config !== 'undefined') ? Config : (typeof require !== 'undefined' ? require('./Config') : null);
  const SheetServiceCls = (typeof SheetService !== 'undefined') ? SheetService : (typeof require !== 'undefined' ? require('./SheetService') : null);
  const DriveServiceCls = (typeof DriveService !== 'undefined') ? DriveService : (typeof require !== 'undefined' ? require('./DriveService') : null);
  const ItunesServiceCls = (typeof ItunesService !== 'undefined') ? ItunesService : (typeof require !== 'undefined' ? require('./ItunesService') : null);
  const MusicBrainzServiceCls = (typeof MusicBrainzService !== 'undefined') ? MusicBrainzService : (typeof require !== 'undefined' ? require('./MusicBrainzService') : null);
  const MusicServiceCls = (typeof MusicService !== 'undefined') ? MusicService : (typeof require !== 'undefined' ? require('./MusicService') : null);

  const config = new ConfigCls();
  const sheetService = new SheetServiceCls(config);
  const driveService = new DriveServiceCls(config);
  const itunesService = new ItunesServiceCls();
  const musicBrainzService = new MusicBrainzServiceCls(config);
  return new MusicServiceCls(config, sheetService, driveService, itunesService, musicBrainzService);
}

/**
 * 【RPC】全データ取得API
 * @returns {ApiResponse}
 */
function apiGetAllData() {
  try {
    const data = getMusicService().getAllMusicData();
    return {
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('apiGetAllData エラー:', err);
    return {
      success: false,
      error: err.message,
      code: err.code || 'DATA_FETCH_ERROR',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 【RPC】統合アルバム検索API（iTunes + MusicBrainz）
 * @param {string} keyword
 * @returns {ApiResponse}
 */
function apiSearchAlbums(keyword) {
  try {
    const data = getMusicService().searchAlbums(keyword);
    return {
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('apiSearchAlbums エラー:', err);
    return {
      success: false,
      error: err.message,
      code: err.code || 'ALBUM_SEARCH_ERROR',
      timestamp: new Date().toISOString()
    };
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
    return {
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('apiSearchItunes エラー:', err);
    return {
      success: false,
      error: err.message,
      code: err.code || 'ITUNES_SEARCH_ERROR',
      timestamp: new Date().toISOString()
    };
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
    return {
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('apiLookupItunesAlbum エラー:', err);
    return {
      success: false,
      error: err.message,
      code: err.code || 'ITUNES_LOOKUP_ERROR',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 【RPC】MusicBrainzリリース収録曲Lookup API
 * @param {string} mbid
 * @returns {ApiResponse}
 */
function apiLookupMusicBrainzRelease(mbid) {
  try {
    const data = getMusicService().lookupMusicBrainzRelease(mbid);
    return {
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('apiLookupMusicBrainzRelease エラー:', err);
    return {
      success: false,
      error: err.message,
      code: err.code || 'MUSICBRAINZ_LOOKUP_ERROR',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 【RPC】アルバム一括保存API（iTunes / MusicBrainz 共通）
 * @param {BatchSavePayload} payload 
 * @returns {ApiResponse}
 */
function apiSaveAlbumBatch(payload) {
  try {
    const data = getMusicService().saveAlbumFromItunes(payload);
    return {
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('apiSaveAlbumBatch エラー:', err);
    return {
      success: false,
      error: err.message,
      code: err.code || 'BATCH_SAVE_ERROR',
      timestamp: new Date().toISOString()
    };
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
    return {
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('apiSaveTrackSingle エラー:', err);
    return {
      success: false,
      error: err.message,
      code: err.code || 'SINGLE_SAVE_ERROR',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 【RPC】アルバムデータ一括更新API
 * @param {AlbumEditPayload} payload 
 * @returns {ApiResponse<AlbumEditResult>}
 */
function apiUpdateAlbumBatch(payload) {
  try {
    const data = getMusicService().updateAlbum(payload);
    return { success: true, data: data, timestamp: new Date().toISOString() };
  } catch (err) {
    console.error('apiUpdateAlbumBatch エラー:', err);
    return {
      success: false,
      error: err.message,
      code: err.code || 'ALBUM_UPDATE_ERROR',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 【RPC】ローカルアートワーク画像アップロードAPI
 * @param {Object} payload 
 * @returns {ApiResponse}
 */
function apiUploadArtwork(payload) {
  try {
    const data = getMusicService().uploadArtwork(payload);
    return {
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('apiUploadArtwork エラー:', err);
    return {
      success: false,
      error: err.message,
      code: err.code || 'ARTWORK_UPLOAD_ERROR',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 【RPC】Google Drive画像インポート・複製API
 * @param {Object} payload 
 * @returns {ApiResponse}
 */
function apiResolveDriveArtwork(payload) {
  try {
    const data = getMusicService().resolveDriveArtwork(payload);
    return {
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('apiResolveDriveArtwork エラー:', err);
    return {
      success: false,
      error: err.message,
      code: err.code || 'DRIVE_RESOLVE_ERROR',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 【RPC】アルバム一括削除API
 * @param {Object} payload 
 * @returns {ApiResponse}
 */
function apiDeleteAlbumsBatch(payload) {
  try {
    const data = getMusicService().deleteAlbums(payload);
    return {
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('apiDeleteAlbumsBatch エラー:', err);
    return {
      success: false,
      error: err.message,
      code: err.code || 'ALBUM_DELETE_ERROR',
      timestamp: new Date().toISOString()
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    doGet,
    doPost,
    constantTimeEqual_,
    extractScalarArg_,
    getMusicService,
    apiGetAllData,
    apiSearchAlbums,
    apiSearchItunes,
    apiLookupItunesAlbum,
    apiLookupMusicBrainzRelease,
    apiSaveAlbumBatch,
    apiSaveTrackSingle,
    apiUpdateAlbumBatch,
    apiUploadArtwork,
    apiResolveDriveArtwork,
    apiDeleteAlbumsBatch
  };
}
