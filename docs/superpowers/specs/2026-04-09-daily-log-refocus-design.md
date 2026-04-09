# Daily Log Refocus — Design Spec
**Date:** 2026-04-09  
**Status:** Approved

## Overview

Refocus the app on the Daily Log page. Hide Habits, Timer, and Meals from the UI (code remains intact). Add Google Auth, migrate Daily Log data from Google Sheets to Firestore, fix the duplicate-date bug with sequential date logic, and make stats auto-load.

---

## 1. Nav & Routing

- Remove `Habits`, `Timer`, and `Meals` nav links from `App.jsx`
- Add app title ("Daily Log") to the left side of the nav bar
- Keep dark mode toggle on the right
- Route `/` → `DailyLog` (replace `HabitTracker` as the default route)
- Existing `/timer` and `/` (HabitTracker) routes remain in the router but are unreachable from the UI — no code deleted

---

## 2. Authentication

- Add **Firebase Authentication** with Google Sign-In provider to the Firebase project
- On app load: if no authenticated user → render a full-page "Sign in with Google" screen instead of the app
- Once authenticated: render the app as normal; add a sign-out button to the nav bar (right side, next to dark mode toggle)
- **Firestore security rules** scoped by `uid`:
  ```
  match /users/{userId}/dailyLogs/{date} {
    allow read, write: if request.auth != null && request.auth.uid == userId;
  }
  ```
- No public registration — only accounts with existing data (i.e. the owner's Google account) are meaningful users

---

## 3. Firestore Data Model

Collection path: `users/{userId}/dailyLogs/{date}`

`{date}` is the **document ID** in `YYYY-MM-DD` format. Using date as the document ID prevents duplicate entries per day and makes "get last logged date" a single ordered query.

Document fields:
```js
{
  date: "2026-04-09",   // string, matches document ID
  sleep: 7.5,           // number, hours (0.25 precision)
  energy: 3,            // number, 1–5
  alc: 0,               // number, units (integer)
  createdAt: Timestamp  // Firestore server timestamp — when it was actually submitted
}
```

---

## 4. Sequential Date Logic

**Goal:** Entries always fill forward from the last logged date. No duplicate days. No future entries.

**Behaviour:**
- On page load, query `users/{userId}/dailyLogs` ordered by `date` descending, limit 1 → `lastLoggedDate`
- `nextEntryDate = lastLoggedDate + 1 day` (if no entries exist, `nextEntryDate = today`)
- The form displays: **"Logging for: Thu 10 Apr"** so the user always knows which day they're filling in
- The user may submit multiple entries in one session, each advancing `nextEntryDate` by one day, until `nextEntryDate > today`
- Submit button is **disabled** with a "You're up to date!" message when `nextEntryDate > today`
- After each successful submit, re-query to recalculate `nextEntryDate`. If still behind today, reset the form and leave it open for the next date. If caught up, disable submission.

---

## 5. Stats & Step Streak

All stats computed **client-side** from Firestore data. Stats load automatically on:
- Page mount
- After each successful form submission

**Stats calculated from the last 7 Firestore entries:**
- Average sleep — mean of `sleep` values
- Average energy — mean of `energy` values
- Total alcohol — sum of `alc` values
- Dry streak — walk backwards from the most recent logged date, count consecutive **calendar days** (not just logged documents) where `alc === 0`. A day with no entry does not count toward the streak.

**Step streak (unchanged):**
- Single GET request to the existing Apps Script URL
- Fetches only `stepStreak` from the response
- Kept as-is; can be refactored into a Fitbit integration later

**Recent entries table:**
- Fetched from Firestore (last 7 entries ordered by date descending)
- No manual browser refresh required — loads on mount and after each submission

---

## 6. Data Migration

A one-off migration from Google Sheets to Firestore.

**Approach:**
1. User exports the raw Google Sheet as CSV (all rows of historical daily log data)
2. A one-off Node.js migration script reads the CSV and batch-writes documents to Firestore under the user's `uid`, using `YYYY-MM-DD` as the document ID for each row
3. Script is run once, then discarded
4. After successful migration, the Apps Script URL is no longer used for Daily Log data (step streak GET call retained)

**CSV expected columns:** `date`, `sleep`, `energy`, `alc` (plus any timestamp column which maps to `createdAt`)

**De-duplication:** If two rows share the same date in the CSV, the script takes the last one (or flags it for manual review).

---

## Out of Scope

- Editing or deleting existing Daily Log entries
- Fitbit/steps integration beyond the existing Apps Script step streak read
- Multi-user support (app is single-user; auth is for data privacy only)
- HabitTracker, CountdownTimer, or Meals changes (deferred)
