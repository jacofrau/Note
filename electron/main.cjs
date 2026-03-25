const http = require("http");
const fs = require("fs");
const path = require("path");
const { parse, pathToFileURL } = require("node:url");
const next = require("next");
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { getNamedAppDataDir } = require("./paths.cjs");

const APP_USER_DATA_DIRNAME = "Note";
const LEGACY_USER_DATA_DIRNAMES = ["notes-sticker-pwa", "Note di Jaco"];
const DESKTOP_STORAGE_FILENAME = "desktop-storage.json";
const RUNTIME_ENV_FILENAME = "runtime.env";
const isDev = process.env.ELECTRON_FORCE_PROD === "true" ? false : !app.isPackaged;
const isFileLogEnabled = app.isPackaged || process.env.ELECTRON_ENABLE_FILE_LOG === "true";
const defaultDevUrl = "http://localhost:3000";
const DEV_SERVER_PROBE_ATTEMPTS = 16;
const DEV_SERVER_PROBE_INTERVAL_MS = 250;

let mainWindow = null;
let server = null;
let nextApp = null;
const previewWindows = new Set();
let desktopStorageCache = null;

function parseEnvFile(rawContent) {
  const entries = {};

  for (const rawLine of String(rawContent || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = rawLine.indexOf("=");
    if (separatorIndex < 0) continue;

    const key = rawLine.slice(0, separatorIndex).trim();
    const value = rawLine.slice(separatorIndex + 1).trim();
    if (!key) continue;

    entries[key] = value;
  }

  return entries;
}

function applyEnvFile(envPath) {
  try {
    if (!envPath || !fs.existsSync(envPath)) return false;

    const parsedEntries = parseEnvFile(fs.readFileSync(envPath, "utf8"));
    for (const [key, value] of Object.entries(parsedEntries)) {
      if (typeof process.env[key] === "string" && process.env[key].trim()) continue;
      process.env[key] = value;
    }

    return true;
  } catch {
    return false;
  }
}

function cloneStructuredValue(value) {
  if (typeof value === "undefined" || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

function ensureStableUserDataPath() {
  try {
    const appDataDir = app.getPath("appData");
    const preferredUserDataPath = path.join(appDataDir, APP_USER_DATA_DIRNAME);

    if (!fs.existsSync(preferredUserDataPath)) {
      const legacyPath = LEGACY_USER_DATA_DIRNAMES
        .map((dirName) => path.join(appDataDir, dirName))
        .find((candidate) => fs.existsSync(candidate) && path.resolve(candidate) !== path.resolve(preferredUserDataPath));

      if (legacyPath) {
        fs.cpSync(legacyPath, preferredUserDataPath, { recursive: true });
      }
    }

    app.setPath("userData", preferredUserDataPath);
  } catch {
    // Se la migrazione non riesce, Electron continua con il path di default.
  }
}

function getDesktopStoragePath() {
  return path.join(app.getPath("userData"), "storage", DESKTOP_STORAGE_FILENAME);
}

function loadRuntimeEnv() {
  const candidates = [
    path.join(app.getPath("userData"), "config", RUNTIME_ENV_FILENAME),
    path.join(process.resourcesPath || "", RUNTIME_ENV_FILENAME),
    path.join(process.cwd(), ".env.local"),
  ];
  const loadedPaths = [];

  for (const candidate of candidates) {
    if (applyEnvFile(candidate)) {
      loadedPaths.push(candidate);
    }
  }

  return loadedPaths;
}

function readDesktopStorageSnapshot() {
  if (desktopStorageCache) {
    return desktopStorageCache;
  }

  const storagePath = getDesktopStoragePath();

  try {
    if (!fs.existsSync(storagePath)) {
      desktopStorageCache = {};
      return desktopStorageCache;
    }

    const raw = fs.readFileSync(storagePath, "utf8");
    const parsed = raw ? JSON.parse(raw) : {};
    desktopStorageCache = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    desktopStorageCache = {};
  }

  return desktopStorageCache;
}

function writeDesktopStorageSnapshot(nextSnapshot) {
  const storagePath = getDesktopStoragePath();

  try {
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    const tempPath = `${storagePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(nextSnapshot, null, 2), "utf8");
    fs.renameSync(tempPath, storagePath);
    desktopStorageCache = nextSnapshot;
  } catch (error) {
    logDesktop("desktop storage write failed", error);
    throw error;
  }

  return desktopStorageCache;
}

function getDesktopStorageValue(key) {
  if (typeof key !== "string" || !key.trim()) return undefined;

  const snapshot = readDesktopStorageSnapshot();
  if (!Object.prototype.hasOwnProperty.call(snapshot, key)) {
    return undefined;
  }

  return cloneStructuredValue(snapshot[key]);
}

function setDesktopStorageValue(key, value) {
  if (typeof key !== "string" || !key.trim()) return undefined;

  const snapshot = readDesktopStorageSnapshot();
  const clonedValue = cloneStructuredValue(value);
  const nextSnapshot = { ...snapshot };

  if (typeof clonedValue === "undefined") {
    delete nextSnapshot[key];
  } else {
    nextSnapshot[key] = clonedValue;
  }

  writeDesktopStorageSnapshot(nextSnapshot);
  return cloneStructuredValue(nextSnapshot[key]);
}

function removeDesktopStorageValue(key) {
  if (typeof key !== "string" || !key.trim()) return false;

  const snapshot = readDesktopStorageSnapshot();
  if (!Object.prototype.hasOwnProperty.call(snapshot, key)) {
    return false;
  }

  const nextSnapshot = { ...snapshot };
  delete nextSnapshot[key];
  writeDesktopStorageSnapshot(nextSnapshot);
  return true;
}

ensureStableUserDataPath();
const loadedRuntimeEnvPaths = loadRuntimeEnv();

function getDesktopLogPath() {
  if (!isFileLogEnabled) return null;

  const baseDir = app.isReady()
    ? app.getPath("userData")
    : getNamedAppDataDir(APP_USER_DATA_DIRNAME);

  return path.join(baseDir, "logs", "desktop.log");
}

function logDesktop(...parts) {
  const logPath = getDesktopLogPath();
  if (!logPath) return;

  const line = `[${new Date().toISOString()}] ${parts.map((part) => {
    if (part instanceof Error) return `${part.name}: ${part.message}\n${part.stack || ""}`;
    if (typeof part === "string") return part;
    try {
      return JSON.stringify(part);
    } catch {
      return String(part);
    }
  }).join(" ")}\n`;

  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, line);
  } catch {
    // Ignora errori di logging.
  }
}

function getIconPath() {
  return path.join(app.getAppPath(), "public", "icons", "notedijaco_icon.png");
}

function validatePackagedAppFiles(appDir) {
  const requiredPaths = [
    path.join(appDir, ".next", "BUILD_ID"),
    path.join(appDir, "electron", "preload.cjs"),
    path.join(appDir, "package.json"),
  ];

  const missingPaths = requiredPaths.filter((requiredPath) => !fs.existsSync(requiredPath));
  if (missingPaths.length > 0) {
    throw new Error(`Pacchetto desktop incompleto. File mancanti: ${missingPaths.join(", ")}`);
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function canReachUrl(url) {
  for (let attempt = 0; attempt < DEV_SERVER_PROBE_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "HEAD",
        cache: "no-store",
      });
      if (response.ok || response.status >= 400) {
        return true;
      }
    } catch {
      // Ignore until next retry.
    }

    if (attempt < DEV_SERVER_PROBE_ATTEMPTS - 1) {
      await sleep(DEV_SERVER_PROBE_INTERVAL_MS);
    }
  }

  return false;
}

async function startNextServer() {
  logDesktop("startNextServer", { isDev, appPath: app.getAppPath() });
  if (server) {
    const address = server.address();
    if (address && typeof address === "object") {
      return address.port;
    }
  }

  const dir = app.getAppPath();
  validatePackagedAppFiles(dir);
  nextApp = next({
    dev: false,
    dir,
  });

  await nextApp.prepare();
  logDesktop("next prepared");
  const handle = nextApp.getRequestHandler();

  const port = await new Promise((resolve, reject) => {
    const instance = http.createServer((req, res) => {
      const parsedUrl = parse(req.url || "/", true);
      void handle(req, res, parsedUrl);
    });

    instance.once("error", reject);
    instance.listen(0, "127.0.0.1", () => {
      server = instance;
      const address = instance.address();
      if (!address || typeof address !== "object") {
        reject(new Error("Impossibile ottenere la porta del server locale."));
        return;
      }
      logDesktop("server listening", { port: address.port });
      resolve(address.port);
    });
  });

  return port;
}

function createPreviewWindow(pdfPath) {
  const previewWindow = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    autoHideMenuBar: true,
    backgroundColor: "#0f0f14",
    title: "Anteprima di stampa",
    icon: getIconPath(),
    parent: mainWindow || undefined,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  previewWindows.add(previewWindow);
  previewWindow.on("closed", () => {
    previewWindows.delete(previewWindow);
    try {
      fs.unlinkSync(pdfPath);
    } catch {
      // Ignora cleanup falliti del file temporaneo.
    }
  });

  return previewWindow;
}

async function openPrintPreview() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error("Finestra principale non disponibile.");
  }

  const pdfBuffer = await mainWindow.webContents.printToPDF({
    printBackground: true,
    displayHeaderFooter: false,
    preferCSSPageSize: true,
    pageSize: "A4",
  });

  const tempDir = path.join(app.getPath("temp"), "note-di-jaco-print-preview");
  fs.mkdirSync(tempDir, { recursive: true });
  const pdfPath = path.join(tempDir, `preview-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`);
  fs.writeFileSync(pdfPath, pdfBuffer);

  const previewWindow = createPreviewWindow(pdfPath);
  await previewWindow.loadURL(pathToFileURL(pdfPath).toString());
}

async function createWindow() {
  logDesktop("createWindow", { isDev });
  let allowMainWindowClose = false;
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1260,
    minHeight: 720,
    autoHideMenuBar: true,
    backgroundColor: "#0b0b10",
    title: "Note di Jaco",
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow.setMinimumSize(1260, 720);

  mainWindow.on("close", (event) => {
    if (allowMainWindowClose) return;

    event.preventDefault();
    allowMainWindowClose = true;

    try {
      mainWindow.webContents.send("desktop:before-close");
    } catch (error) {
      logDesktop("before-close notify failed", error);
    }

    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close();
      }
    }, 120);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const targetStartUrl = process.env.ELECTRON_START_URL || defaultDevUrl;

  try {
    if (isDev) {
      const externalReady = await canReachUrl(targetStartUrl);
      if (externalReady) {
        await mainWindow.loadURL(targetStartUrl);
        logDesktop("dev window loaded", { url: targetStartUrl });
        mainWindow.webContents.openDevTools({ mode: "detach" });
        return;
      }

      logDesktop("external dev url not ready, starting embedded server", { url: targetStartUrl });
    }

    const port = await startNextServer();
    await mainWindow.loadURL(`http://127.0.0.1:${port}`);
    logDesktop(isDev ? "embedded dev server loaded" : "prod window loaded", { port });
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto.";
    logDesktop("startup failed", error);
    await dialog.showErrorBox(
      "Avvio non riuscito",
      isDev
        ? `Impossibile aprire né l'URL di sviluppo né avviare il server interno.\n\nDettagli: ${message}`
        : `L'app desktop non riesce ad avviare il server interno.\n\nDettagli: ${message}`,
    );
    app.quit();
  }
}

ipcMain.handle("desktop:open-print-preview", async () => {
  try {
    await openPrintPreview();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto.";
    logDesktop("print preview failed", error);
    return { ok: false, error: message };
  }
});

ipcMain.handle("desktop-storage:set-item", async (_event, payload) => {
  if (!payload || typeof payload.key !== "string") {
    return undefined;
  }

  return setDesktopStorageValue(payload.key, payload.value);
});

ipcMain.handle("desktop-storage:remove-item", async (_event, key) => {
  return removeDesktopStorageValue(key);
});

ipcMain.on("desktop-storage:get-snapshot-sync", (event) => {
  event.returnValue = cloneStructuredValue(readDesktopStorageSnapshot());
});

ipcMain.on("desktop-storage:set-item-sync", (event, payload) => {
  if (!payload || typeof payload.key !== "string") {
    event.returnValue = undefined;
    return;
  }

  event.returnValue = setDesktopStorageValue(payload.key, payload.value);
});

ipcMain.on("desktop-storage:remove-item-sync", (event, key) => {
  event.returnValue = removeDesktopStorageValue(key);
});

app.whenReady().then(createWindow);
app.on("ready", () => {
  logDesktop("electron ready");
  logDesktop("runtime env", {
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY?.trim()),
    hasSmtpPass: Boolean(process.env.SMTP_PASS?.trim()),
    hasSmtpUser: Boolean(process.env.SMTP_USER?.trim()),
    sources: loadedRuntimeEnvPaths,
  });
});

app.on("window-all-closed", () => {
  logDesktop("window-all-closed");
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  logDesktop("activate");
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

app.on("before-quit", () => {
  logDesktop("before-quit");
  for (const previewWindow of previewWindows) {
    if (!previewWindow.isDestroyed()) {
      previewWindow.destroy();
    }
  }
  previewWindows.clear();
  if (server) {
    server.close();
    server = null;
  }
  if (nextApp) {
    nextApp = null;
  }
});
