/**
 * 音楽カタログ業務ロジック統括オーケストレーター
 */
class MusicService {
  /**
   * @param {Config} config 
   * @param {SheetService} sheetService 
   * @param {DriveService} driveService 
   * @param {ItunesService} itunesService 
   */
  constructor(config, sheetService, driveService, itunesService) {
    this.config = config;
    this.sheetService = sheetService;
    this.driveService = driveService;
    this.itunesService = itunesService;
  }

  /**
   * 全スプレッドシート楽曲データを取得
   * @returns {{ tracks: Array<RawTrackRow>, totalTracks: number, loadedAt: string }}
   */
  getAllMusicData() {
    const tracks = this.sheetService.fetchAllTracks();
    return {
      tracks: tracks,
      totalTracks: tracks.length,
      loadedAt: new Date().toISOString()
    };
  }

  /**
   * iTunesからアルバム概要を検索
   * @param {string} keyword 
   * @returns {{ albums: Array<ItunesAlbumSummary> }}
   */
  searchItunesAlbums(keyword) {
    if (!keyword || !keyword.trim()) {
      const err = new Error('検索キーワードを入力してください。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    const albums = this.itunesService.searchAlbums(keyword);
    return {
      albums: albums
    };
  }

  /**
   * iTunesからアルバム収録曲・ディスク情報を取得
   * @param {number|string} collectionId 
   * @returns {{ albumDetail: ItunesAlbumDetail }}
   */
  lookupItunesAlbum(collectionId) {
    if (!collectionId) {
      const err = new Error('コレクションIDが無効です。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    const detail = this.itunesService.lookupAlbumSongs(collectionId);
    return {
      albumDetail: detail
    };
  }

  /**
   * iTunesアルバムデータから画像保存およびスプレッドシートバッチ書き込みを実行
   * @param {BatchSavePayload} payload 
   * @returns {{ count: number, savedAlbum: string, artworkUrl: string }}
   */
  saveAlbumFromItunes(payload) {
    if (!payload || typeof payload !== 'object') {
      const err = new Error('リクエストペイロードが不正です。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }

    const albumName = String(payload.albumName || '').trim();
    const albumArtist = String(payload.albumArtist || '').trim();
    const releaseDate = String(payload.releaseDate || '').trim();
    const tracks = Array.isArray(payload.tracks) ? payload.tracks : [];

    if (!albumName) {
      const err = new Error('アルバム名が指定されていません。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    if (!albumArtist) {
      const err = new Error('アルバムアーティスト名が指定されていません。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    if (tracks.length === 0) {
      const err = new Error('登録する収録曲が1件も存在しません。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }

    // Google Driveへ500x500ジャケット画像を保存
    let driveArtworkUrl = '';
    if (payload.artworkUrl500) {
      driveArtworkUrl = this.driveService.downloadAndSaveArtwork(payload.artworkUrl500, albumName);
    }

    // スプレッドシートへバッチ追記
    const count = this.sheetService.insertTracksBatch(tracks, {
      albumName: albumName,
      albumArtist: albumArtist,
      releaseDate: releaseDate
    }, driveArtworkUrl);

    return {
      count: count,
      savedAlbum: albumName,
      artworkUrl: driveArtworkUrl
    };
  }

  /**
   * 1曲を手動登録
   * @param {SingleTrackPayload} trackPayload 
   * @returns {{ savedTrack: RawTrackRow }}
   */
  saveSingleTrack(trackPayload) {
    if (!trackPayload || typeof trackPayload !== 'object') {
      const err = new Error('リクエストペイロードが不正です。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }

    const cdNumber = (trackPayload.cdNumber !== undefined && trackPayload.cdNumber !== null && trackPayload.cdNumber !== '')
      ? Number(trackPayload.cdNumber)
      : 1;
    const albumArtist = String(trackPayload.albumArtist || '').trim();
    const albumName = String(trackPayload.albumName || '').trim();
    const trackArtist = String(trackPayload.trackArtist || albumArtist).trim();
    const trackNumber = (trackPayload.trackNumber !== undefined && trackPayload.trackNumber !== null && trackPayload.trackNumber !== '')
      ? Number(trackPayload.trackNumber)
      : 1;
    const trackName = String(trackPayload.trackName || '').trim();
    const releaseDate = String(trackPayload.releaseDate || '').trim();
    const artworkUrl = String(trackPayload.artworkUrl || '').trim();

    if (isNaN(cdNumber) || cdNumber < 1) {
      const err = new Error('CD番号は1以上の数値を指定してください。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    if (!albumArtist) {
      const err = new Error('アルバムアーティスト名を入力してください。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    if (!albumName) {
      const err = new Error('アルバム名を入力してください。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    if (!trackName) {
      const err = new Error('トラック名を入力してください。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    if (isNaN(trackNumber) || trackNumber < 1) {
      const err = new Error('トラック番号は1以上の数値を指定してください。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }

    const saved = this.sheetService.appendSingleTrack({
      cdNumber: cdNumber,
      albumArtist: albumArtist,
      albumName: albumName,
      trackArtist: trackArtist,
      trackNumber: trackNumber,
      trackName: trackName,
      releaseDate: releaseDate,
      artworkUrl: artworkUrl
    });

    return {
      savedTrack: saved
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MusicService;
}
