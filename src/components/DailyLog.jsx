import React, { useState, useEffect } from 'react';
import { collection, doc, getDocs, setDoc, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { SegmentedEnergySlider } from './EnergySliders';
import { CircularSleepSlider } from './EnergySliders';
import { auth, db } from '../firebase';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbynd1P4XhEhxsO_G2cgYRm2XZQt6-iTWyuk27YVVfTsXWyWFjHnSXPIWoinDLlv2rgB/exec';

// Local-time-aware date formatting — avoids UTC off-by-one errors
const formatDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDisplayDate = (dateStr) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });
};

const addDays = (dateStr, n) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + n);
  return formatDate(d);
};

const isAfterToday = (dateStr) => dateStr > formatDate(new Date());

const DailyLog = () => {
  const [formData, setFormData] = useState({ sleep: 7, energy: 3, alc: 0 });
  const [nextEntryDate, setNextEntryDate] = useState(null);
  const [upToDate, setUpToDate] = useState(false);
  const [stats, setStats] = useState({
    avgSleep: '-', avgEnergy: '-', totalAlc: '-', dryStreak: '-', stepStreak: '-'
  });
  const [recentEntries, setRecentEntries] = useState([]);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchNextDate = async (userId) => {
    const q = query(
      collection(db, 'users', userId, 'dailyLogs'),
      orderBy('date', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return formatDate(new Date());
    return addDays(snap.docs[0].data().date, 1);
  };

  const fetchStats = async (userId) => {
    const q = query(
      collection(db, 'users', userId, 'dailyLogs'),
      orderBy('date', 'desc'),
      limit(60)
    );
    const snap = await getDocs(q);
    const entries = snap.docs.map(d => d.data());
    if (entries.length === 0) return;

    const last7 = entries.slice(0, 7);
    const avgSleep   = (last7.reduce((s, e) => s + Number(e.sleep),  0) / last7.length).toFixed(1);
    const avgEnergy  = (last7.reduce((s, e) => s + Number(e.energy), 0) / last7.length).toFixed(1);
    const totalAlc   = last7.reduce((s, e) => s + Number(e.alc), 0);

    // Dry streak: walk backwards through calendar days from most recent entry
    let dryStreak = 0;
    const byDate = Object.fromEntries(entries.map(e => [e.date, e]));
    let cursor = entries[0].date;
    while (byDate[cursor] && Number(byDate[cursor].alc) === 0) {
      dryStreak++;
      cursor = addDays(cursor, -1);
    }

    setStats(prev => ({ ...prev, avgSleep, avgEnergy, totalAlc, dryStreak }));
    setRecentEntries([...last7].reverse()); // oldest first for table display
  };

  const fetchStepStreak = async () => {
    try {
      const response = await fetch(SCRIPT_URL);
      const data = await response.json();
      setStats(prev => ({ ...prev, stepStreak: data.stepStreak ?? '-' }));
    } catch {
      // step streak is best-effort — leave as '-' if unavailable
    }
  };

  const loadAll = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;
    setLoading(true);
    try {
      const [nextDate] = await Promise.all([
        fetchNextDate(userId),
        fetchStats(userId),
        fetchStepStreak(),
      ]);
      setNextEntryDate(nextDate);
      setUpToDate(isAfterToday(nextDate));
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAll(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const userId = auth.currentUser?.uid;
    if (upToDate || !nextEntryDate || !userId) return;

    try {
      await setDoc(doc(db, 'users', userId, 'dailyLogs', nextEntryDate), {
        date: nextEntryDate,
        sleep:  Number(formData.sleep),
        energy: Number(formData.energy),
        alc:    Number(formData.alc),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Failed to save daily log:', err);
      return;
    }

    setFormData({ sleep: 7, energy: 3, alc: 0 });
    await loadAll();
    setSubmitSuccess(true);
    setTimeout(() => setSubmitSuccess(false), 3000);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 dark:bg-gray-900">
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 dark:bg-gray-900 dark:text-white">
      <h1 className="text-2xl font-bold mb-1 dark:text-white">How are you today?</h1>
      {nextEntryDate && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {upToDate
            ? "You're up to date — come back tomorrow."
            : `Logging for: ${formatDisplayDate(nextEntryDate)}`}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <CircularSleepSlider
            value={formData.sleep}
            onChange={(hours) => {
              setFormData(prev => ({ ...prev, sleep: hours }));
            }}
          />
        </div>

        <div>
          <SegmentedEnergySlider
            value={formData.energy}
            onChange={(e) => setFormData(prev => ({ ...prev, energy: Number(e.target.value) }))}
          />
        </div>

        <div className="flex items-center space-x-3">
          <label className="font-semibold dark:text-white text-lg">Alcohol</label>
            <input
              type="number"
              value={formData.alc}
              onChange={(e) => setFormData(prev => ({ ...prev, alc: Number(e.target.value) }))}
              min="0"
              className="w-20 p-2 border items-center rounded dark:bg-gray-700 dark:text-white dark:border-gray-600"
            />
        </div>

        {submitSuccess && (
          <p className="text-green-600 dark:text-green-400 text-sm text-center mb-2">Saved!</p>
        )}
        <button
          type="submit"
          disabled={upToDate}
          className={`w-full p-3 text-white rounded transition-colors
            ${upToDate
              ? 'bg-gray-400 cursor-not-allowed dark:bg-gray-600'
              : 'bg-blue-500 hover:bg-blue-600 dark:bg-blue-700 dark:hover:bg-blue-600'
            }`}
        >
          Submit
        </button>
      </form>

      <div className="mt-8 p-6 bg-gray-50 rounded-lg dark:bg-gray-800">
        <div className="stats-grid grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white p-4 rounded shadow dark:bg-gray-700">
            <h3 className="text-gray-600 dark:text-gray-300">Step Streak</h3>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.stepStreak}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">days</div>
          </div>
          <div className="bg-white p-4 rounded shadow dark:bg-gray-700">
            <h3 className="text-gray-600 dark:text-gray-300">Dry Streak</h3>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.dryStreak}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">days</div>
          </div>
        </div>

        <h2 className="text-xl font-bold mb-4 dark:text-white">Last 7 Days</h2>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded shadow dark:bg-gray-700">
            <h3 className="text-gray-600 dark:text-gray-300">Average Sleep</h3>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.avgSleep}</div>
          </div>
          <div className="bg-white p-4 rounded shadow dark:bg-gray-700">
            <h3 className="text-gray-600 dark:text-gray-300">Average Energy</h3>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.avgEnergy}</div>
          </div>
          <div className="bg-white p-4 rounded shadow dark:bg-gray-700">
            <h3 className="text-gray-600 dark:text-gray-300">Total Alcohol</h3>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.totalAlc}</div>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-4 dark:text-white">Recent Entries</h3>
          <table className="w-full border-collapse dark:border-gray-600">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-700">
                <th className="border p-2 dark:border-gray-600 dark:text-white">Date</th>
                <th className="border p-2 dark:border-gray-600 dark:text-white">Sleep</th>
                <th className="border p-2 dark:border-gray-600 dark:text-white">Energy</th>
                <th className="border p-2 dark:border-gray-600 dark:text-white">Alcohol</th>
              </tr>
            </thead>
            <tbody>
              {recentEntries.map((entry) => (
                <tr key={entry.date} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="border p-2 dark:border-gray-600 dark:text-white">{formatDisplayDate(entry.date)}</td>
                  <td className="border p-2 dark:border-gray-600 dark:text-white">{entry.sleep}</td>
                  <td className="border p-2 dark:border-gray-600 dark:text-white">{entry.energy}</td>
                  <td className="border p-2 dark:border-gray-600 dark:text-white">{entry.alc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DailyLog;
