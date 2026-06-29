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

Rendered inside a persistent nav bar (two `NavLink`s: Daily Log / Habits) with a dark mode toggle:
- `/` → `DailyLog` — sleep/energy/alcohol logging (default route)
- `/habits` → `Habits` — daily habit tracker (toggle-instance logging by category)
- `/habit-grid` → `HabitTracker` — legacy weekly grid, hidden/unlinked, kept for future use
- `/timer` → `CountdownTimer` — hidden, reads `?minutes=N`

### Data

- **Habits page** (`Habits.jsx` + `src/lib/habitsData.js`, `src/lib/dates.js`): Firebase Firestore + Auth. Definitions at `users/{uid}/habitCategories/{id}` (`name`, `order`, `archived`) and `users/{uid}/habitDefinitions/{id}` (`name`, `description`, `defaultCount`, `categoryId`, `order`, `cadence` `'daily'|'weekly'`, `timesPerWeek`, `archived`). Daily logs (append-only) at `users/{uid}/habitLogs/{YYYY-MM-DD}` (`date`, `locked`, `perHabit:{habitId:{target,completed}}`, `createdAt`). Toggles auto-save an unlocked draft; **"Done for today"** sets `locked:true`, advances the date, and POSTs the day's per-habit counts to `SHEET_SYNC_URL` (`type:'habits'` → Sheet3). Sequential & append-only with its own date pointer (day after the latest *locked* log). Streaks are cadence-aware: daily = consecutive days; weekly = consecutive ISO weeks meeting `timesPerWeek`. Archive (not delete) hides items while retaining data. Drag-reorder uses `@dnd-kit`. Category collapse state lives in `localStorage`.
- **Legacy habit grid** (`HabitTracker.jsx`): Firebase Firestore. Top-level collection: `habits`, documents with `name`, `minutes`, `entries` (object keyed by ISO date strings → `true`), `createdAt`.
- **Daily log** (`DailyLog.jsx`): Firebase Firestore + Auth. Entries live at `users/{uid}/dailyLogs/{YYYY-MM-DD}` with `date`, `sleep`, `energy`, `alc`, `createdAt`. Logging is sequential (only `nextEntryDate`, the day after the latest entry). Two Apps Script web app URLs are used: `SCRIPT_URL` (GET, the Fitbit step streak) and `SHEET_SYNC_URL` (POST on Submit → mirrors the entry to the `formInput` Google Sheet; see Sheet sync below).

There is no global state management — each component manages its own state with `useState`/`useRef`. Data is fetched directly in components via `getDocs`/`addDoc`/`updateDoc`.

### Daily log → Google Sheet sync

The daily log mirrors to the historical `formInput` sheet (id `1a4UFdpK5MbDiBrd9GnGDwmc8ZT3H72SCNcfAUFe1ewc`, dates **day-first DD/MM/YYYY**):
- **Daily log → `Sheet1`**: `DailyLog.jsx` POSTs each entry (`type:'dailyLog'`) to `SHEET_SYNC_URL`, a standalone "DailyLog Sheet Sync" Apps Script (source: `scripts/apps-script-doPost.gs`) that appends a row and dedupes by date.
- **Habits → `Sheet3`**: `Habits.jsx` POSTs the day's counts (`type:'habits'`) to the **same** `SHEET_SYNC_URL` on day-lock; the Apps Script upserts one row per date with one column per habit (creates the tab/columns as needed). Redeploy the web app (new version, same URL) after editing the `.gs`.
- **Backfill/repair**: `scripts/sync-to-sheet.mjs` (Node + `googleapis` + `scripts/serviceAccount.json`) reads Firestore and appends dates missing from the sheet (idempotent, `SINCE` cutoff, `DRY_RUN` flag).
- **Edit history**: `scripts/edit-sleep.mjs` edits past sleep values directly in Firestore (the UI can't).
- **Seed habits**: `scripts/seed-habits.mjs` (Admin SDK, `DRY_RUN` flag) writes the starting Habits categories & definitions with deterministic slug IDs (idempotent).

The service account must be shared as Editor on the sheet with the Google Sheets API enabled. `serviceAccount.json` and `data.csv` are gitignored. See `CHANGELOG.md` for the rollout.

### Dark Mode

`DarkModeToggle.jsx` persists preference to `localStorage` and adds/removes the `dark` class on `<html>`. Tailwind's `dark:` variants handle the visual switching.

### Custom UI Components (`EnergySliders.jsx`)

Two SVG/drag-based components: `SegmentedEnergySlider` (5-segment color gradient) and `CircularSleepSlider` (SVG arc, 0–12 hours at 0.25 precision). Both support mouse and touch events.
