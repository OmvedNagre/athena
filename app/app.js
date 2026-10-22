import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import http from "http";

let electronWindow = null;
let startTimestamp = null;
let timerInterval = null;
let cameraSnapInterval = null;
let backendProcess = null;
let snapshotFolder = path.join(import.meta.dirname, "user-camera-snap");

// Function to auto-start backend if not already listening
function startBackendIfNeeded() {
    const checkReq = http.get("http://localhost:3000/", () => {
        console.log("Backend already active on http://localhost:3000");
    });

    checkReq.on("error", () => {
        const serverScript = path.join(import.meta.dirname, "..", "backend", "server.js");
        if (fs.existsSync(serverScript)) {
            console.log("Starting backend server from:", serverScript);
            backendProcess = spawn(process.execPath, [serverScript], {
                cwd: path.join(import.meta.dirname, "..", "backend"),
                stdio: "pipe",
                env: { ...process.env, PORT: "3000" }
            });

            backendProcess.stdout?.on("data", (d) => console.log(`[Backend] ${d}`));
            backendProcess.stderr?.on("data", (d) => console.error(`[Backend ERR] ${d}`));
            backendProcess.on("close", (code) => console.log(`Backend process exited with code ${code}`));
        }
    });
}

// Ensure default snapshot folder exists
if (!fs.existsSync(snapshotFolder)) {
    fs.mkdirSync(snapshotFolder, { recursive: true });
}

function createWindow() {
    electronWindow = new BrowserWindow({
        height: 950,
        width: 1050,
        minWidth: 850,
        minHeight: 700,
        webPreferences: {
            devTools: true,
            preload: path.join(import.meta.dirname, 'preload.js')
        }
    });

    electronWindow.loadURL('http://localhost:5173');
}

ipcMain.handle('start-timer', () => {
    // If timer is already running, do NOT reset startTimestamp!
    const isAlreadyRunning = Boolean(timerInterval && startTimestamp);
    if (!isAlreadyRunning) {
        startTimestamp = Date.now();
    }

    if (!timerInterval) {
        // Initial tick with current elapsed seconds
        const currentElapsed = Math.floor((Date.now() - startTimestamp) / 1000);
        if (electronWindow && !electronWindow.isDestroyed()) {
            electronWindow.webContents.send('timer', currentElapsed);
        }

        // Send Timer Tick every 1s with integer elapsed seconds (1, 2, 3...)
        timerInterval = setInterval(() => {
            if (electronWindow && !electronWindow.isDestroyed()) {
                const elapsedSeconds = Math.floor((Date.now() - startTimestamp) / 1000);
                electronWindow.webContents.send('timer', elapsedSeconds);
            }
        }, 1000);
    }

    if (!cameraSnapInterval) {
        // Capture user's camera snap strictly every 5 seconds
        cameraSnapInterval = setInterval(() => {
            if (electronWindow && !electronWindow.isDestroyed()) {
                electronWindow.webContents.send('camera-shot');
            }
        }, 5000);
    }

    const elapsed = Math.floor((Date.now() - startTimestamp) / 1000);
    return { started: true, elapsedSeconds: elapsed, intervalSeconds: 5 };
});

ipcMain.handle('stop-timer', () => {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    if (cameraSnapInterval) {
        clearInterval(cameraSnapInterval);
        cameraSnapInterval = null;
    }
    const finalElapsed = startTimestamp ? Math.floor((Date.now() - startTimestamp) / 1000) : 0;
    return { stopped: true, finalElapsed };
});

ipcMain.handle('reset-timer', () => {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    if (cameraSnapInterval) {
        clearInterval(cameraSnapInterval);
        cameraSnapInterval = null;
    }
    startTimestamp = null;
    if (electronWindow && !electronWindow.isDestroyed()) {
        electronWindow.webContents.send('timer', 0);
    }
    return { reset: true };
});

ipcMain.handle('get-timer-state', () => {
    const isRunning = Boolean(timerInterval && startTimestamp);
    const elapsed = startTimestamp ? Math.floor((Date.now() - startTimestamp) / 1000) : 0;
    return { isRunning, elapsedSeconds: elapsed };
});

ipcMain.handle('select-snapshot-folder', async () => {
    const result = await dialog.showOpenDialog(electronWindow, {
        title: "Select Folder for Camera Snapshots",
        defaultPath: snapshotFolder,
        properties: ["openDirectory", "createDirectory"]
    });

    if (!result.canceled && result.filePaths.length > 0) {
        snapshotFolder = result.filePaths[0];
        return snapshotFolder;
    }
    return snapshotFolder;
});

ipcMain.handle('get-snapshot-folder', () => {
    return snapshotFolder;
});

ipcMain.handle('store-camera-snap-image-on-disk', (_event, data) => {
    const targetDir = snapshotFolder || path.join(import.meta.dirname, "user-camera-snap");
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }
    const fileName = `snap_${Date.now()}.jpg`;
    const filePath = path.join(targetDir, fileName);
    fs.writeFileSync(filePath, Buffer.from(data));
    return { success: true, filePath, fileName, folder: targetDir };
});

ipcMain.on("show-rules", () => {
    dialog.showMessageBox(electronWindow, {
        type: "info",
        title: "Athena Exam Rules & Guidelines",
        message: "Examination Conduct & Security Rules",
        detail:
            "1. Stay on the exam screen at all times.\n" +
            "2. Camera must remain enabled and face clearly visible throughout the exam.\n" +
            "3. Fullscreen mode is mandatory. Exiting fullscreen will be logged as a violation.\n" +
            "4. Automated camera snapshots will be recorded every 5 seconds for proctoring verification.\n" +
            "5. No external assistance, secondary screens, unauthorized tabs, or mobile phones allowed.\n" +
            "6. Click 'Submit' or 'Exit Exam' only when you have completed your test."
    });
});

app.whenReady().then(() => {
    startBackendIfNeeded();
    createWindow();
});

function cleanupResources() {
    if (timerInterval) clearInterval(timerInterval);
    if (cameraSnapInterval) clearInterval(cameraSnapInterval);
    if (backendProcess) {
        try {
            backendProcess.kill();
        } catch (err) {
            console.error("Error stopping backend process:", err);
        }
        backendProcess = null;
    }
}

app.on('window-all-closed', () => {
    cleanupResources();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    cleanupResources();
});