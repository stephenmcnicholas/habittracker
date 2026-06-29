// One-off seed of the starting Habits categories & definitions into Firestore.
// Uses the Admin SDK + scripts/serviceAccount.json (same as edit-sleep.mjs).
// Idempotent: deterministic slug doc IDs + .set() means re-running overwrites
// rather than duplicating. Safe to re-run after tweaking the lists below.
//
//   DRY_RUN first (default true): node scripts/seed-habits.mjs
//   Then set DRY_RUN = false and run again to write.

import admin from 'firebase-admin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccount.json');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const YOUR_UID = 'cUUSyEef9VQch1dISOu9y50okIA2';  // Firebase Console → Auth → Users
const DRY_RUN = true;
// ──────────────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'mobility', name: 'Mobility', order: 0 },
  { id: 'strength', name: 'Strength', order: 1 },
];

// Mobility — daily, one bout each, ordered by the priority sequence (cat-cow first).
const MOBILITY = [
  ['cat-cow',                 'Cat-cow',                          '×10 slow breaths — always first'],
  ['deep-squat-hold',         'Deep squat hold',                  '30–60s, supported (door frame)'],
  ['chin-tuck',               'Chin tuck',                        '×10 reps, hold 3s'],
  ['hip-flexor-lunge',        'Hip flexor lunge stretch',         '45–60s each side'],
  ['doorway-chest-opener',    'Doorway chest opener',             '2×40s, vary arm height'],
  ['thoracic-rotation',       'Thoracic rotation',                '×8 each side'],
  ['calf-ankle-dorsiflexion', 'Calf + ankle dorsiflexion',        '30s straight + 30s bent knee, each side'],
  ['ankle-wall-drill',        'Ankle wall drill',                 '×10 reps + 30s hold each side'],
  ['hamstring-stretch',       'Hamstring stretch',                '40–60s each side, hinge from hip'],
  ['figure-4-glute',          'Figure-4 glute stretch',           '40–60s each side'],
  ['thoracic-extension',      'Thoracic extension over chair',    '60–90s, towel across spine'],
  ['neck-lateral-flexion',    'Neck lateral flexion + rotation',  '20–30s each side; skip on acute pain'],
  ['pendulum-wall-walk',      'Pendulum swing + wall walk',       '30s each direction, pain-free range'],
];

// Strength — weekly (3×/week). [id, name, description, defaultCount]
const STRENGTH = [
  ['goblet-squat',        'Goblet squat',                              '3×10–12, heavier DB to progress', 3],
  ['single-leg-rdl',      'Single-leg RDL',                            '3×8 each side',                   3],
  ['push-up',             'Push-up',                                   '3×10–15, feet elevated to progress', 3],
  ['overhead-db-press',   'Overhead DB press',                         '2×10–12',                         2],
  ['inverted-row',        'Inverted row',                              '3×10–12 (table)',                 3],
  ['bicep-curl',          'Bicep curl',                                '2×12',                            2],
  ['tricep-overhead-ext', 'Tricep overhead ext / close-grip push-up',  '2×12',                            2],
  ['plank-dead-bug',      'Plank or dead bug',                         '2×30–45s',                        2],
  ['dorsal-raise',        'Dorsal raise',                              '2×15',                            2],
];

const habits = [
  ...MOBILITY.map(([id, name, description], i) => ({
    id, name, description, defaultCount: 1, categoryId: 'mobility',
    cadence: 'daily', timesPerWeek: null, order: i, archived: false,
  })),
  ...STRENGTH.map(([id, name, description, defaultCount], i) => ({
    id, name, description, defaultCount, categoryId: 'strength',
    cadence: 'weekly', timesPerWeek: 3, order: i, archived: false,
  })),
];

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const run = async () => {
  const base = db.collection('users').doc(YOUR_UID);
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Seeding ${CATEGORIES.length} categories + ${habits.length} habits under users/${YOUR_UID}/\n`);

  for (const c of CATEGORIES) {
    const { id, ...data } = c;
    if (DRY_RUN) console.log(`  • category ${id}: ${data.name}`);
    else { await base.collection('habitCategories').doc(id).set({ ...data, archived: false }); console.log(`  ✓ category ${id}`); }
  }

  for (const h of habits) {
    const { id, ...data } = h;
    if (DRY_RUN) console.log(`  • habit ${id} [${data.categoryId}, ${data.cadence}${data.cadence === 'weekly' ? ` ${data.timesPerWeek}x` : ''}, default ${data.defaultCount}]`);
    else { await base.collection('habitDefinitions').doc(id).set(data); console.log(`  ✓ habit ${id}`); }
  }

  console.log(`\nDone.${DRY_RUN ? ' (DRY RUN — set DRY_RUN = false to write.)' : ''}`);
  process.exit(0);
};

run().catch((err) => { console.error(err); process.exit(1); });
