// Local-time-aware date helpers, shared by the Habits page.
// Mirrors the helpers in DailyLog.jsx (copied, not refactored, to keep DailyLog
// untouched) and adds ISO-week helpers for weekly-cadence streaks.

// Date object → 'YYYY-MM-DD' in local time (avoids UTC off-by-one).
export const formatDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// 'YYYY-MM-DD' → "Mon, 29 Jun 2026"
export const formatDisplayDate = (dateStr) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
};

// 'YYYY-MM-DD' (+ n days) → 'YYYY-MM-DD'
export const addDays = (dateStr, n) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + n);
  return formatDate(d);
};

export const todayStr = () => formatDate(new Date());

export const isAfterToday = (dateStr) => dateStr > todayStr();

// ── ISO week ────────────────────────────────────────────────────────────────
// ISO-8601: weeks start Monday; week 1 is the week containing the first Thursday.
// Returns a sortable key like "2026-W27". Used to group weekly-cadence sessions.
export const isoWeekKey = (dateStr) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  // Work on a copy at local midnight.
  const d = new Date(year, month - 1, day);
  // Shift to the Thursday of this week (ISO weeks are defined by their Thursday).
  // getDay(): 0=Sun..6=Sat → ISO day 1=Mon..7=Sun.
  const isoDay = (d.getDay() + 6) % 7; // 0=Mon..6=Sun
  d.setDate(d.getDate() - isoDay + 3); // move to Thursday
  const thursday = new Date(d);
  // Week number = weeks since the first Thursday of the ISO year.
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  const firstIsoDay = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstIsoDay + 3);
  const week = 1 + Math.round((thursday - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  return `${thursday.getFullYear()}-W${String(week).padStart(2, '0')}`;
};

// Week key n weeks before the week containing dateStr.
export const addWeeks = (dateStr, n) => isoWeekKey(addDays(dateStr, n * 7));
