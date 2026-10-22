# Improvement Report #003: Backend Integration, Timer Reset Fix & Emoji Removal

**Date**: 2026-10-22  
**Serial**: 003  
**Project**: Athena-Clone  
**Target Environment**: Electron + Vite + React 19 + Express Backend  

---

## 1. Executive Summary

This update resolves the critical timer/environment reset issue that occurred when clicking "Go To Test", completely removes emojis from the snapshot storage component in favor of clean SVGs, normalizes the backend folder structure, and seamlessly integrates the Express backend with both Electron and the React frontend.

---

## 2. Root Cause Analysis & Resolutions

### Issue 1: Timer and Entire State Resetting Upon "Go To Test"
- **Root Cause A (Vite File Watcher Triggering Full Page Reload)**:
  - When snapshots were written to `app/user-camera-snap/snap_*.jpg` (or sessions written to backend), Vite's dev server file watcher detected the new file inside the project root and triggered `[vite] page reload`.
  - The full page reload remounted React, abruptly stopping the media stream, exiting/losing fullscreen, resetting `elapsedSeconds` to 0, and resetting all component state.
  - **Resolution**: Configured `server.watch.ignored` in `vite.config.js` to strictly ignore `**/user-camera-snap/**`, `**/backend/**`, `**/data/**`, `**/*.json`, and snapshot image formats (`**/*.jpg`, `**/*.jpeg`, `**/*.png`).
- **Root Cause B (Unconditional `startTimestamp` Overwrite in Electron)**:
  - In `app/app.js`, `ipcMain.handle('start-timer')` was overwriting `startTimestamp = Date.now()` every time it was called, forcing `timer: 0` to be broadcast to the renderer.
  - **Resolution**: Updated `start-timer` to preserve `startTimestamp` if the timer is already active. Added `stop-timer`, `reset-timer`, and `get-timer-state` IPC handlers to provide robust lifecycle control.
- **Root Cause C (No View Transition on "Go To Test")**:
  - The setup button previously only changed its label to "Test In Progress" without transitioning to the assessment questions, allowing repeated clicks.
  - **Resolution**: Transitioned candidate into the live Exam interface with proctoring PiP preview and questions fetched from the backend.

---

### Issue 2: Removal of Emojis from Snapshot Storage
- **Changes**:
  - Removed emoji `📁` from `"📁 Choose Save Folder"` and replaced it with a crisp SVG folder icon.
  - Removed emoji `📸` from `"📸 Capture Snapshot Now"` and replaced it with a crisp SVG camera icon.
  - Replaced all notification toasts (such as `📸 Captured...` and `🚀 Test started...`) with clean, professional text accompanied by SVG indicators.

---

### Issue 3: Backend Folder Normalization & Full Integration
- **Folder Normalization**:
  - Renamed `"backend "` (which contained an accidental trailing space) to `"backend"`.
  - Installed `cors` and `express` dependencies and verified standalone execution.
- **Electron Lifecycle Integration**:
  - In `app/app.js`, added `startBackendIfNeeded()` which automatically detects if the Express server on port 3000 is running and spawns `node backend/server.js` if it is not.
  - Cleanly terminates the spawned child process on `window-all-closed` and `will-quit`.
- **Frontend Exam Workflow Integration**:
  - Added full API communication layer supporting direct `http://localhost:3000` and Vite reverse proxy `/exam/*`.
  - Implemented the full backend API flow:
    1. `POST /exam/start` creates session and returns `sessionId`.
    2. `GET /exam/mcq` retrieves questions.
    3. `POST /exam/answer` records candidate choices in real-time.
    4. `POST /exam/submit` finalizes session and computes results.
  - Created a modern assessment view with active question panel, options list, question palette navigation (1-5), and live PiP proctoring feed.
  - Added an Exam Results summary view displaying score, attempted, correct, wrong, and total proctoring snapshots.

---

## 3. Modified & Created Files

| File Path | Description of Changes |
| :--- | :--- |
| `vite.config.js` | Added watch ignore rules for snapshots and data, plus proxy for `/exam`. |
| `app/app.js` | Fixed timer reset bug, added stop/reset/get timer handlers, and integrated backend process management. |
| `app/preload.js` | Exposed `stopTimerOnMain`, `resetTimerOnMain`, and `getTimerState` to the renderer. |
| `backend/server.js` | Enabled updating answers for already answered questions before final exam submission. |
| `package.json` | Added `backend` npm script and express/cors dependencies. |
| `src/App.jsx` | Implemented full exam view, backend API integration, PiP proctoring stream, and removed all emojis from snapshot storage. |
| `src/App.css` | Styled exam navbar, PiP proctoring container, question palette, option cards, and result metrics. |
| `Improvements/003_backend_integration_and_timer_fix.md` | Serialized documentation report (this document). |
