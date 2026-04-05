"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import {
  checkDesktopForUpdates,
  downloadDesktopUpdate,
  getDesktopPlatform,
  getDesktopUpdateState,
  installDesktopUpdate,
  subscribeDesktopUpdateState,
  type DesktopUpdateState,
} from "@/lib/desktopBridge";
import { getAppThemeColor, getAppThemeIconPath, type AppTheme } from "@/lib/appSettings";

export type AvailableUpdate = {
  downloadUrl: string;
  version: string;
};

type UseDesktopUpdateSupportOptions = {
  appVersion: string;
  updateManifestUrl: string;
};

function comparePrereleasePart(left: string, right: string): number {
  const leftNumeric = /^\d+$/u.test(left);
  const rightNumeric = /^\d+$/u.test(right);

  if (leftNumeric && rightNumeric) {
    return Number(left) - Number(right);
  }
  if (leftNumeric) return -1;
  if (rightNumeric) return 1;
  return left.localeCompare(right, "en", { sensitivity: "base" });
}

function compareVersions(left: string, right: string): number {
  const [leftCore, leftPrerelease] = left.split("-", 2);
  const [rightCore, rightPrerelease] = right.split("-", 2);
  const leftSegments = leftCore.split(".").map((segment) => Number.parseInt(segment, 10) || 0);
  const rightSegments = rightCore.split(".").map((segment) => Number.parseInt(segment, 10) || 0);
  const segmentCount = Math.max(leftSegments.length, rightSegments.length);

  for (let index = 0; index < segmentCount; index += 1) {
    const difference = (leftSegments[index] ?? 0) - (rightSegments[index] ?? 0);
    if (difference !== 0) return difference;
  }

  if (!leftPrerelease && !rightPrerelease) return 0;
  if (!leftPrerelease) return 1;
  if (!rightPrerelease) return -1;

  const leftParts = leftPrerelease.split(".");
  const rightParts = rightPrerelease.split(".");
  const partCount = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < partCount; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    const partDifference = comparePrereleasePart(leftPart, rightPart);
    if (partDifference !== 0) return partDifference;
  }

  return 0;
}

export function useAppChrome(theme: AppTheme, title: string) {
  useEffect(() => {
    const nextIconPath = getAppThemeIconPath(theme);
    const nextThemeColor = getAppThemeColor(theme);
    const iconType = nextIconPath.toLocaleLowerCase("en-US").includes(".ico") ? "image/x-icon" : "image/png";
    const iconLinks = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));

    if (iconLinks.length === 0) {
      const link = document.createElement("link");
      link.rel = "icon";
      link.href = nextIconPath;
      link.type = iconType;
      document.head.appendChild(link);
    } else {
      for (const link of iconLinks) {
        link.href = nextIconPath;
        link.type = iconType;
      }
    }

    let shortcutIconLink = document.querySelector<HTMLLinkElement>('link[rel="shortcut icon"]');
    if (!shortcutIconLink) {
      shortcutIconLink = document.createElement("link");
      shortcutIconLink.rel = "shortcut icon";
      document.head.appendChild(shortcutIconLink);
    }
    shortcutIconLink.href = nextIconPath;
    shortcutIconLink.type = iconType;

    const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute("content", nextThemeColor);
    }
  }, [theme]);

  useEffect(() => {
    document.title = title;
  }, [title]);
}

export function useDesktopUpdateSupport({ appVersion, updateManifestUrl }: UseDesktopUpdateSupportOptions) {
  const [desktopPlatformState] = useState<string | null>(() => getDesktopPlatform());
  const [desktopUpdateState, setDesktopUpdateState] = useState<DesktopUpdateState | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);

  useEffect(() => {
    let isDisposed = false;
    const detectedDesktopPlatform = desktopPlatformState;

    let unsubscribeDesktopUpdateState = () => {};

    async function checkWebForUpdates() {
      if (!updateManifestUrl) return;

      try {
        const requestUrl = new URL(updateManifestUrl, window.location.origin);
        const response = await fetch(requestUrl.toString(), { cache: "no-store" });
        if (!response.ok) return;

        const data = await response.json();
        const remoteVersion = typeof data?.version === "string" ? data.version.trim() : "";
        const downloadUrl = typeof data?.downloadUrl === "string" ? data.downloadUrl.trim() : "";

        if (!remoteVersion || !downloadUrl) {
          if (!isDisposed) setAvailableUpdate(null);
          return;
        }

        if (!isDisposed) {
          setAvailableUpdate(compareVersions(remoteVersion, appVersion) > 0 ? { downloadUrl, version: remoteVersion } : null);
        }
      } catch {
        if (!isDisposed) setAvailableUpdate(null);
      }
    }

    async function setupDesktopUpdates() {
      unsubscribeDesktopUpdateState = subscribeDesktopUpdateState((nextState) => {
        if (!isDisposed) {
          setDesktopUpdateState(nextState);
        }
      });

      const initialUpdateState = await getDesktopUpdateState();
      if (!isDisposed) {
        setDesktopUpdateState(initialUpdateState);
      }

      await checkDesktopForUpdates();
    }

    if (detectedDesktopPlatform) {
      void setupDesktopUpdates();
    } else {
      void checkWebForUpdates();
    }

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;

      if (detectedDesktopPlatform) {
        void checkDesktopForUpdates();
        return;
      }

      void checkWebForUpdates();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      isDisposed = true;
      unsubscribeDesktopUpdateState();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [appVersion, desktopPlatformState, updateManifestUrl]);

  const handleDesktopUpdateAction = useCallback(() => {
    if (!desktopUpdateState) return;

    if (desktopUpdateState.kind === "available" || desktopUpdateState.kind === "error") {
      void downloadDesktopUpdate();
      return;
    }

    if (desktopUpdateState.kind === "downloaded") {
      void installDesktopUpdate();
    }
  }, [desktopUpdateState]);

  return {
    availableUpdate,
    desktopPlatformState,
    desktopUpdateState,
    handleDesktopUpdateAction,
  };
}

export function usePendingSaveLifecycle(flushPendingSave: () => void) {
  useEffect(
    () => () => {
      flushPendingSave();
    },
    [flushPendingSave],
  );

  useEffect(() => {
    const onPageHide = () => {
      flushPendingSave();
    };
    const onBeforeUnload = () => {
      flushPendingSave();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "hidden") return;
      flushPendingSave();
    };
    const removeDesktopBeforeCloseListener = window.noteDiJacoDesktop?.onBeforeClose?.(() => {
      flushPendingSave();
    });

    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("unload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("unload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (typeof removeDesktopBeforeCloseListener === "function") {
        removeDesktopBeforeCloseListener();
      }
    };
  }, [flushPendingSave]);
}

export function useAutoFocusAndSelect<T extends HTMLInputElement | HTMLTextAreaElement>(
  isOpen: boolean,
  ref: RefObject<T | null>,
) {
  useEffect(() => {
    if (!isOpen) return;

    const timeoutId = window.setTimeout(() => {
      ref.current?.focus();
      ref.current?.select();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isOpen, ref]);
}
