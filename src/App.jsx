import { useEffect, useRef, useState } from 'react';
import './App.css';

const BACKEND_URL = 'http://localhost:3000';

async function apiRequest(endpoint, options = {}) {
  try {
    const res = await fetch(`${BACKEND_URL}${endpoint}`, options);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `HTTP error ${res.status}`);
    }
    return await res.json();
  } catch (primaryErr) {
    // Fallback to relative path (handled by Vite proxy if direct fails)
    try {
      const fallbackRes = await fetch(endpoint, options);
      if (!fallbackRes.ok) {
        const errData = await fallbackRes.json().catch(() => ({}));
        throw new Error(errData.message || `HTTP error ${fallbackRes.status}`, { cause: primaryErr });
      }
      return await fallbackRes.json();
    } catch (fallbackErr) {
      throw new Error(`API Request to ${endpoint} failed`, { cause: fallbackErr });
    }
  }
}

function App() {
  // Navigation / View State: 'setup' | 'exam' | 'submitted'
  const [currentView, setCurrentView] = useState('setup');

  // Permissions & Proctoring State
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [testStarted, setTestStarted] = useState(false);
  const [isTicking, setIsTicking] = useState(false);
  const [saveFolder, setSaveFolder] = useState('app/user-camera-snap');
  const [feedbackNotice, setFeedbackNotice] = useState(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [snapshotCount, setSnapshotCount] = useState(0);

  // Exam & Backend Data State
  const [sessionId, setSessionId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({}); // { [questionId]: selectedOptionIndex }
  const [examResult, setExamResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState(null);

  // References for Camera Stream
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    // 1. Sync initial snapshot folder from Electron main process
    if (window.athena?.getSnapshotFolder) {
      window.athena.getSnapshotFolder().then((folder) => {
        if (folder) setSaveFolder(folder);
      });
    }

    // 2. Sync timer state if already running in main
    if (window.athena?.getTimerState) {
      window.athena.getTimerState().then((state) => {
        if (state?.isRunning) {
          setElapsedSeconds(state.elapsedSeconds || 0);
          setTestStarted(true);
        }
      });
    }

    // 3. Register Listener for handling Timer Tick from Main
    let removeTimerTickListener = () => {};
    if (window.athena?.registerListenerForTimerTickFromMain) {
      removeTimerTickListener = window.athena.registerListenerForTimerTickFromMain((seconds) => {
        const sec = Math.floor(Number(seconds) || 0);
        setElapsedSeconds(sec);
        setIsTicking(true);
        setTimeout(() => setIsTicking(false), 200);
      });
    }

    // 4. Register Listener for handling Camera Snap Request from Main (every 5 seconds)
    let removeCameraSnapListener = () => {};
    if (window.athena?.registerListenerForCameraSnapFromMain) {
      removeCameraSnapListener = window.athena.registerListenerForCameraSnapFromMain(() => {
        saveVideoScreenShots();
      });
    }

    // 5. Fullscreen change listener to sync state if candidate exits via ESC
    const handleFullscreenChange = () => {
      setFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      removeTimerTickListener();
      removeCameraSnapListener();
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Ensure video element remains bound to the active camera stream across view switches
  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
    }
  }, [currentView, cameraEnabled]);

  // Format integer seconds into MM:SS digital clock
  const formatClock = (totalSec) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  async function getCameraAccess() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraEnabled(true);
      setFeedbackNotice('Camera connected successfully');
      setTimeout(() => setFeedbackNotice(null), 3000);
    } catch (error) {
      console.error('Camera access error:', error);
      alert('Could not access Camera. Please ensure permissions are granted.');
    }
  }

  async function enableFullScreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setFullScreen(true);
      }
    } catch (error) {
      console.error('Fullscreen request error:', error);
      alert('Cannot access full screen mode.');
    }
  }

  async function handleSelectFolder() {
    if (window.athena?.selectSnapshotFolder) {
      try {
        const chosen = await window.athena.selectSnapshotFolder();
        if (chosen) {
          setSaveFolder(chosen);
          setFeedbackNotice(`Snapshot folder updated: ${chosen}`);
          setTimeout(() => setFeedbackNotice(null), 4000);
        }
      } catch (err) {
        console.error('Folder selection failed:', err);
      }
    }
  }

  async function saveVideoScreenShots() {
    if (!videoRef.current || !videoRef.current.srcObject) {
      return;
    }

    try {
      const track = videoRef.current.srcObject.getVideoTracks()[0];
      if (!track) return;

      let arrayBuffer = null;

      // 1. Try ImageCapture API
      if (typeof ImageCapture !== 'undefined') {
        try {
          const imageCapture = new ImageCapture(track);
          const blob = await imageCapture.takePhoto();
          arrayBuffer = await blob.arrayBuffer();
        } catch {
          arrayBuffer = null;
        }
      }

      // 2. High-performance canvas fallback
      if (!arrayBuffer && videoRef.current) {
        const video = videoRef.current;
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
          if (blob) {
            arrayBuffer = await blob.arrayBuffer();
          }
        }
      }

      // 3. Send raw binary to Electron main process
      if (arrayBuffer && window.athena?.storeCameraSnapImageOnDisk) {
        const res = await window.athena.storeCameraSnapImageOnDisk(arrayBuffer);
        setSnapshotCount((prev) => prev + 1);
        const name = res?.fileName || `snap_${Date.now()}.jpg`;
        setFeedbackNotice(`Captured: ${name} (5s interval)`);
        setTimeout(() => setFeedbackNotice(null), 3000);
      }
    } catch (error) {
      console.error('Failed to capture snapshot:', error);
    }
  }

  // Start Test & Transition to Exam View
  const handleStartTest = async () => {
    if (!cameraEnabled || !fullScreen) return;
    if (isLoading) return;

    setIsLoading(true);
    setApiError(null);

    try {
      // 1. Start Electron timer & 5-second snapshot monitoring (does not reset if already running)
      if (window.athena?.startTimerOnMain) {
        await window.athena.startTimerOnMain();
      }

      // 2. Create session on Express Backend
      const sessionData = await apiRequest('/exam/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'student-101', name: 'Vaibhav' }),
      });

      setSessionId(sessionData.sessionId);

      // 3. Fetch questions from Express Backend
      const questionsData = await apiRequest('/exam/mcq');
      setQuestions(questionsData);
      setCurrentQuestionIndex(0);
      setTestStarted(true);
      setCurrentView('exam');

      setFeedbackNotice('Exam session started. Timer & snapshot monitoring active.');
      setTimeout(() => setFeedbackNotice(null), 3500);
    } catch (error) {
      console.error('Start test error:', error);
      setApiError('Unable to connect to exam backend. Please ensure backend is running.');
      setFeedbackNotice(`Error: ${error.message}`);
      setTimeout(() => setFeedbackNotice(null), 4000);
    } finally {
      setIsLoading(false);
    }
  };

  // Submit Answer to Backend
  const handleSelectAnswer = async (questionId, optionIndex) => {
    if (!sessionId) return;

    // Optimistically update local answer state
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionIndex,
    }));

    try {
      await apiRequest('/exam/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          questionId,
          selectedAnswer: optionIndex,
        }),
      });
    } catch (err) {
      console.error('Answer submission failed:', err);
    }
  };

  // Submit Complete Exam
  const handleConfirmSubmit = async () => {
    if (!sessionId) return;
    setIsLoading(true);

    try {
      const res = await apiRequest('/exam/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      // Stop Electron timer and snapshot interval cleanly
      if (window.athena?.stopTimerOnMain) {
        await window.athena.stopTimerOnMain();
      }

      setExamResult(res.result);
      setShowSubmitModal(false);
      setCurrentView('submitted');
      setFeedbackNotice('Exam submitted successfully.');
      setTimeout(() => setFeedbackNotice(null), 4000);
    } catch (err) {
      console.error('Exam submission failed:', err);
      setFeedbackNotice(`Submission failed: ${err.message}`);
      setTimeout(() => setFeedbackNotice(null), 4000);
    } finally {
      setIsLoading(false);
    }
  };

  // Reset & Return to Setup
  const handleReturnToSetup = async () => {
    if (window.athena?.resetTimerOnMain) {
      await window.athena.resetTimerOnMain();
    }
    setElapsedSeconds(0);
    setTestStarted(false);
    setSessionId(null);
    setQuestions([]);
    setAnswers({});
    setCurrentQuestionIndex(0);
    setExamResult(null);
    setCurrentView('setup');
  };

  const handleShowRules = () => {
    setShowRulesModal(true);
  };

  // Total attempted answers count
  const answeredCount = Object.keys(answers).length;
  const currentQuestion = questions[currentQuestionIndex];

  return (
    <div className={currentView === 'setup' ? 'page-wrapper' : 'exam-page-wrapper'}>
      {/* Toast Feedback Notification */}
      {feedbackNotice && (
        <div className="toast-notice">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>{feedbackNotice}</span>
          <button
            type="button"
            onClick={() => setFeedbackNotice(null)}
            className="toast-close-btn"
          >
            ✕
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW 1: PERMISSIONS & SETUP SCREEN (Matches Reference UI) */}
      {/* ======================================================== */}
      {currentView === 'setup' && (
        <>
          {/* Top Greeting Header */}
          <header className="header-section">
            <h1 className="header-title">Hi Vaibhav!</h1>
            <p className="header-subtitle">Kindly Allow the following Permissions to Start the test:</p>
          </header>

          {/* Main Permissions Card */}
          <div className="card-container">
            {/* Section 1: Configure Camera */}
            <div className="permission-item">
              <div className="icon-box">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>

              <div className="permission-content">
                <h3 className="permission-heading">Configure Camera</h3>
                <p className="permission-desc">Kindly configure Camera to attempt quiz/contests.</p>

                <div className="action-row">
                  <button
                    type="button"
                    className={`btn ${cameraEnabled ? 'btn-connected' : 'btn-black'}`}
                    disabled={cameraEnabled}
                    onClick={getCameraAccess}
                  >
                    {cameraEnabled ? (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Camera Connected
                      </>
                    ) : (
                      'Get Camera Access'
                    )}
                  </button>

                  {/* STRICT FIXED SIZE CAMERA CONTAINER (280x160) */}
                  <div className="camera-box-container">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="video-stream-element"
                      style={{ display: cameraEnabled ? 'block' : 'none' }}
                    />

                    {cameraEnabled ? (
                      <div className="live-badge">
                        <span className="live-dot"></span>
                        LIVE
                      </div>
                    ) : (
                      <div className="camera-placeholder">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="1" y1="1" x2="23" y2="23" />
                          <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56" />
                        </svg>
                        <span className="camera-placeholder-text">Camera Inactive</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="divider"></div>

            {/* Section 2: Switch to full screen */}
            <div className="permission-item">
              <div className="icon-box">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              </div>

              <div className="permission-content">
                <h3 className="permission-heading">Switch to full screen</h3>
                <p className="permission-desc">Kindly close all tabs and switch to full screen</p>

                <button
                  type="button"
                  className={`btn ${fullScreen ? 'btn-success' : 'btn-primary'}`}
                  disabled={fullScreen}
                  onClick={enableFullScreen}
                >
                  {fullScreen ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Full Screen Enabled
                    </>
                  ) : (
                    'Give Full Screen Permissions'
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Primary Actions */}
          <div className="bottom-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!cameraEnabled || !fullScreen || isLoading}
              onClick={handleStartTest}
              style={{ minWidth: '130px' }}
            >
              {isLoading ? 'Connecting...' : 'Go To Test'}
            </button>

            <button
              type="button"
              className="btn btn-outline"
              onClick={handleShowRules}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              Show Rule's
            </button>
          </div>

          {apiError && (
            <div className="api-error-banner">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{apiError}</span>
            </div>
          )}

          {/* Proctoring & Clockwork Monitoring Card */}
          <div className="proctoring-card">
            <div className="proctoring-grid">
              {/* Proper Clockwork Timer */}
              <div className="clock-section">
                <div className="clock-header">
                  <span className="clock-label">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    Elapsed Time
                  </span>
                  <span className={`clock-status-pill ${testStarted ? 'active' : ''}`}>
                    {testStarted ? 'Active' : 'Idle'}
                  </span>
                </div>

                <div className="clock-display">
                  <span className="clock-digits">{formatClock(elapsedSeconds)}</span>
                  <span className="clock-unit">
                    {elapsedSeconds}s elapsed
                    <span className={`clock-tick-indicator ${isTicking ? 'ticking' : ''}`} />
                  </span>
                </div>
              </div>

              {/* Snapshot Folder & Controls (NO EMOJIS) */}
              <div className="snapshot-section">
                <div className="snapshot-header">
                  <span className="snapshot-title">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    Snapshot Storage
                  </span>
                  <span className="interval-badge">Auto: Every 5s</span>
                </div>

                <div className="folder-box">
                  <span className="folder-path-label">Destination Folder:</span>
                  <div className="folder-path-display" title={saveFolder}>
                    {saveFolder}
                  </div>
                </div>

                <div className="snapshot-action-buttons">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={handleSelectFolder}
                    title="Select a directory to store snapshots"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    <span>Choose Save Folder</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-black btn-sm"
                    onClick={saveVideoScreenShots}
                    disabled={!cameraEnabled}
                    title="Manually capture snapshot"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    <span>Capture Snapshot Now</span>
                  </button>

                  {snapshotCount > 0 && (
                    <span className="snapshot-count-pill">
                      {snapshotCount} saved
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ======================================================== */}
      {/* VIEW 2: LIVE EXAMINATION SCREEN (MCQ Questions Flow)      */}
      {/* ======================================================== */}
      {currentView === 'exam' && (
        <div className="exam-interface-container">
          {/* Top Exam Navigation Bar */}
          <nav className="exam-navbar">
            <div className="exam-brand">
              <div className="brand-badge">ATHENA</div>
              <div className="brand-info">
                <span className="exam-main-title">Assessment Test</span>
                <span className="exam-candidate-tag">Candidate: Vaibhav (student-101)</span>
              </div>
            </div>

            {/* Middle Live Clockwork Stopwatch */}
            <div className="exam-timer-pill">
              <span className="pulse-recording-dot"></span>
              <span className="timer-label">Time Elapsed:</span>
              <span className="timer-digits">{formatClock(elapsedSeconds)}</span>
            </div>

            {/* Right Side: Compact Live Proctoring Video & Actions */}
            <div className="exam-nav-right">
              {/* Compact Fixed Proctoring Video Box (140x84) */}
              <div className="exam-pip-camera">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="pip-video-element"
                />
                <div className="pip-live-badge">
                  <span className="pip-live-dot"></span>
                  LIVE PROCTOR
                </div>
              </div>

              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleShowRules}
                title="View Rules"
              >
                Show Rule's
              </button>

              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowSubmitModal(true)}
              >
                Submit Exam
              </button>
            </div>
          </nav>

          {/* Exam Main Content Layout */}
          <div className="exam-body-grid">
            {/* Left Column: Active MCQ Question Card */}
            <main className="question-main-panel">
              {currentQuestion ? (
                <div className="question-card">
                  <div className="question-card-header">
                    <span className="question-badge">
                      Question {currentQuestionIndex + 1} of {questions.length}
                    </span>
                    <span className={`status-pill ${answers[currentQuestion.id] !== undefined ? 'answered' : 'unanswered'}`}>
                      {answers[currentQuestion.id] !== undefined ? 'Answered' : 'Not Answered'}
                    </span>
                  </div>

                  <h2 className="question-title">
                    {currentQuestion.question}
                  </h2>

                  {/* Options List */}
                  <div className="options-container">
                    {currentQuestion.options.map((optText, optIdx) => {
                      const isSelected = answers[currentQuestion.id] === optIdx;
                      const optLabel = String.fromCharCode(65 + optIdx); // A, B, C, D
                      return (
                        <div
                          key={optIdx}
                          className={`option-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleSelectAnswer(currentQuestion.id, optIdx)}
                        >
                          <div className={`option-selector ${isSelected ? 'selected' : ''}`}>
                            {optLabel}
                          </div>
                          <span className="option-text">{optText}</span>
                          {isSelected && (
                            <svg className="option-check-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Question Action Buttons */}
                  <div className="question-card-footer">
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={currentQuestionIndex === 0}
                      onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                    >
                      ← Previous
                    </button>

                    <div style={{ display: 'flex', gap: '10px' }}>
                      {currentQuestionIndex < questions.length - 1 ? (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => setCurrentQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                        >
                          Save & Next →
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-success"
                          onClick={() => setShowSubmitModal(true)}
                        >
                          Finish & Submit
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="loading-box">
                  <div className="loading-spinner"></div>
                  <p>Loading questions from backend...</p>
                </div>
              )}
            </main>

            {/* Right Column: Question Navigator Palette */}
            <aside className="question-sidebar">
              <div className="palette-card">
                <h3 className="palette-title">Question Palette</h3>

                <div className="palette-grid">
                  {questions.map((q, idx) => {
                    const isAnswered = answers[q.id] !== undefined;
                    const isCurrent = idx === currentQuestionIndex;
                    return (
                      <button
                        key={q.id}
                        type="button"
                        className={`palette-item ${isAnswered ? 'answered' : ''} ${isCurrent ? 'current' : ''}`}
                        onClick={() => setCurrentQuestionIndex(idx)}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>

                <div className="palette-legend">
                  <div className="legend-item">
                    <span className="legend-dot answered"></span>
                    <span>Answered ({answeredCount})</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot unanswered"></span>
                    <span>Unanswered ({questions.length - answeredCount})</span>
                  </div>
                </div>

                <div className="proctoring-summary-box">
                  <span className="proctoring-summary-title">Proctoring Telemetry</span>
                  <div className="telemetry-row">
                    <span>Snapshots Recorded:</span>
                    <strong>{snapshotCount}</strong>
                  </div>
                  <div className="telemetry-row">
                    <span>Proctoring Frequency:</span>
                    <strong>Every 5s</strong>
                  </div>
                  <div className="telemetry-row">
                    <span>Session:</span>
                    <strong style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sessionId}</strong>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW 3: EXAM SUBMISSION SUMMARY & RESULTS                */}
      {/* ======================================================== */}
      {currentView === 'submitted' && (
        <div className="card-container" style={{ textAlign: 'center', maxWidth: '640px', margin: '40px auto' }}>
          <div className="success-icon-badge">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h1 className="header-title" style={{ marginTop: '16px' }}>Exam Submitted Successfully!</h1>
          <p className="header-subtitle" style={{ marginBottom: '28px' }}>
            Your test responses and proctoring telemetry have been verified and recorded.
          </p>

          {examResult && (
            <div className="results-grid">
              <div className="result-metric-card">
                <span className="metric-value">{examResult.attempted}</span>
                <span className="metric-label">Attempted</span>
              </div>
              <div className="result-metric-card">
                <span className="metric-value" style={{ color: '#16a34a' }}>{examResult.correct}</span>
                <span className="metric-label">Correct</span>
              </div>
              <div className="result-metric-card">
                <span className="metric-value" style={{ color: '#dc2626' }}>{examResult.wrong}</span>
                <span className="metric-label">Wrong</span>
              </div>
              <div className="result-metric-card">
                <span className="metric-value" style={{ color: '#2563eb' }}>
                  {questions.length > 0 ? `${Math.round((examResult.correct / questions.length) * 100)}%` : '0%'}
                </span>
                <span className="metric-label">Score</span>
              </div>
            </div>
          )}

          <div className="proctoring-stats-banner">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Proctoring Integrity: {snapshotCount} webcam snapshots stored in <code>{saveFolder}</code></span>
          </div>

          <div style={{ marginTop: '28px', display: 'flex', justifyContent: 'center', gap: '14px' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleReturnToSetup}
            >
              Return to Setup Screen
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 1: RULES DIALOG                                    */}
      {/* ======================================================== */}
      {showRulesModal && (
        <div className="modal-overlay" onClick={() => setShowRulesModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Athena Examination Rules</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowRulesModal(false)}
              >
                ✕
              </button>
            </div>

            <ul className="rules-list">
              <li>
                <span className="rule-number">1</span>
                <span><strong>Stay on the exam screen:</strong> Navigating away from the active window will be logged as an infraction.</span>
              </li>
              <li>
                <span className="rule-number">2</span>
                <span><strong>Camera must remain enabled:</strong> Your face must be clearly visible and well-lit at all times.</span>
              </li>
              <li>
                <span className="rule-number">3</span>
                <span><strong>Fullscreen mode is mandatory:</strong> Exiting fullscreen mode triggers proctoring warnings.</span>
              </li>
              <li>
                <span className="rule-number">4</span>
                <span><strong>Automated snapshot recording:</strong> Webcam snapshots are automatically taken every 5 seconds and saved to the designated folder.</span>
              </li>
              <li>
                <span className="rule-number">5</span>
                <span><strong>No external assistance:</strong> Multiple monitors, mobile phones, headphones, or secondary aids are strictly prohibited.</span>
              </li>
              <li>
                <span className="rule-number">6</span>
                <span><strong>Submission:</strong> Click 'Exit Exam' or 'Submit' only when you have completely answered all questions.</span>
              </li>
            </ul>

            <div style={{ textAlign: 'right' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowRulesModal(false)}
              >
                I Understand & Agree
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: CONFIRM SUBMIT MODAL                            */}
      {/* ======================================================== */}
      {showSubmitModal && (
        <div className="modal-overlay" onClick={() => setShowSubmitModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Submit Examination?</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowSubmitModal(false)}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '15px', color: '#475569', marginBottom: '20px', lineHeight: '1.5' }}>
              Are you sure you want to finalize your exam submission? You will not be able to modify your answers once submitted.
            </p>

            <div className="submit-summary-box">
              <div className="summary-row">
                <span>Total Questions:</span>
                <strong>{questions.length}</strong>
              </div>
              <div className="summary-row">
                <span>Answered Questions:</span>
                <strong style={{ color: '#16a34a' }}>{answeredCount}</strong>
              </div>
              <div className="summary-row">
                <span>Unanswered Questions:</span>
                <strong style={{ color: '#dc2626' }}>{questions.length - answeredCount}</strong>
              </div>
              <div className="summary-row">
                <span>Total Time Elapsed:</span>
                <strong>{formatClock(elapsedSeconds)}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setShowSubmitModal(false)}
                disabled={isLoading}
              >
                Cancel & Continue Test
              </button>
              <button
                type="button"
                className="btn btn-success"
                onClick={handleConfirmSubmit}
                disabled={isLoading}
              >
                {isLoading ? 'Submitting...' : 'Yes, Submit Exam'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;