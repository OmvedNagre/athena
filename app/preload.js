// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld("athena", {
    registerListenerForTimerTickFromMain: (callback) => {
        // callback is setTimer
        const fn = (event, message) => {
            callback(message);
        };

        ipcRenderer.on('timer', fn);

        return () => {
            ipcRenderer.removeListener('timer', fn);
        };
    },
    startTimerOnMain: () => {
        return ipcRenderer.invoke('start-timer');
    },
    stopTimerOnMain: () => {
        return ipcRenderer.invoke('stop-timer');
    },
    resetTimerOnMain: () => {
        return ipcRenderer.invoke('reset-timer');
    },
    getTimerState: () => {
        return ipcRenderer.invoke('get-timer-state');
    },

    // Functions related to capturing camera snaps of user
    registerListenerForCameraSnapFromMain: (callback) => {
        const fn = (event, ...args) => {
            callback(...args);
        };
        ipcRenderer.on('camera-shot', fn);

        return () => {
            ipcRenderer.removeListener('camera-shot', fn);
        };
    },

    storeCameraSnapImageOnDisk: (data) => {
        return ipcRenderer.invoke('store-camera-snap-image-on-disk', data);
    },

    selectSnapshotFolder: () => {
        return ipcRenderer.invoke('select-snapshot-folder');
    },

    getSnapshotFolder: () => {
        return ipcRenderer.invoke('get-snapshot-folder');
    },

    // Functions related to showing Contest Rules
    showRules: () => {
        ipcRenderer.send("show-rules");
    }
});
