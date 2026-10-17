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
    const cleaned = String(keyword || '').trim();
    if (!cleaned) {
      const err = new Error('検索キーワードを入力してください。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    const albums = this.itunesService.searchAlbums(cleaned);
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
    const rawTracks = payload.tracks;

    if (!albumName) {
      const err = new Error('アルバム名が指定されていません。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    if (albumName.length > 255) {
      const err = new Error('アルバム名は255文字以内で入力してください。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    if (!albumArtist) {
      const err = new Error('アルバムアーティスト名が指定されていません。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    if (albumArtist.length > 255) {
      const err = new Error('アルバムアーティスト名は255文字以内で入力してください。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    if (!Array.isArray(rawTracks) || rawTracks.length === 0) {
      const err = new Error('登録する収録曲が1件も存在しません。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }

    // tracks 配列の要素検証
    const validatedTracks = [];
    for (let i = 0; i < rawTracks.length; i++) {
      const t = rawTracks[i];
      if (!t || typeof t !== 'object') {
        const err = new Error(`トラックデータ (インデックス ${i}) が不正です。`);
        err.code = 'VALIDATION_FAILED';
        throw err;
      }
      const tName = String(t.trackName || '').trim();
      if (!tName) {
        const err = new Error(`トラック名 (インデックス ${i}) が指定されていません。`);
        err.code = 'VALIDATION_FAILED';
        throw err;
      }
      if (tName.length > 255) {
        const err = new Error(`トラック名 (インデックス ${i}) は255文字以内で入力してください。`);
        err.code = 'VALIDATION_FAILED';
        throw err;
      }

      const cdNo = (t.cdNumber !== undefined && t.cdNumber !== null && t.cdNumber !== '')
        ? Number(t.cdNumber)
        : 1;
      if (!Number.isFinite(cdNo) || !Number.isInteger(cdNo) || cdNo < 1) {
        const err = new Error(`CD番号 (インデックス ${i}) は1以上の整数を指定してください。`);
        err.code = 'VALIDATION_FAILED';
        throw err;
      }

      const trkNo = (t.trackNumber !== undefined && t.trackNumber !== null && t.trackNumber !== '')
        ? Number(t.trackNumber)
        : 1;
      if (!Number.isFinite(trkNo) || !Number.isInteger(trkNo) || trkNo < 1) {
        const err = new Error(`トラック番号 (インデックス ${i}) は1以上の整数を指定してください。`);
        err.code = 'VALIDATION_FAILED';
        throw err;
      }

      const tArtist = String(t.trackArtist || albumArtist).trim();
      if (tArtist.length > 255) {
        const err = new Error(`トラックアーティスト名 (インデックス ${i}) は255文字以内で入力してください。`);
        err.code = 'VALIDATION_FAILED';
        throw err;
      }

      validatedTracks.push({
        cdNumber: cdNo,
        trackNumber: trkNo,
        trackName: this.escapeFormula_(tName),
        trackArtist: this.escapeFormula_(tArtist)
      });
    }

    // Google Driveへ500x500ジャケット画像を保存
    let driveArtworkUrl = '';
    if (payload.artworkUrl500) {
      driveArtworkUrl = this.driveService.downloadAndSaveArtwork(payload.artworkUrl500, albumName);
    }

    // スプレッドシートへバッチ追記
    const count = this.sheetService.insertTracksBatch(validatedTracks, {
      albumName: this.escapeFormula_(albumName),
      albumArtist: this.escapeFormula_(albumArtist),
      releaseDate: this.escapeFormula_(releaseDate)
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

    if (!Number.isFinite(cdNumber) || !Number.isInteger(cdNumber) || cdNumber < 1) {
      const err = new Error('CD番号は1以上の整数を指定してください。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    if (!albumArtist) {
      const err = new Error('アルバムアーティスト名を入力してください。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    if (albumArtist.length > 255) {
      const err = new Error('アルバムアーティスト名は255文字以内で入力してください。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    if (!albumName) {
      const err = new Error('アルバム名を入力してください。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    if (albumName.length > 255) {
      const err = new Error('アルバム名は255文字以内で入力してください。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    if (!trackName) {
      const err = new Error('トラック名を入力してください。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    if (trackName.length > 255) {
      const err = new Error('トラック名は255文字以内で入力してください。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    if (!Number.isFinite(trackNumber) || !Number.isInteger(trackNumber) || trackNumber < 1) {
      const err = new Error('トラック番号は1以上の整数を指定してください。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    if (trackArtist.length > 255) {
      const err = new Error('トラックアーティスト名は255文字以内で入力してください。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }

    const saved = this.sheetService.appendSingleTrack({
      cdNumber: cdNumber,
      albumArtist: this.escapeFormula_(albumArtist),
      albumName: this.escapeFormula_(albumName),
      trackArtist: this.escapeFormula_(trackArtist),
      trackNumber: trackNumber,
      trackName: this.escapeFormula_(trackName),
      releaseDate: this.escapeFormula_(releaseDate),
      artworkUrl: artworkUrl
    });

    return {
      savedTrack: saved
    };
  }

  /**
   * スプレッドシート式インジェクション（=, @, +, - で始まる文字列）を無害化
   * @param {any} val 
   * @returns {string}
   */
  escapeFormula_(val) {
    if (val === null || val === undefined) return '';
    const str = String(val).trim();
    if (/^[=@+\-]/.test(str)) {
      return `'${str}`;
    }
    return str;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MusicService;
}
