/**
 * Daily-log → formInput sheet sync (trigger-on-submit).
 *
 * This is a NEW, standalone Apps Script project — separate from the Fitbit
 * Integration project, which stays untouched. It only appends daily-log rows
 * to the formInput sheet.
 *
 * The React app POSTs { type:'dailyLog', date:'YYYY-MM-DD', sleep, energy, alc }
 * on each Submit; this appends one row [DD/MM/YYYY, sleep, energy, alc] to the
 * sheet, skipping the date if it's already there (so it's safe if it fires twice).
 *
 * ── Set it up ───────────────────────────────────────────────────────────────
 *   1. https://script.google.com → New project. Name it "DailyLog Sheet Sync".
 *   2. Replace Code.gs with this whole file. Save.
 *   3. Deploy → New deployment → type: Web app.
 *        Execute as: Me.   Who has access: Anyone.
 *   4. Authorize when prompted (it needs Sheets access).
 *   5. Copy the Web app /exec URL and paste it into SHEET_SYNC_URL in
 *      src/components/DailyLog.jsx, then `npm run deploy`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

var FORMINPUT_SHEET_ID = '1a4UFdpK5MbDiBrd9GnGDwmc8ZT3H72SCNcfAUFe1ewc';
var FORMINPUT_TAB = 'Sheet1';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (!data || !data.date) return jsonOut_({ ok: false, error: 'missing date' });

    var sheet = SpreadsheetApp.openById(FORMINPUT_SHEET_ID).getSheetByName(FORMINPUT_TAB);
    var p = String(data.date).split('-');           // YYYY-MM-DD
    var dmy = p[2] + '/' + p[1] + '/' + p[0];        // DD/MM/YYYY

    // Skip if this date is already present (day-first dedup).
    var lastRow = sheet.getLastRow();
    if (lastRow > 0) {
      var colA = sheet.getRange(1, 1, lastRow, 1).getValues();
      for (var i = 0; i < colA.length; i++) {
        if (cellToIso_(colA[i][0]) === data.date) {
          return jsonOut_({ ok: true, skipped: true });
        }
      }
    }

    sheet.appendRow([dmy, Number(data.sleep), Number(data.energy), Number(data.alc)]);
    return jsonOut_({ ok: true });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

// A column-A value → 'YYYY-MM-DD' (or null). Handles real Date cells and
// day-first text like "10/04/2026" or "29/03/2026 09:23:49".
function cellToIso_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  var tok = s.split(' ').filter(function (t) { return t.indexOf('/') > -1; })[0];
  if (!tok) return null;
  var q = tok.split('/');
  if (q.length !== 3) return null;
  var y = q[2].length === 2 ? '20' + q[2] : q[2];
  return y + '-' + pad2_(q[1]) + '-' + pad2_(q[0]);  // day-first: q[0]=day, q[1]=month
}

function pad2_(x) { x = String(x); return x.length < 2 ? '0' + x : x; }

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
