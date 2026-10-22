# Improvement Report #002: Resolution of Overlapping Rules Dialogs

**Date**: 2026-10-22  
**Serial**: 002  
**Project**: Athena-Clone 2  
**Target Environment**: Electron + Vite + React 19  

---

## 1. Problem Description
When clicking the single **`Show Rule's`** button, two modal dialogs were simultaneously triggered:
1. An Electron native OS message box (`dialog.showMessageBox`) via `window.athena.showRules()`.
2. A React in-app modal overlay with blurred backdrop (`showRulesModal`).

Because both were being invoked inside `handleShowRules()`, the dark OS native dialog popped up directly on top of the in-app modal, visually obscuring the exam guidelines and creating a jarring user experience.

---

## 2. Root Cause
In `src/App.jsx`, `handleShowRules` was executing:
```javascript
const handleShowRules = () => {
  if (window.athena?.showRules) {
    window.athena.showRules(); // Triggered native OS dialog
  }
  setShowRulesModal(true);     // Triggered in-app React modal
};
```
Both fired concurrently on a single click, causing the OS alert to overlay the React modal.

---

## 3. Resolution
- **Updated `handleShowRules` in `src/App.jsx`**:
  - Removed the automatic invocation of the blocking OS alert box.
  - Now exclusively triggers the modern in-app modal with formatted guidelines, custom typography, backdrop blur, numbered cards, and the `"I Understand & Agree"` dismissal button.
- **Result**:
  - Clicking **`Show Rule's`** now cleanly renders only the in-app modal without any OS popups obscuring the screen.

---

## 4. Verification
- Code validated through Vite HMR live update.
- Linted with `npm run lint`: 0 errors, 0 warnings.
- Tested UI presentation: clean single modal presentation with full readability.
