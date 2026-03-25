import {
  getDesktopStoredValueSync,
  isDesktopStorageAvailable,
  setDesktopStoredValueSync,
} from "./desktopBridge";

export type AppTheme = "dark";

export type AppSettings = {
  userName: string;
  theme: AppTheme;
  hasCompletedOnboarding: boolean;
  moveCompletedChecklistItemsToBottom: boolean;
  showMathResultsPreview: boolean;
  showPersistentDesignSwitcher: boolean;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  userName: "",
  theme: "dark",
  hasCompletedOnboarding: false,
  moveCompletedChecklistItemsToBottom: false,
  showMathResultsPreview: true,
  showPersistentDesignSwitcher: false,
};

export const APP_SETTINGS_STORAGE_KEY = "note_di_jaco_app_settings_v1";
const appSettingsListeners = new Set<() => void>();
let appSettingsSnapshot: AppSettings = DEFAULT_APP_SETTINGS;

function areAppSettingsEqual(left: AppSettings, right: AppSettings): boolean {
  return (
    left.userName === right.userName &&
    left.theme === right.theme &&
    left.hasCompletedOnboarding === right.hasCompletedOnboarding &&
    left.moveCompletedChecklistItemsToBottom === right.moveCompletedChecklistItemsToBottom &&
    left.showMathResultsPreview === right.showMathResultsPreview &&
    left.showPersistentDesignSwitcher === right.showPersistentDesignSwitcher
  );
}

function cacheAppSettingsSnapshot(value: AppSettings): AppSettings {
  if (areAppSettingsEqual(appSettingsSnapshot, value)) {
    return appSettingsSnapshot;
  }

  appSettingsSnapshot = value;
  return appSettingsSnapshot;
}

export function normalizeAppTheme(value: unknown): AppTheme {
  return value === "dark" ? "dark" : DEFAULT_APP_SETTINGS.theme;
}

export function normalizeAppUserName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 24);
}

export function normalizeAppSettings(value: unknown): AppSettings {
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const hasLegacyStoredSettings =
    Object.prototype.hasOwnProperty.call(candidate, "userName") ||
    Object.prototype.hasOwnProperty.call(candidate, "theme");

  return {
    userName: normalizeAppUserName(candidate.userName),
    theme: normalizeAppTheme(candidate.theme),
    hasCompletedOnboarding:
      typeof candidate.hasCompletedOnboarding === "boolean"
        ? candidate.hasCompletedOnboarding
        : hasLegacyStoredSettings,
    moveCompletedChecklistItemsToBottom:
      typeof candidate.moveCompletedChecklistItemsToBottom === "boolean"
        ? candidate.moveCompletedChecklistItemsToBottom
        : DEFAULT_APP_SETTINGS.moveCompletedChecklistItemsToBottom,
    showMathResultsPreview:
      typeof candidate.showMathResultsPreview === "boolean"
        ? candidate.showMathResultsPreview
        : DEFAULT_APP_SETTINGS.showMathResultsPreview,
    showPersistentDesignSwitcher:
      typeof candidate.showPersistentDesignSwitcher === "boolean"
        ? candidate.showPersistentDesignSwitcher
        : DEFAULT_APP_SETTINGS.showPersistentDesignSwitcher,
  };
}

export function formatAppDisplayName(userName: string): string {
  const normalized = normalizeAppUserName(userName);
  return normalized ? `Note di ${normalized}` : "Note";
}

function writeDocumentSettings(settings: AppSettings) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.appTheme = settings.theme;
  document.documentElement.dataset.appOnboardingComplete = settings.hasCompletedOnboarding ? "true" : "false";
  document.documentElement.dataset.appSettings = encodeURIComponent(JSON.stringify(settings));
}

export function getStoredAppSettings(): AppSettings {
  const desktopStoredValue = getDesktopStoredValueSync<unknown>(APP_SETTINGS_STORAGE_KEY);
  if (typeof desktopStoredValue !== "undefined") {
    return cacheAppSettingsSnapshot(normalizeAppSettings(desktopStoredValue));
  }

  if (typeof window === "undefined") return DEFAULT_APP_SETTINGS;

  try {
    const rawValue = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    if (!rawValue) return cacheAppSettingsSnapshot(DEFAULT_APP_SETTINGS);
    const normalized = cacheAppSettingsSnapshot(normalizeAppSettings(JSON.parse(rawValue)));

    if (isDesktopStorageAvailable()) {
      setDesktopStoredValueSync(APP_SETTINGS_STORAGE_KEY, normalized);
    }

    return normalized;
  } catch {
    return cacheAppSettingsSnapshot(DEFAULT_APP_SETTINGS);
  }
}

export function setStoredAppSettings(value: AppSettings): AppSettings {
  const normalized = cacheAppSettingsSnapshot(normalizeAppSettings(value));
  if (isDesktopStorageAvailable()) {
    setDesktopStoredValueSync(APP_SETTINGS_STORAGE_KEY, normalized);
  }

  if (typeof window === "undefined") return normalized;

  try {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Se localStorage non e disponibile, le impostazioni restano valide solo per la sessione corrente.
  }

  return normalized;
}

export function getDocumentAppSettings(): AppSettings {
  if (typeof document === "undefined") return DEFAULT_APP_SETTINGS;

  try {
    const rawSettings = document.documentElement.dataset.appSettings;
    if (rawSettings) {
      return cacheAppSettingsSnapshot(normalizeAppSettings(JSON.parse(decodeURIComponent(rawSettings))));
    }
  } catch {
    // Se il dataset non e valido, si torna ai default sotto.
  }

  return cacheAppSettingsSnapshot({
    ...DEFAULT_APP_SETTINGS,
    theme: normalizeAppTheme(document.documentElement.dataset.appTheme),
    hasCompletedOnboarding: document.documentElement.dataset.appOnboardingComplete === "true",
  });
}

export function subscribeAppSettings(listener: () => void): () => void {
  appSettingsListeners.add(listener);
  return () => {
    appSettingsListeners.delete(listener);
  };
}

export function setDocumentAppSettings(value: AppSettings): AppSettings {
  const normalized = cacheAppSettingsSnapshot(normalizeAppSettings(value));
  writeDocumentSettings(normalized);

  for (const listener of appSettingsListeners) {
    listener();
  }

  return normalized;
}

export const APP_SETTINGS_INIT_SCRIPT = `
  try {
    const defaults = ${JSON.stringify(DEFAULT_APP_SETTINGS)};
    const desktopStorage = window.noteDiJacoDesktop?.storage;
    const desktopStored = desktopStorage?.getItemSync("${APP_SETTINGS_STORAGE_KEY}");
    const rawSettings =
      typeof desktopStored === "undefined"
        ? window.localStorage.getItem("${APP_SETTINGS_STORAGE_KEY}")
        : null;
    const parsed =
      typeof desktopStored !== "undefined"
        ? desktopStored
        : rawSettings
          ? JSON.parse(rawSettings)
          : defaults;
    const userName =
      typeof parsed?.userName === "string"
        ? parsed.userName.replace(/\\s+/g, " ").trim().slice(0, 24)
        : defaults.userName;
    const theme = parsed?.theme === "dark" ? "dark" : defaults.theme;
    const hasLegacyStoredSettings =
      typeof parsed === "object" && parsed !== null && ("userName" in parsed || "theme" in parsed);
    const hasCompletedOnboarding =
      typeof parsed?.hasCompletedOnboarding === "boolean"
        ? parsed.hasCompletedOnboarding
        : hasLegacyStoredSettings;
    const moveCompletedChecklistItemsToBottom =
      typeof parsed?.moveCompletedChecklistItemsToBottom === "boolean"
        ? parsed.moveCompletedChecklistItemsToBottom
        : defaults.moveCompletedChecklistItemsToBottom;
    const showMathResultsPreview =
      typeof parsed?.showMathResultsPreview === "boolean"
        ? parsed.showMathResultsPreview
        : defaults.showMathResultsPreview;
    const showPersistentDesignSwitcher =
      typeof parsed?.showPersistentDesignSwitcher === "boolean"
        ? parsed.showPersistentDesignSwitcher
        : defaults.showPersistentDesignSwitcher;
    const normalized = {
      userName,
      theme,
      hasCompletedOnboarding,
      moveCompletedChecklistItemsToBottom,
      showMathResultsPreview,
      showPersistentDesignSwitcher,
    };
    if (typeof desktopStored === "undefined" && desktopStorage?.setItemSync) {
      desktopStorage.setItemSync("${APP_SETTINGS_STORAGE_KEY}", normalized);
    }
    document.documentElement.dataset.appTheme = theme;
    document.documentElement.dataset.appOnboardingComplete = hasCompletedOnboarding ? "true" : "false";
    document.documentElement.dataset.appSettings = encodeURIComponent(JSON.stringify(normalized));
  } catch {
    const defaults = ${JSON.stringify(DEFAULT_APP_SETTINGS)};
    document.documentElement.dataset.appTheme = defaults.theme;
    document.documentElement.dataset.appOnboardingComplete = defaults.hasCompletedOnboarding ? "true" : "false";
    document.documentElement.dataset.appSettings = encodeURIComponent(JSON.stringify(defaults));
  }
`;
