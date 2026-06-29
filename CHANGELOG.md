# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added — Habits page (2026-06-29)

A new **Habits** page (`/habits`) for tracking adherence to any daily habit —
exercise, mobility, medicine, hygiene, etc. Lives alongside Daily Log (two nav
links); the legacy weekly grid moved from `/habits` to `/habit-grid`.

- **User-defined categories & habits** in Firestore (`users/{uid}/habitCategories`,
  `habitDefinitions`). Each habit has a name, description, default daily count, and
  a **cadence** (`daily` or `weekly` with a `timesPerWeek` target).
- **Toggle-instance logging** — tick off instances per habit; a **"+"** adds an
  extra instance for the day. Toggles auto-save an unlocked draft.
- **"Done for today"** locks the day (append-only, own sequential date pointer,
  same rule as Daily Log) and mirrors that day's per-habit counts to **Sheet3** of
  the `formInput` sheet (`type:'habits'` via the same `SHEET_SYNC_URL` web app —
  one row per date, one column per habit).
- **Cadence-aware streaks** — 🔥 per habit: consecutive days (daily) or consecutive
  ISO weeks meeting the weekly target (weekly). Weekly habits also show "k/N this
  week" and are excluded from the daily progress bar.
- **Edit mode** — add/edit/**archive** (retain data, hide) categories & habits, plus
  drag-to-reorder within a category (`@dnd-kit`). Category collapse persists locally.
- `scripts/seed-habits.mjs` — one-off Admin SDK seed of the starting Mobility (13)
  and Strength (9) habits. `scripts/apps-script-doPost.gs` gained the Sheet3 branch.
- Firestore rules add the three new owner-scoped `habit*` subcollections.

### Added — Daily log → Google Sheet sync (2026-06-02)

The daily log (sleep / energy / alcohol) now mirrors to the historical
`formInput` Google Sheet, restoring the long-running spreadsheet record that
stopped on 9 Apr 2026 when logging moved to Firestore.

- **Live trigger** — on each **Submit**, `DailyLog.jsx` POSTs the entry to a
  dedicated "DailyLog Sheet Sync" Apps Script web app (`SHEET_SYNC_URL`), which
  appends a `DD/MM/YYYY, sleep, energy, alc` row to the sheet and dedupes by
  date. Best-effort and non-blocking — a sheet failure never blocks the log.
  Source for the web app lives at `scripts/apps-script-doPost.gs`.
- **`scripts/sync-to-sheet.mjs`** — Node backfill/repair tool. Reads Firestore
  daily logs and appends any dates missing from the sheet, from a `SINCE`
  cutoff onward. Idempotent, with a `DRY_RUN` flag. Used once to backfill the
  10 Apr → 2 Jun 2026 gap (54 rows).
- **`scripts/edit-sleep.mjs`** — one-off editor for historical sleep values in
  Firestore (the Daily Log UI is append-only and can't edit past entries).
- Added the `googleapis` dependency for Node-side Sheets access.

### Notes

- The `formInput` sheet stores dates **day-first (DD/MM/YYYY)**; the tab is
  named `Sheet1` (the spreadsheet itself is named "formInput").
- Kept separate from the **Fitbit Integration** Apps Script (`SCRIPT_URL`),
  which pulls step data into its own sheet and serves the step streak via GET.
- The Firebase service account
  (`firebase-adminsdk-fbsvc@habittracker-a2060.iam.gserviceaccount.com`) must be
  shared as Editor on the sheet, with the Google Sheets API enabled, for the
  Node scripts to write. `scripts/serviceAccount.json` is gitignored.
