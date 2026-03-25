import {
  getDesktopStoredValueSync,
  isDesktopStorageAvailable,
  setDesktopStoredValueSync,
} from "./desktopBridge";

export type DesignMode = "classic" | "v103b";

export const DEFAULT_DESIGN_MODE: DesignMode = "classic";
export const DESIGN_MODE_STORAGE_KEY = "note_di_jaco_design_mode_v1";
const designModeListeners = new Set<() => void>();

export function normalizeDesignMode(value: unknown): DesignMode {
  return value === "v103b" ? "v103b" : DEFAULT_DESIGN_MODE;
}

export function getStoredDesignMode(): DesignMode {
  const desktopStoredValue = getDesktopStoredValueSync<unknown>(DESIGN_MODE_STORAGE_KEY);
  if (typeof desktopStoredValue !== "undefined") {
    return normalizeDesignMode(desktopStoredValue);
  }

  if (typeof window === "undefined") return DEFAULT_DESIGN_MODE;

  try {
    const normalized = normalizeDesignMode(window.localStorage.getItem(DESIGN_MODE_STORAGE_KEY));

    if (isDesktopStorageAvailable()) {
      setDesktopStoredValueSync(DESIGN_MODE_STORAGE_KEY, normalized);
    }

    return normalized;
  } catch {
    return DEFAULT_DESIGN_MODE;
  }
}

export function setStoredDesignMode(value: DesignMode): DesignMode {
  const normalized = normalizeDesignMode(value);
  if (isDesktopStorageAvailable()) {
    setDesktopStoredValueSync(DESIGN_MODE_STORAGE_KEY, normalized);
  }

  if (typeof window === "undefined") return normalized;

  try {
    window.localStorage.setItem(DESIGN_MODE_STORAGE_KEY, normalized);
  } catch {
    // Se localStorage non e disponibile, il design resta valido solo per la sessione corrente.
  }

  return normalized;
}

export function getDocumentDesignMode(): DesignMode {
  if (typeof document === "undefined") return DEFAULT_DESIGN_MODE;
  return normalizeDesignMode(document.documentElement.dataset.designMode);
}

export function subscribeDesignMode(listener: () => void): () => void {
  designModeListeners.add(listener);
  return () => {
    designModeListeners.delete(listener);
  };
}

export function setDocumentDesignMode(value: DesignMode): DesignMode {
  const normalized = normalizeDesignMode(value);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.designMode = normalized;
  }

  for (const listener of designModeListeners) {
    listener();
  }

  return normalized;
}

export const DESIGN_MODE_INIT_SCRIPT = `
  try {
    const desktopStorage = window.noteDiJacoDesktop?.storage;
    const desktopStored = desktopStorage?.getItemSync("${DESIGN_MODE_STORAGE_KEY}");
    const storedMode =
      typeof desktopStored === "undefined"
        ? window.localStorage.getItem("${DESIGN_MODE_STORAGE_KEY}")
        : desktopStored;
    const normalizedMode = storedMode === "v103b" ? "v103b" : "${DEFAULT_DESIGN_MODE}";
    if (typeof desktopStored === "undefined" && desktopStorage?.setItemSync) {
      desktopStorage.setItemSync("${DESIGN_MODE_STORAGE_KEY}", normalizedMode);
    }
    document.documentElement.dataset.designMode = normalizedMode;
  } catch {
    document.documentElement.dataset.designMode = "${DEFAULT_DESIGN_MODE}";
  }
`;
