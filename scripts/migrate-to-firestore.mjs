import admin from 'firebase-admin';
import { createRequire } from 'module';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccount.json');

// ─── CONFIG — adjust these to match your CSV ─────────────────────────────────
const YOUR_UID    = 'REPLACE_WITH_YOUR_UID';  // from Firebase Console → Auth → Users

const DATE_COL    = 'date';     // header name of the date column in your CSV
const SLEEP_COL   = 'sleep';    // header name of the sleep column
const ENERGY_COL  = 'energy';   // header name of the energy column
const ALC_COL     = 'alc';      // header name of the alcohol column

// Date format used in your CSV:
//   'YYYY-MM-DD'  e.g. 2026-04-09
//   'DD/MM/YYYY'  e.g. 09/04/2026
//   'MM/DD/YYYY'  e.g. 04/09/2026
const DATE_FORMAT = 'DD/MM/YYYY';
// ─────────────────────────────────────────────────────────────────────────────

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

const toISODate = (raw) => {
  const s = raw.trim();
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
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1)
    .filter(line => line.trim())
    .map(line => {
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
    });
};

const run = async () => {
  const csv = readFileSync('./scripts/data.csv', 'utf8');
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

    await db.collection('users').doc(YOUR_UID)
      .collection('dailyLogs').doc(date)
      .set({
        date,
        sleep:  parseFloat(row[SLEEP_COL])  || 0,
        energy: parseInt(row[ENERGY_COL])   || 0,
        alc:    parseInt(row[ALC_COL])      || 0,
        createdAt: admin.firestore.Timestamp.fromDate(new Date(date)),
      });

    console.log(`  ✓ ${date}`);
    written++;
  }

  console.log(`\nDone. Written: ${written}, Skipped: ${skipped}`);
  process.exit(0);
};

run().catch(err => { console.error(err); process.exit(1); });
