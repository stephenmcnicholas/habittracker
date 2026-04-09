import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';
import HabitTracker from './components/HabitTracker';
import CountdownTimer from './components/CountdownTimer';
import DarkModeToggle from './components/DarkModeToggle';
import DailyLog from './components/DailyLog';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 dark:text-white">
        <nav className="p-4 bg-white shadow dark:bg-gray-800 dark:shadow-lg">
          <div className="max-w-2xl mx-auto flex justify-between items-center">
            <span className="font-semibold text-gray-800 dark:text-white">Daily Log</span>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => signOut(auth).catch(console.error)}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Sign out
              </button>
              <DarkModeToggle />
            </div>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<DailyLog />} />
          {/* Hidden — kept for future use */}
          <Route path="/habits" element={<HabitTracker />} />
          <Route path="/timer" element={<CountdownTimer />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;