if (typeof Config === 'undefined' && typeof require !== 'undefined') {
  globalThis.Config = require('./Config');
}

/**
 * スプレッドシート永続化およびデータマッピングクラスタ
 */
class SheetService {
  /**
   * @param {Config} config 
   */
  constructor(config) {
    this.config = config;
  }

  /**
   * シートを取得。存在しない場合は作成してヘッダーを初期化する
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   */
  getOrCreateSheet() {
    const spreadsheetId = this.config.getSpreadsheetId();
    let ss;
    try {
      ss = SpreadsheetApp.openById(spreadsheetId);
    } catch (e) {
      const err = new Error(`スプレッドシート(ID: ${spreadsheetId})を開けませんでした: ${e.message}`);
      err.code = 'SPREADSHEET_OPEN_ERROR';
      throw err;
    }

    const sheetName = this.config.getSheetName();
    let sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      this.initHeaderIfEmpty(sheet);
    } else if (sheet.getLastRow() === 0) {
      this.initHeaderIfEmpty(sheet);
    }

    return sheet;
  }

  /**
   * ヘッダー行を初期化・装飾・固定
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet 
   */
  initHeaderIfEmpty(sheet) {
    const headers = Config.CONSTANTS.SHEET_HEADERS;
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setBackground('#1E293B');
    headerRange.setFontColor('#F8FAFC');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  }

  /**
   * 全トラックレコードを取得して RawTrackRow[] にマッピング
   * @returns {Array<RawTrackRow>}
   */
  fetchAllTracks() {
    const sheet = this.getOrCreateSheet();
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      return [];
    }

    const rows = sheet.getRange(2, 1, lastRow - 1, 8).getValues();

    return rows.map((row) => {
      let releaseDateStr = '';
      if (row[6] instanceof Date) {
        releaseDateStr = Utilities.formatDate(row[6], 'Asia/Tokyo', 'yyyy-MM-dd');
      } else if (row[6]) {
        releaseDateStr = String(row[6]).trim().substring(0, 10);
      }

      return {
        cdNumber: Number(row[0]) || 1,
        albumArtist: String(row[1] || '').trim(),
        albumName: String(row[2] || '').trim(),
        trackArtist: String(row[3] || '').trim(),
        trackNumber: Number(row[4]) || 1,
        trackName: String(row[5] || '').trim(),
        releaseDate: releaseDateStr,
        artworkUrl: String(row[7] || '').trim()
      };
    });
  }

  /**
   * 複数トラックをバッチ一括追記
   * @param {Array<{ cdNumber: number, trackNumber: number, trackName: string, trackArtist: string }>} tracks 
   * @param {{ albumName: string, albumArtist: string, releaseDate: string }} albumMeta 
   * @param {string} driveArtworkUrl 
   * @returns {number} 挿入行数
   */
  insertTracksBatch(tracks, albumMeta, driveArtworkUrl) {
    if (!tracks || tracks.length === 0) {
      return 0;
    }

    const lock = (typeof LockService !== 'undefined' && LockService.getScriptLock)
      ? LockService.getScriptLock()
      : null;

    if (lock) {
      const timeoutMs = (Config && Config.CONSTANTS && Config.CONSTANTS.LOCK_TIMEOUT_MS) || 30000;
      const hasLock = lock.tryLock(timeoutMs);
      if (!hasLock) {
        const err = new Error('他ユーザーが更新処理中のため、保存を実行できませんでした。しばらく時間をおいて再試行してください。');
        err.code = 'LOCK_TIMEOUT';
        throw err;
      }
    }

    try {
      const rows = tracks.map((t) => [
        Number(t.cdNumber) || 1,
        this.escapeFormula_(albumMeta.albumArtist),
        this.escapeFormula_(albumMeta.albumName),
        this.escapeFormula_(t.trackArtist || albumMeta.albumArtist),
        Number(t.trackNumber) || 1,
        this.escapeFormula_(t.trackName),
        this.escapeFormula_(albumMeta.releaseDate),
        this.escapeFormula_(driveArtworkUrl)
      ]);

      const sheet = this.getOrCreateSheet();
      const startRow = sheet.getLastRow() + 1;
      const dateRange = sheet.getRange(startRow, 7, rows.length, 1);
      if (dateRange && typeof dateRange.setNumberFormat === 'function') {
        dateRange.setNumberFormat('@');
      }
      sheet.getRange(startRow, 1, rows.length, 8).setValues(rows);

      return rows.length;
    } finally {
      if (lock) {
        lock.releaseLock();
      }
    }
  }

  /**
   * 1曲を手動追記
   * @param {SingleTrackPayload} trackPayload 
   * @returns {RawTrackRow}
   */
  appendSingleTrack(trackPayload) {
    const lock = (typeof LockService !== 'undefined' && LockService.getScriptLock)
      ? LockService.getScriptLock()
      : null;

    if (lock) {
      const timeoutMs = (Config && Config.CONSTANTS && Config.CONSTANTS.LOCK_TIMEOUT_MS) || 30000;
      const hasLock = lock.tryLock(timeoutMs);
      if (!hasLock) {
        const err = new Error('他ユーザーが更新処理中のため、保存を実行できませんでした。しばらく時間をおいて再試行してください。');
        err.code = 'LOCK_TIMEOUT';
        throw err;
      }
    }

    try {
      const row = [
        Number(trackPayload.cdNumber) || 1,
        this.escapeFormula_(trackPayload.albumArtist),
        this.escapeFormula_(trackPayload.albumName),
        this.escapeFormula_(trackPayload.trackArtist),
        Number(trackPayload.trackNumber) || 1,
        this.escapeFormula_(trackPayload.trackName),
        this.escapeFormula_(trackPayload.releaseDate),
        this.escapeFormula_(trackPayload.artworkUrl)
      ];

      const sheet = this.getOrCreateSheet();
      sheet.appendRow(row);

      return {
        cdNumber: row[0],
        albumArtist: row[1],
        albumName: row[2],
        trackArtist: row[3],
        trackNumber: row[4],
        trackName: row[5],
        releaseDate: row[6],
        artworkUrl: row[7]
      };
    } finally {
      if (lock) {
        lock.releaseLock();
      }
    }
  }

  /**
   * アルバムおよび収録曲の一括更新（アトミック置換・排他制御）
   * @param {{ originalAlbumArtist: string, originalAlbumName: string }} targetKey 
   * @param {{ albumName: string, albumArtist: string, releaseDate?: string, artworkUrl?: string }} newAlbumMeta 
   * @param {Array<{ cdNumber: number, trackNumber: number, trackName: string, trackArtist?: string }>} newTracks 
   * @returns {AlbumEditResult}
   */
  updateAlbumBatch(targetKey, newAlbumMeta, newTracks) {
    // 1. スクリプト排他ロックの獲得（最大30秒待機）
    const lock = (typeof LockService !== 'undefined' && LockService.getScriptLock)
      ? LockService.getScriptLock()
      : null;

    if (lock) {
      const timeoutMs = (Config && Config.CONSTANTS && Config.CONSTANTS.LOCK_TIMEOUT_MS) || 30000;
      const hasLock = lock.tryLock(timeoutMs);
      if (!hasLock) {
        const err = new Error('他ユーザーが更新処理中のため、保存を実行できませんでした。しばらく時間をおいて再試行してください。');
        err.code = 'LOCK_TIMEOUT';
        throw err;
      }
    }

    try {
      const sheet = this.getOrCreateSheet();
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) {
        const err = new Error('スプレッドシートにデータが存在しません。');
        err.code = 'NOT_FOUND';
        throw err;
      }

      // 2. 既存全データ行（2行目〜最終行、A〜H列）を一括取得
      const dataRange = sheet.getRange(2, 1, lastRow - 1, 8);
      const rawRows = dataRange.getValues();

      const origArtist = String(targetKey.originalAlbumArtist || '').trim();
      const origAlbum = String(targetKey.originalAlbumName || '').trim();

      // 3. 旧識別キーに合致する既存行を除外し、合致しない行のみを retainedRows として保持
      const retainedRows = [];
      let matchCount = 0;

      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        const rowAlbumArtist = String(row[1] || '').trim();
        const rowAlbumName = String(row[2] || '').trim();

        if (rowAlbumArtist === origArtist && rowAlbumName === origAlbum) {
          matchCount++;
        } else {
          retainedRows.push(row);
        }
      }

      if (matchCount === 0) {
        const err = new Error(`更新対象のアルバム「${origAlbum} (${origArtist})」がスプレッドシート上に見つかりませんでした。`);
        err.code = 'NOT_FOUND';
        throw err;
      }

      // 4. 編集後の新トラック行配列を組み立て（全文字列項目に escapeFormula_ を適用）
      const newRows = newTracks.map(t => [
        Number(t.cdNumber) || 1,
        this.escapeFormula_(String(newAlbumMeta.albumArtist).trim()),
        this.escapeFormula_(String(newAlbumMeta.albumName).trim()),
        this.escapeFormula_(String(t.trackArtist || newAlbumMeta.albumArtist).trim()),
        Number(t.trackNumber) || 1,
        this.escapeFormula_(String(t.trackName).trim()),
        this.escapeFormula_(String(newAlbumMeta.releaseDate || '').trim()),
        this.escapeFormula_(String(newAlbumMeta.artworkUrl || '').trim())
      ]);

      // 5. 保持行と新行群を結合
      const combinedRows = retainedRows.concat(newRows);

      // 6. データ領域を一括置換（アトミック更新）
      dataRange.clearContent();
      if (combinedRows.length > 0) {
        const dateRange = sheet.getRange(2, 7, combinedRows.length, 1);
        if (dateRange && typeof dateRange.setNumberFormat === 'function') {
          dateRange.setNumberFormat('@');
        }
        sheet.getRange(2, 1, combinedRows.length, 8).setValues(combinedRows);
      }

      SpreadsheetApp.flush();

      return {
        updatedRowCount: newRows.length,
        totalRowCount: combinedRows.length,
        previousRowCount: matchCount,
        albumName: newAlbumMeta.albumName,
        albumArtist: newAlbumMeta.albumArtist
      };
    } finally {
      // 7. 排他ロックの確実な解放
      if (lock) {
        lock.releaseLock();
      }
    }
  }

  /**
   * 複数アルバムおよびその収録曲の一括削除（アトミック置換・排他制御）
   * @param {Array<{ albumArtist: string, albumName: string }>} albumKeys 
   * @returns {{ deletedAlbumCount: number, deletedTrackCount: number, deletedAlbums: Array<{ albumArtist: string, albumName: string }>, remainingRowCount: number }}
   */
  deleteAlbumsBatch(albumKeys) {
    if (!albumKeys || !Array.isArray(albumKeys) || albumKeys.length === 0) {
      return {
        deletedAlbumCount: 0,
        deletedTrackCount: 0,
        deletedAlbums: [],
        remainingRowCount: 0
      };
    }

    // 1. スクリプト排他ロックの獲得（最大30秒待機）
    const lock = (typeof LockService !== 'undefined' && LockService.getScriptLock)
      ? LockService.getScriptLock()
      : null;

    if (lock) {
      const timeoutMs = (Config && Config.CONSTANTS && Config.CONSTANTS.LOCK_TIMEOUT_MS) || 30000;
      const hasLock = lock.tryLock(timeoutMs);
      if (!hasLock) {
        const err = new Error('他ユーザーが更新処理中のため、削除を実行できませんでした。しばらく時間をおいて再試行してください。');
        err.code = 'LOCK_TIMEOUT';
        throw err;
      }
    }

    try {
      const sheet = this.getOrCreateSheet();
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) {
        return {
          deletedAlbumCount: 0,
          deletedTrackCount: 0,
          deletedAlbums: [],
          remainingRowCount: 0
        };
      }

      // 2. 複合キー Set の生成 (albumArtist:::albumName)
      const targetKeySet = new Set();
      for (let i = 0; i < albumKeys.length; i++) {
        const k = albumKeys[i];
        if (k && typeof k === 'object') {
          const artist = String(k.albumArtist || '').trim();
          const name = String(k.albumName || '').trim();
          if (artist && name) {
            targetKeySet.add(`${artist}:::${name}`);
          }
        }
      }

      if (targetKeySet.size === 0) {
        return {
          deletedAlbumCount: 0,
          deletedTrackCount: 0,
          deletedAlbums: [],
          remainingRowCount: lastRow - 1
        };
      }

      // 3. 既存データ行（2行目〜最終行、A〜H列）を一括取得
      const dataRange = sheet.getRange(2, 1, lastRow - 1, 8);
      const rawRows = dataRange.getValues();

      const retainedRows = [];
      const matchedKeySet = new Set();
      let deletedTrackCount = 0;

      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        const rowArtist = String(row[1] || '').trim();
        const rowAlbum = String(row[2] || '').trim();
        const key = `${rowArtist}:::${rowAlbum}`;

        if (targetKeySet.has(key)) {
          deletedTrackCount++;
          matchedKeySet.add(key);
        } else {
          retainedRows.push(row);
        }
      }

      // 4. 実際に削除されたアルバム一覧を構築
      const deletedAlbums = [];
      const seenDeleted = new Set();
      for (let i = 0; i < albumKeys.length; i++) {
        const k = albumKeys[i];
        if (k && typeof k === 'object') {
          const artist = String(k.albumArtist || '').trim();
          const name = String(k.albumName || '').trim();
          const key = `${artist}:::${name}`;
          if (matchedKeySet.has(key) && !seenDeleted.has(key)) {
            seenDeleted.add(key);
            deletedAlbums.push({ albumArtist: artist, albumName: name });
          }
        }
      }

      // 5. データ領域を一括置換（アトミック更新・残存0行時ガード）
      dataRange.clearContent();
      if (retainedRows.length > 0) {
        const dateRange = sheet.getRange(2, 7, retainedRows.length, 1);
        if (dateRange && typeof dateRange.setNumberFormat === 'function') {
          dateRange.setNumberFormat('@');
        }
        sheet.getRange(2, 1, retainedRows.length, 8).setValues(retainedRows);
      }

      SpreadsheetApp.flush();

      return {
        deletedAlbumCount: deletedAlbums.length,
        deletedTrackCount: deletedTrackCount,
        deletedAlbums: deletedAlbums,
        remainingRowCount: retainedRows.length
      };
    } finally {
      // 6. 排他ロックの確実な解放
      if (lock) {
        lock.releaseLock();
      }
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
  module.exports = SheetService;
}
