import {
  getDesktopStoredValueSync,
  isDesktopStorageAvailable,
  setDesktopStoredValueSync,
} from "./desktopBridge";

export type AppTheme = "dark" | "blue" | "pink" | "red" | "green" | "yellow";

export const APP_THEME_OPTIONS: ReadonlyArray<{ label: string; value: AppTheme }> = [
  { label: "Viola", value: "dark" },
  { label: "Blu", value: "blue" },
  { label: "Verde scuro", value: "green" },
  { label: "Giallo", value: "yellow" },
  { label: "Rosa", value: "pink" },
  { label: "Rosso", value: "red" },
];

export const APP_THEME_ICON_PATHS: Record<AppTheme, string> = {
  dark: "/icons/notedijaco_icon.png?v=20260303-234200",
  blue: "/icons/notedijaco_blueicon.png?v=20260327-000700",
  pink: "/icons/notedijaco_pinkicon.png?v=20260327-001900",
  red: "/icons/notedijaco_rediconfix.png?v=20260327-003200",
  green: "/icons/notedijaco_greenicon.png?v=20260326-233449",
  yellow: "/icons/notedijaco_yellowicon.png?v=20260326-233703",
};

export const APP_THEME_COLORS: Record<AppTheme, string> = {
  dark: "#0f0914",
  blue: "#060a14",
  pink: "#10070a",
  red: "#100607",
  green: "#06110c",
  yellow: "#141005",
};

export type AppSettings = {
  userName: string;
  theme: AppTheme;
  hasCompletedOnboarding: boolean;
  showColoredTextHighlights: boolean;
  moveCompletedChecklistItemsToBottom: boolean;
  showMathResultsPreview: boolean;
  showPersistentDesignSwitcher: boolean;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  userName: "",
  theme: "dark",
  hasCompletedOnboarding: false,
  showColoredTextHighlights: true,
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
    left.showColoredTextHighlights === right.showColoredTextHighlights &&
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
  return value === "blue" || value === "pink" || value === "red" || value === "green" || value === "yellow" || value === "dark"
    ? value
    : DEFAULT_APP_SETTINGS.theme;
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
    showColoredTextHighlights:
      typeof candidate.showColoredTextHighlights === "boolean"
        ? candidate.showColoredTextHighlights
        : DEFAULT_APP_SETTINGS.showColoredTextHighlights,
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

export function getAppThemeIconPath(theme: AppTheme): string {
  return APP_THEME_ICON_PATHS[normalizeAppTheme(theme)];
}

export function getAppThemeColor(theme: AppTheme): string {
  return APP_THEME_COLORS[normalizeAppTheme(theme)];
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
    const iconPaths = ${JSON.stringify(APP_THEME_ICON_PATHS)};
    const themeColors = ${JSON.stringify(APP_THEME_COLORS)};
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
    const theme =
      parsed?.theme === "blue" ||
      parsed?.theme === "pink" ||
      parsed?.theme === "red" ||
      parsed?.theme === "green" ||
      parsed?.theme === "yellow" ||
      parsed?.theme === "dark"
        ? parsed.theme
        : defaults.theme;
    const hasLegacyStoredSettings =
      typeof parsed === "object" && parsed !== null && ("userName" in parsed || "theme" in parsed);
    const hasCompletedOnboarding =
      typeof parsed?.hasCompletedOnboarding === "boolean"
        ? parsed.hasCompletedOnboarding
        : hasLegacyStoredSettings;
    const showColoredTextHighlights =
      typeof parsed?.showColoredTextHighlights === "boolean"
        ? parsed.showColoredTextHighlights
        : defaults.showColoredTextHighlights;
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
      showColoredTextHighlights,
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
    const nextIconPath = iconPaths[theme] || iconPaths.dark;
    const nextThemeColor = themeColors[theme] || themeColors.dark;
    const iconLinks = Array.from(document.querySelectorAll('link[rel~="icon"]'));
    if (iconLinks.length === 0) {
      const link = document.createElement("link");
      link.rel = "icon";
      link.href = nextIconPath;
      document.head.appendChild(link);
    } else {
      for (const link of iconLinks) {
        link.href = nextIconPath;
      }
    }
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute("content", nextThemeColor);
    }
  } catch {
    const defaults = ${JSON.stringify(DEFAULT_APP_SETTINGS)};
    document.documentElement.dataset.appTheme = defaults.theme;
    document.documentElement.dataset.appOnboardingComplete = defaults.hasCompletedOnboarding ? "true" : "false";
    document.documentElement.dataset.appSettings = encodeURIComponent(JSON.stringify(defaults));
  }
`;
