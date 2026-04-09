# Daily Log Refocus — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refocus the app on Daily Log — add Google Auth, migrate data from Google Sheets to Firestore, enforce sequential date logging, and auto-load stats.

**Architecture:** Firebase Auth gates the entire app via an `AuthGate` wrapper component. Daily Log reads/writes to a per-user Firestore subcollection (`users/{uid}/dailyLogs/{date}`), with the ISO date string as the document ID to enforce one entry per calendar day. Stats are computed client-side from the last 60 Firestore entries. Step streak is still fetched from the existing Apps Script endpoint (read-only, unchanged). A one-off Node.js migration script (using Firebase Admin SDK) imports historical data from a CSV export of the Google Sheet.

**Tech Stack:** React 19, Firebase v11 (Auth + Firestore), Firebase Admin SDK (migration only), Tailwind CSS, Vite, HashRouter

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/firebase.js` | Modify | Export `auth` and `googleProvider` alongside existing `db` |
| `src/components/AuthGate.jsx` | Create | Full-page Google sign-in screen; renders children when authenticated |
| `src/main.jsx` | Modify | Wrap `<App />` in `<AuthGate>` |
| `src/App.jsx` | Modify | Remove nav links, add title + sign-out button, default route to DailyLog |
| `src/components/DailyLog.jsx` | Modify | Firestore reads/writes, sequential date logic, client-side stats |
| `scripts/migrate-to-firestore.mjs` | Create | One-off Admin SDK migration from CSV to Firestore |

Firestore security rules are set via the Firebase Console (no `firebase.json` in this project).

---

### Task 1: Wire up Firebase Authentication

**Files:**
- Modify: `src/firebase.js`

- [ ] **Step 1: Add auth exports**

Replace the entire contents of `src/firebase.js`:

```js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCm20xcM89i6kGpqIKGn2nllgwUbmKqGmw",
  authDomain: "habittracker-a2060.firebaseapp.com",
  projectId: "habittracker-a2060",
  storageBucket: "habittracker-a2060.firebasestorage.app",
  messagingSenderId: "69908278913",
  appId: "1:69908278913:web:9ebdff9cd4e3eac780e780",
  measurementId: "G-Y09PWQ67FC"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
```

- [ ] **Step 2: Verify no import errors**

Run: `npm run dev`

Expected: App loads normally, no console errors. Auth is not wired up yet — that happens in Task 2.

- [ ] **Step 3: Commit**

```bash
git add src/firebase.js
git commit -m "feat: export Firebase Auth and GoogleAuthProvider"
```

---

### Task 2: Build AuthGate component

**Files:**
- Create: `src/components/AuthGate.jsx`
- Modify: `src/main.jsx`

- [ ] **Step 1: Create AuthGate.jsx**

Create `src/components/AuthGate.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

const AuthGate = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = () => signInWithPopup(auth, googleProvider);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 gap-6">
        <h1 className="text-2xl font-bold dark:text-white">Daily Log</h1>
        <button
          onClick={signIn}
          className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return children;
};

export default AuthGate;
```

- [ ] **Step 2: Wrap App in AuthGate in main.jsx**

Replace the entire contents of `src/main.jsx`:

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AuthGate from './components/AuthGate.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>,
)
```

- [ ] **Step 3: Verify sign-in flow**

Run: `npm run dev`

Expected:
- App shows "Daily Log" heading and "Sign in with Google" button (no other content)
- Clicking the button opens a Google OAuth popup
- After signing in, the full app renders normally
- Refreshing the page keeps you signed in (Firebase persists the session)

- [ ] **Step 4: Commit**

```bash
git add src/components/AuthGate.jsx src/main.jsx
git commit -m "feat: add AuthGate with Google Sign-In"
```

---

### Task 3: Update App.jsx — nav, routing, sign-out

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Rewrite App.jsx**

Replace the entire contents of `src/App.jsx`:

```jsx
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';
import HabitTracker from './components/HabitTracker';
import CountdownTimer from './components/CountdownTimer';
import DarkModeToggle from './components/DarkModeToggle';
import DailyLog from './components/DailyLog';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 dark:text-white">
        <nav className="p-4 bg-white shadow dark:bg-gray-800 dark:shadow-lg">
          <div className="max-w-2xl mx-auto flex justify-between items-center">
            <span className="font-semibold text-gray-800 dark:text-white">Daily Log</span>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => signOut(auth)}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Sign out
              </button>
              <DarkModeToggle />
            </div>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<DailyLog />} />
          {/* Hidden — kept for future use */}
          <Route path="/habits" element={<HabitTracker />} />
          <Route path="/timer" element={<CountdownTimer />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
```

- [ ] **Step 2: Verify nav and routing**

Run: `npm run dev`. Sign in.

Expected:
- Nav shows "Daily Log" on the left; "Sign out" and dark mode toggle on the right
- No Habits / Timer / Meals links visible
- Page loads directly to the Daily Log form
- Clicking "Sign out" returns to the sign-in screen
- Dark mode toggle still works

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: simplify nav to Daily Log only, add sign-out"
```

---

### Task 4: Set Firestore security rules

**Files:** None in this repo — rules are set in the Firebase Console.

- [ ] **Step 1: Open the rules editor**

Navigate to: Firebase Console → project `habittracker-a2060` → Firestore Database → Rules tab.

- [ ] **Step 2: Replace all rules with the following**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Habits (existing collection) — any authenticated user can read/write
    match /habits/{habitId} {
      allow read, write: if request.auth != null;
    }

    // Daily logs — each user can only access their own documents
    match /users/{userId}/dailyLogs/{date} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

- [ ] **Step 3: Publish**

Click "Publish" in the Firebase Console.

- [ ] **Step 4: Verify rules are active**

In `npm run dev`, open DevTools → Console. Navigate to the Daily Log page. There should be no Firestore permission errors.

---

### Task 5: Refactor DailyLog — Firestore reads + sequential date logic

**Files:**
- Modify: `src/components/DailyLog.jsx`

This task replaces the Google Sheets fetch with Firestore queries and introduces sequential date logic. The submit handler is still replaced in Task 6.

- [ ] **Step 1: Replace imports and add helper functions**

Replace the import block at the top of `src/components/DailyLog.jsx` and add the helper functions immediately after:

```jsx
import React, { useState, useEffect } from 'react';
import { collection, doc, getDocs, setDoc, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { SegmentedEnergySlider } from './EnergySliders';
import { CircularSleepSlider } from './EnergySliders';
import { auth, db } from '../firebase';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbynd1P4XhEhxsO_G2cgYRm2XZQt6-iTWyuk27YVVfTsXWyWFjHnSXPIWoinDLlv2rgB/exec';

// Local-time-aware date formatting — avoids UTC off-by-one errors
const formatDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDisplayDate = (dateStr) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });
};

const addDays = (dateStr, n) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + n);
  return formatDate(d);
};

const isAfterToday = (dateStr) => dateStr > formatDate(new Date());
```

- [ ] **Step 2: Replace the component state and data-fetching logic**

Replace everything from `const DailyLog = () => {` through the closing `}` of the `useEffect` with:

```jsx
const DailyLog = () => {
  const userId = auth.currentUser?.uid;

  const [formData, setFormData] = useState({ sleep: 7, energy: 3, alc: 0 });
  const [nextEntryDate, setNextEntryDate] = useState(null);
  const [upToDate, setUpToDate] = useState(false);
  const [stats, setStats] = useState({
    avgSleep: '-', avgEnergy: '-', totalAlc: '-', dryStreak: '-', stepStreak: '-'
  });
  const [recentEntries, setRecentEntries] = useState([]);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchNextDate = async () => {
    const q = query(
      collection(db, 'users', userId, 'dailyLogs'),
      orderBy('date', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return formatDate(new Date());
    return addDays(snap.docs[0].data().date, 1);
  };

  const fetchStats = async () => {
    const q = query(
      collection(db, 'users', userId, 'dailyLogs'),
      orderBy('date', 'desc'),
      limit(60)
    );
    const snap = await getDocs(q);
    const entries = snap.docs.map(d => d.data());
    if (entries.length === 0) return;

    const last7 = entries.slice(0, 7);
    const avgSleep   = (last7.reduce((s, e) => s + Number(e.sleep),  0) / last7.length).toFixed(1);
    const avgEnergy  = (last7.reduce((s, e) => s + Number(e.energy), 0) / last7.length).toFixed(1);
    const totalAlc   = last7.reduce((s, e) => s + Number(e.alc), 0);

    // Dry streak: walk backwards through calendar days from most recent entry
    let dryStreak = 0;
    const byDate = Object.fromEntries(entries.map(e => [e.date, e]));
    let cursor = entries[0].date;
    while (byDate[cursor] && Number(byDate[cursor].alc) === 0) {
      dryStreak++;
      cursor = addDays(cursor, -1);
    }

    setStats(prev => ({ ...prev, avgSleep, avgEnergy, totalAlc, dryStreak }));
    setRecentEntries([...last7].reverse()); // oldest first for table display
  };

  const fetchStepStreak = async () => {
    try {
      const response = await fetch(SCRIPT_URL);
      const data = await response.json();
      setStats(prev => ({ ...prev, stepStreak: data.stepStreak ?? '-' }));
    } catch {
      // step streak is best-effort — leave as '-' if unavailable
    }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [nextDate] = await Promise.all([
        fetchNextDate(),
        fetchStats(),
        fetchStepStreak(),
      ]);
      setNextEntryDate(nextDate);
      setUpToDate(isAfterToday(nextDate));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);
```

- [ ] **Step 3: Add loading state and "Logging for:" display to the JSX**

Replace the old `if (loading)` block and the `<h1>` heading at the start of the `return` with:

```jsx
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 dark:bg-gray-900">
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 dark:bg-gray-900 dark:text-white">
      <h1 className="text-2xl font-bold mb-1 dark:text-white">How are you today?</h1>
      {nextEntryDate && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {upToDate
            ? "You're up to date — come back tomorrow."
            : `Logging for: ${formatDisplayDate(nextEntryDate)}`}
        </p>
      )}
```

Keep all remaining JSX (form body, stats panel) unchanged for now.

- [ ] **Step 4: Verify in browser**

Run: `npm run dev`. Sign in.

Expected:
- "Logging for: [date]" or "You're up to date" message appears below the heading
- Stats panel still shows data (from Apps Script, as the old fetch code is still present — it will be removed in Task 7)
- No console errors

- [ ] **Step 5: Commit**

```bash
git add src/components/DailyLog.jsx
git commit -m "feat: add Firestore data fetching and sequential date logic to DailyLog"
```

---

### Task 6: Refactor DailyLog — Firestore writes + form cleanup

**Files:**
- Modify: `src/components/DailyLog.jsx`

- [ ] **Step 1: Replace handleSubmit**

Replace the existing `handleSubmit` function with:

```jsx
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (upToDate || !nextEntryDate) return;

    await setDoc(doc(db, 'users', userId, 'dailyLogs', nextEntryDate), {
      date: nextEntryDate,
      sleep:  Number(formData.sleep),
      energy: Number(formData.energy),
      alc:    Number(formData.alc),
      createdAt: serverTimestamp(),
    });

    setFormData({ sleep: 7, energy: 3, alc: 0 });
    setSubmitSuccess(true);
    setTimeout(() => setSubmitSuccess(false), 3000);

    await loadAll(); // recalculates nextEntryDate and refreshes stats
  };
```

- [ ] **Step 2: Remove duplicate state and old event handlers**

Delete these declarations and functions — they are no longer needed:

```jsx
// DELETE these lines:
const [sleepValue, setSleepValue] = useState(7);
const [energyValue, setEnergyValue] = useState(3);

const handleSleepSliderChange = (e) => { ... }
const handleEnergySliderChange = (e) => { ... }
```

Also remove the old `scriptURL` constant (the SCRIPT_URL constant added in Task 5 replaces it).

- [ ] **Step 3: Update slider onChange handlers in the JSX**

Replace the `CircularSleepSlider` usage:

```jsx
          <CircularSleepSlider
            value={formData.sleep}
            onChange={(hours) => setFormData(prev => ({ ...prev, sleep: hours }))}
          />
```

Replace the `SegmentedEnergySlider` usage:

```jsx
          <SegmentedEnergySlider
            value={formData.energy}
            onChange={(e) => setFormData(prev => ({ ...prev, energy: Number(e.target.value) }))}
          />
```

- [ ] **Step 4: Update the submit button JSX**

Replace the existing `<button type="submit" ...>` with:

```jsx
        {submitSuccess && (
          <p className="text-green-600 dark:text-green-400 text-sm text-center mb-2">Saved!</p>
        )}
        <button
          type="submit"
          disabled={upToDate}
          className={`w-full p-3 text-white rounded transition-colors
            ${upToDate
              ? 'bg-gray-400 cursor-not-allowed dark:bg-gray-600'
              : 'bg-blue-500 hover:bg-blue-600 dark:bg-blue-700 dark:hover:bg-blue-600'
            }`}
        >
          Submit
        </button>
```

- [ ] **Step 5: Verify submission flow**

Run: `npm run dev`. Sign in.

Expected:
- Fill in the form → click Submit → "Saved!" appears briefly
- "Logging for:" advances to the next day
- When you've caught up to today, the button becomes greyed out and shows "You're up to date — come back tomorrow."
- Open Firebase Console → Firestore → `users/{uid}/dailyLogs` — the new document appears with correct `date`, `sleep`, `energy`, `alc` fields
- No `alert()` dialogs

- [ ] **Step 6: Commit**

```bash
git add src/components/DailyLog.jsx
git commit -m "feat: submit DailyLog entries to Firestore, remove duplicate state"
```

---

### Task 7: Refactor DailyLog — client-side stats panel

**Files:**
- Modify: `src/components/DailyLog.jsx`

`fetchStats` (added in Task 5) already computes all stats from Firestore and writes them to the `stats` state object. This task updates the stats panel JSX to use those values and removes any remaining Apps Script fetch for non-step-streak stats.

- [ ] **Step 1: Verify no stale Apps Script fetch remains**

Search the file for `fetch(SCRIPT_URL` (or `fetch(scriptURL`). There should be exactly one call — inside `fetchStepStreak`. Delete any other `fetch` calls referencing the script URL (e.g. the old `fetchStats` that called the Apps Script).

- [ ] **Step 2: Update the Recent Entries table to use Firestore field names**

Replace the `<tbody>` row renderer:

```jsx
              {recentEntries.map((entry) => (
                <tr key={entry.date} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="border p-2 dark:border-gray-600 dark:text-white">{formatDisplayDate(entry.date)}</td>
                  <td className="border p-2 dark:border-gray-600 dark:text-white">{entry.sleep}</td>
                  <td className="border p-2 dark:border-gray-600 dark:text-white">{entry.energy}</td>
                  <td className="border p-2 dark:border-gray-600 dark:text-white">{entry.alc}</td>
                </tr>
              ))}
```

- [ ] **Step 3: Verify stats panel**

Run: `npm run dev`. Sign in.

Expected (before migration — Firestore is empty):
- Stats show `-` values
- Step streak loads from Apps Script
- Recent entries table is empty

After migration (Task 8), all values populate correctly.

- [ ] **Step 4: Commit**

```bash
git add src/components/DailyLog.jsx
git commit -m "feat: compute DailyLog stats client-side from Firestore"
```

---

### Task 8: Data migration script

**Files:**
- Create: `scripts/migrate-to-firestore.mjs`

This is a one-off script using the Firebase Admin SDK, which bypasses client-side auth. Run it once after exporting your Google Sheet as CSV, then keep it in the repo but never run it again.

- [ ] **Step 1: Download a Firebase service account key**

Go to: Firebase Console → Project Settings (gear icon) → Service accounts tab → "Generate new private key" → Download JSON.

Save the file as `scripts/serviceAccount.json`.

**Important:** Add `scripts/serviceAccount.json` to `.gitignore` immediately — never commit this file.

```bash
echo "scripts/serviceAccount.json" >> .gitignore
git add .gitignore
git commit -m "chore: ignore Firebase service account key"
```

- [ ] **Step 2: Export your Google Sheet as CSV**

In Google Sheets: File → Download → Comma-separated values (.csv)

Save it as `scripts/data.csv`.

Open the file and note:
- The exact **column header names** for date, sleep, energy, and alcohol
- The **date format** used (e.g. `09/04/2026`, `2026-04-09`, or `04/09/2026`)

Add `scripts/data.csv` to `.gitignore` too:

```bash
echo "scripts/data.csv" >> .gitignore
git add .gitignore
git commit -m "chore: ignore migration CSV file"
```

- [ ] **Step 3: Install firebase-admin**

```bash
npm install --save-dev firebase-admin
```

- [ ] **Step 4: Get your Firebase UID**

Go to Firebase Console → Authentication → Users tab. Copy the UID in the "User UID" column (the long alphanumeric string next to your Google account email).

- [ ] **Step 5: Create the migration script**

Create `scripts/migrate-to-firestore.mjs`, replacing the CONFIG values with your actual column names, date format, and UID:

```js
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
```

- [ ] **Step 6: Run the migration**

```bash
node scripts/migrate-to-firestore.mjs
```

Expected output:
```
Found N rows. Writing to users/{uid}/dailyLogs/...
  ✓ 2025-01-01
  ✓ 2025-01-02
  ...
Done. Written: N, Skipped: 0
```

If you see date parse errors, re-check the `DATE_FORMAT` and `DATE_COL` values and re-run. The script uses `set()` (not `add()`), so re-running is safe — it will overwrite rather than duplicate.

- [ ] **Step 7: Verify in Firebase Console**

Go to Firebase Console → Firestore → `users` → `{your-uid}` → `dailyLogs`. Confirm one document per date, with correct field values.

- [ ] **Step 8: Verify in the app**

Run: `npm run dev`. Sign in.

Expected:
- Stats panel shows your historical averages (average sleep, energy, total alcohol, dry streak)
- Recent entries table shows last 7 days
- "Logging for:" shows the next unlogged date after your last historical entry
- Step streak still loads from the Apps Script

- [ ] **Step 9: Commit the migration script**

```bash
git add scripts/migrate-to-firestore.mjs
git commit -m "chore: one-off migration script for Google Sheets → Firestore"
```
