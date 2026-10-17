if (typeof Config === 'undefined' && typeof require !== 'undefined') {
  globalThis.Config = require('./Config');
}

/**
 * MusicBrainz API (Web Service v2) & Cover Art Archive 連携クライアントクラス
 */
class MusicBrainzService {
  /**
   * @param {Config} [config] 省略時は内部で new Config() を生成
   */
  constructor(config) {
    this.config = config || (typeof Config !== 'undefined' && Config ? new Config() : null);
    this.lastRequestTs_ = 0;
  }

  /**
   * MusicBrainz 連携の有効状態を返却
   * @returns {boolean}
   */
  isEnabled() {
    if (this.config && typeof this.config.isMusicBrainzEnabled === 'function') {
      return this.config.isMusicBrainzEnabled();
    }
    return Boolean(Config && Config.CONSTANTS && Config.CONSTANTS.MUSICBRAINZ && Config.CONSTANTS.MUSICBRAINZ.ENABLED);
  }

  /**
   * 送信する User-Agent ヘッダ文字列を取得
   * @returns {string}
   */
  getUserAgent() {
    if (this.config && typeof this.config.getMusicBrainzUserAgent === 'function') {
      const ua = this.config.getMusicBrainzUserAgent();
      if (ua) return ua;
    }
    return (Config && Config.CONSTANTS && Config.CONSTANTS.MUSICBRAINZ)
      ? Config.CONSTANTS.MUSICBRAINZ.DEFAULT_USER_AGENT
      : 'MusicInfoApp/1.0 ( https://github.com/nankojin-ops/MusicInfo-app )';
  }

  /**
   * MBID (標準UUID形式) の厳格バリデーション (NFR-SEC-002)
   * @param {string} mbid
   * @returns {boolean}
   */
  isValidMbid(mbid) {
    if (typeof mbid !== 'string') return false;
    const trimmed = mbid.trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
  }

  /**
   * Lucene 特殊文字のエスケープおよび制御文字除去 (NFR-SEC-003)
   * @param {string} term
   * @returns {string}
   */
  sanitizeSearchQuery(term) {
    if (term === null || term === undefined) return '';
    const cleaned = String(term)
      .replace(/[\x00-\x1F\x7F]/g, ' ')
      .trim();
    if (!cleaned) return '';

    return cleaned
      .replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, '\\$&')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * カバーアートアーカイブ (CAA) の正面画像URLを生成
   * @param {string} mbid
   * @param {250|500|1200} [size=250]
   * @returns {string}
   */
  buildCoverArtUrl(mbid, size = 250) {
    if (!this.isValidMbid(mbid)) return '';
    const validSize = (size === 500 || size === 1200) ? size : 250;
    const baseUrl = (Config && Config.CONSTANTS && Config.CONSTANTS.MUSICBRAINZ)
      ? Config.CONSTANTS.MUSICBRAINZ.CAA_BASE_URL
      : 'https://coverartarchive.org/release';
    return `${baseUrl}/${mbid.trim().toLowerCase()}/front-${validSize}`;
  }

  /**
   * artist-credit 配列を表示用アーティスト名文字列へ連結
   * @param {Array<object|string>} artistCredit
   * @param {string} [fallback='']
   * @returns {string}
   */
  formatArtistCredit(artistCredit, fallback = '') {
    if (!Array.isArray(artistCredit) || artistCredit.length === 0) {
      return fallback;
    }

    let result = '';
    for (let i = 0; i < artistCredit.length; i++) {
      const credit = artistCredit[i];
      if (typeof credit === 'string') {
        result += credit;
      } else if (credit && typeof credit === 'object') {
        const artistObj = (credit.artist && typeof credit.artist === 'object') ? credit.artist : null;
        const name = String(credit.name || (artistObj && artistObj.name) || '').trim();
        const joinphrase = (credit.joinphrase !== undefined && credit.joinphrase !== null)
          ? String(credit.joinphrase)
          : '';
        if (name) {
          result += name + joinphrase;
        }
      }
    }

    const trimmed = result.trim();
    return trimmed || fallback;
  }

  /**
   * UrlFetchApp.fetch / fetchAll 用の検索リクエストオブジェクトを生成
   * @param {string} term
   * @returns {{ url: string, method: string, headers: Object<string, string>, muteHttpExceptions: boolean }|null}
   */
  buildSearchRequest(term) {
    const sanitized = this.sanitizeSearchQuery(term);
    if (!sanitized) {
      return null;
    }

    const mbConst = (Config && Config.CONSTANTS && Config.CONSTANTS.MUSICBRAINZ)
      ? Config.CONSTANTS.MUSICBRAINZ
      : {
          RELEASE_ENDPOINT: 'https://musicbrainz.org/ws/2/release',
          LIMIT: 25
        };

    const url = `${mbConst.RELEASE_ENDPOINT}?query=${encodeURIComponent(sanitized)}&limit=${mbConst.LIMIT}&dismax=true&fmt=json`;

    return {
      url: url,
      method: 'get',
      headers: {
        'User-Agent': this.getUserAgent(),
        'Accept': 'application/json'
      },
      muteHttpExceptions: true
    };
  }

  /**
   * 検索 HTTPResponse を解析し AlbumSearchResult[] に正規化
   * @param {GoogleAppsScript.URL_Fetch.HTTPResponse} response
   * @returns {Array<AlbumSearchResult>}
   */
  parseSearchResponse(response) {
    if (!response || typeof response.getResponseCode !== 'function') {
      const err = new Error('MusicBrainz Search APIから有効なレスポンスが得られませんでした');
      err.code = 'MUSICBRAINZ_API_NETWORK_ERROR';
      throw err;
    }

    const statusCode = response.getResponseCode();
    if (statusCode === 503) {
      const err = new Error('MusicBrainz APIのレート制限または一時過負荷に達しました (HTTP 503)');
      err.code = 'MUSICBRAINZ_RATE_LIMITED';
      throw err;
    }

    if (statusCode !== 200) {
      const err = new Error(`MusicBrainz Search APIとの通信に失敗しました (HTTP ${statusCode})`);
      err.code = 'MUSICBRAINZ_API_NETWORK_ERROR';
      throw err;
    }

    let data;
    try {
      data = JSON.parse(response.getContentText());
    } catch (parseErr) {
      const err = new Error('MusicBrainz Search APIのレスポンスJSON解析に失敗しました');
      err.code = 'MUSICBRAINZ_API_PARSE_ERROR';
      throw err;
    }

    const releases = (data && Array.isArray(data.releases)) ? data.releases : [];
    const results = [];

    for (let i = 0; i < releases.length; i++) {
      const item = releases[i];
      if (!item || typeof item !== 'object') continue;

      const mbid = String(item.id || '').trim();
      if (!mbid) continue;

      const mediaList = Array.isArray(item.media)
        ? item.media.filter((m) => m && typeof m === 'object')
        : [];

      const formats = [];
      let mediaTrackSum = 0;
      for (let j = 0; j < mediaList.length; j++) {
        const m = mediaList[j];
        const fmt = String(m.format || '').trim();
        if (fmt && !formats.includes(fmt)) {
          formats.push(fmt);
        }
        mediaTrackSum += (Number(m['track-count']) || 0);
      }

      const rawTrackCount = Number(item['track-count']);
      const trackCount = (Number.isFinite(rawTrackCount) && rawTrackCount > 0)
        ? rawTrackCount
        : mediaTrackSum;

      const rawScore = Number(item.score);
      const score = Number.isFinite(rawScore) ? rawScore : 0;

      results.push({
        source: 'musicbrainz',
        sourceId: mbid,
        albumName: String(item.title || '').trim() || '不明なアルバム',
        albumArtist: this.formatArtistCredit(item['artist-credit'], '不明なアーティスト'),
        artworkUrl100: this.buildCoverArtUrl(mbid, 250),
        artworkUrl500: this.buildCoverArtUrl(mbid, 500),
        releaseDate: item.date ? String(item.date).trim().substring(0, 10) : '',
        trackCount: trackCount,
        primaryGenreName: '',
        extra: {
          format: formats.join(' + '),
          country: String(item.country || '').trim(),
          disambiguation: String(item.disambiguation || '').trim(),
          discCount: mediaList.length || 1,
          status: String(item.status || '').trim(),
          score: score
        }
      });
    }

    return results;
  }

  /**
   * fetchAll 等で初回レスポンスを取得済みのケース向けに、HTTP 503 時の1回限定リトライとパースを行う
   * @param {{ url: string, method: string, headers: Object<string, string>, muteHttpExceptions: boolean }} requestObj
   * @param {GoogleAppsScript.URL_Fetch.HTTPResponse} initialResponse
   * @returns {Array<AlbumSearchResult>}
   */
  executeWithRetryFromInitialResponse(requestObj, initialResponse) {
    if (!initialResponse || typeof initialResponse.getResponseCode !== 'function') {
      const err = new Error('MusicBrainz Search APIから有効なレスポンスが得られませんでした');
      err.code = 'MUSICBRAINZ_API_NETWORK_ERROR';
      throw err;
    }

    if (initialResponse.getResponseCode() === 503 && requestObj && requestObj.url) {
      const retryDelay = (Config && Config.CONSTANTS && Config.CONSTANTS.MUSICBRAINZ)
        ? Config.CONSTANTS.MUSICBRAINZ.RETRY_DELAY_MS
        : 1100;
      this.sleep_(retryDelay);
      this.recordRequestTimestamp_();

      const retryResponse = UrlFetchApp.fetch(requestObj.url, {
        method: requestObj.method || 'get',
        headers: requestObj.headers,
        muteHttpExceptions: true
      });
      return this.parseSearchResponse(retryResponse);
    }

    return this.parseSearchResponse(initialResponse);
  }

  /**
   * キーワードから MusicBrainz リリース一覧を検索（レート制御＋503時1回リトライ付き）
   * @param {string} term
   * @returns {Array<AlbumSearchResult>}
   */
  searchReleases(term) {
    const req = this.buildSearchRequest(term);
    if (!req) {
      return [];
    }

    this.enforceRateLimit_();
    let response;
    try {
      response = UrlFetchApp.fetch(req.url, {
        method: req.method,
        headers: req.headers,
        muteHttpExceptions: true
      });
    } catch (fetchErr) {
      const err = new Error(`MusicBrainz Search APIへの接続に失敗しました: ${fetchErr.message}`);
      err.code = 'MUSICBRAINZ_API_NETWORK_ERROR';
      throw err;
    }

    return this.executeWithRetryFromInitialResponse(req, response);
  }

  /**
   * MBID からリリース収録曲・メディア情報を詳細取得（UUID検証＋レート制御＋503時1回リトライ付き）
   * @param {string} mbid
   * @returns {AlbumDetail}
   */
  lookupRelease(mbid) {
    const cleanedMbid = typeof mbid === 'string' ? mbid.trim() : '';
    if (!this.isValidMbid(cleanedMbid)) {
      const err = new Error('MusicBrainz リリースID (MBID) の形式が無効です。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }

    const mbConst = (Config && Config.CONSTANTS && Config.CONSTANTS.MUSICBRAINZ)
      ? Config.CONSTANTS.MUSICBRAINZ
      : {
          RELEASE_ENDPOINT: 'https://musicbrainz.org/ws/2/release',
          RETRY_DELAY_MS: 1100
        };

    const url = `${mbConst.RELEASE_ENDPOINT}/${encodeURIComponent(cleanedMbid)}?inc=recordings+artist-credits&fmt=json`;
    const fetchOptions = {
      method: 'get',
      headers: {
        'User-Agent': this.getUserAgent(),
        'Accept': 'application/json'
      },
      muteHttpExceptions: true
    };

    this.enforceRateLimit_();
    let response;
    try {
      response = UrlFetchApp.fetch(url, fetchOptions);
    } catch (fetchErr) {
      const err = new Error(`MusicBrainz Lookup APIへの接続に失敗しました: ${fetchErr.message}`);
      err.code = 'MUSICBRAINZ_API_NETWORK_ERROR';
      throw err;
    }

    if (response && typeof response.getResponseCode === 'function' && response.getResponseCode() === 503) {
      this.sleep_(mbConst.RETRY_DELAY_MS || 1100);
      this.recordRequestTimestamp_();
      try {
        response = UrlFetchApp.fetch(url, fetchOptions);
      } catch (retryFetchErr) {
        const err = new Error(`MusicBrainz Lookup APIへの再接続に失敗しました: ${retryFetchErr.message}`);
        err.code = 'MUSICBRAINZ_API_NETWORK_ERROR';
        throw err;
      }
    }

    if (!response || typeof response.getResponseCode !== 'function') {
      const err = new Error('MusicBrainz Lookup APIから有効なレスポンスが得られませんでした');
      err.code = 'MUSICBRAINZ_API_NETWORK_ERROR';
      throw err;
    }

    const statusCode = response.getResponseCode();
    if (statusCode === 404) {
      const err = new Error(`指定されたMusicBrainzリリース(MBID: ${cleanedMbid})が見つかりませんでした。`);
      err.code = 'ALBUM_NOT_FOUND';
      throw err;
    }
    if (statusCode === 503) {
      const err = new Error('MusicBrainz APIのレート制限に達しました (HTTP 503)');
      err.code = 'MUSICBRAINZ_RATE_LIMITED';
      throw err;
    }
    if (statusCode !== 200) {
      const err = new Error(`MusicBrainz Lookup APIとの通信に失敗しました (HTTP ${statusCode})`);
      err.code = 'MUSICBRAINZ_API_NETWORK_ERROR';
      throw err;
    }

    let data;
    try {
      data = JSON.parse(response.getContentText());
    } catch (parseErr) {
      const err = new Error('MusicBrainz Lookup APIのレスポンスJSON解析に失敗しました');
      err.code = 'MUSICBRAINZ_API_PARSE_ERROR';
      throw err;
    }

    if (!data || typeof data !== 'object') {
      const err = new Error('MusicBrainz Lookup APIのレスポンスが空です');
      err.code = 'ALBUM_NOT_FOUND';
      throw err;
    }

    const albumName = String(data.title || '').trim() || '不明なアルバム';
    const albumArtist = this.formatArtistCredit(data['artist-credit'], '不明なアーティスト');
    const releaseDate = data.date ? String(data.date).trim().substring(0, 10) : '';

    const caa = (data['cover-art-archive'] && typeof data['cover-art-archive'] === 'object')
      ? data['cover-art-archive']
      : null;
    const hasFrontCover = Boolean(caa && caa.front === true);
    const artworkUrl100 = hasFrontCover ? this.buildCoverArtUrl(cleanedMbid, 250) : '';
    const artworkUrl500 = hasFrontCover ? this.buildCoverArtUrl(cleanedMbid, 500) : '';

    const mediaList = Array.isArray(data.media) ? data.media : [];
    const tracks = [];
    let expectedTrackCount = 0;

    for (let mIdx = 0; mIdx < mediaList.length; mIdx++) {
      const medium = mediaList[mIdx];
      if (!medium || typeof medium !== 'object') continue;

      const posNum = Number(medium.position);
      const cdNumber = (Number.isInteger(posNum) && posNum >= 1) ? posNum : (mIdx + 1);
      const mediumFormat = String(medium.format || '').trim();
      const declaredCount = Number(medium['track-count']) || 0;
      const rawTracks = Array.isArray(medium.tracks) ? medium.tracks : [];
      expectedTrackCount += (declaredCount > 0 ? declaredCount : rawTracks.length);

      for (let tIdx = 0; tIdx < rawTracks.length; tIdx++) {
        const trk = rawTracks[tIdx];
        if (!trk || typeof trk !== 'object') continue;

        const trkPos = Number(trk.position);
        const trackNumber = (Number.isInteger(trkPos) && trkPos >= 1) ? trkPos : (tIdx + 1);

        const recording = (trk.recording && typeof trk.recording === 'object') ? trk.recording : null;
        const rawTitle = (trk.title !== undefined && trk.title !== null && String(trk.title).trim() !== '')
          ? String(trk.title).trim()
          : (recording && recording.title ? String(recording.title).trim() : '');
        const trackName = rawTitle || `Track ${trackNumber}`;

        const creditSource = (Array.isArray(trk['artist-credit']) && trk['artist-credit'].length > 0)
          ? trk['artist-credit']
          : (recording && Array.isArray(recording['artist-credit']) && recording['artist-credit'].length > 0
            ? recording['artist-credit']
            : null);
        const trackArtist = creditSource
          ? this.formatArtistCredit(creditSource, albumArtist)
          : albumArtist;

        const trackEntry = {
          cdNumber: cdNumber,
          trackNumber: trackNumber,
          trackName: trackName,
          trackArtist: trackArtist
        };
        if (mediumFormat) {
          trackEntry.mediumFormat = mediumFormat;
        }
        tracks.push(trackEntry);
      }
    }

    tracks.sort((a, b) => a.cdNumber - b.cdNumber || a.trackNumber - b.trackNumber);
    const truncated = expectedTrackCount > tracks.length;

    return {
      source: 'musicbrainz',
      sourceId: cleanedMbid,
      albumName: albumName,
      albumArtist: albumArtist,
      releaseDate: releaseDate,
      artworkUrl100: artworkUrl100,
      artworkUrl500: artworkUrl500,
      trackCount: tracks.length,
      truncated: truncated,
      expectedTrackCount: expectedTrackCount || tracks.length,
      tracks: tracks
    };
  }

  /**
   * CacheService と Utilities.sleep を用いて前回リクエストから MIN_INTERVAL_MS (1100ms) 以上の間隔を確保
   */
  enforceRateLimit_() {
    const mbConst = (Config && Config.CONSTANTS && Config.CONSTANTS.MUSICBRAINZ)
      ? Config.CONSTANTS.MUSICBRAINZ
      : { MIN_INTERVAL_MS: 1100, CACHE_KEY_LAST_REQ: 'MUSICBRAINZ_LAST_REQUEST_TS' };

    const minInterval = mbConst.MIN_INTERVAL_MS || 1100;
    const cacheKey = mbConst.CACHE_KEY_LAST_REQ || 'MUSICBRAINZ_LAST_REQUEST_TS';
    const now = Date.now();
    let lastTs = 0;

    if (typeof CacheService !== 'undefined' && CacheService && typeof CacheService.getScriptCache === 'function') {
      try {
        const scriptCache = CacheService.getScriptCache();
        if (scriptCache && typeof scriptCache.get === 'function') {
          const cached = scriptCache.get(cacheKey);
          if (cached) {
            lastTs = Number(cached) || 0;
          }
        }
      } catch (e) {
        // キャッシュ読み取り失敗時はメモリ上のタイムスタンプを使用
      }
    }

    if (!lastTs && this.lastRequestTs_) {
      lastTs = this.lastRequestTs_;
    }

    if (lastTs > 0) {
      const elapsed = now - lastTs;
      if (elapsed >= 0 && elapsed < minInterval) {
        const waitMs = minInterval - elapsed;
        this.sleep_(waitMs);
      }
    }

    this.recordRequestTimestamp_();
  }

  /**
   * 最終リクエスト時刻をインスタンス変数および CacheService に記録
   */
  recordRequestTimestamp_() {
    const cacheKey = (Config && Config.CONSTANTS && Config.CONSTANTS.MUSICBRAINZ)
      ? Config.CONSTANTS.MUSICBRAINZ.CACHE_KEY_LAST_REQ
      : 'MUSICBRAINZ_LAST_REQUEST_TS';
    const ts = Date.now();
    this.lastRequestTs_ = ts;

    if (typeof CacheService !== 'undefined' && CacheService && typeof CacheService.getScriptCache === 'function') {
      try {
        const scriptCache = CacheService.getScriptCache();
        if (scriptCache && typeof scriptCache.put === 'function') {
          scriptCache.put(cacheKey, String(ts), 60);
        }
      } catch (e) {
        // キャッシュ書き込み失敗時は無視
      }
    }
  }

  /**
   * 指定ミリ秒スリープ（GAS Utilities.sleep が存在する場合に呼び出し）
   * @param {number} ms
   */
  sleep_(ms) {
    if (!ms || ms <= 0) return;
    if (typeof Utilities !== 'undefined' && Utilities && typeof Utilities.sleep === 'function') {
      Utilities.sleep(ms);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MusicBrainzService;
}
