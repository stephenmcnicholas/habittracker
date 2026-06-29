# Habits Page — Design Spec
**Date:** 2026-06-29
**Status:** Draft — awaiting sign-off

## Overview

Add a second logging page, **"Habits"**, for tracking adherence to any daily habit —
exercise, medicine (take meds), hygiene (floss), languages, etc. It sits alongside
the existing Daily Log: navigable from Daily Log and back. Habits are user-defined,
grouped into user-defined categories, and ticked off as toggle "instances" through
the day. The intent is a clean, low-friction interface that makes daily compliance
and visibility effortless, and lets new categories/habits be added any time the user
wants to build a new habit.

The day is finalised with a single **"Done for today"** action, which locks the
entry (append-only, same rule as Daily Log) and mirrors that day's per-habit counts
to **Sheet3** of the `formInput` sheet.

This page does not touch the existing Daily Log behaviour, data, or its Sheet1 sync.

---

## 1. Nav & Routing

- New route `/habits` → `Habits` page (component `src/components/Habits.jsx`).
- **Route clash to resolve:** the old hidden weekly-grid `HabitTracker` currently
  sits at `/habits`. It's unreachable from the UI and kept "for future use", so it
  moves to `/habit-grid`; the new Habits page takes `/habits`.
- The nav bar's left side becomes two links: **Daily Log** (`/`) and **Habits**
  (`/habits`), with the active one highlighted. Sign-out + dark-mode toggle stay on the right.

---

## 2. Firestore Data Model

All under the signed-in user's `uid`, consistent with `dailyLogs`. (These are
subcollections under `users/{uid}` and do not collide with the old top-level
`habits` collection used by the legacy weekly grid.)

### Definitions (user-editable)

`users/{uid}/habitCategories/{autoId}`
```js
{ name: "Strength", order: 0, archived: false }
```

`users/{uid}/habitDefinitions/{autoId}`
```js
{
  name: "Push-up",
  description: "3×10–15, stop 2 short of failure",  // prescription / purpose / reminder
  defaultCount: 3,                     // default # of instances per day
  categoryId: "<habitCategories doc id>",
  order: 0,                            // sort order within its category
  cadence: "weekly",                   // "daily" | "weekly"
  timesPerWeek: 3,                     // only used when cadence === "weekly"
  archived: false
}
```

**Cadence** decouples the streak from a daily expectation without any per-day
scheduling — every habit still shows every day; only the streak metric differs (see §4).
- `cadence: "daily"` — habits meant for every day (mobility, hygiene, meds). `timesPerWeek` ignored.
- `cadence: "weekly"` — habits done a set number of times per week (strength: recovery
  matters, daily is counter-productive). `timesPerWeek` is the weekly target.

### Daily logs (append-only)

`users/{uid}/habitLogs/{YYYY-MM-DD}` — document ID is the date, one per day.
```js
{
  date: "2026-06-29",
  locked: false,                       // false = today's editable draft; true = finalised
  perHabit: {
    "<habitId>": { target: 3, completed: 2 },   // target may exceed defaultCount via "+"
    ...
  },
  createdAt: Timestamp                 // set when first saved
}
```

- `completed` is an integer count of finished instances. Toggles fill sequentially
  (tick the first N), so we only ever store the count — order of instances doesn't matter
  for streaks or the sheet.
- `target` starts at the habit's `defaultCount` and increases when "+" is pressed
  for that day. Pressing "+" never changes the habit's `defaultCount`.

---

## 3. Sequential, append-only logging

Mirrors Daily Log, but with its **own** date pointer (independent of Daily Log):

- **Current logging date** = day after the most recent *locked* `habitLogs` doc.
  If there are no logs at all → today. If that date is after today → "You're up to
  date" and nothing to log.
- While on the current date, an **unlocked draft** doc (`locked:false`) holds live
  toggle state. Toggles **auto-save** to it as you tick, so closing the browser
  mid-day loses nothing.
- **"Done for today"** sets `locked:true`, fires the Sheet3 sync, and advances the
  current date to the next day. If that next day is still ≤ today (you were catching
  up on missed days), the page immediately loads a fresh draft for it; otherwise it
  shows "up to date".
- **Locked days cannot be edited** in the UI — only the current draft date is editable.
  (Historical fixes, if ever needed, happen directly in Firestore, same as Daily Log.)

---

## 4. Page Layout & Behaviour

Header: page title "Habits" and the current logging date (e.g. `2026-06-29`),
or "You're up to date — come back tomorrow." **No overall streak in the header.**

**Progress bar** under the header: `Σ completed / Σ target` instances across all
non-archived **daily-cadence** habits for the day, labelled e.g. **"7 / 20 done"**.
Weekly-cadence habits are excluded so a rest day can still reach 100%.

**Categories** render as collapsible sections (chevron to collapse/expand). Collapse
state is a **local (this-browser) convenience** — persisted in `localStorage`, not Firestore.

**Habit row** (within a category):
- Name (bold), description (small/italic), and a streak badge (see below).
- A row of **toggle buttons**, one per target instance. Completed instances show a
  green tick; pending ones show their index. Tapping toggles completion (sequential
  fill). Auto-saves.
- A **"+"** button to add one more instance for that day (increments `target`).
- Weekly-cadence rows also show **"k / N this week"** (sessions logged this week vs target).

**"Done for today"** button at the bottom — locks the day and advances (see §3).
Disabled when already up to date.

### Per-habit streak (cadence-aware)

- **Daily cadence** — 🔥 = consecutive calendar days, walking back from the most
  recent locked day, on which that habit had `completed ≥ 1`. A day with no locked
  log, or `completed = 0`, breaks the streak.
- **Weekly cadence** — 🔥 = consecutive **ISO weeks (Mon–Sun)**, walking back from
  the current week, in which the habit was done on `timesPerWeek` or more distinct
  days. The current (in-progress) week never breaks the streak — it only extends it
  once the target is met. A "session" = a day with `completed ≥ 1`.

Both computed client-side from the last ~60 locked logs.

---

## 5. Managing habits & categories (edit mode)

In normal (view) mode the page is clean — just categories, rows and toggles. An
**"Edit" toggle** reveals management controls:

- **Add category** (name) and **add habit** (name, description, default count, category).
- **Edit** an existing category/habit (rename, change description/default count/category).
- **Archive** a habit or category — sets `archived:true`. Archived items stop
  rendering and stop being written to the sheet, but the Firestore data (and their
  historical Sheet3 columns) are retained, and they can be un-archived later. (No
  hard delete in v1.)
- **Drag-to-reorder** habits within a category (updates `order`). Drag handles appear
  only in edit mode.

Editing a habit's `defaultCount` applies to today's open (unlocked) draft
**immediately**, clamped so the target never drops below instances already
completed; future days use the new default too. **Locked** past days are never altered.

---

## 6. Sheet3 sync

One row per date in **Sheet3** of the `formInput` sheet
(id `1a4UFdpK5MbDiBrd9GnGDwmc8ZT3H72SCNcfAUFe1ewc`), with **one column per habit**
holding that day's completed count. Written only when the day is **locked** via
"Done for today" — satisfies "doesn't need to be real-time".

Mechanism reuses the existing pattern:
- On "Done for today", the app POSTs `{ type:'habits', date:'YYYY-MM-DD',
  counts:{ "Push-ups":3, "Floss":1, ... } }` (no-cors, best-effort, non-blocking)
  to the **same** `SHEET_SYNC_URL` web app.
- `scripts/apps-script-doPost.gs` gains a `type:'habits'` branch: open Sheet3, read
  the header row (col A = `Date`, each following column = a habit name), ensure a
  column exists for every habit in the payload (append a new header if missing), then
  upsert the row for that date (day-first `DD/MM/YYYY`, dedupe/update by date).
- Renaming a habit later creates a new column in the sheet (old data stays under the
  old header). Acceptable for a human-readable sheet; columns are keyed by habit
  name, not id.
- A backfill/repair Node script (`scripts/sync-habits-to-sheet.mjs`) can be added
  later if needed, mirroring `sync-to-sheet.mjs`. Not required for v1.

Firestore security rules add `match /users/{userId}/habit{Categories,Definitions,Logs}/...`
scoped to `request.auth.uid == userId` (set in the Firebase Console).

---

## Out of scope (v1)

- Editing/deleting locked historical habit days from the UI.
- Hard-deleting habits/categories (archive only).
- A scheduled (cron / time-driven) sheet job — sync fires on day-lock instead.
- Per-instance metadata (weight, reps, time) — instances are simple done/not-done toggles.
- Changes to Daily Log, its Sheet1 sync, or the Fitbit step streak.

---

## Appendix — Seeded starting habits

Written once into Firestore on first setup (a one-off seed script, or via edit mode).
`#` = `defaultCount`. Mobility ordered by the priority sequence; cat-cow always first.

### Category: Mobility — cadence `daily`

| # | Habit | Description |
|---|-------|-------------|
| 1 | Cat-cow | ×10 slow breaths — always first |
| 1 | Deep squat hold | 30–60s, supported (door frame) |
| 1 | Chin tuck | ×10 reps, hold 3s |
| 1 | Hip flexor lunge stretch | 45–60s each side |
| 1 | Doorway chest opener | 2×40s, vary arm height |
| 1 | Thoracic rotation | ×8 each side |
| 1 | Calf + ankle dorsiflexion | 30s straight + 30s bent knee, each side |
| 1 | Ankle wall drill | ×10 reps + 30s hold each side |
| 1 | Hamstring stretch | 40–60s each side, hinge from hip |
| 1 | Figure-4 glute stretch | 40–60s each side |
| 1 | Thoracic extension over chair | 60–90s, towel across spine |
| 1 | Neck lateral flexion + rotation | 20–30s each side; skip on acute pain |
| 1 | Pendulum swing + wall walk | 30s each direction, pain-free range |

### Category: Strength — cadence `weekly`, `timesPerWeek: 3`

| # | Habit | Description |
|---|-------|-------------|
| 3 | Goblet squat | 3×10–12, heavier DB to progress |
| 3 | Single-leg RDL | 3×8 each side |
| 3 | Push-up | 3×10–15, feet elevated to progress |
| 2 | Overhead DB press | 2×10–12 |
| 3 | Inverted row | 3×10–12 (table) |
| 2 | Bicep curl | 2×12 |
| 2 | Tricep overhead ext / close-grip push-up | 2×12 |
| 2 | Plank or dead bug | 2×30–45s |
| 2 | Dorsal raise | 2×15 |

General strength rules (stop 2 reps short of failure, rest 60–90s, full-body each
session, non-consecutive days) live in the user's head / notes — not modelled in the app.

---

## Open choices defaulted (flag if you disagree)

1. **Toggles fill sequentially** (tick first N), storing only a count — vs. individually
   addressable on/off instances. Defaulted to sequential.
2. **Nav** = two text links ("Daily Log" / "Habits") in the existing bar. Defaulted yes.
3. **Streak counts locked days only** (today's in-progress draft doesn't extend the streak
   until locked). Defaulted yes.
4. **Progress bar counts instances** (Σ completed / Σ target), not habits-with-≥1-done.
5. **Old weekly grid moves from `/habits` to `/habit-grid`** so the new page can own `/habits`.
