// Sync Firestore daily logs → the `formInput` Google Sheet.
//
// Considers only entries from SINCE onward, finds which dates are NOT already
// in the sheet, and appends the missing ones (oldest first) as
//   [ date (DD/MM/YYYY, text), sleep, energy, alc ]
//
// All dates (legacy sheet rows and the rows this script writes) are day-first
// DD/MM/YYYY, so dedup is exact and re-running only ever appends new dates.

import admin from 'firebase-admin';
import { google } from 'googleapis';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccount.json');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const YOUR_UID  = 'cUUSyEef9VQch1dISOu9y50okIA2';
const SHEET_ID  = '1a4UFdpK5MbDiBrd9GnGDwmc8ZT3H72SCNcfAUFe1ewc';
const TAB_NAME  = 'Sheet1';      // tab to write to (falls back to first tab if missing)

// Only sync entries on/after this date (ISO). The sheet's last real row is
// 09/04/2026, so this backfills the gap from 10 Apr onward and ignores the
// 2025 history. Going forward it stays correct — older dates are never touched.
const SINCE = '2026-04-10';

// Dry run first (true = print what WOULD be appended, write nothing).
const DRY_RUN = true;
// ─────────────────────────────────────────────────────────────────────────────

// 'YYYY-MM-DD' → 'DD/MM/YYYY'
const toDMY = (iso) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

// A sheet cell from column A → 'YYYY-MM-DD', or null if it isn't a DD/MM/YYYY
// date. Sheet dates are day-first, optionally followed by a time ("09:23:49")
// — we take the first slash-bearing token. Older "Sun 26 Jan 25" style rows
// have no slash and are ignored (they predate SINCE anyway).
const cellToISO = (raw) => {
  if (!raw) return null;
  const token = String(raw).trim().split(' ').find(t => t.includes('/'));
  if (!token) return null;
  const [d, m, y] = token.split('/').map(p => p.trim());
  if (!d || !m || !y) return null;
  const yyyy = y.length === 2 ? `20${y}` : y;
  return `${yyyy}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

const run = async () => {
  // ── Firestore ──
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const snap = await db.collection('users').doc(YOUR_UID).collection('dailyLogs').get();
  const logs = snap.docs
    .map(d => d.data())
    .filter(e => e.date && e.date >= SINCE)
    .sort((x, y) => x.date.localeCompare(y.date));
  console.log(`Firestore: ${logs.length} daily log(s) on/after ${SINCE}.`);

  // ── Google Sheets auth ──
  const auth = new google.auth.JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // Resolve the target tab (use TAB_NAME if present, else the first sheet).
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const titles = meta.data.sheets.map(s => s.properties.title);
  const tab = titles.includes(TAB_NAME) ? TAB_NAME : titles[0];
  if (tab !== TAB_NAME) console.warn(`Tab "${TAB_NAME}" not found; using "${tab}". Tabs: ${titles.join(', ')}`);

  // Existing dates already in the sheet.
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A:A`,
  });
  const have = new Set(
    (existing.data.values || [])
      .map(row => cellToISO(row[0]))
      .filter(Boolean)
  );
  console.log(`Sheet "${tab}": ${have.size} dated row(s) already present.`);

  // Missing entries, oldest first.
  const missing = logs.filter(e => !have.has(e.date));
  if (missing.length === 0) {
    console.log('\nNothing to append — the sheet is already up to date.');
    process.exit(0);
  }

  const rows = missing.map(e => [
    toDMY(e.date),
    Number(e.sleep),
    Number(e.energy),
    Number(e.alc),
  ]);

  console.log(`\n${DRY_RUN ? '[DRY RUN] Would append' : 'Appending'} ${rows.length} row(s):`);
  for (const r of rows) console.log(`  ${r[0]}  sleep=${r[1]} energy=${r[2]} alc=${r[3]}`);

  if (DRY_RUN) {
    console.log('\nDRY RUN — set DRY_RUN = false to write these rows.');
    process.exit(0);
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A:D`,
    valueInputOption: 'RAW',  // store the date as literal text, no locale reinterpretation
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  console.log(`\nDone. Appended ${rows.length} row(s) to "${tab}".`);
  process.exit(0);
};

run().catch(err => {
  console.error('\nFailed:', err.message || err);
  if (String(err).includes('PERMISSION_DENIED') || err.code === 403) {
    console.error(`\n→ Share the sheet with the service account as Editor:\n  ${serviceAccount.client_email}\n→ And enable the Google Sheets API for project "${serviceAccount.project_id}".`);
  }
  process.exit(1);
});
