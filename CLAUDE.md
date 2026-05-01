# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (Vite with HMR) at localhost:5173/habittracker/
npm run build     # Production build to /dist
npm run lint      # Run ESLint
npm run preview   # Preview production build locally
npm run deploy    # Build + deploy to GitHub Pages
```

No test runner is configured.

## Architecture

React 19 SPA using Vite, Tailwind CSS (dark mode via `class` strategy), and HashRouter (required for GitHub Pages hosting at `/habittracker/`).

### Routing (`App.jsx`)

Three routes rendered inside a persistent nav bar with a dark mode toggle:
- `/` → `HabitTracker` — weekly habit grid, streak stats, add/toggle habits
- `/timer` → `CountdownTimer` — reads `?minutes=N` query param from habit click
- `/dailylog` → `DailyLog` — sleep/energy/alcohol logging

### Data

- **Habits** (`HabitTracker.jsx`): Firebase Firestore (`firebase.js` exports `db`). Collection: `habits`, documents with `name`, `minutes`, `entries` (object keyed by ISO date strings → `true`), `createdAt`.
- **Daily log** (`DailyLog.jsx`): Google Sheets via Apps Script URL using `fetch` with `mode: 'no-cors'`. No Firebase.

There is no global state management — each component manages its own state with `useState`/`useRef`. Data is fetched directly in components via `getDocs`/`addDoc`/`updateDoc`.

### Dark Mode

`DarkModeToggle.jsx` persists preference to `localStorage` and adds/removes the `dark` class on `<html>`. Tailwind's `dark:` variants handle the visual switching.

### Custom UI Components (`EnergySliders.jsx`)

Two SVG/drag-based components: `SegmentedEnergySlider` (5-segment color gradient) and `CircularSleepSlider` (SVG arc, 0–12 hours at 0.25 precision). Both support mouse and touch events.
