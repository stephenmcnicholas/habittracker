import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Archive, Flame } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { categoryStreak } from '../lib/habitsData';
import HabitRow from './HabitRow';

const collapseKey = (id) => `habits.collapsed.${id}`;

// Wraps HabitRow with dnd-kit sortable wiring (edit mode only).
const SortableHabitRow = (props) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.habit.id });
  const dnd = {
    setNodeRef,
    attributes,
    listeners,
    style: {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    },
  };
  return <HabitRow {...props} dnd={dnd} />;
};

const HabitCategory = ({
  category, habits, logs, currentDate, perHabit, disabled, editMode,
  onToggle, onAddInstance, onReorder, onEditHabit, onArchiveHabit,
  onEditCategory, onArchiveCategory,
}) => {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(collapseKey(category.id)) === '1',
  );
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(collapseKey(category.id), next ? '1' : '0');
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const ids = habits.map((h) => h.id);
    const next = arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id));
    onReorder(category.id, next);
  };

  // Streak across the whole category: any one habit logged keeps it alive.
  const catStreak = categoryStreak(habits.map((h) => h.id), logs);

  const rows = habits.map((h) => (
    <HabitRow
      key={h.id} habit={h} entry={perHabit[h.id]} logs={logs} currentDate={currentDate}
      disabled={disabled} editMode={editMode}
      onToggle={onToggle} onAddInstance={onAddInstance}
      onEdit={onEditHabit} onArchive={onArchiveHabit}
    />
  ));

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={toggleCollapsed}
            className="flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            {category.name}
          </button>
          {catStreak > 0 && (
            <span className="flex items-center gap-0.5 text-orange-500 text-sm" title="Category streak — any habit logged keeps it going">
              <Flame size={14} />{catStreak}
            </span>
          )}
        </div>
        {editMode && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onEditCategory(category)} aria-label="Edit category"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <Pencil size={14} />
            </button>
            <button type="button" onClick={() => onArchiveCategory(category)} aria-label="Archive category"
              className="text-gray-400 hover:text-red-500">
              <Archive size={14} />
            </button>
          </div>
        )}
      </div>

      {!collapsed && (
        editMode ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={habits.map((h) => h.id)} strategy={verticalListSortingStrategy}>
              {habits.map((h) => (
                <SortableHabitRow
                  key={h.id} habit={h} entry={perHabit[h.id]} logs={logs} currentDate={currentDate}
                  disabled={disabled} editMode={editMode}
                  onToggle={onToggle} onAddInstance={onAddInstance}
                  onEdit={onEditHabit} onArchive={onArchiveHabit}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : rows
      )}
    </section>
  );
};

export default HabitCategory;
