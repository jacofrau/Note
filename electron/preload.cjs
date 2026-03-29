const { contextBridge, ipcRenderer } = require("electron");

function cloneStructuredValue(value) {
  if (typeof value === "undefined" || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

const rawDesktopStorageSnapshot = ipcRenderer.sendSync("desktop-storage:get-snapshot-sync");
const desktopStorageSnapshot =
  rawDesktopStorageSnapshot && typeof rawDesktopStorageSnapshot === "object" && !Array.isArray(rawDesktopStorageSnapshot)
    ? rawDesktopStorageSnapshot
    : {};
const rawPendingNoteFiles = ipcRenderer.sendSync("desktop-note-file:get-pending-sync");
const pendingNoteFiles = Array.isArray(rawPendingNoteFiles)
  ? rawPendingNoteFiles.map((entry) => cloneStructuredValue(entry))
  : [];
const openNoteFileListeners = new Set();
const updateStateListeners = new Set();

function getSnapshotValue(key) {
  if (!Object.prototype.hasOwnProperty.call(desktopStorageSnapshot, key)) {
    return undefined;
  }

  return cloneStructuredValue(desktopStorageSnapshot[key]);
}

function flushPendingNoteFiles() {
  if (!openNoteFileListeners.size || pendingNoteFiles.length === 0) {
    return;
  }

  const bufferedPayloads = pendingNoteFiles.splice(0, pendingNoteFiles.length).map((entry) => cloneStructuredValue(entry));

  queueMicrotask(() => {
    for (const payload of bufferedPayloads) {
      for (const listener of openNoteFileListeners) {
        try {
          listener(cloneStructuredValue(payload));
        } catch {
          // Ignora errori renderer per singolo listener.
        }
      }
    }
  });
}

ipcRenderer.on("desktop:open-note-file", (_event, payload) => {
  pendingNoteFiles.push(cloneStructuredValue(payload));
  flushPendingNoteFiles();
});

ipcRenderer.on("desktop:update-state", (_event, payload) => {
  const nextState = cloneStructuredValue(payload);

  for (const listener of updateStateListeners) {
    try {
      listener(nextState);
    } catch {
      // Ignora errori renderer per singolo listener.
    }
  }
});

contextBridge.exposeInMainWorld("noteDiJacoDesktop", {
  platform: process.platform,
  openPrintPreview: () => ipcRenderer.invoke("desktop:open-print-preview"),
  getUpdateState: () => ipcRenderer.invoke("desktop-update:get-state"),
  checkForUpdates: () => ipcRenderer.invoke("desktop-update:check"),
  downloadUpdate: () => ipcRenderer.invoke("desktop-update:download"),
  installUpdate: () => ipcRenderer.invoke("desktop-update:install"),
  onBeforeClose: (listener) => {
    if (typeof listener !== "function") {
      return () => {};
    }

    const wrappedListener = () => {
      try {
        listener();
      } catch {
        // Ignora errori lato renderer durante il flush finale.
      }
    };

    ipcRenderer.on("desktop:before-close", wrappedListener);
    return () => {
      ipcRenderer.removeListener("desktop:before-close", wrappedListener);
    };
  },
  onOpenNoteFile: (listener) => {
    if (typeof listener !== "function") {
      return () => {};
    }

    openNoteFileListeners.add(listener);
    flushPendingNoteFiles();
    return () => {
      openNoteFileListeners.delete(listener);
    };
  },
  onUpdateState: (listener) => {
    if (typeof listener !== "function") {
      return () => {};
    }

    updateStateListeners.add(listener);
    return () => {
      updateStateListeners.delete(listener);
    };
  },
  saveNoteFileToDesktop: (payload) => ipcRenderer.invoke("desktop-note-file:save-to-desktop", payload),
  storage: {
    getItemSync: (key) => getSnapshotValue(key),
    getItem: async (key) => getSnapshotValue(key),
    setItemSync: (key, value) => {
      const storedValue = cloneStructuredValue(
        ipcRenderer.sendSync("desktop-storage:set-item-sync", {
          key,
          value,
        }),
      );

      if (typeof storedValue === "undefined") {
        delete desktopStorageSnapshot[key];
      } else {
        desktopStorageSnapshot[key] = cloneStructuredValue(storedValue);
      }
      return cloneStructuredValue(storedValue);
    },
    setItem: async (key, value) => {
      const storedValue = cloneStructuredValue(
        await ipcRenderer.invoke("desktop-storage:set-item", {
          key,
          value,
        }),
      );

      if (typeof storedValue === "undefined") {
        delete desktopStorageSnapshot[key];
      } else {
        desktopStorageSnapshot[key] = cloneStructuredValue(storedValue);
      }
      return cloneStructuredValue(storedValue);
    },
    removeItemSync: (key) => {
      const removed = Boolean(ipcRenderer.sendSync("desktop-storage:remove-item-sync", key));
      if (removed) {
        delete desktopStorageSnapshot[key];
      }
      return removed;
    },
    removeItem: async (key) => {
      const removed = Boolean(await ipcRenderer.invoke("desktop-storage:remove-item", key));
      if (removed) {
        delete desktopStorageSnapshot[key];
      }
      return removed;
    },
  },
});
