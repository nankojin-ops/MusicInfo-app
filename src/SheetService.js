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

    const rows = tracks.map((t) => [
      Number(t.cdNumber) || 1,
      this.escapeFormula_(albumMeta.albumArtist),
      this.escapeFormula_(albumMeta.albumName),
      this.escapeFormula_(t.trackArtist || albumMeta.albumArtist),
      Number(t.trackNumber) || 1,
      this.escapeFormula_(t.trackName),
      this.escapeFormula_(albumMeta.releaseDate),
      String(driveArtworkUrl || '').trim()
    ]);

    const sheet = this.getOrCreateSheet();
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, 8).setValues(rows);

    return rows.length;
  }

  /**
   * 1曲を手動追記
   * @param {SingleTrackPayload} trackPayload 
   * @returns {RawTrackRow}
   */
  appendSingleTrack(trackPayload) {
    const row = [
      Number(trackPayload.cdNumber) || 1,
      this.escapeFormula_(trackPayload.albumArtist),
      this.escapeFormula_(trackPayload.albumName),
      this.escapeFormula_(trackPayload.trackArtist),
      Number(trackPayload.trackNumber) || 1,
      this.escapeFormula_(trackPayload.trackName),
      this.escapeFormula_(trackPayload.releaseDate),
      String(trackPayload.artworkUrl || '').trim()
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
