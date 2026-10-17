var MusicBrainzService = (typeof MusicBrainzService !== 'undefined')
  ? MusicBrainzService
  : (typeof require !== 'undefined' ? require('./MusicBrainzService') : null);

/**
 * 音楽カタログ業務ロジック統括オーケストレーター
 */
class MusicService {
  /**
   * @param {Config} config 
   * @param {SheetService} sheetService 
   * @param {DriveService} driveService 
   * @param {ItunesService} itunesService 
   * @param {MusicBrainzService} [musicBrainzService=null]
   */
  constructor(config, sheetService, driveService, itunesService, musicBrainzService = null) {
    this.config = config;
    this.sheetService = sheetService;
    this.driveService = driveService;
    this.itunesService = itunesService;
    this.musicBrainzService = musicBrainzService;
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
   * iTunes と MusicBrainz の統合アルバム検索
   * @param {string} keyword
   * @returns {AlbumSearchResponse}
   */
  searchAlbums(keyword) {
    const cleaned = String(keyword || '').trim();
    if (!cleaned) {
      const err = new Error('検索キーワードを入力してください。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }

    const mbService = this.musicBrainzService || (MusicBrainzService ? new MusicBrainzService(this.config) : null);
    const configEnabled = (this.config && typeof this.config.isMusicBrainzEnabled === 'function')
      ? this.config.isMusicBrainzEnabled()
      : true;
    const serviceEnabled = (mbService && typeof mbService.isEnabled === 'function')
      ? mbService.isEnabled()
      : true;
    const mbEnabled = Boolean(mbService && configEnabled && serviceEnabled);

    const sources = {
      itunes: { ok: false, count: 0 },
      musicbrainz: mbEnabled
        ? { ok: false, count: 0 }
        : { ok: true, count: 0, skipped: true }
    };

    let itunesAlbums = [];
    let mbAlbums = [];
    let handledViaFetchAll = false;

    const canUseFetchAll = Boolean(
      mbEnabled &&
      typeof UrlFetchApp !== 'undefined' &&
      UrlFetchApp &&
      typeof UrlFetchApp.fetchAll === 'function' &&
      this.itunesService &&
      typeof this.itunesService.buildSearchRequest === 'function' &&
      typeof this.itunesService.parseSearchResponse === 'function' &&
      mbService &&
      typeof mbService.buildSearchRequest === 'function' &&
      typeof mbService.executeWithRetryFromInitialResponse === 'function'
    );

    if (canUseFetchAll) {
      const itunesReq = this.itunesService.buildSearchRequest(cleaned);
      const mbReq = mbService.buildSearchRequest(cleaned);
      if (itunesReq && mbReq) {
        try {
          if (typeof mbService.enforceRateLimit_ === 'function') {
            mbService.enforceRateLimit_();
          }
          const responses = UrlFetchApp.fetchAll([itunesReq, mbReq]);
          handledViaFetchAll = true;

          try {
            itunesAlbums = this.itunesService.parseSearchResponse(responses[0]) || [];
            sources.itunes = { ok: true, count: itunesAlbums.length };
          } catch (itErr) {
            sources.itunes = {
              ok: false,
              count: 0,
              error: itErr.message || 'iTunes検索に失敗しました'
            };
          }

          try {
            mbAlbums = mbService.executeWithRetryFromInitialResponse(mbReq, responses[1]) || [];
            sources.musicbrainz = { ok: true, count: mbAlbums.length };
          } catch (mbErr) {
            sources.musicbrainz = {
              ok: false,
              count: 0,
              error: mbErr.message || 'MusicBrainz検索に失敗しました'
            };
          }
        } catch (fetchAllErr) {
          handledViaFetchAll = false;
        }
      }
    }

    if (!handledViaFetchAll) {
      try {
        itunesAlbums = (this.itunesService && typeof this.itunesService.searchAlbums === 'function')
          ? (this.itunesService.searchAlbums(cleaned) || [])
          : [];
        sources.itunes = { ok: true, count: itunesAlbums.length };
      } catch (itErr) {
        sources.itunes = {
          ok: false,
          count: 0,
          error: itErr.message || 'iTunes検索に失敗しました'
        };
      }

      if (mbEnabled) {
        try {
          mbAlbums = (mbService && typeof mbService.searchReleases === 'function')
            ? (mbService.searchReleases(cleaned) || [])
            : [];
          sources.musicbrainz = { ok: true, count: mbAlbums.length };
        } catch (mbErr) {
          sources.musicbrainz = {
            ok: false,
            count: 0,
            error: mbErr.message || 'MusicBrainz検索に失敗しました'
          };
        }
      }
    }

    if (!sources.itunes.ok && (!mbEnabled || !sources.musicbrainz.ok)) {
      const reasons = [sources.itunes.error, sources.musicbrainz.error].filter(Boolean).join(' / ');
      const err = new Error(`アルバム検索に失敗しました: ${reasons || 'すべての検索ソースでエラーが発生しました'}`);
      err.code = 'ALBUM_SEARCH_ALL_FAILED';
      throw err;
    }

    const mergedAlbums = this.mergeAlbumSearchResults(itunesAlbums, mbAlbums);

    return {
      albums: mergedAlbums,
      sources: sources
    };
  }

  /**
   * iTunes 検索結果と MusicBrainz 検索結果のマージ・重複排除・ソート（純粋関数）
   * @param {Array<object>} itunesAlbums
   * @param {Array<object>} mbAlbums
   * @returns {Array<AlbumSearchResult>}
   */
  mergeAlbumSearchResults(itunesAlbums, mbAlbums) {
    const safeItunes = Array.isArray(itunesAlbums) ? itunesAlbums : [];
    const safeMb = Array.isArray(mbAlbums) ? mbAlbums : [];

    const normalizedItunes = safeItunes
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const colId = (item.collectionId !== undefined && item.collectionId !== null) ? item.collectionId : '';
        const sourceId = String(item.sourceId !== undefined && item.sourceId !== null ? item.sourceId : colId);
        return {
          ...item,
          source: 'itunes',
          sourceId: sourceId
        };
      });

    const extractYear = (dateStr) => {
      if (!dateStr) return '';
      const m = String(dateStr).trim().match(/^(\d{4})/);
      return m ? m[1] : '';
    };

    const isDuplicateOfItunes = (mbItem) => {
      const mbNameNorm = this.normalizeForComparison_(mbItem.albumName);
      const mbArtistNorm = this.normalizeForComparison_(mbItem.albumArtist);
      const mbTrackCount = Number(mbItem.trackCount) || 0;
      const mbYear = extractYear(mbItem.releaseDate);

      if (!mbNameNorm || !mbArtistNorm || mbTrackCount <= 0 || !mbYear) {
        return false;
      }

      for (let i = 0; i < normalizedItunes.length; i++) {
        const itItem = normalizedItunes[i];
        const itNameNorm = this.normalizeForComparison_(itItem.albumName);
        const itArtistNorm = this.normalizeForComparison_(itItem.albumArtist);
        const itTrackCount = Number(itItem.trackCount) || 0;
        const itYear = extractYear(itItem.releaseDate);

        if (!itNameNorm || !itArtistNorm || itTrackCount <= 0 || !itYear) {
          continue;
        }

        if (
          itNameNorm === mbNameNorm &&
          itArtistNorm === mbArtistNorm &&
          itTrackCount === mbTrackCount &&
          itYear === mbYear
        ) {
          return true;
        }
      }
      return false;
    };

    const indexedMb = [];
    for (let i = 0; i < safeMb.length; i++) {
      const item = safeMb[i];
      if (!item || typeof item !== 'object') continue;

      const normalizedItem = {
        ...item,
        source: 'musicbrainz',
        sourceId: String(item.sourceId || item.id || '')
      };

      if (isDuplicateOfItunes(normalizedItem)) {
        continue;
      }

      const rawScore = (normalizedItem.extra && normalizedItem.extra.score !== undefined)
        ? Number(normalizedItem.extra.score)
        : Number(normalizedItem.score);
      const score = Number.isFinite(rawScore) ? rawScore : 0;

      indexedMb.push({
        item: normalizedItem,
        score: score,
        index: i
      });
    }

    indexedMb.sort((a, b) => (b.score - a.score) || (a.index - b.index));
    const sortedMb = indexedMb.map((entry) => entry.item);

    return normalizedItunes.concat(sortedMb);
  }

  /**
   * 重複判定用の文字列正規化ヘルパー (ADR-004)
   * Unicode NFKC -> 小文字化 -> 前後空白除去 -> 連続空白・句読点・記号の除去
   * ※記号のみのタイトル（"+" や "=" 等）で記号除去後に空文字となる場合は空白除去のみの文字列へフォールバック
   * @param {string} str
   * @returns {string}
   */
  normalizeForComparison_(str) {
    if (str === null || str === undefined) return '';
    const nfkc = String(str).normalize('NFKC').toLowerCase().trim();
    if (!nfkc) return '';

    const noSpaces = nfkc.replace(/\s+/g, '');
    if (!noSpaces) return '';

    const stripped = noSpaces.replace(/[\p{P}\p{S}]/gu, '');
    return stripped.length > 0 ? stripped : noSpaces;
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
   * MusicBrainzからリリース収録曲・メディア情報を取得
   * @param {string} mbid
   * @returns {{ albumDetail: AlbumDetail }}
   */
  lookupMusicBrainzRelease(mbid) {
    if (!mbid || typeof mbid !== 'string' || !mbid.trim()) {
      const err = new Error('MusicBrainz リリースID (MBID) が指定されていません。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    const mbService = this.musicBrainzService || (MusicBrainzService ? new MusicBrainzService(this.config) : null);
    if (!mbService) {
      const err = new Error('MusicBrainzService が初期化されていません。');
      err.code = 'MUSICBRAINZ_SERVICE_UNAVAILABLE';
      throw err;
    }
    const detail = mbService.lookupRelease(mbid.trim());
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

    let normalizedArtworkUrl = artworkUrl;
    if (artworkUrl && this.driveService && typeof this.driveService.ensurePublicArtwork === 'function') {
      try {
        normalizedArtworkUrl = this.driveService.ensurePublicArtwork(artworkUrl, albumName);
      } catch (e) {
        console.warn(`アルバムアートの公開正規化に失敗しました (フォールバック): ${e.message}`);
        normalizedArtworkUrl = artworkUrl;
      }
    }

    const saved = this.sheetService.appendSingleTrack({
      cdNumber: cdNumber,
      albumArtist: this.escapeFormula_(albumArtist),
      albumName: this.escapeFormula_(albumName),
      trackArtist: this.escapeFormula_(trackArtist),
      trackNumber: trackNumber,
      trackName: this.escapeFormula_(trackName),
      releaseDate: this.escapeFormula_(releaseDate),
      artworkUrl: this.escapeFormula_(normalizedArtworkUrl)
    });

    return {
      savedTrack: saved
    };
  }

  /**
   * アルバムおよび収録曲の一括編集
   * @param {AlbumEditPayload} payload 
   * @returns {AlbumEditResult}
   */
  updateAlbum(payload) {
    this.validateAlbumPayload_(payload);
    const { targetKey, album, tracks } = payload;

    const normalizedAlbum = { ...album };
    if (normalizedAlbum.artworkUrl && this.driveService && typeof this.driveService.ensurePublicArtwork === 'function') {
      try {
        normalizedAlbum.artworkUrl = this.driveService.ensurePublicArtwork(
          normalizedAlbum.artworkUrl,
          normalizedAlbum.albumName || targetKey.originalAlbumName
        );
      } catch (e) {
        console.warn(`アルバムアートの公開正規化に失敗しました (フォールバック): ${e.message}`);
      }
    }

    return this.sheetService.updateAlbumBatch(targetKey, normalizedAlbum, tracks);
  }

  /**
   * アルバム編集ペイロードの厳格な二重バリデーション
   * @param {AlbumEditPayload} payload 
   */
  validateAlbumPayload_(payload) {
    if (!payload || typeof payload !== 'object') {
      const err = new Error('リクエストペイロードが不正なオブジェクトです。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }

    const { targetKey, album, tracks } = payload;

    // 1. 旧識別キーの存在検証
    if (!targetKey || typeof targetKey !== 'object') {
      const err = new Error('編集対象の旧アルバム識別キー（targetKey）が指定されていません。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    const origArtist = String(targetKey.originalAlbumArtist || '').trim();
    const origAlbum = String(targetKey.originalAlbumName || '').trim();
    if (!origArtist || !origAlbum) {
      const err = new Error('編集対象の旧アルバムアーティスト名および旧アルバム名は必須です。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }

    // 2. 新アルバムメタデータの必須・文字長検証（最大255文字）
    if (!album || typeof album !== 'object') {
      const err = new Error('新アルバム情報（album）が指定されていません。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    const albumName = String(album.albumName || '').trim();
    const albumArtist = String(album.albumArtist || '').trim();
    if (!albumName) {
      const err = new Error('アルバム名は必須です。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    if (!albumArtist) {
      const err = new Error('アルバムアーティスト名は必須です。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    if (albumName.length > 255 || albumArtist.length > 255) {
      const err = new Error('アルバム名およびアルバムアーティスト名は最大255文字以内で入力してください。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }

    // 3. 収録曲件数検証（最低1曲必須・全削除抑止）
    if (!Array.isArray(tracks) || tracks.length === 0) {
      const err = new Error('収録曲は最低1曲必要です。全曲削除することはできません。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }

    // 4. トラック一覧の反復検証（正整数・必須・文字長・同一CD番号内重複検証）
    const trackKeySet = new Set();
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      if (!t || typeof t !== 'object') {
        const err = new Error(`トラックデータ[${i + 1}]が不正なオブジェクトです。`);
        err.code = 'VALIDATION_FAILED';
        throw err;
      }

      // CD番号の検証（1以上の正整数、有限数、小数は拒絶）
      const cdNo = Number(t.cdNumber);
      if (!Number.isInteger(cdNo) || cdNo < 1 || !Number.isFinite(cdNo)) {
        const err = new Error(`トラック #${i + 1} のCD番号は1以上の整数を指定してください。`);
        err.code = 'VALIDATION_FAILED';
        throw err;
      }

      // トラック番号の検証（1以上の正整数、有限数、小数は拒絶）
      const trkNo = Number(t.trackNumber);
      if (!Number.isInteger(trkNo) || trkNo < 1 || !Number.isFinite(trkNo)) {
        const err = new Error(`トラック #${i + 1} のトラック番号は1以上の整数を指定してください。`);
        err.code = 'VALIDATION_FAILED';
        throw err;
      }

      // トラック曲名の必須・文字長検証
      const trkName = String(t.trackName || '').trim();
      if (!trkName) {
        const err = new Error(`トラック #${i + 1} の曲名は必須です。`);
        err.code = 'VALIDATION_FAILED';
        throw err;
      }
      if (trkName.length > 255) {
        const err = new Error(`トラック #${i + 1} の曲名は255文字以内で入力してください。`);
        err.code = 'VALIDATION_FAILED';
        throw err;
      }

      // トラックアーティスト名の文字長検証（任意）
      if (t.trackArtist && String(t.trackArtist).length > 255) {
        const err = new Error(`トラック #${i + 1} のアーティスト名は255文字以内で入力してください。`);
        err.code = 'VALIDATION_FAILED';
        throw err;
      }

      // 同一CD番号内でのトラック番号重複禁止検証
      const uniqueDiscTrackKey = `${cdNo}_${trkNo}`;
      if (trackKeySet.has(uniqueDiscTrackKey)) {
        const err = new Error(`CD番号 ${cdNo} の中に重複するトラック番号 #${trkNo} が存在します。番号を調整してください。`);
        err.code = 'VALIDATION_FAILED';
        throw err;
      }
      trackKeySet.add(uniqueDiscTrackKey);
    }
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
