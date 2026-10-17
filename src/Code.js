/**
 * Web Apps エントリーポイント
 * @param {GoogleAppsScript.Events.DoGet} e
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('MusicInfo Manager - 音楽CD・アルバムコレクション管理')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * HTMLService テンプレート内インクルードヘルパー
 * createTemplateFromFile().getRawContent() により、スクリプト内のHTMLタグや演算子(<, &&)が
 * サニタイザーによって破損・エンコードされるのを防ぎ、生のコンテンツを安全に挿入します。
 * @param {string} filename 
 * @returns {string} ファイルの内容HTML文字列
 */
function include(filename) {
  try {
    return HtmlService.createTemplateFromFile(filename).getRawContent();
  } catch (e) {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  }
}

/**
 * サービス依存関係を解決して MusicService を生成するファクトリ関数
 * @returns {MusicService}
 */
function getMusicService() {
  const config = new Config();
  const sheetService = new SheetService(config);
  const driveService = new DriveService(config);
  const itunesService = new ItunesService();
  return new MusicService(config, sheetService, driveService, itunesService);
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
 * 【RPC】iTunesアルバム一括保存API
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    doGet,
    include,
    getMusicService,
    apiGetAllData,
    apiSearchItunes,
    apiLookupItunesAlbum,
    apiSaveAlbumBatch,
    apiSaveTrackSingle
  };
}
