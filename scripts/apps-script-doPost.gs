/**
 * formInput sheet sync (trigger-on-submit). Handles two payload types:
 *
 *   { type:'dailyLog', date, sleep, energy, alc }  → Sheet1 (one row per date)
 *   { type:'habits',   date, counts:{name:count} } → Sheet3 (one row per date,
 *                                                     one column per habit)
 *
 * This is a standalone Apps Script project — separate from the Fitbit Integration
 * project, which stays untouched.
 *
 * - Daily log: appends [DD/MM/YYYY, sleep, energy, alc], skipping dates already
 *   present (safe if it fires twice).
 * - Habits: upserts the row for the date in Sheet3, writing each habit's count
 *   under a column matching its name (header row), creating Sheet3 / new columns
 *   as needed. The React Habits page POSTs this when a day is locked ("Done for
 *   today"), so it's written at most once per date.
 *
 * ── Set it up / update ────────────────────────────────────────────────────────
 *   1. https://script.google.com → open "DailyLog Sheet Sync" (or New project).
 *   2. Replace Code.gs with this whole file. Save.
 *   3. Deploy → Manage deployments → edit the existing Web app deployment →
 *        New version → Deploy.  (Execute as: Me.  Who has access: Anyone.)
 *        The /exec URL stays the same — no app change needed.
 *   4. Authorize when prompted (it needs Sheets access).
 * ─────────────────────────────────────────────────────────────────────────────
 */

var FORMINPUT_SHEET_ID = '1a4UFdpK5MbDiBrd9GnGDwmc8ZT3H72SCNcfAUFe1ewc';
var FORMINPUT_TAB = 'Sheet1';
var HABITS_TAB = 'Sheet3';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (!data || !data.date) return jsonOut_({ ok: false, error: 'missing date' });

    if (data.type === 'habits') return handleHabits_(data);

    // Default: daily log → Sheet1 (existing behaviour).
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

// Habits → Sheet3: one row per date, one column per habit (keyed by habit name
// in the header row). Upserts the date's row; creates the tab / columns as needed.
function handleHabits_(data) {
  var ss = SpreadsheetApp.openById(FORMINPUT_SHEET_ID);
  var sheet = ss.getSheetByName(HABITS_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(HABITS_TAB);
    sheet.getRange(1, 1).setValue('Date');
  }

  var counts = data.counts || {};
  var names = Object.keys(counts);
  var p = String(data.date).split('-');        // YYYY-MM-DD
  var dmy = p[2] + '/' + p[1] + '/' + p[0];     // DD/MM/YYYY

  // Header row → map habit name → 0-based column index; append any new habits.
  var lastCol = Math.max(1, sheet.getLastColumn());
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (!header[0]) header[0] = 'Date';
  var colOf = {};
  for (var c = 1; c < header.length; c++) {
    var h = String(header[c]).trim();
    if (h) colOf[h] = c;
  }
  for (var i = 0; i < names.length; i++) {
    if (!(names[i] in colOf)) {
      header.push(names[i]);
      colOf[names[i]] = header.length - 1;
    }
  }
  sheet.getRange(1, 1, 1, header.length).setValues([header]);

  // Find the row for this date (day-first dedup), else append.
  var lastRow = sheet.getLastRow();
  var targetRow = -1;
  if (lastRow >= 2) {
    var colA = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var r = 0; r < colA.length; r++) {
      if (cellToIso_(colA[r][0]) === data.date) { targetRow = r + 2; break; }
    }
  }
  if (targetRow === -1) {
    targetRow = lastRow + 1;
    sheet.getRange(targetRow, 1).setValue(dmy);
  }

  for (var j = 0; j < names.length; j++) {
    sheet.getRange(targetRow, colOf[names[j]] + 1).setValue(Number(counts[names[j]]));
  }
  return jsonOut_({ ok: true, row: targetRow });
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
