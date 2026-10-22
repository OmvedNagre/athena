# Improvement Report #005: Dynamic Candidate Credentials & Session Authentication

**Date**: 2026-10-22  
**Serial**: 005  
**Project**: Athena-Clone  
**Target Environment**: Electron + Vite + React 19 + Express Backend  

---

## 1. Executive Summary

This release resolves the static, hard-coded candidate credentials ("Omved" and "student-101"), replacing them with a fully dynamic candidate authentication system. 

Before starting an assessment, candidates are prompted to enter their **Full Name** and **Student Enrollment ID** on the initial Setup / Verification screen. The entered credentials dynamically configure greeting headers, authenticate the test session with the backend (`POST /exam/start`), and persist throughout the active exam navbar, Question Palette telemetry, submission confirmation dialog, and final score summary.

---

## 2. Detailed Changes

### Item 1: Candidate Identification Input Form (`src/App.jsx` & `src/App.css`)
- **Interactive Form Inputs**:
  - Embedded a dedicated `.candidate-inputs-card` into the pre-exam Setup view preceding the camera and fullscreen permission items.
  - Provided two distinct input fields:
    1. **Full Name** (`#studentName`): text input with avatar icon, real-time value binding to `candidateName`.
    2. **Enrollment ID / Student ID** (`#enrollmentId`): text input with badge icon, real-time value binding to `enrollmentId`.
  - Added clean placeholder guidance (`e.g. Omved Nagre`, `e.g. ENROLL-2026-101`) and red asterisks (`*`) denoting required status.
- **Dynamic Greeting Reactivity**:
  - The top greeting title now dynamically renders `Hi {candidateName.trim() || 'Student'}!`, reacting in real time as the candidate enters their name.

---

### Item 2: Multi-Factor Launch Gate Validation
- **Requirement Verification**:
  - Test launch (`canStartTest`) now strictly requires 4 conditions before the **Go To Test** action button unlocks:
    1. `candidateName.trim().length > 0` (Student name provided)
    2. `enrollmentId.trim().length > 0` (Student ID / Enrollment number provided)
    3. `cameraEnabled === true` (Webcam initialized and active)
    4. `fullScreen === true` (Kiosk / Fullscreen proctoring mode granted)
  - When either credential field is blank, an inline warning pill (`.candidate-hint-text`) informs the user: *"Please enter your Name and Enrollment ID to enable test launch."*

---

### Item 3: End-to-End Dynamic Credential Propagation
- **Backend Session Creation (`POST /exam/start`)**:
  - Transmits dynamic credentials in the request body payload:
    ```javascript
    body: JSON.stringify({
      userId: trimmedEnrollment,
      name: trimmedName,
    })
    ```
- **Live Exam Navigation Bar**:
  - Displays `Candidate: {candidateName.trim()} ({enrollmentId.trim()})` alongside the real-time proctoring stopwatch.
- **Question Palette Sidebar Telemetry**:
  - Lists the live **Candidate Name** and **Enrollment ID** in the telemetry summary block.
- **Exam Submit Confirmation Modal**:
  - Summarizes the candidate's name and monospace enrollment ID alongside question attempt counts before final submission.
- **Exam Submission Results View**:
  - Displays a clean `.candidate-summary-badge` featuring the student's name, bullet separator, and formatted ID under the celebration banner.

---

### Item 4: Modern Design System Additions (`src/App.css`)
- Added `.candidate-inputs-card` with an icon header box (`.icon-box-sm`).
- Added responsive two-column grid layout (`.candidate-form-grid`) that collapses to a single column on smaller screens.
- Implemented high-contrast inputs (`.text-input`) with focused state ring effects (`rgba(37, 99, 235, 0.15)`), distinct border transitions, and icon prefixes.
- Styled `.candidate-summary-badge` with rounded pill borders and monospace enrollment typography.

---

## 3. Verification & Quality Assurance

| Test Suite | Command | Result |
| :--- | :--- | :--- |
| ESLint Rules | `npm run lint` | Pass (0 errors, 0 warnings) |
| Production Build | `npm run build` | Pass (Built clean Vite bundle) |
| Dynamic Credentials | Form Input Test | Verified (Real-time reactivity) |
| Pre-flight Validation | Launch Gate | Verified (Blocked until all 4 criteria met) |
| Backend Integration | `POST /exam/start` | Verified (Dynamic payload forwarded) |
