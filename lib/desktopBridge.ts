export type DesktopPrintPreviewResult = {
  ok: boolean;
  error?: string;
};

export type DesktopOpenNoteFilePayload = {
  content: string;
  fileName: string;
  filePath: string;
};

export type DesktopSaveNoteFileRequest = {
  content: string;
  fileName: string;
};

export type DesktopSaveNoteFileResult = {
  ok: boolean;
  error?: string;
  filePath?: string;
};

type DesktopStorageBridge = {
  getItemSync: (key: string) => unknown;
  getItem: (key: string) => Promise<unknown>;
  setItemSync: (key: string, value: unknown) => unknown;
  setItem: (key: string, value: unknown) => Promise<unknown>;
  removeItemSync: (key: string) => boolean;
  removeItem: (key: string) => Promise<boolean>;
};

declare global {
  interface Window {
    noteDiJacoDesktop?: {
      platform?: string;
      openPrintPreview?: () => Promise<DesktopPrintPreviewResult>;
      onBeforeClose?: (listener: () => void) => (() => void) | void;
      onOpenNoteFile?: (listener: (payload: DesktopOpenNoteFilePayload) => void) => (() => void) | void;
      saveNoteFileToDesktop?: (payload: DesktopSaveNoteFileRequest) => Promise<DesktopSaveNoteFileResult>;
      storage?: DesktopStorageBridge;
    };
  }
}

function getDesktopStorageBridge(): DesktopStorageBridge | null {
  if (typeof window === "undefined") return null;
  return window.noteDiJacoDesktop?.storage ?? null;
}

export function isDesktopStorageAvailable() {
  return !!getDesktopStorageBridge();
}

export function getDesktopPlatform(): string | null {
  if (typeof window === "undefined") return null;

  const platform = window.noteDiJacoDesktop?.platform;
  return typeof platform === "string" && platform.trim() ? platform : null;
}

export function subscribeDesktopOpenNoteFile(listener: (payload: DesktopOpenNoteFilePayload) => void) {
  if (typeof window === "undefined") return () => {};

  const subscribe = window.noteDiJacoDesktop?.onOpenNoteFile;
  if (!subscribe) return () => {};

  const unsubscribe = subscribe(listener);
  return typeof unsubscribe === "function" ? unsubscribe : () => {};
}

export async function saveDesktopNoteFileToDesktop(payload: DesktopSaveNoteFileRequest) {
  if (typeof window === "undefined") {
    return {
      ok: false,
      error: "Bridge desktop non disponibile.",
    } satisfies DesktopSaveNoteFileResult;
  }

  const saveFile = window.noteDiJacoDesktop?.saveNoteFileToDesktop;
  if (!saveFile) {
    return {
      ok: false,
      error: "Bridge desktop non disponibile.",
    } satisfies DesktopSaveNoteFileResult;
  }

  return saveFile(payload);
}

export function getDesktopStoredValueSync<T>(key: string): T | undefined {
  const bridge = getDesktopStorageBridge();
  if (!bridge) return undefined;

  const value = bridge.getItemSync(key);
  return typeof value === "undefined" ? undefined : (value as T);
}

export async function getDesktopStoredValue<T>(key: string): Promise<T | undefined> {
  const bridge = getDesktopStorageBridge();
  if (!bridge) return undefined;

  const value = await bridge.getItem(key);
  return typeof value === "undefined" ? undefined : (value as T);
}

export function setDesktopStoredValueSync<T>(key: string, value: T): T {
  const bridge = getDesktopStorageBridge();
  if (!bridge) return value;

  const stored = bridge.setItemSync(key, value);
  return (typeof stored === "undefined" ? value : stored) as T;
}

export async function setDesktopStoredValue<T>(key: string, value: T): Promise<T> {
  const bridge = getDesktopStorageBridge();
  if (!bridge) return value;

  const stored = await bridge.setItem(key, value);
  return (typeof stored === "undefined" ? value : stored) as T;
}

export function removeDesktopStoredValueSync(key: string): boolean {
  const bridge = getDesktopStorageBridge();
  if (!bridge) return false;
  return bridge.removeItemSync(key);
}

export async function removeDesktopStoredValue(key: string): Promise<boolean> {
  const bridge = getDesktopStorageBridge();
  if (!bridge) return false;
  return bridge.removeItem(key);
}
