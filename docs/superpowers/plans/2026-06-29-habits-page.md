# Habits Page — Implementation Plan
**Date:** 2026-06-29
**Spec:** `docs/superpowers/specs/2026-06-29-habits-page-design.md`
**Status:** Draft — awaiting go-ahead

**Goal:** Add a generic daily-**Habits** tracking page (`/habits`) — user-defined
categories & habits, toggle-instance logging with auto-save, "Done for today"
lock + advance (append-only, own date pointer), cadence-aware per-habit streaks,
edit mode (add / edit / archive / reorder), and a Sheet3 mirror written on day-lock.
Daily Log and its Sheet1 sync are untouched.

**Tech:** React 19, Firebase v11 (Auth + Firestore), react-router-dom (HashRouter),
Tailwind, Vite. Firebase Admin SDK for the one-off seed script. One candidate new
runtime dependency for touch drag-and-drop (see Open question).

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/App.jsx` | Modify | Nav links (Daily Log / Habits), route `/habits`, move old grid to `/habit-grid` |
| `src/lib/dates.js` | Create | Shared date helpers + ISO-week helpers (no DailyLog refactor) |
| `src/lib/habitsData.js` | Create | Firestore reads/writes + streak/progress computation (pure where possible) |
| `src/components/Habits.jsx` | Create | The page: header, progress, categories, rows, Done-for-today |
| `src/components/HabitCategory.jsx` | Create | Collapsible category section + reorderable rows |
| `src/components/HabitRow.jsx` | Create | One habit: toggles, "+", streak badge, weekly counter |
| `src/components/HabitEditPanel.jsx` | Create | Edit-mode forms: add/edit/archive category & habit |
| `scripts/seed-habits.mjs` | Create | One-off Admin SDK seed of the starting categories & habits |
| `scripts/apps-script-doPost.gs` | Modify | Add `type:'habits'` branch → Sheet3 dynamic-column upsert |
| Firestore security rules | Console | Scope new subcollections to the owner |

---

### Task 1: Routing & nav

**Files:** `src/App.jsx`

- [ ] Add `import { NavLink } from 'react-router-dom'` and `import Habits from './components/Habits'`.
- [ ] Replace the left-side `<span>Daily Log</span>` with two `NavLink`s: `to="/"` ("Daily Log", `end`) and `to="/habits"` ("Habits"). Active link gets a highlight class (e.g. `text-blue-500 font-semibold`), inactive `text-gray-500`.
- [ ] Routes: add `<Route path="/habits" element={<Habits />} />`; change the existing legacy grid route from `/habits` to `/habit-grid` (it stays hidden/unlinked).
- [ ] **Verify:** `npm run dev`, sign in. Nav shows two links; clicking toggles between Daily Log and a (stub) Habits page; active styling works; dark mode + sign out unaffected.
- [ ] Commit: `feat: add Habits route and nav links`

---

### Task 2: Shared date helpers

**Files:** `src/lib/dates.js`

- [ ] Export `formatDate(date)`, `formatDisplayDate(dateStr)`, `addDays(dateStr, n)`, `isAfterToday(dateStr)` — same local-time-aware logic already in `DailyLog.jsx` (copied, not refactored, to avoid risk to Daily Log).
- [ ] Add ISO-week helpers:
  ```js
  // Monday-based ISO week key, e.g. "2026-W27", for grouping weekly-cadence sessions.
  export const isoWeekKey = (dateStr) => { /* compute ISO year + week number */ };
  // List of week keys from most-recent backwards, for streak walking.
  export const weekKeyOf = (dateStr) => isoWeekKey(dateStr);
  ```
- [ ] **Verify:** unit-sanity in a scratch node REPL (no test runner) — `isoWeekKey('2026-06-29')` etc. behave; Mon–Sun boundaries correct around year-end.
- [ ] Commit: `feat: shared date + ISO-week helpers`

---

### Task 3: Habits data layer

**Files:** `src/lib/habitsData.js`

Pure-ish module wrapping Firestore + computation, so `Habits.jsx` stays thin.

- [ ] `loadDefinitions(uid)` → `{ categories, habits }` (both `archived !== true`, ordered by `order`).
- [ ] `computeCurrentDate(uid)` — query `habitLogs` where `locked == true`, order `date` desc, limit 1; return day after it, or today if none. (Composite index may be needed for `where + orderBy`; if so, fetch recent logs and filter client-side instead — note in code.)
- [ ] `loadDraft(uid, date)` → existing `habitLogs/{date}` doc if present & unlocked, else `null`.
- [ ] `loadRecentLogs(uid, n=60)` → last `n` `habitLogs` (locked) for streak/weekly computation.
- [ ] `saveDraft(uid, date, perHabit)` → `setDoc(..., { date, locked:false, perHabit, createdAt: serverTimestamp() }, { merge:true })`.
- [ ] `lockDay(uid, date, perHabit)` → `setDoc(..., { locked:true }, { merge:true })`.
- [ ] **Pure computation helpers** (exported, no Firestore — easy to reason about):
  - `dailyStreak(habitId, logs)` — consecutive calendar days back from latest locked day with `completed ≥ 1`.
  - `weeklyStreak(habitId, timesPerWeek, logs)` — consecutive ISO weeks back from current week with `≥ timesPerWeek` distinct days having `completed ≥ 1`; current in-progress week never breaks it.
  - `weekProgress(habitId, logs, date)` — distinct sessions in `date`'s ISO week (for "k/N this week").
  - `dayProgress(habits, perHabit)` — `{ done, total }` summing daily-cadence targets/completed only.
- [ ] Commit: `feat: Habits Firestore data layer + streak/progress computation`

---

### Task 4: Habits page — render + toggle auto-save

**Files:** `src/components/Habits.jsx`, `HabitCategory.jsx`, `HabitRow.jsx`

- [ ] `Habits.jsx`: on mount (gated by `onAuthStateChanged`, mirroring `DailyLog.jsx`), load definitions, current date, draft (seed `perHabit` from each habit's `defaultCount` when no draft), recent logs. State: `loading`, `upToDate`, `currentDate`, `perHabit`, `categories`, `habits`, `recentLogs`, `editMode`.
- [ ] Header: "Habits" + current date or "You're up to date — come back tomorrow." Progress bar from `dayProgress` ("7 / 20 done"), daily-cadence habits only.
- [ ] `HabitCategory.jsx`: collapsible (chevron); collapse state in `localStorage` keyed `habits.collapsed.<categoryId>`. Renders its non-archived habits ordered by `order`.
- [ ] `HabitRow.jsx`: name + description; toggle buttons (`target` of them; first `completed` show green tick ✓, rest show index — sequential fill on tap); "+" increments that habit's `target` in `perHabit`; streak badge (🔥 + `dailyStreak` or `weeklyStreak`); weekly rows also show "k / N this week".
- [ ] Toggling / "+" updates `perHabit` state and calls `saveDraft` (debounced ~500ms to limit writes). Disabled once `upToDate`.
- [ ] **Verify:** ticks persist across reload (draft saved); progress bar excludes strength; weekly "k/N" shows; no console errors.
- [ ] Commit: `feat: Habits page with auto-saving toggle logging`

---

### Task 5: "Done for today" — lock, advance, sheet sync

**Files:** `src/components/Habits.jsx`

- [ ] Button at bottom (disabled when `upToDate`). On click: `lockDay(uid, currentDate, perHabit)`; then POST to `SHEET_SYNC_URL` (define the constant in this file, same URL as DailyLog) `{ type:'habits', date, counts:{ [habitName]: completed } }` for non-archived habits, `no-cors`, best-effort/non-blocking (`.catch(()=>{})`).
- [ ] Recompute current date; if still ≤ today, load a fresh draft for the next day (catch-up); else set `upToDate`. Refresh `recentLogs` so streaks update. Brief "Locked!" confirmation.
- [ ] **Verify:** lock advances the date; catching up over multiple missed days works one at a time; locked days no longer editable; reopening the page resumes at the right date.
- [ ] Commit: `feat: Done-for-today locks the day, advances, and syncs to Sheet3`

---

### Task 6: Edit mode — add / edit / archive / reorder

**Files:** `src/components/HabitEditPanel.jsx`, `Habits.jsx`, `HabitCategory.jsx`

- [ ] "Edit" toggle in the header reveals controls.
- [ ] Add category (name → `addDoc` habitCategories, `order` = max+1). Add habit (name, description, defaultCount, category, cadence, timesPerWeek → `addDoc` habitDefinitions).
- [ ] Edit existing category/habit (`updateDoc`). Archive (set `archived:true`; `updateDoc`) — disappears from view, data kept; un-archive available via an "archived" disclosure. No hard delete.
- [ ] Reorder habits within a category → persist `order` (see Open question for drag vs arrows).
- [ ] Definition edits affect future days only; today's open draft keeps its targets; locked days never change.
- [ ] **Verify:** add a category + habit, edit a default count, archive then un-archive, reorder — all persist across reload; archived items don't render or sync.
- [ ] Commit: `feat: Habits edit mode — add/edit/archive/reorder`

---

### Task 7: Seed script (one-off)

**Files:** `scripts/seed-habits.mjs`

- [ ] Admin SDK script (pattern of `scripts/edit-sleep.mjs`, reuses `scripts/serviceAccount.json`, UID `cUUSyEef9VQch1dISOu9y50okIA2`). `DRY_RUN` flag.
- [ ] Deterministic slug doc IDs (e.g. category `mobility`/`strength`; habit = slug of name) so re-running overwrites rather than duplicates. Writes the two categories + the seeded habits from the spec appendix (cadence/timesPerWeek/defaultCount/order set).
- [ ] Run with `DRY_RUN` first, then for real. **Verify** in Firebase Console + the page renders them.
- [ ] Commit: `chore: one-off seed script for starting habits`

---

### Task 8: Apps Script — Sheet3 branch

**Files:** `scripts/apps-script-doPost.gs`

- [ ] Branch on `data.type`: keep `'dailyLog'` (Sheet1) exactly as-is; add `'habits'`.
- [ ] `'habits'` handler: open Sheet3 (`getSheetByName('Sheet3')`, create if missing; header row `Date` in A1). For payload `{date, counts:{name:count}}`: ensure a column exists for each habit name (append header if missing); upsert the row for that date (reuse `cellToIso_` dedup; update existing row or append), writing counts under matching columns and day-first `DD/MM/YYYY` in col A.
- [ ] Update the file header comment + redeploy note (new web-app **version** of the same deployment — URL unchanged).
- [ ] **Verify:** lock a day in the app → Sheet3 gets a dated row with correct per-habit columns; locking again dedupes/updates; a brand-new habit adds a new column.
- [ ] Commit: `feat: Apps Script writes Habits day to Sheet3 (dynamic columns)`

---

### Task 9: Firestore security rules

**Files:** Firebase Console (no repo file).

- [ ] Add, scoped to owner:
  ```
  match /users/{userId}/habitCategories/{id}  { allow read, write: if request.auth != null && request.auth.uid == userId; }
  match /users/{userId}/habitDefinitions/{id} { allow read, write: if request.auth != null && request.auth.uid == userId; }
  match /users/{userId}/habitLogs/{date}      { allow read, write: if request.auth != null && request.auth.uid == userId; }
  ```
- [ ] Publish; verify no permission errors in DevTools.

---

### Task 10: Lint, build, deploy

- [ ] `npm run lint` clean; `npm run build` succeeds.
- [ ] Manual end-to-end pass (log a day, lock, check sheet, reorder/edit, streaks).
- [ ] `npm run deploy`; verify live at `/habittracker/#/habits`.
- [ ] Update `CLAUDE.md` (new page/route/collections, Sheet3 sync) and `CHANGELOG.md`.
- [ ] Commit + final deploy.

---

## Open question (one) — reorder mechanism

"Hold and drag to reorder" is touch-friendly only with a real DnD lib; native HTML5
DnD is poor on mobile.
- **(a) Add `@dnd-kit/core` + `@dnd-kit/sortable`** — proper touch+mouse drag (one new
  runtime dependency, ~small). *Recommended, matches your "hold and drag" ask.*
- **(b) Up/down arrows in edit mode** — zero dependencies, works everywhere, less slick.

Default: **(a)** unless you'd rather avoid the dependency.

## Notes / assumptions
- Sheet3 tab is assumed named `Sheet3` (gid 872637989); the script creates it if absent.
- No history/recent-entries table on the Habits page (History tab was dropped); streaks
  + weekly counters provide the at-a-glance feedback.
- A `computeCurrentDate` query combining `where(locked)` + `orderBy(date)` may need a
  composite index; fallback is to fetch recent logs and filter client-side.
