import { GripVertical, Flame, Plus, Check, Pencil, Archive, History } from 'lucide-react';
import { dailyStreak, weeklyStreak, weekProgress, lastDone } from '../lib/habitsData';
import { todayStr, daysBetween, shortDate } from '../lib/dates';

// One toggleable instance. Sequential fill: completed shows a tick, pending shows
// its index. Tapping instance i fills up to i (or clears from i if already done).
const Toggle = ({ index, completed, disabled, onClick }) => {
  const done = index < completed;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={done ? `Instance ${index + 1} done` : `Mark instance ${index + 1}`}
      className={`w-10 h-10 rounded-lg border flex items-center justify-center text-sm font-medium transition-colors
        ${done
          ? 'border-green-500 bg-green-500/10 text-green-500'
          : 'border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-400 dark:hover:border-gray-500'}`}
    >
      {done ? <Check size={18} /> : index + 1}
    </button>
  );
};

// Presentational. `dnd` (optional) carries dnd-kit refs/listeners for the drag handle.
const HabitRow = ({
  habit, entry, logs, currentDate, disabled, editMode,
  onToggle, onAddInstance, onEdit, onArchive, dnd,
}) => {
  const target = entry?.target ?? (Number(habit.defaultCount) || 1);
  const completed = entry?.completed ?? 0;

  const streak = habit.cadence === 'weekly'
    ? weeklyStreak(habit.id, habit.timesPerWeek, logs, currentDate)
    : dailyStreak(habit.id, logs);
  const weekDone = habit.cadence === 'weekly'
    ? weekProgress(habit.id, logs, currentDate)
    : null;

  // When the streak is broken, show when it was last logged (muted, no guilt cue).
  const last = streak > 0 ? null : lastDone(habit.id, logs);
  let lastLabel = null;
  if (last) {
    const d = daysBetween(last, todayStr());
    lastLabel = d <= 1 ? 'yesterday' : d <= 6 ? `${d}d ago` : shortDate(last);
  }

  const handleToggle = (i) => onToggle(habit.id, i < completed ? i : i + 1);

  return (
    <div
      ref={dnd?.setNodeRef}
      style={dnd?.style}
      className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 mb-2"
    >
      <div className="flex items-start gap-2">
        {editMode && dnd && (
          <button
            type="button"
            className="mt-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-grab active:cursor-grabbing touch-none"
            aria-label="Drag to reorder"
            {...dnd.attributes}
            {...dnd.listeners}
          >
            <GripVertical size={16} />
          </button>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold truncate dark:text-white">{habit.name}</div>
            <div className="flex items-center gap-2 shrink-0">
              {streak > 0 ? (
                <span className="flex items-center gap-0.5 text-orange-500 text-sm" title="Current streak">
                  <Flame size={14} />{streak}
                </span>
              ) : lastLabel ? (
                <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-xs"
                  title={`Last logged ${shortDate(last)}`}>
                  <History size={13} />{lastLabel}
                </span>
              ) : null}
              {editMode && (
                <>
                  <button type="button" onClick={() => onEdit(habit)} aria-label="Edit habit"
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    <Pencil size={14} />
                  </button>
                  <button type="button" onClick={() => onArchive(habit)} aria-label="Archive habit"
                    className="text-gray-400 hover:text-red-500">
                    <Archive size={14} />
                  </button>
                </>
              )}
            </div>
          </div>

          {habit.description && (
            <div className="text-xs italic text-gray-500 dark:text-gray-400">{habit.description}</div>
          )}
          {habit.cadence === 'weekly' && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {weekDone} / {habit.timesPerWeek} this week
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-2">
            {Array.from({ length: target }).map((_, i) => (
              <Toggle key={i} index={i} completed={completed} disabled={disabled}
                onClick={() => handleToggle(i)} />
            ))}
            {!disabled && (
              <button type="button" onClick={() => onAddInstance(habit.id)} aria-label="Add an instance"
                className="w-10 h-10 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex items-center justify-center">
                <Plus size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HabitRow;
