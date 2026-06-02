import admin from 'firebase-admin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccount.json');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const YOUR_UID = 'cUUSyEef9VQch1dISOu9y50okIA2';  // Firebase Console → Auth → Users

// Dates to fix → the new sleep value (hours). Date IDs are 'YYYY-MM-DD'.
// Add/remove lines as needed. Only the `sleep` field is changed; energy/alc are
// left alone.
const EDITS = {
  '2026-05-22': 10.0,
  '2026-05-23': 10.5,
  '2026-05-24': 9.5,
  '2026-05-25': 9.5,
  '2026-05-26': 10.0,
  '2026-05-28': 9.5,
  '2026-05-29': 9.0,
  // '2026-05-30': 8,
};

// Dry run first (true = just print what WOULD change, write nothing).
const DRY_RUN = false;
// ─────────────────────────────────────────────────────────────────────────────

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const run = async () => {
  const dates = Object.keys(EDITS);
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Editing sleep for ${dates.length} date(s) under users/${YOUR_UID}/dailyLogs/\n`);

  let updated = 0;
  for (const date of dates) {
    const newSleep = EDITS[date];
    if (typeof newSleep !== 'number' || isNaN(newSleep)) {
      console.warn(`  ✗ ${date}: "${newSleep}" is not a number — skipping`);
      continue;
    }

    const ref = db.collection('users').doc(YOUR_UID).collection('dailyLogs').doc(date);
    const snap = await ref.get();
    if (!snap.exists) {
      console.warn(`  ✗ ${date}: no entry exists for this date — skipping (use the migration script to create it)`);
      continue;
    }

    const oldSleep = snap.data().sleep;
    if (DRY_RUN) {
      console.log(`  • ${date}: sleep ${oldSleep} → ${newSleep}  (not written — DRY_RUN)`);
    } else {
      await ref.update({ sleep: newSleep });
      console.log(`  ✓ ${date}: sleep ${oldSleep} → ${newSleep}`);
      updated++;
    }
  }

  console.log(`\nDone.${DRY_RUN ? ' (DRY RUN — set DRY_RUN = false to apply.)' : ` Updated ${updated} entry(ies).`}`);
  process.exit(0);
};

run().catch(err => { console.error(err); process.exit(1); });
