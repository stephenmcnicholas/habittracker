# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (Vite with HMR) at localhost:5173/habittracker/
npm run build     # Production build to /dist
npm run lint      # Run ESLint
npm run preview   # Preview production build locally
npm run deploy    # Build + deploy to GitHub Pages
```

No test runner is configured.

## Architecture

React 19 SPA using Vite, Tailwind CSS (dark mode via `class` strategy), and HashRouter (required for GitHub Pages hosting at `/habittracker/`).

### Routing (`App.jsx`)

Three routes rendered inside a persistent nav bar with a dark mode toggle:
- `/` → `HabitTracker` — weekly habit grid, streak stats, add/toggle habits
- `/timer` → `CountdownTimer` — reads `?minutes=N` query param from habit click
- `/dailylog` → `DailyLog` — sleep/energy/alcohol logging

### Data

- **Habits** (`HabitTracker.jsx`): Firebase Firestore (`firebase.js` exports `db`). Collection: `habits`, documents with `name`, `minutes`, `entries` (object keyed by ISO date strings → `true`), `createdAt`.
- **Daily log** (`DailyLog.jsx`): Firebase Firestore + Auth. Entries live at `users/{uid}/dailyLogs/{YYYY-MM-DD}` with `date`, `sleep`, `energy`, `alc`, `createdAt`. Logging is sequential (only `nextEntryDate`, the day after the latest entry). Two Apps Script web app URLs are used: `SCRIPT_URL` (GET, the Fitbit step streak) and `SHEET_SYNC_URL` (POST on Submit → mirrors the entry to the `formInput` Google Sheet; see Sheet sync below).

There is no global state management — each component manages its own state with `useState`/`useRef`. Data is fetched directly in components via `getDocs`/`addDoc`/`updateDoc`.

### Daily log → Google Sheet sync

The daily log mirrors to the historical `formInput` sheet (id `1a4UFdpK5MbDiBrd9GnGDwmc8ZT3H72SCNcfAUFe1ewc`, tab `Sheet1`, dates **day-first DD/MM/YYYY**):
- **Live**: `DailyLog.jsx` POSTs each entry to `SHEET_SYNC_URL`, a standalone "DailyLog Sheet Sync" Apps Script (source: `scripts/apps-script-doPost.gs`) that appends a row and dedupes by date.
- **Backfill/repair**: `scripts/sync-to-sheet.mjs` (Node + `googleapis` + `scripts/serviceAccount.json`) reads Firestore and appends dates missing from the sheet (idempotent, `SINCE` cutoff, `DRY_RUN` flag).
- **Edit history**: `scripts/edit-sleep.mjs` edits past sleep values directly in Firestore (the UI can't).

The service account must be shared as Editor on the sheet with the Google Sheets API enabled. `serviceAccount.json` and `data.csv` are gitignored. See `CHANGELOG.md` for the rollout.

### Dark Mode

`DarkModeToggle.jsx` persists preference to `localStorage` and adds/removes the `dark` class on `<html>`. Tailwind's `dark:` variants handle the visual switching.

### Custom UI Components (`EnergySliders.jsx`)

Two SVG/drag-based components: `SegmentedEnergySlider` (5-segment color gradient) and `CircularSleepSlider` (SVG arc, 0–12 hours at 0.25 precision). Both support mouse and touch events.
