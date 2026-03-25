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

function getSnapshotValue(key) {
  if (!Object.prototype.hasOwnProperty.call(desktopStorageSnapshot, key)) {
    return undefined;
  }

  return cloneStructuredValue(desktopStorageSnapshot[key]);
}

contextBridge.exposeInMainWorld("noteDiJacoDesktop", {
  platform: process.platform,
  openPrintPreview: () => ipcRenderer.invoke("desktop:open-print-preview"),
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
