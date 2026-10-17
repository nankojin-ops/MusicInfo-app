/**
 * Web Apps エントリーポイント
 * @param {GoogleAppsScript.Events.DoGet} e
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.raw === 'true') {
    return ContentService.createTextOutput(
      HtmlService.createHtmlOutputFromFile('index').getContent()
    ).setMimeType(ContentService.MimeType.TEXT);
  }

  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('MusicInfo Manager - 音楽CD・アルバムコレクション管理')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * HTMLService テンプレート内インクルードヘルパー（後方互換用）
 * @param {string} filename 
 * @returns {string} ファイルの内容HTML文字列
 */
function include(filename) {
  try {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  } catch (e) {
    return HtmlService.createTemplateFromFile(filename).getRawContent();
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    doGet,
    include,
    getMusicService,
    apiGetAllData,
    apiSearchAlbums,
    apiSearchItunes,
    apiLookupItunesAlbum,
    apiLookupMusicBrainzRelease,
    apiSaveAlbumBatch,
    apiSaveTrackSingle,
    apiUpdateAlbumBatch
  };
}
