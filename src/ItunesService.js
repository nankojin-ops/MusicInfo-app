/**
 * Apple iTunes API連携クライアントクラス
 */
class ItunesService {
  /**
   * キーワードからアルバム一覧を検索
   * @param {string} term 
   * @returns {Array<ItunesAlbumSummary>}
   */
  searchAlbums(term) {
    const cleaned = (term || '').trim();
    if (!cleaned) {
      return [];
    }

    const url = `${Config.CONSTANTS.ITUNES.SEARCH_URL}?term=${encodeURIComponent(cleaned)}&country=${Config.CONSTANTS.ITUNES.DEFAULT_COUNTRY}&media=${Config.CONSTANTS.ITUNES.DEFAULT_MEDIA}&entity=${Config.CONSTANTS.ITUNES.ENTITY_ALBUM}&limit=${Config.CONSTANTS.ITUNES.LIMIT}`;

    const response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      const err = new Error(`iTunes Search APIとの通信に失敗しました (HTTP ${response.getResponseCode()})`);
      err.code = 'ITUNES_API_NETWORK_ERROR';
      throw err;
    }

    const data = JSON.parse(response.getContentText());
    const results = data.results || [];

    return results
      .filter((item) => item.wrapperType === 'collection')
      .map((item) => ({
        collectionId: item.collectionId,
        albumName: item.collectionName || '不明なアルバム',
        albumArtist: item.artistName || '不明なアーティスト',
        artworkUrl100: item.artworkUrl100 || '',
        artworkUrl500: this.convertTo500x500ArtworkUrl(item.artworkUrl100 || ''),
        releaseDate: item.releaseDate ? String(item.releaseDate).substring(0, 10) : '',
        trackCount: item.trackCount || 0,
        primaryGenreName: item.primaryGenreName || ''
      }));
  }

  /**
   * アルバムID (collectionId) から収録曲・ディスク情報を詳細取得
   * @param {number|string} collectionId 
   * @returns {ItunesAlbumDetail}
   */
  lookupAlbumSongs(collectionId) {
    if (!collectionId) {
      const err = new Error('コレクションIDが無効です。');
      err.code = 'VALIDATION_FAILED';
      throw err;
    }

    const url = `${Config.CONSTANTS.ITUNES.LOOKUP_URL}?id=${encodeURIComponent(collectionId)}&entity=${Config.CONSTANTS.ITUNES.ENTITY_SONG}&country=${Config.CONSTANTS.ITUNES.DEFAULT_COUNTRY}`;

    const response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      const err = new Error(`iTunes Lookup APIとの通信に失敗しました (HTTP ${response.getResponseCode()})`);
      err.code = 'ITUNES_API_NETWORK_ERROR';
      throw err;
    }

    const data = JSON.parse(response.getContentText());
    const results = data.results || [];

    if (results.length === 0) {
      const err = new Error(`指定されたアルバム(ID: ${collectionId})が見つかりませんでした。`);
      err.code = 'ALBUM_NOT_FOUND';
      throw err;
    }

    const collectionMeta = results[0];
    const rawTracks = results.slice(1).filter((item) => item.wrapperType === 'track');

    const tracks = rawTracks.map((item) => ({
      cdNumber: Number(item.discNumber) || 1,
      trackNumber: Number(item.trackNumber) || 1,
      trackName: String(item.trackName || '').trim(),
      trackArtist: String(item.artistName || collectionMeta.artistName || '').trim()
    }));

    // CD番号、トラック番号昇順で整列
    tracks.sort((a, b) => a.cdNumber - b.cdNumber || a.trackNumber - b.trackNumber);

    return {
      collectionId: collectionMeta.collectionId,
      albumName: collectionMeta.collectionName || '',
      albumArtist: collectionMeta.artistName || '',
      releaseDate: (collectionMeta.releaseDate || '').substring(0, 10),
      artworkUrl100: collectionMeta.artworkUrl100 || '',
      artworkUrl500: this.convertTo500x500ArtworkUrl(collectionMeta.artworkUrl100 || ''),
      trackCount: tracks.length,
      tracks: tracks
    };
  }

  /**
   * 100x100の画像URLを500x500の高解像度URLに置換
   * @param {string} url100 
   * @returns {string}
   */
  convertTo500x500ArtworkUrl(url100) {
    if (!url100) return '';
    return url100.replace(/100x100bb\.(jpg|png|webp)/i, '500x500bb.$1');
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ItunesService;
}
