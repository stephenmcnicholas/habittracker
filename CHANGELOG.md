# Changelog

All notable changes to this project are documented here.

## [Unreleased]

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
