import { useState } from 'react';

// Modal form for add/edit of a category or a habit.
// mode: 'category' | 'habit'. `initial` is the entity being edited, or null to add.
const HabitEditPanel = ({ mode, initial, categories, onSave, onClose }) => {
  const isHabit = mode === 'habit';
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [defaultCount, setDefaultCount] = useState(initial?.defaultCount ?? 1);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? categories[0]?.id ?? '');
  const [cadence, setCadence] = useState(initial?.cadence ?? 'daily');
  const [timesPerWeek, setTimesPerWeek] = useState(initial?.timesPerWeek ?? 3);

  const title = `${initial ? 'Edit' : 'Add'} ${isHabit ? 'habit' : 'category'}`;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (isHabit) {
      onSave({
        name: name.trim(),
        description: description.trim(),
        defaultCount: Math.max(1, Number(defaultCount) || 1),
        categoryId,
        cadence,
        timesPerWeek: cadence === 'weekly' ? Math.max(1, Number(timesPerWeek) || 1) : null,
      });
    } else {
      onSave({ name: name.trim() });
    }
  };

  const field = 'w-full p-2 border rounded dark:bg-gray-700 dark:text-white dark:border-gray-600';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-lg font-bold dark:text-white">{title}</h2>

        <label className="block">
          <span className="text-sm text-gray-600 dark:text-gray-300">Name</span>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>

        {isHabit && (
          <>
            <label className="block">
              <span className="text-sm text-gray-600 dark:text-gray-300">Description</span>
              <input className={field} value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. ×10 slow breaths" />
            </label>

            <label className="block">
              <span className="text-sm text-gray-600 dark:text-gray-300">Category</span>
              <select className={field} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-sm text-gray-600 dark:text-gray-300">Default count (instances/day)</span>
              <input type="number" min="1" className={field} value={defaultCount}
                onChange={(e) => setDefaultCount(e.target.value)} />
            </label>

            <label className="block">
              <span className="text-sm text-gray-600 dark:text-gray-300">Cadence</span>
              <select className={field} value={cadence} onChange={(e) => setCadence(e.target.value)}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly (target sessions/week)</option>
              </select>
            </label>

            {cadence === 'weekly' && (
              <label className="block">
                <span className="text-sm text-gray-600 dark:text-gray-300">Times per week</span>
                <input type="number" min="1" className={field} value={timesPerWeek}
                  onChange={(e) => setTimesPerWeek(e.target.value)} />
              </label>
            )}
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
            Cancel
          </button>
          <button type="submit"
            className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">
            Save
          </button>
        </div>
      </form>
    </div>
  );
};

export default HabitEditPanel;
