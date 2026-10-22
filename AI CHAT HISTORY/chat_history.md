# AI Chat & Development History — Athena Examination Clone

**Repository**: [OmvedNagre/athena](https://github.com/OmvedNagre/athena.git)  
**Environment**: Electron + Vite + React 19 + Express Backend  
**Date**: October 22, 2026  

---

## Session Overview

This document records the chronological history of requirements, bug analyses, engineering decisions, and implementations performed during pair programming on the Athena Examination Clone.

---

## Conversation & Milestone Log

### Milestone 1: Initial Three-Part Request

#### User Request:
> 1. Every time I press go to test the timer gets reset in fact everything, fix that error.
> 2. Remove the emojis from the snapshot storage...
> 3. I am attaching a backend folder in the file structure integrate the frontend, backend, electron move the backend folder accordingly inside the Athena-Clone folder structure.

#### Problem Investigation & Analysis:
1. **Timer and Environment Reset Root Cause**:
   - When proctoring snapshots were written to `app/user-camera-snap/snap_*.jpg`, Vite's development server watcher detected newly created files within the project root and triggered `[vite] page reload`.
   - The browser reload caused React to unmount, destroying media streams, resetting fullscreen status, and wiping all state variables (`elapsedSeconds = 0`, `testStarted = false`).
   - Additionally, `ipcMain.handle('start-timer')` in `app/app.js` unconditionally reset `startTimestamp = Date.now()` on every invocation.
2. **Snapshot Storage Emojis**:
   - `📁 Choose Save Folder` and `📸 Capture Snapshot Now` contained native emojis inconsistent with modern enterprise proctoring UI standards.
3. **Backend Integration**:
   - The attached folder had an accidental trailing space (`"backend "`).
   - The backend was an Express server providing `/exam/start`, `/exam/mcq`, `/exam/answer`, and `/exam/submit`, which had no corresponding screens in the React frontend.

#### Solutions Implemented:
- Configured `server.watch.ignored` in `vite.config.js` to strictly ignore `**/user-camera-snap/**`, `**/backend/**`, `**/data/**`, and snapshot image formats.
- Refactored `start-timer` in `app/app.js` to preserve elapsed time if already running, and added `stop-timer`, `reset-timer`, and `get-timer-state`.
- Renamed `"backend "` to `backend`, installed `express` and `cors`, and added npm scripts.
- Configured Electron to auto-launch the backend server as a background daemon if port 3000 is inactive and cleanly kill it upon app quit.
- Replaced all emojis in the snapshot storage card with clean SVG vector icons.
- Built the live Examination View in React: question rendering, radio options, question palette (1–5), live PiP webcam preview, and submission summary.
- Documented in `Improvements/003_backend_integration_and_timer_fix.md`.

---

### Milestone 2: Git Repository Setup & Push

#### User Request:
> `https://github.com/OmvedNagre/athena.git`  
> push the code to this newly made repo....

#### Actions Taken:
- Created `.gitignore` excluding `node_modules/`, `backend/node_modules/`, `dist/`, `.DS_Store`, and temporary test images while preserving the snapshot directory.
- Initialized local Git repository on `main`.
- Staged all source files, configurations, and documentation.
- Linked remote `origin` to `https://github.com/OmvedNagre/athena.git` and pushed successfully.

---

### Milestone 3: Resolving Connection Errors & Duplicate Electron Instances

#### User Query & Terminal Log:
> `npm run electron`  
> `electron: Failed to load URL: http://localhost:5173/ with error: ERR_CONNECTION_REFUSED`  
> ...  
> `when running "npm run electron"... two electron applications are being open`

#### Root Cause Analysis:
1. **`ERR_CONNECTION_REFUSED`**:
   - `electron ./app/app.js` was executed before the Vite development server had completed initialization.
2. **Two Electron App Icons in macOS Dock**:
   - In `app/app.js`, `backendProcess = spawn(process.execPath, [serverScript])` was used. In Electron, `process.execPath` is the Electron application bundle executable. Spawning it without `ELECTRON_RUN_AS_NODE: '1'` launched a second complete Electron GUI application.
   - On macOS, `window-all-closed` had a Darwin guard (`if (process.platform !== 'darwin') app.quit();`), meaning closing the window did not terminate the Electron process, causing multiple instances to accumulate.

#### Solutions Implemented:
- Enforced `app.requestSingleInstanceLock()` to restrict execution to a single instance.
- Changed backend and Vite spawning to run with `ELECTRON_RUN_AS_NODE: '1'` as pure headless daemons.
- Added `waitForServer("http://localhost:5173/")` before `loadURL()` to ensure Vite is ready and eliminate connection warnings.
- Updated `window-all-closed` to call `app.quit()` directly on macOS.
- Pushed updates to GitHub.

---

### Milestone 4: High-Contrast UI, Lockdown Mode, Mark for Review & Name Personalization

#### User Request:
> Fix this text UI highlited by selecting....make it more visible...and rest enable a function where once app is open tab switching is not allowed like even by the gesture in macOS or the cmd + tab mode....and also add a button functionality of mark for review while answering the questions  
> and change the name from Vaibhav to Omved and after all this is done  
> list the changes as instructed earlier into the Improvements folder by making a a new .md file and after that make a .md file of the chat we had and list that file under a new folder named AI CHAT HISTORY

#### Solutions Implemented:
1. **High-Contrast Proctoring Verification Card**:
   - Replaced `.proctoring-stats-banner` with `.proctoring-audit-card` featuring verified badges, high-contrast dark badges (`#0f172a`), cyan path code typography (`#38bdf8`), and global `::selection` styling.
2. **Proctoring Lockdown Mode**:
   - Enabled macOS Kiosk mode (`setKiosk(true)`), screen-saver window level (`setAlwaysOnTop(true, 'screen-saver')`), and multi-workspace visibility.
   - Intercepted `Cmd+Tab`, `Alt+Tab`, `Cmd+H`, `Cmd+M` with `globalShortcut` and `before-input-event`.
   - Added window `blur` listener that forces focus back to the exam window and logs violations.
3. **"Mark for Review" Question Answering**:
   - Added interactive "Mark for Review" toggle button with bookmark icon.
   - Configured 4-state Question Palette items (Answered, Answered & Reviewed, Reviewed, Unanswered).
   - Added marked for review counter in Palette legend and submission modal.
4. **Candidate Personalization**:
   - Updated candidate greeting and session identity from "Vaibhav" to "Omved".
5. **Documentation**:
   - Created `Improvements/004_kiosk_lockdown_mark_for_review_and_ui_enhancements.md`.
   - Created `AI CHAT HISTORY/chat_history.md` (this file).

### Milestone 5: PiP Webcam "LIVE PROCTOR" Badge Refinement

#### User Request:
> The live proctor written on my camera is too big reduce the size to a level where it is still readable and at the same time I am able to see my face

#### Analysis & Implementation:
- The previous `.pip-live-badge` was positioned at `bottom: 4px; left: 4px;` across a 140x84 container, which caused the dark banner to directly obscure the lower half of the candidate's face.
- Repositioned the badge to the **top-right** corner (`top: 5px; right: 5px;`), ensuring it sits up in the ceiling/background area without covering facial features.
- Reduced badge typography to a clean `8px` micro-badge with `padding: 2px 5px`, reduced pulsing dot size to `4px`, and increased webcam frame size to `150px x 95px` for an unobstructed face view.

---

## Final Verification Checklist

- [x] ESLint: `npm run lint` — 0 errors, 0 warnings
- [x] Production Build: `npm run build` — Clean build
- [x] Backend API Endpoints: Verified end-to-end
- [x] Single Instance Enforcement: Active
- [x] Proctoring Lockdown & Blur Recovery: Active
- [x] High-Contrast Selected Text UI: Implemented
- [x] Mark for Review Functionality: Implemented
- [x] Candidate Name: Updated to Omved
- [x] PiP Live Proctor Badge: Scaled and repositioned away from face
- [x] Dynamic Candidate Authentication: Implemented (Name & Enrollment ID requested prior to starting test)
- [x] Dynamic Session Forwarding: Dynamic payload sent to `/exam/start`
- [x] Dynamic Exam UI: Name & ID shown on navbar, sidebar telemetry, submit confirmation modal, and results screen
- [x] GitHub Synchronization: Pushed to `OmvedNagre/athena`

---

## Session Milestone: Dynamic Candidate Identification & Authentication

### User Prompt
> "Make the name instead of Omved being hard-coded to dynamic like before starting of an exam ask the student for their name and their enrollment id (instead of hard coded 101 studen id)"

### Assistant Action & Solution
1. **Interactive Candidate Input Card**:
   - Added `candidateName` and `enrollmentId` dynamic state in `src/App.jsx`.
   - Initialized to empty strings (`''`) to require the student to enter their information before launch.
   - Built a two-column input card (`.candidate-inputs-card`) with SVG icons, floating placeholders, and validation indicators.
2. **Dynamic Header & Real-time Greeting**:
   - The top welcome greeting (`Hi {candidateName.trim() || 'Student'}!`) reflects typing in real time.
3. **Four-Factor Launch Validation Gate**:
   - Updated `canStartTest` to ensure Full Name, Enrollment ID, Camera permission, and Fullscreen are all verified before "Go To Test" is unlocked.
4. **End-to-End Propagation**:
   - Passes `{ userId: enrollmentId.trim(), name: candidateName.trim() }` dynamically to `POST /exam/start`.
   - Displays dynamic credentials on the active exam navbar tag, sidebar Question Palette telemetry, Submit Confirmation modal, and Exam Results summary.
5. **Modern Styling**:
   - Added styles for `.candidate-inputs-card`, `.candidate-form-grid`, `.form-group`, `.text-input`, `.candidate-hint-text`, and `.candidate-summary-badge` in `src/App.css`.
6. **Documentation & Verification**:
   - Documented in `Improvements/005_dynamic_candidate_credentials_and_pip_badge_scaling.md`.
   - Verified clean build (`npm run build`) and ESLint (`npm run lint`).


