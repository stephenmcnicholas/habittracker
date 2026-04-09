import admin from 'firebase-admin';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccount.json');

// ─── CONFIG — adjust these to match your CSV ─────────────────────────────────
const YOUR_UID    = 'cUUSyEef9VQch1dISOu9y50okIA2';  // from Firebase Console → Auth → Users

const DATE_COL    = 'Date';     // header name of the date column in your CSV
const SLEEP_COL   = 'Sleep';    // header name of the sleep column
const ENERGY_COL  = 'Energy';   // header name of the energy column
const ALC_COL     = 'Alc';      // header name of the alcohol column

// Date format used in your CSV:
//   'YYYY-MM-DD'  e.g. 2026-04-09
//   'DD/MM/YYYY'  e.g. 09/04/2026
//   'MM/DD/YYYY'  e.g. 04/09/2026
const DATE_FORMAT = 'MM/DD/YYYY';
// ─────────────────────────────────────────────────────────────────────────────

if (YOUR_UID === 'REPLACE_WITH_YOUR_UID') {
  console.error('ERROR: Set YOUR_UID in the CONFIG block before running this script.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

const toISODate = (raw) => {
  // Strip time component if present (e.g. "2/1/2025 9:17:01" → "2/1/2025")
  const s = raw.trim().split(' ')[0];
  if (DATE_FORMAT === 'YYYY-MM-DD') return s;
  if (DATE_FORMAT === 'DD/MM/YYYY') {
    const [d, m, y] = s.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (DATE_FORMAT === 'MM/DD/YYYY') {
    const [m, d, y] = s.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  throw new Error(`Unknown date format: ${raw}`);
};

const parseCSV = (text) => {
  const lines = text.trim().split('\n');
  const parseRow = (line) => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current.trim());
    return values;
  };
  const headers = parseRow(lines[0]);
  return lines.slice(1)
    .filter(line => line.trim())
    .map(line => {
      const values = parseRow(line);
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
    });
};

const run = async () => {
  const csv = readFileSync(resolve(__dirname, 'data.csv'), 'utf8');
  const rows = parseCSV(csv);

  console.log(`Found ${rows.length} rows. Writing to users/${YOUR_UID}/dailyLogs/...`);

  const seen = new Set();
  let written = 0;
  let skipped = 0;

  for (const row of rows) {
    const rawDate = row[DATE_COL];
    if (!rawDate) { skipped++; continue; }

    let date;
    try {
      date = toISODate(rawDate);
    } catch (e) {
      console.warn(`  ✗ Skipping row with unparseable date "${rawDate}": ${e.message}`);
      skipped++;
      continue;
    }

    if (seen.has(date)) {
      console.warn(`  ! Duplicate date ${date} — overwriting with later row`);
    }
    seen.add(date);

    const sleep  = parseFloat(row[SLEEP_COL]);
    const energy = parseInt(row[ENERGY_COL]);
    const alc    = parseInt(row[ALC_COL]);

    if (isNaN(sleep))  console.warn(`  ! ${date}: sleep value "${row[SLEEP_COL]}" is not a number — storing 0`);
    if (isNaN(energy)) console.warn(`  ! ${date}: energy value "${row[ENERGY_COL]}" is not a number — storing 0`);
    if (isNaN(alc))    console.warn(`  ! ${date}: alc value "${row[ALC_COL]}" is not a number — storing 0`);

    await db.collection('users').doc(YOUR_UID)
      .collection('dailyLogs').doc(date)
      .set({
        date,
        sleep:  isNaN(sleep)  ? 0 : sleep,
        energy: isNaN(energy) ? 0 : energy,
        alc:    isNaN(alc)    ? 0 : alc,
        createdAt: admin.firestore.Timestamp.fromDate(new Date(date)),
      });

    console.log(`  ✓ ${date}`);
    written++;
  }

  console.log(`\nDone. Written: ${written}, Skipped: ${skipped}`);
  process.exit(0);
};

run().catch(err => { console.error(err); process.exit(1); });
