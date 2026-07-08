// Habits data layer: Firestore reads/writes + pure streak/progress computation.
// Keeps Habits.jsx thin and makes the streak logic easy to reason about/test.

import {
  collection, doc, getDocs, setDoc, addDoc, updateDoc,
  query, orderBy, limit, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { addDays, isoWeekKey, todayStr } from './dates';

const catCol = (uid) => collection(db, 'users', uid, 'habitCategories');
const defCol = (uid) => collection(db, 'users', uid, 'habitDefinitions');
const logCol = (uid) => collection(db, 'users', uid, 'habitLogs');

// ── Definitions ───────────────────────────────────────────────────────────
// Returns ALL categories/habits (incl. archived) so edit mode can show them;
// the page filters archived !== true for normal rendering.
export const loadDefinitions = async (uid) => {
  const [catSnap, defSnap] = await Promise.all([
    getDocs(query(catCol(uid), orderBy('order'))),
    getDocs(query(defCol(uid), orderBy('order'))),
  ]);
  const categories = catSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const habits = defSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return { categories, habits };
};

export const addCategory = (uid, data) =>
  addDoc(catCol(uid), { archived: false, ...data });
export const addHabit = (uid, data) =>
  addDoc(defCol(uid), { archived: false, ...data });
export const updateCategory = (uid, id, data) =>
  updateDoc(doc(catCol(uid), id), data);
export const updateHabit = (uid, id, data) =>
  updateDoc(doc(defCol(uid), id), data);

// Persist a new ordering of habit ids within a category.
export const reorderHabits = async (uid, orderedIds) => {
  await Promise.all(
    orderedIds.map((id, i) => updateDoc(doc(defCol(uid), id), { order: i })),
  );
};

// ── Logs ──────────────────────────────────────────────────────────────────
// Most-recent n logs (locked + the current unlocked draft), date desc.
export const loadLogs = async (uid, n = 70) => {
  const snap = await getDocs(query(logCol(uid), orderBy('date', 'desc'), limit(n)));
  return snap.docs.map((d) => d.data());
};

export const saveDraft = (uid, date, perHabit) =>
  setDoc(doc(logCol(uid), date),
    { date, locked: false, perHabit, updatedAt: serverTimestamp() },
    { merge: true });

export const lockDay = (uid, date, perHabit) =>
  setDoc(doc(logCol(uid), date),
    { date, locked: true, perHabit, createdAt: serverTimestamp() },
    { merge: true });

// ── Pure computation ────────────────────────────────────────────────────────
// All operate on the array returned by loadLogs(). Only LOCKED days count toward
// streaks (an in-progress draft doesn't extend a streak until "Done for today").

const lockedLogs = (logs) => logs.filter((l) => l.locked);

// completed count for a habit on a given locked day (0 if none / not logged).
const completedOn = (byDate, date, habitId) =>
  Number(byDate[date]?.perHabit?.[habitId]?.completed ?? 0);

// Day after the most recent locked day, or today if there are none.
export const computeCurrentDate = (logs) => {
  const locked = lockedLogs(logs);
  if (locked.length === 0) return todayStr();
  // logs are date-desc, so the first locked one is the latest.
  return addDays(locked[0].date, 1);
};

// Daily cadence: consecutive calendar days back from the latest locked day
// with completed >= 1.
export const dailyStreak = (habitId, logs) => {
  const locked = lockedLogs(logs);
  if (locked.length === 0) return 0;
  const byDate = Object.fromEntries(locked.map((l) => [l.date, l]));
  let cursor = locked[0].date;
  let streak = 0;
  while (byDate[cursor] && completedOn(byDate, cursor, habitId) >= 1) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
};

// Category cadence: consecutive calendar days back from the latest locked day on
// which AT LEAST ONE habit in the category was completed (>= 1). Independent of any
// individual habit's streak — a day counts if habit A *or* habit B was logged.
export const categoryStreak = (habitIds, logs) => {
  const locked = lockedLogs(logs);
  if (locked.length === 0) return 0;
  const byDate = Object.fromEntries(locked.map((l) => [l.date, l]));
  const ids = habitIds.length ? habitIds : null;
  if (!ids) return 0;
  const anyDoneOn = (date) => ids.some((id) => completedOn(byDate, date, id) >= 1);
  let cursor = locked[0].date;
  let streak = 0;
  while (byDate[cursor] && anyDoneOn(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
};

// sessions per ISO week for a habit (a session = a locked day with completed >= 1).
const weekSessionCounts = (habitId, logs) => {
  const counts = {};
  for (const l of lockedLogs(logs)) {
    if (completedOn({ [l.date]: l }, l.date, habitId) >= 1) {
      const wk = isoWeekKey(l.date);
      counts[wk] = (counts[wk] || 0) + 1;
    }
  }
  return counts;
};

// Sessions logged this week for `date` (for the "k / N this week" badge).
export const weekProgress = (habitId, logs, date = todayStr()) =>
  weekSessionCounts(habitId, logs)[isoWeekKey(date)] || 0;

// Weekly cadence: consecutive ISO weeks (back from the current week) with
// >= timesPerWeek sessions. The in-progress current week never breaks it.
export const weeklyStreak = (habitId, timesPerWeek, logs, today = todayStr()) => {
  const counts = weekSessionCounts(habitId, logs);
  let cursorDate = today;
  let streak = 0;
  let first = true;
  for (let i = 0; i < 220; i++) { // guard; ~70 days of logs ends it far sooner
    const met = (counts[isoWeekKey(cursorDate)] || 0) >= timesPerWeek;
    if (met) streak++;
    else if (!first) break; // a past week below target ends the run
    // else: current in-progress week not yet met — allowed, keep looking back
    first = false;
    cursorDate = addDays(cursorDate, -7);
  }
  return streak;
};

// Most recent locked day this habit was completed (>=1), or null if never.
export const lastDone = (habitId, logs) => {
  for (const l of logs) { // logs arrive date-desc from loadLogs
    if (l.locked && Number(l.perHabit?.[habitId]?.completed ?? 0) >= 1) return l.date;
  }
  return null;
};

// Daily progress bar: Σ completed / Σ target across daily-cadence, non-archived
// habits (weekly habits are excluded so rest days can still reach 100%).
export const dayProgress = (habits, perHabit) => {
  let done = 0;
  let total = 0;
  for (const h of habits) {
    if (h.archived || h.cadence !== 'daily') continue;
    const e = perHabit[h.id];
    if (!e) continue;
    done += Number(e.completed || 0);
    total += Number(e.target || 0);
  }
  return { done, total };
};

// Build the initial perHabit map for a fresh draft, seeding targets from defaults.
export const initialPerHabit = (habits) =>
  Object.fromEntries(
    habits
      .filter((h) => !h.archived)
      .map((h) => [h.id, { target: Number(h.defaultCount) || 1, completed: 0 }]),
  );
