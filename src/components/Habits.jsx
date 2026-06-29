import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Plus } from 'lucide-react';
import { auth } from '../firebase';
import { isAfterToday, formatDisplayDate } from '../lib/dates';
import {
  loadDefinitions, loadLogs, saveDraft, lockDay,
  addCategory, addHabit, updateCategory, updateHabit, reorderHabits,
  computeCurrentDate, initialPerHabit, dayProgress,
} from '../lib/habitsData';
import HabitCategory from './HabitCategory';
import HabitEditPanel from './HabitEditPanel';

// Same "DailyLog Sheet Sync" web app — now also handles type:'habits' → Sheet3.
const SHEET_SYNC_URL = 'https://script.google.com/macros/s/AKfycbwBRpPWWmP3CsvuRhS87YaXAO5HyVA6WOyiHebBnPNRsVeZ6yo6sE_4oqZH3apS099HXw/exec';

const Habits = () => {
  const [categories, setCategories] = useState([]);
  const [habits, setHabits] = useState([]);
  const [logs, setLogs] = useState([]);
  const [currentDate, setCurrentDate] = useState(null);
  const [upToDate, setUpToDate] = useState(false);
  const [perHabit, setPerHabit] = useState({});
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editPanel, setEditPanel] = useState(null); // { mode, initial } | null
  const [justLocked, setJustLocked] = useState(false);

  const saveTimer = useRef(null);

  const loadAll = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setLoading(true);
    try {
      const [{ categories, habits }, allLogs] = await Promise.all([
        loadDefinitions(uid), loadLogs(uid),
      ]);
      const current = computeCurrentDate(allLogs);
      const active = habits.filter((h) => !h.archived);
      const draft = allLogs.find((l) => l.date === current && !l.locked);
      const base = initialPerHabit(active);
      if (draft?.perHabit) {
        for (const id in draft.perHabit) if (base[id]) base[id] = draft.perHabit[id];
      }
      setCategories(categories);
      setHabits(habits);
      setLogs(allLogs);
      setCurrentDate(current);
      setUpToDate(isAfterToday(current));
      setPerHabit(base);
    } catch (e) {
      console.error('Failed to load habits:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => { if (user) loadAll(); });
    return unsub;
  }, []);

  const scheduleSave = (next) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const date = currentDate;
    saveTimer.current = setTimeout(() => {
      const uid = auth.currentUser?.uid;
      if (uid && date && !isAfterToday(date)) saveDraft(uid, date, next).catch(console.error);
    }, 600);
  };

  const onToggle = (habitId, completed) => setPerHabit((prev) => {
    const next = { ...prev, [habitId]: { ...prev[habitId], completed } };
    scheduleSave(next);
    return next;
  });

  const onAddInstance = (habitId) => setPerHabit((prev) => {
    const cur = prev[habitId] || { target: 1, completed: 0 };
    const next = { ...prev, [habitId]: { ...cur, target: cur.target + 1 } };
    scheduleSave(next);
    return next;
  });

  const activeHabits = habits.filter((h) => !h.archived);

  const handleDone = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || upToDate || !currentDate) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      await lockDay(uid, currentDate, perHabit);
    } catch (e) {
      console.error('Failed to lock day:', e);
      return;
    }
    // Mirror the day's per-habit counts to Sheet3 (best-effort, non-blocking).
    const counts = {};
    for (const h of activeHabits) counts[h.name] = perHabit[h.id]?.completed ?? 0;
    if (SHEET_SYNC_URL) {
      fetch(SHEET_SYNC_URL, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'habits', date: currentDate, counts }),
      }).catch(() => {});
    }
    setJustLocked(true);
    setTimeout(() => setJustLocked(false), 2500);
    await loadAll();
  };

  // ── Edit-mode actions ───────────────────────────────────────────────────
  const reloadDefinitions = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const defs = await loadDefinitions(uid);
    setCategories(defs.categories);
    setHabits(defs.habits);
    setPerHabit((prev) => ({ ...initialPerHabit(defs.habits.filter((h) => !h.archived)), ...prev }));
  };

  const handleSavePanel = async (data) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const { mode, initial } = editPanel;
    try {
      if (mode === 'category') {
        if (initial) await updateCategory(uid, initial.id, data);
        else await addCategory(uid, { ...data, order: categories.length });
      } else if (initial) {
        await updateHabit(uid, initial.id, data);
      } else {
        const sameCat = habits.filter((h) => h.categoryId === data.categoryId);
        await addHabit(uid, { ...data, order: sameCat.length });
      }
      setEditPanel(null);
      await reloadDefinitions();
      // Apply a default-count edit to today's open draft immediately, clamped so
      // it never drops below instances already ticked. (Locked days are untouched.)
      if (mode === 'habit' && initial && !upToDate) {
        setPerHabit((prev) => {
          const cur = prev[initial.id];
          if (!cur) return prev;
          const target = Math.max(Number(data.defaultCount) || 1, cur.completed || 0);
          if (target === cur.target) return prev;
          const next = { ...prev, [initial.id]: { ...cur, target } };
          scheduleSave(next);
          return next;
        });
      }
    } catch (e) {
      console.error('Failed to save:', e);
    }
  };

  const handleArchiveHabit = async (h) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !window.confirm(`Archive "${h.name}"? It will be hidden but its data is kept.`)) return;
    await updateHabit(uid, h.id, { archived: true });
    await reloadDefinitions();
  };

  const handleArchiveCategory = async (c) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !window.confirm(`Archive category "${c.name}"? Its habits will be hidden too.`)) return;
    await updateCategory(uid, c.id, { archived: true });
    await reloadDefinitions();
  };

  const handleReorder = async (categoryId, orderedIds) => {
    // optimistic local reorder
    setHabits((prev) => prev.map((h) => {
      const i = orderedIds.indexOf(h.id);
      return i === -1 ? h : { ...h, order: i };
    }));
    const uid = auth.currentUser?.uid;
    if (uid) await reorderHabits(uid, orderedIds).catch(console.error);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 dark:bg-gray-900">
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  const activeCategories = categories.filter((c) => !c.archived);
  const habitsOf = (catId) => activeHabits
    .filter((h) => h.categoryId === catId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const { done, total } = dayProgress(activeHabits, perHabit);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto p-4 dark:bg-gray-900 dark:text-white">
      <div className="flex items-start justify-between mb-1">
        <h1 className="text-2xl font-bold dark:text-white">Habits</h1>
        <button type="button" onClick={() => setEditMode((v) => !v)}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          {editMode ? 'Done editing' : 'Edit'}
        </button>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {upToDate
          ? "You're up to date — come back tomorrow."
          : currentDate && `Logging for: ${formatDisplayDate(currentDate)}`}
      </p>

      {!upToDate && total > 0 && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
            <span>Daily progress</span><span>{done} / {total} done</span>
          </div>
          <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {editMode && (
        <div className="flex gap-2 mb-6">
          <button type="button" onClick={() => setEditPanel({ mode: 'category', initial: null })}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800">
            <Plus size={14} /> Category
          </button>
          <button type="button" onClick={() => setEditPanel({ mode: 'habit', initial: null })}
            disabled={activeCategories.length === 0}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
            <Plus size={14} /> Habit
          </button>
        </div>
      )}

      {activeCategories.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          No habits yet. {editMode ? 'Add a category to get started.' : 'Tap "Edit" to add your first category.'}
        </p>
      ) : (
        activeCategories.map((cat) => (
          <HabitCategory
            key={cat.id} category={cat} habits={habitsOf(cat.id)} logs={logs}
            currentDate={currentDate} perHabit={perHabit} disabled={upToDate} editMode={editMode}
            onToggle={onToggle} onAddInstance={onAddInstance} onReorder={handleReorder}
            onEditHabit={(h) => setEditPanel({ mode: 'habit', initial: h })}
            onArchiveHabit={handleArchiveHabit}
            onEditCategory={(c) => setEditPanel({ mode: 'category', initial: c })}
            onArchiveCategory={handleArchiveCategory}
          />
        ))
      )}

      {!upToDate && activeHabits.length > 0 && (
        <>
          {justLocked && (
            <p className="text-green-600 dark:text-green-400 text-sm text-center mb-2">Locked!</p>
          )}
          <button type="button" onClick={handleDone}
            className="w-full p-3 mt-2 text-white rounded transition-colors bg-blue-500 hover:bg-blue-600 dark:bg-blue-700 dark:hover:bg-blue-600">
            Done for today
          </button>
        </>
      )}

      {editPanel && (
        <HabitEditPanel
          mode={editPanel.mode} initial={editPanel.initial} categories={activeCategories}
          onSave={handleSavePanel} onClose={() => setEditPanel(null)}
        />
      )}
    </div>
  );
};

export default Habits;
