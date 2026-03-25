"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { nanoid } from "nanoid";
import packageJson from "../package.json";
import { DesignModeIcon, TagLabelIcon, ThemePaletteIcon } from "@/components/AppIcons";
import DesignModeOption from "@/components/DesignModeOption";
import DeleteConfirmDialog from "@/components/dialogs/DeleteConfirmDialog";
import OnboardingDialog from "@/components/dialogs/OnboardingDialog";
import ResetAppDialog from "@/components/dialogs/ResetAppDialog";
import TagManageDialog from "@/components/dialogs/TagManageDialog";
import NoteList from "@/components/NoteList";
import OverlayScrollArea from "@/components/OverlayScrollArea";
import PrintIcon from "@/components/PrintIcon";
import { CHANGELOG } from "@/lib/changelog";
import {
  getDesktopPlatform,
  saveDesktopNoteFileToDesktop,
  subscribeDesktopOpenNoteFile,
  type DesktopOpenNoteFilePayload,
} from "@/lib/desktopBridge";
import {
  BACKUP_FILE_NAME,
  getSingleNoteFileName,
  NOTE_FILE_MIME,
  parseNotesImportFile,
  serializeAppBackupFile,
  serializeSingleNoteFile,
} from "@/lib/noteFiles";
import {
  getNoteBodySearchTextFromDoc as bodyTextSearchFromDoc,
  getNoteTitleFromDoc as titleFromDoc,
  getNoteTitleSearchTextFromDoc as titleSearchFromDoc,
} from "@/lib/noteText";
import {
  DEFAULT_APP_SETTINGS,
  getDocumentAppSettings,
  getStoredAppSettings,
  normalizeAppUserName,
  setDocumentAppSettings,
  setStoredAppSettings,
  subscribeAppSettings,
  type AppTheme,
} from "@/lib/appSettings";
import {
  DEFAULT_DESIGN_MODE,
  getDocumentDesignMode,
  getStoredDesignMode,
  setDocumentDesignMode,
  setStoredDesignMode,
  subscribeDesignMode,
  type DesignMode,
} from "@/lib/designMode";
import { getCustomTagLegendGroups, NotesTagIcon } from "@/lib/tagDefinitions";
import type { Note } from "@/lib/types";
import {
  getStoredCloudSyncAccessKey,
  hasCloudSyncAccessKey,
  isCloudSyncEnabledClient,
  loadStickerPacks,
  loadNotes,
  normalizeNotesData,
  resetStoredAppData,
  saveNotesLocallyImmediately,
  saveNotes,
  saveNotesImmediately,
  saveStickerPacks,
  setStoredCloudSyncAccessKey,
  sortNotes,
} from "@/lib/storage";

const appVersion = packageJson.version || "1.0.0";
const cloudSyncEnabled = isCloudSyncEnabledClient();
const updateManifestUrl = process.env.NEXT_PUBLIC_UPDATE_MANIFEST_URL?.trim() || "/api/app-release";
const SAVE_DEBOUNCE_MS = 220;

const Editor = dynamic(() => import("@/components/Editor"), {
  ssr: false,
  loading: () => (
    <div className="card deferredPanel">
      <div className="deferredPanelTitle">Caricamento editor...</div>
      <div className="muted deferredPanelText">Sto preparando l&apos;editor della nota.</div>
    </div>
  ),
});

const StickerPackPicker = dynamic(() => import("@/components/CustomEmojiPicker"), {
  ssr: false,
  loading: () => (
    <div className="card deferredPanel deferredPanelSidebar">
      <div className="header">
        <div>
          <div className="h1">Sticker</div>
          <div className="muted">caricamento in corso</div>
        </div>
      </div>
      <div className="deferredPanelBody">
        <div className="deferredPanelText">Sto caricando i tuoi pacchetti sticker.</div>
      </div>
    </div>
  ),
});

type AvailableUpdate = {
  downloadUrl: string;
  version: string;
};

type SettingsDialogTab = "notes" | "design" | "user";
type SpecialAppBrandIcon = {
  imageClassName?: string;
  src: string;
};

function getSpecialAppBrandIcon(userName: string): SpecialAppBrandIcon | null {
  const normalizedUserName = userName.toLocaleLowerCase("it-IT");

  if (normalizedUserName === "ippo") {
    return {
      src: "/icons/hippo-brand.webp",
    };
  }

  if (normalizedUserName === "elu" || normalizedUserName === "elugu") {
    return {
      src: "/icons/elugucrown.png?v=20260325-211734",
      imageClassName: "appBrandIconEluguImage",
    };
  }

  return null;
}

function now() {
  return Date.now();
}

function emptyDoc() {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

function normalizeTitles(notes: Note[]): Note[] {
  return notes.map((note) => ({
    ...note,
    title: titleFromDoc(note.doc),
  }));
}

function noteMatchesQuery(note: Note, query: string): boolean {
  if (!query) return true;

  const title = note.title ? note.title.toLocaleLowerCase("it-IT") : titleSearchFromDoc(note.doc);
  if (title.includes(query)) return true;

  return bodyTextSearchFromDoc(note.doc).includes(query);
}

function normalizeTagLabel(value: string): string | null {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  return compact.slice(0, 24);
}

function formatDisplayVersion(version: string): string {
  const trimmed = version.trim();
  if (!trimmed) return trimmed;
  if (/^\d+\.\d+\.\d+b$/i.test(trimmed)) return trimmed;
  return trimmed.replace(/-beta(?:\.\d+)?$/i, "b");
}

type ParsedVersion = {
  core: number[];
  prerelease: string[];
};

function parseVersion(version: string): ParsedVersion {
  const trimmed = version.trim();
  const [mainPart, prereleasePart = ""] = trimmed.split("-", 2);
  const core = mainPart
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));

  const prerelease = prereleasePart
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    core,
    prerelease,
  };
}

function comparePrereleasePart(left: string, right: string): number {
  const leftNumber = Number.parseInt(left, 10);
  const rightNumber = Number.parseInt(right, 10);
  const leftIsNumber = String(leftNumber) === left;
  const rightIsNumber = String(rightNumber) === right;

  if (leftIsNumber && rightIsNumber) {
    if (leftNumber > rightNumber) return 1;
    if (leftNumber < rightNumber) return -1;
    return 0;
  }

  if (leftIsNumber) return -1;
  if (rightIsNumber) return 1;

  return left.localeCompare(right, "en", { sensitivity: "base" });
}

function compareVersions(left: string, right: string): number {
  const leftParsed = parseVersion(left);
  const rightParsed = parseVersion(right);
  const length = Math.max(leftParsed.core.length, rightParsed.core.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParsed.core[index] ?? 0;
    const rightValue = rightParsed.core[index] ?? 0;

    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }

  if (leftParsed.prerelease.length === 0 && rightParsed.prerelease.length > 0) return 1;
  if (leftParsed.prerelease.length > 0 && rightParsed.prerelease.length === 0) return -1;

  const prereleaseLength = Math.max(leftParsed.prerelease.length, rightParsed.prerelease.length);
  for (let index = 0; index < prereleaseLength; index += 1) {
    const leftValue = leftParsed.prerelease[index];
    const rightValue = rightParsed.prerelease[index];

    if (typeof leftValue === "undefined") return -1;
    if (typeof rightValue === "undefined") return 1;

    const comparison = comparePrereleasePart(leftValue, rightValue);
    if (comparison !== 0) return comparison;
  }

  return 0;
}

function EmptySearchIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M0 16q0 3.264 1.28 6.208t3.392 5.12 5.12 3.424 6.208 1.248 6.208-1.248 5.12-3.424 3.392-5.12 1.28-6.208-1.28-6.208-3.392-5.12-5.088-3.392-6.24-1.28q-3.264 0-6.208 1.28t-5.12 3.392-3.392 5.12-1.28 6.208zM4 16q0-3.264 1.6-6.016t4.384-4.352 6.016-1.632 6.016 1.632 4.384 4.352 1.6 6.016-1.6 6.048-4.384 4.352-6.016 1.6-6.016-1.6-4.384-4.352-1.6-6.048zM9.76 20.256q0 0.832 0.576 1.408t1.44 0.608 1.408-0.608l2.816-2.816 2.816 2.816q0.576 0.608 1.408 0.608t1.44-0.608 0.576-1.408-0.576-1.408l-2.848-2.848 2.848-2.816q0.576-0.576 0.576-1.408t-0.576-1.408-1.44-0.608-1.408 0.608l-2.816 2.816-2.816-2.816q-0.576-0.608-1.408-0.608t-1.44 0.608-0.576 1.408 0.576 1.408l2.848 2.816-2.848 2.848q-0.576 0.576-0.576 1.408z"
        fill="currentColor"
      />
    </svg>
  );
}

function TagLegendIcon() {
  return <TagLabelIcon />;
}

function ChecklistSettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8.5 12.5L10.5 14.5L15.5 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MathResultsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18.707 8.535c-.391-.391-1.023-.391-1.414 0-1.264 1.264-3.321 1.264-4.586 0-2.045-2.044-5.371-2.042-7.414 0-.391.391-.391 1.023 0 1.414s1.023.391 1.414 0c.374-.374.82-.624 1.293-.776v7.827c0 .553.447 1 1 1s1-.447 1-1v-7.826c.472.152.919.401 1.293.775.768.767 1.715 1.245 2.707 1.437v5.614c0 .553.447 1 1 1s1-.447 1-1v-5.614c.992-.191 1.939-.67 2.707-1.437.391-.39.391-1.023 0-1.414z"
        fill="currentColor"
      />
    </svg>
  );
}

function SettingsResetIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M6 6l8 8M14 6l-8 8"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FeedbackIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M4.75 15.25V4.75C4.75 4.198 5.198 3.75 5.75 3.75H14.25C14.802 3.75 15.25 4.198 15.25 4.75V11.75C15.25 12.302 14.802 12.75 14.25 12.75H8.75L4.75 15.25Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7 7.5H13M7 10H11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function Home() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isInitialNotesLoaded, setIsInitialNotesLoaded] = useState(false);
  const [hasManualSelectionCleared, setHasManualSelectionCleared] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const insertCustomEmojiFn = useRef<null | ((src: string) => void)>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef(false);
  const latestNotesRef = useRef<Note[]>([]);
  const [editorHistory, setEditorHistory] = useState<{
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
  } | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [deleteConfirmState, setDeleteConfirmState] = useState<{ id: string; label: string } | null>(null);
  const [tagDialogState, setTagDialogState] = useState<{ id: string; label: string; hasTag: boolean } | null>(null);
  const [tagDialogValue, setTagDialogValue] = useState("");
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [showOlderChangelogEntries, setShowOlderChangelogEntries] = useState(false);
  const [isTagLegendOpen, setIsTagLegendOpen] = useState(false);
  const [isCloudKeyDialogOpen, setIsCloudKeyDialogOpen] = useState(false);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [isResetAppDialogOpen, setIsResetAppDialogOpen] = useState(false);
  const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [cloudKeyValue, setCloudKeyValue] = useState("");
  const [feedbackValue, setFeedbackValue] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [settingsNameValue, setSettingsNameValue] = useState("");
  const [settingsThemeValue, setSettingsThemeValue] = useState<AppTheme>(DEFAULT_APP_SETTINGS.theme);
  const [settingsDesignValue, setSettingsDesignValue] = useState<DesignMode>(DEFAULT_DESIGN_MODE);
  const [settingsActiveTab, setSettingsActiveTab] = useState<SettingsDialogTab>("notes");
  const [settingsMoveCompletedChecklistItemsToBottomValue, setSettingsMoveCompletedChecklistItemsToBottomValue] = useState(
    DEFAULT_APP_SETTINGS.moveCompletedChecklistItemsToBottom,
  );
  const [settingsShowMathResultsPreviewValue, setSettingsShowMathResultsPreviewValue] = useState(
    DEFAULT_APP_SETTINGS.showMathResultsPreview,
  );
  const [settingsShowPersistentDesignSwitcherValue, setSettingsShowPersistentDesignSwitcherValue] = useState(
    DEFAULT_APP_SETTINGS.showPersistentDesignSwitcher,
  );
  const [onboardingNameValue, setOnboardingNameValue] = useState(DEFAULT_APP_SETTINGS.userName);
  const [onboardingThemeValue, setOnboardingThemeValue] = useState<AppTheme>(DEFAULT_APP_SETTINGS.theme);
  const [onboardingDesignValue, setOnboardingDesignValue] = useState<DesignMode>(DEFAULT_DESIGN_MODE);
  const [hasCloudKey, setHasCloudKey] = useState(() => hasCloudSyncAccessKey());
  const appSettings = useSyncExternalStore(subscribeAppSettings, getDocumentAppSettings, () => DEFAULT_APP_SETTINGS);
  const designMode = useSyncExternalStore(subscribeDesignMode, getDocumentDesignMode, () => DEFAULT_DESIGN_MODE);
  const pendingPrintNoteIdRef = useRef<string | null>(null);
  const pendingNoteFilePayloadsRef = useRef<DesktopOpenNoteFilePayload[]>([]);
  const isProcessingPendingNoteFilesRef = useRef(false);
  const hasLoadedNotesRef = useRef(false);
  const tagDialogInputRef = useRef<HTMLInputElement | null>(null);
  const cloudKeyInputRef = useRef<HTMLInputElement | null>(null);
  const feedbackTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const settingsInputRef = useRef<HTMLInputElement | null>(null);
  const onboardingInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      const loaded = normalizeTitles(sortNotes(await loadNotes()));
      setNotes(loaded);
      latestNotesRef.current = loaded;
      hasLoadedNotesRef.current = true;
      setIsInitialNotesLoaded(true);
      setActiveId(loaded[0]?.id ?? null);
      setHasManualSelectionCleared(false);
    })();
  }, []);

  const sortedNotes = notes;
  const normalizedQuery = query.trim().toLocaleLowerCase("it-IT");
  const hasSearchQuery = normalizedQuery.length > 0;
  const {
    activeCount,
    archivedCount,
    availableTags,
    effectiveSelectedTag,
    filtered,
    visibleNotes,
  } = useMemo(() => {
    const tagSet = new Set<string>();
    const nextVisibleNotes: Note[] = [];
    let nextActiveCount = 0;
    let nextArchivedCount = 0;

    for (const note of sortedNotes) {
      if (note.archived) {
        nextArchivedCount += 1;
      } else {
        nextActiveCount += 1;
      }

      const normalizedTag = normalizeTagLabel(note.tag ?? "");
      if (normalizedTag) {
        tagSet.add(normalizedTag);
      }

      if (Boolean(note.archived) === showArchived) {
        nextVisibleNotes.push(note);
      }
    }

    const nextAvailableTags = [...tagSet].sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
    const nextEffectiveSelectedTag = selectedTag && tagSet.has(selectedTag) ? selectedTag : null;
    const nextFiltered = !hasSearchQuery && !nextEffectiveSelectedTag
      ? nextVisibleNotes
      : nextVisibleNotes.filter((note) => {
          if (nextEffectiveSelectedTag && normalizeTagLabel(note.tag ?? "") !== nextEffectiveSelectedTag) {
            return false;
          }

          if (hasSearchQuery && !noteMatchesQuery(note, normalizedQuery)) {
            return false;
          }

          return true;
        });

    return {
      activeCount: nextActiveCount,
      archivedCount: nextArchivedCount,
      availableTags: nextAvailableTags,
      effectiveSelectedTag: nextEffectiveSelectedTag,
      filtered: nextFiltered,
      visibleNotes: nextVisibleNotes,
    };
  }, [hasSearchQuery, normalizedQuery, selectedTag, showArchived, sortedNotes]);

  const hasActiveFilters = hasSearchQuery || Boolean(effectiveSelectedTag);
  const activePool = hasActiveFilters ? filtered : visibleNotes;
  const hasEmptyFilterState = hasActiveFilters && filtered.length === 0;
  const active = useMemo(
    () => activePool.find((n) => n.id === activeId) ?? (hasManualSelectionCleared ? null : activePool[0] ?? null),
    [activePool, activeId, hasManualSelectionCleared],
  );
  const activeNoteId = active?.id ?? null;
  const visibleEditorHistory = active ? editorHistory : null;
  const emptySelectionTitle = hasEmptyFilterState ? "Nessuna nota trovata" : "Nessuna nota selezionata";
  const emptySelectionText = hasSearchQuery
    ? `Nessuna nota trovata per "${query.trim()}".`
    : effectiveSelectedTag
      ? `Nessuna nota nel tag #${effectiveSelectedTag.toLowerCase()}.`
      : showArchived
        ? "Seleziona una nota archiviata."
        : visibleNotes.length > 0
          ? "Seleziona una nota dalla lista oppure premi Esc per chiuderla."
          : "Crea una nota per iniziare.";

  const customTagLegendGroups = useMemo(() => getCustomTagLegendGroups(), []);
  const normalizedAppUserName = useMemo(() => normalizeAppUserName(appSettings.userName), [appSettings.userName]);
  const hasCustomAppUserName = normalizedAppUserName.length > 0;
  const appDisplayName = "Note";
  const headerAppDisplayName = hasCustomAppUserName ? `Note di ${normalizedAppUserName}` : "Note";
  const specialAppBrandIcon = useMemo(() => getSpecialAppBrandIcon(normalizedAppUserName), [normalizedAppUserName]);
  const isOnboardingDialogOpen = !appSettings.hasCompletedOnboarding;

  useEffect(() => {
    if (!isOnboardingDialogOpen) return;

    const storedSettings = getStoredAppSettings();
    const storedDesignMode = getStoredDesignMode();

    setOnboardingNameValue(storedSettings.userName);
    setOnboardingThemeValue(storedSettings.theme);
    setOnboardingDesignValue(storedDesignMode);
  }, [isOnboardingDialogOpen]);

  useEffect(() => {
    if (!updateManifestUrl) return;

    let isDisposed = false;

    async function checkForUpdates() {
      try {
        const requestUrl = new URL(updateManifestUrl, window.location.origin);
        const desktopPlatform = getDesktopPlatform();

        if (desktopPlatform) {
          requestUrl.searchParams.set("platform", desktopPlatform);
        }

        const response = await fetch(requestUrl.toString(), {
          cache: "no-store",
        });
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

    void checkForUpdates();

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      void checkForUpdates();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      isDisposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    document.title = appDisplayName;
  }, [appDisplayName]);

  const flushPendingSave = useCallback(() => {
    if (!hasLoadedNotesRef.current) return;
    if (!pendingSaveRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    pendingSaveRef.current = false;
    saveNotesImmediately(latestNotesRef.current);
  }, []);

  const activateNote = useCallback((id: string | null) => {
    setHasManualSelectionCleared(false);
    setActiveId(id);
  }, []);

  const clearActiveSelection = useCallback(() => {
    flushPendingSave();
    setHasManualSelectionCleared(true);
    setActiveId(null);
  }, [flushPendingSave]);

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

  const performPrint = useCallback(
    async () => {
      flushPendingSave();

      if (window.noteDiJacoDesktop?.openPrintPreview) {
        const result = await window.noteDiJacoDesktop.openPrintPreview();
        if (result.ok) return;
        alert(`Anteprima di stampa non disponibile.\n\nDettagli: ${result.error || "Errore sconosciuto."}`);
        return;
      }

      const previousTitle = document.title;
      let restored = false;

      const restoreTitle = () => {
        if (restored) return;
        restored = true;
        document.title = previousTitle;
        window.removeEventListener("afterprint", restoreTitle);
      };

      document.title = "";
      window.addEventListener("afterprint", restoreTitle);

      requestAnimationFrame(() => {
        window.print();
        window.setTimeout(restoreTitle, 1200);
      });
    },
    [flushPendingSave],
  );

  const requestPrint = useCallback(
    (id: string | null = activeNoteId) => {
      if (!id) return;

      const note = notes.find((entry) => entry.id === id);
      if (!note) return;

      if (activeNoteId === id) {
        void performPrint();
        return;
      }

      pendingPrintNoteIdRef.current = id;
      activateNote(id);
    },
    [activateNote, activeNoteId, notes, performPrint],
  );

  useEffect(() => {
    const pendingId = pendingPrintNoteIdRef.current;
    if (!pendingId || pendingId !== activeNoteId) return;

    const note = notes.find((entry) => entry.id === pendingId);
    pendingPrintNoteIdRef.current = null;
    if (!note) return;

    const timeoutId = window.setTimeout(() => {
      void performPrint();
    }, 40);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeNoteId, notes, performPrint]);

  const persist = useCallback(async (next: Note[]) => {
    const sorted = sortNotes(next);
    setNotes(sorted);
    latestNotesRef.current = sorted;
    saveNotesLocallyImmediately(sorted);

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    pendingSaveRef.current = true;
    saveTimeoutRef.current = setTimeout(() => {
      void saveNotes(latestNotesRef.current);
      saveTimeoutRef.current = null;
      pendingSaveRef.current = false;
    }, SAVE_DEBOUNCE_MS);

    return sorted;
  }, []);

  const openIncomingSingleNote = useCallback(
    async (incomingNote: Note) => {
      flushPendingSave();

      const next = normalizeTitles([
        incomingNote,
        ...latestNotesRef.current.filter((entry) => entry.id !== incomingNote.id),
      ]);

      await persist(next);
      setShowArchived(Boolean(incomingNote.archived));
      setSelectedTag(null);
      setQuery("");
      activateNote(incomingNote.id);
    },
    [activateNote, flushPendingSave, persist],
  );

  const restoreImportedBackup = useCallback(
    async (options: {
      appSettings: ReturnType<typeof getStoredAppSettings> | null;
      designMode: ReturnType<typeof getStoredDesignMode> | null;
      notes: Note[];
      stickerPacks: Awaited<ReturnType<typeof loadStickerPacks>>;
    }) => {
      flushPendingSave();

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      pendingSaveRef.current = false;

      const nextNotes = normalizeTitles(sortNotes(options.notes));
      await saveNotes(nextNotes);
      await saveStickerPacks(options.stickerPacks);

      const nextAppSettings = options.appSettings ?? getStoredAppSettings();
      setStoredAppSettings(nextAppSettings);
      setDocumentAppSettings(nextAppSettings);

      const nextDesignMode = options.designMode ?? getStoredDesignMode();
      setStoredDesignMode(nextDesignMode);
      setDocumentDesignMode(nextDesignMode);

      setNotes(nextNotes);
      latestNotesRef.current = nextNotes;
      setShowArchived(false);
      setSelectedTag(null);
      setQuery("");
      setHasManualSelectionCleared(false);
      setActiveId(nextNotes[0]?.id ?? null);
      setHasCloudKey(hasCloudSyncAccessKey());
    },
    [flushPendingSave],
  );

  const processPendingNoteFiles = useCallback(async () => {
    if (!hasLoadedNotesRef.current || isProcessingPendingNoteFilesRef.current) return;
    if (pendingNoteFilePayloadsRef.current.length === 0) return;

    isProcessingPendingNoteFilesRef.current = true;

    try {
      while (pendingNoteFilePayloadsRef.current.length > 0) {
        const payload = pendingNoteFilePayloadsRef.current.shift();
        if (!payload) continue;

        const parsed = parseNotesImportFile(payload.content);
        if (!parsed) {
          alert(`Il file ${payload.fileName} non contiene un file .nby valido.`);
          continue;
        }

        if (parsed.kind === "single-note") {
          await openIncomingSingleNote(parsed.note);
          continue;
        }

        const confirmed = confirm(
          `Il file ${payload.fileName} contiene un backup completo dell'app.\n\nVuoi ripristinarlo ora?`,
        );
        if (!confirmed) {
          continue;
        }

        await restoreImportedBackup(parsed);
        alert("Backup ripristinato. L'app verrà ricaricata per applicare tutto.");
        window.location.reload();
        return;
      }
    } finally {
      isProcessingPendingNoteFilesRef.current = false;
    }
  }, [openIncomingSingleNote, restoreImportedBackup]);

  useEffect(() => {
    const unsubscribe = subscribeDesktopOpenNoteFile((payload) => {
      pendingNoteFilePayloadsRef.current.push(payload);
      if (hasLoadedNotesRef.current) {
        void processPendingNoteFiles();
      }
    });

    return unsubscribe;
  }, [processPendingNoteFiles]);

  useEffect(() => {
    if (!isInitialNotesLoaded) return;
    void processPendingNoteFiles();
  }, [isInitialNotesLoaded, processPendingNoteFiles]);

  const newNote = useCallback(async () => {
    const id = nanoid();
    const n: Note = {
      id,
      title: "",
      doc: emptyDoc(),
      createdAt: now(),
      updatedAt: now(),
      pinned: false,
      archived: false,
    };
    const next = [n, ...notes];
    await persist(next);
    setShowArchived(false);
    setSelectedTag(null);
    setQuery("");
    activateNote(id);
  }, [activateNote, notes, persist]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "escape") {
        if (!activeNoteId || document.querySelector(".editorOverlay [role='dialog']")) return;
        event.preventDefault();
        clearActiveSelection();
        return;
      }

      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (key === "p") {
        if (!activeNoteId) return;

        event.preventDefault();
        requestPrint(activeNoteId);
        return;
      }

      if (key === "n") {
        event.preventDefault();
        void newNote();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [activeNoteId, clearActiveSelection, newNote, requestPrint]);

  async function updateActive(patch: Partial<Note>) {
    if (!active) return;
    const next = notes.map((n) => (n.id === active.id ? { ...n, ...patch, updatedAt: now() } : n));
    await persist(next);
  }

  async function togglePin(id: string) {
    const next = notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned, updatedAt: now() } : n));
    await persist(next);
  }

  async function setNoteTag(id: string, rawTag: string) {
    const normalizedTag = normalizeTagLabel(rawTag) ?? undefined;
    const next = notes.map((n) => (n.id === id ? { ...n, tag: normalizedTag, updatedAt: now() } : n));
    await persist(next);
  }

  function closeTagDialog() {
    setTagDialogState(null);
    setTagDialogValue("");
  }

  function closeCloudKeyDialog() {
    setIsCloudKeyDialogOpen(false);
    setCloudKeyValue("");
  }

  function closeSettingsDialog() {
    setIsSettingsDialogOpen(false);
    setIsResetAppDialogOpen(false);
    closeFeedbackDialog();
  }

  function applyDesignMode(nextMode: DesignMode) {
    setDocumentDesignMode(nextMode);
    setStoredDesignMode(nextMode);
  }

  function toggleQuickDesignMode() {
    applyDesignMode(designMode === "classic" ? "v103b" : "classic");
  }

  function persistAppSettings(nextSettings: typeof appSettings) {
    setDocumentAppSettings(nextSettings);
    setStoredAppSettings(nextSettings);
  }

  function openSettingsDialog() {
    setSettingsNameValue(appSettings.userName);
    setSettingsThemeValue(appSettings.theme);
    setSettingsDesignValue(designMode);
    setSettingsMoveCompletedChecklistItemsToBottomValue(appSettings.moveCompletedChecklistItemsToBottom);
    setSettingsShowMathResultsPreviewValue(appSettings.showMathResultsPreview);
    setSettingsShowPersistentDesignSwitcherValue(appSettings.showPersistentDesignSwitcher);
    setSettingsActiveTab("notes");
    setIsSettingsDialogOpen(true);
  }

  function saveSettingsDialog() {
    const nextSettings = {
      userName: settingsNameValue,
      theme: settingsThemeValue,
      hasCompletedOnboarding: appSettings.hasCompletedOnboarding,
      moveCompletedChecklistItemsToBottom: settingsMoveCompletedChecklistItemsToBottomValue,
      showMathResultsPreview: settingsShowMathResultsPreviewValue,
      showPersistentDesignSwitcher: settingsShowPersistentDesignSwitcherValue,
    };
    persistAppSettings(nextSettings);
    applyDesignMode(settingsDesignValue);
    closeSettingsDialog();
  }

  function openResetAppDialog() {
    setIsResetAppDialogOpen(true);
  }

  function closeResetAppDialog() {
    setIsResetAppDialogOpen(false);
  }

  function openFeedbackDialog() {
    setFeedbackValue("");
    setFeedbackStatus(null);
    setIsFeedbackDialogOpen(true);
  }

  function closeFeedbackDialog() {
    setIsFeedbackDialogOpen(false);
    setIsSubmittingFeedback(false);
    setFeedbackValue("");
    setFeedbackStatus(null);
  }

  async function submitFeedbackDialog() {
    const message = feedbackValue.trim();
    if (!message || isSubmittingFeedback) return;

    setIsSubmittingFeedback(true);
    setFeedbackStatus(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          designMode,
          message,
          userName: normalizedAppUserName,
          version: formatDisplayVersion(appVersion),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; ok?: boolean } | null;

      if (!response.ok || !payload?.ok) {
        setFeedbackStatus({
          kind: "error",
          text: payload?.error || "Invio non riuscito. Riprova tra poco.",
        });
        return;
      }

      setFeedbackValue("");
      setFeedbackStatus({
        kind: "success",
        text: "Feedback ricevuto con successo. Grazie.",
      });
    } catch {
      setFeedbackStatus({
        kind: "error",
        text: "Connessione non disponibile. Riprova tra poco.",
      });
    } finally {
      setIsSubmittingFeedback(false);
    }
  }

  async function confirmResetApp() {
    flushPendingSave();

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    pendingSaveRef.current = false;

    await resetStoredAppData();

    persistAppSettings(DEFAULT_APP_SETTINGS);
    applyDesignMode(DEFAULT_DESIGN_MODE);

    setHasCloudKey(false);
    setCloudKeyValue("");
    setSettingsNameValue(DEFAULT_APP_SETTINGS.userName);
    setSettingsThemeValue(DEFAULT_APP_SETTINGS.theme);
    setSettingsDesignValue(DEFAULT_DESIGN_MODE);
    setSettingsMoveCompletedChecklistItemsToBottomValue(DEFAULT_APP_SETTINGS.moveCompletedChecklistItemsToBottom);
    setSettingsShowMathResultsPreviewValue(DEFAULT_APP_SETTINGS.showMathResultsPreview);
    setSettingsShowPersistentDesignSwitcherValue(DEFAULT_APP_SETTINGS.showPersistentDesignSwitcher);
    setOnboardingNameValue(DEFAULT_APP_SETTINGS.userName);
    setOnboardingThemeValue(DEFAULT_APP_SETTINGS.theme);
    setOnboardingDesignValue(DEFAULT_DESIGN_MODE);
    setNotes([]);
    latestNotesRef.current = [];
    setActiveId(null);
    setHasManualSelectionCleared(false);
    setShowArchived(false);
    setSelectedTag(null);
    setQuery("");
    closeSettingsDialog();
    window.location.reload();
  }

  function saveOnboardingDialog() {
    const nextSettings = {
      userName: onboardingNameValue,
      theme: onboardingThemeValue,
      hasCompletedOnboarding: true,
      moveCompletedChecklistItemsToBottom: DEFAULT_APP_SETTINGS.moveCompletedChecklistItemsToBottom,
      showMathResultsPreview: DEFAULT_APP_SETTINGS.showMathResultsPreview,
      showPersistentDesignSwitcher: DEFAULT_APP_SETTINGS.showPersistentDesignSwitcher,
    };
    persistAppSettings(nextSettings);
    applyDesignMode(onboardingDesignValue);
  }

  function openCloudKeyDialog() {
    setCloudKeyValue(getStoredCloudSyncAccessKey() ?? "");
    setIsCloudKeyDialogOpen(true);
  }

  function openTagDialog(id: string) {
    const note = notes.find((entry) => entry.id === id);
    if (!note) return;

    setTagDialogState({
      id,
      label: titleFromDoc(note.doc) || "questa nota",
      hasTag: Boolean(note.tag),
    });
    setTagDialogValue(note.tag ?? "");
  }

  async function saveTagDialog() {
    if (!tagDialogState) return;

    const normalized = normalizeTagLabel(tagDialogValue);
    if (!normalized) return;

    await setNoteTag(tagDialogState.id, normalized);
    closeTagDialog();
  }

  async function removeTagDialog() {
    if (!tagDialogState) return;

    await setNoteTag(tagDialogState.id, "");
    closeTagDialog();
  }

  async function saveCloudKeyDialog() {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingSaveRef.current = false;
    await saveNotes(latestNotesRef.current);

    const normalized = setStoredCloudSyncAccessKey(cloudKeyValue);
    if (!normalized) return;

    setHasCloudKey(true);
    closeCloudKeyDialog();
    window.location.reload();
  }

  async function clearCloudKeyDialog() {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingSaveRef.current = false;
    await saveNotes(latestNotesRef.current);

    setStoredCloudSyncAccessKey("");
    setHasCloudKey(false);
    closeCloudKeyDialog();
    window.location.reload();
  }

  function openChangelog() {
    setShowOlderChangelogEntries(false);
    setIsTagLegendOpen(false);
    setIsChangelogOpen(true);
  }

  function closeChangelog() {
    setShowOlderChangelogEntries(false);
    setIsTagLegendOpen(false);
    setIsChangelogOpen(false);
  }

  useEffect(() => {
    if (!tagDialogState) return;

    const timeoutId = window.setTimeout(() => {
      tagDialogInputRef.current?.focus();
      tagDialogInputRef.current?.select();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [tagDialogState]);

  useEffect(() => {
    if (!isCloudKeyDialogOpen) return;

    const timeoutId = window.setTimeout(() => {
      cloudKeyInputRef.current?.focus();
      cloudKeyInputRef.current?.select();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isCloudKeyDialogOpen]);

  useEffect(() => {
    if (!isFeedbackDialogOpen) return;

    const timeoutId = window.setTimeout(() => {
      feedbackTextareaRef.current?.focus();
      feedbackTextareaRef.current?.select();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isFeedbackDialogOpen]);

  useEffect(() => {
    if (!isSettingsDialogOpen) return;

    const timeoutId = window.setTimeout(() => {
      settingsInputRef.current?.focus();
      settingsInputRef.current?.select();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (isResetAppDialogOpen) {
        setIsResetAppDialogOpen(false);
        return;
      }
      setIsSettingsDialogOpen(false);
      setIsResetAppDialogOpen(false);
      setIsFeedbackDialogOpen(false);
      setIsSubmittingFeedback(false);
      setFeedbackValue("");
      setFeedbackStatus(null);
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isResetAppDialogOpen, isSettingsDialogOpen]);

  useEffect(() => {
    if (!isOnboardingDialogOpen) return;

    const timeoutId = window.setTimeout(() => {
      onboardingInputRef.current?.focus();
      onboardingInputRef.current?.select();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isOnboardingDialogOpen]);

  async function toggleArchive(id: string) {
    const target = notes.find((n) => n.id === id);
    if (!target) return;

    const next = notes.map((n) => (n.id === id ? { ...n, archived: !n.archived, updatedAt: now() } : n));
    const persisted = await persist(next);

    if (activeNoteId !== id) return;

    const nextArchived = !target.archived;
    if (nextArchived === showArchived) return;

    const replacement = persisted.find((note) => Boolean(note.archived) === showArchived);
    activateNote(replacement?.id ?? null);
  }

  async function deleteNote(id: string) {
    const noteToDelete = notes.find((n) => n.id === id);
    if (!noteToDelete) return;

    const label = titleFromDoc(noteToDelete.doc) || "questa nota";
    setDeleteConfirmState({ id, label });
  }

  async function confirmDeleteNote() {
    if (!deleteConfirmState) return;

    const { id } = deleteConfirmState;
    setDeleteConfirmState(null);

    const next = notes.filter((n) => n.id !== id);
    const persisted = await persist(next);
    if (activeNoteId === id) {
      const replacement = persisted.find((note) => Boolean(note.archived) === showArchived);
      activateNote(replacement?.id ?? null);
    }
  }

  async function downloadBackup() {
    const data = serializeAppBackupFile({
      notes: latestNotesRef.current,
      stickerPacks: await loadStickerPacks(),
      appSettings: getStoredAppSettings(),
      designMode: getStoredDesignMode(),
    });

    if (window.noteDiJacoDesktop?.saveNoteFileToDesktop) {
      const result = await saveDesktopNoteFileToDesktop({
        content: data,
        fileName: BACKUP_FILE_NAME,
      });

      if (!result.ok) {
        alert(`Salvataggio backup .nby non riuscito.\n\nDettagli: ${result.error || "Errore sconosciuto."}`);
        return;
      }

      alert(`Backup salvato.\n\n${result.filePath}`);
      return;
    }

    const blob = new Blob([data], { type: NOTE_FILE_MIME });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = BACKUP_FILE_NAME;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadSingleNote(id: string) {
    const note = notes.find((entry) => entry.id === id);
    if (!note) return;

    const fileName = getSingleNoteFileName(note);
    const data = serializeSingleNoteFile(note);

    if (window.noteDiJacoDesktop?.saveNoteFileToDesktop) {
      const result = await saveDesktopNoteFileToDesktop({
        content: data,
        fileName,
      });

      if (!result.ok) {
        alert(`Salvataggio .nby non riuscito.\n\nDettagli: ${result.error || "Errore sconosciuto."}`);
        return;
      }

      alert(`Nota salvata sul Desktop.\n\n${result.filePath}`);
      return;
    }

    const blob = new Blob([data], { type: NOTE_FILE_MIME });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importBackup(file: File) {
    try {
      const txt = await file.text();
      const parsed = parseNotesImportFile(txt);
      if (!parsed) {
        alert("File non valido o vuoto.");
        return;
      }

      if (parsed.kind === "single-note") {
        await openIncomingSingleNote(parsed.note);
        return;
      }

      if (parsed.format === "nby-backup") {
        const confirmed = confirm("Questo file contiene un backup completo. OK = ripristina tutto adesso.");
        if (!confirmed) return;

        await restoreImportedBackup(parsed);
        alert("Backup ripristinato. L'app verrà ricaricata per applicare tutto.");
        window.location.reload();
        return;
      }

      const incoming = parsed.notes;

      const mode = confirm("OK = UNISCI con le note esistenti. Annulla = SOSTITUISCI tutto.");
      let next: Note[];
      if (mode) {
        const map = new Map<string, Note>();
        for (const n of latestNotesRef.current) map.set(n.id, n);
        for (const n of incoming) map.set(n.id, n);
        next = normalizeTitles(normalizeNotesData([...map.values()]));
      } else {
        next = normalizeTitles(normalizeNotesData(incoming));
      }
      const persisted = await persist(next);
      const replacement = persisted.find((note) => Boolean(note.archived) === showArchived);
      activateNote(replacement?.id ?? null);
    } catch {
      alert("Il file selezionato non contiene un backup valido.");
    }
  }

  function selectNote(id: string) {
    flushPendingSave();
    activateNote(id);
  }

  return (
    <div className="container">
      <div className="appHeaderBar">
        <div className="appBrand">
          <div className={"appBrandIcon" + (specialAppBrandIcon ? " appBrandIconSpecial" : "")} aria-hidden="true">
            {specialAppBrandIcon ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={specialAppBrandIcon.src}
                  alt=""
                  width={34}
                  height={34}
                  className={"appBrandIconImage" + (specialAppBrandIcon.imageClassName ? ` ${specialAppBrandIcon.imageClassName}` : "")}
                />
              </>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/icons/notedijaco_icon.png?v=20260303-234200"
                  alt=""
                  width={34}
                  height={34}
                  className="appBrandIconImage"
                />
              </>
            )}
          </div>
          <div className="appBrandTitleRow">
            <div className="appBrandTitle">
              {hasCustomAppUserName ? (
                headerAppDisplayName
              ) : (
                <span className="appBrandTitleRich">
                  <span className="appBrandTitleMain">Note</span>
                  <span className="appBrandTitleByline">by jaco</span>
                </span>
              )}
            </div>
            {appSettings.showPersistentDesignSwitcher ? (
              <button
                className={"appHeaderDesignToggle" + (designMode === "v103b" ? " active" : "")}
                type="button"
                onClick={toggleQuickDesignMode}
                aria-label={`Passa al design ${designMode === "classic" ? "moderno" : "classico"}`}
                title={`Passa al design ${designMode === "classic" ? "moderno" : "classico"}`}
              >
                <span className="appHeaderDesignToggleIcon" aria-hidden="true">
                  <DesignModeIcon />
                </span>
              </button>
            ) : null}
          </div>
          {availableUpdate ? (
            <a
              className="appUpdateBadge"
              href={availableUpdate.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
                title={`Scarica aggiornamento ${formatDisplayVersion(availableUpdate.version)}`}
              aria-label={`Nuova versione disponibile ${formatDisplayVersion(availableUpdate.version)}. Scarica aggiornamento.`}
            >
              <span className="appUpdateBadgeIcon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 4v10m0 0 4-4m-4 4-4-4M5 18h14"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="appUpdateBadgeText">Nuova versione {formatDisplayVersion(availableUpdate.version)}</span>
            </a>
          ) : null}
        </div>
        <div className="appHeaderActions">
          <button
            className="btn appHeaderHistoryBtn appHeaderSettingsBtn"
            onClick={openSettingsDialog}
            type="button"
            title="Impostazioni"
            aria-label="Impostazioni"
          >
            <span className="appHeaderSettingsIcon" aria-hidden="true" />
          </button>
          <button
            className="btn appHeaderHistoryBtn"
            disabled={!activeNoteId}
            onClick={() => requestPrint(activeNoteId)}
            type="button"
            title="Stampa nota"
            aria-label={activeNoteId ? "Stampa nota" : "Nessuna nota da stampare"}
          >
            <PrintIcon className="undoRedoIcon" />
          </button>
          <button
            className="btn appHeaderHistoryBtn"
            disabled={!visibleEditorHistory?.canUndo}
            onClick={() => visibleEditorHistory?.undo()}
            type="button"
            title="Undo"
            aria-label="Undo"
          >
            <svg className="undoRedoIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M9 7 5 11l4 4M6 11h8a5 5 0 1 1 0 10h-1"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            className="btn appHeaderHistoryBtn"
            disabled={!visibleEditorHistory?.canRedo}
            onClick={() => visibleEditorHistory?.redo()}
            type="button"
            title="Redo"
            aria-label="Redo"
          >
            <svg className="undoRedoIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="m15 7 4 4-4 4M18 11h-8a5 5 0 1 0 0 10h1"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="shell">
        <NoteList
          designMode={designMode}
          notes={filtered}
          activeId={activeNoteId}
          showArchived={showArchived}
          activeCount={activeCount}
          archivedCount={archivedCount}
          selectedTag={effectiveSelectedTag}
          availableTags={availableTags}
          query={query}
          setQuery={setQuery}
          onSelectTag={setSelectedTag}
          onSelect={selectNote}
          onNew={newNote}
          onOpenArchived={() => setShowArchived(true)}
          onCloseArchived={() => setShowArchived(false)}
          onExport={downloadBackup}
          onImport={importBackup}
          onExportOne={downloadSingleNote}
          onPrint={requestPrint}
          onManageTag={openTagDialog}
          onTogglePin={togglePin}
          onToggleArchive={toggleArchive}
          onDelete={deleteNote}
        />

        <div className="editorLayout">
          <div className="editorColumn">
            {active ? (
              <div className="printNoteFrame">
                <Editor
                  key={active.id}
                  designMode={designMode}
                  noteId={active.id}
                  doc={active.doc}
                  lastUpdatedAt={active.updatedAt}
                  moveCompletedChecklistItemsToBottom={appSettings.moveCompletedChecklistItemsToBottom}
                  showMathResultsPreview={appSettings.showMathResultsPreview}
                  onChangeDoc={(d) => updateActive({ doc: d, title: titleFromDoc(d) })}
                  onDeleteNote={() => {
                    void deleteNote(active.id);
                  }}
                  onNewNote={newNote}
                  onInsertCustomEmoji={(fn) => {
                    insertCustomEmojiFn.current = fn;
                  }}
                  onHistoryStateChange={setEditorHistory}
                />
              </div>
            ) : (
              showArchived && filtered.length === 0 && !effectiveSelectedTag && !hasSearchQuery ? (
                <div className="card archivedCenterCard">
                  <div className="archivedEmptyState">
                    <span className="archivedEmptyStateIcon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none">
                        <path
                          d="M4 7h16l-1.5 11a2 2 0 0 1-2 1.7H7.5a2 2 0 0 1-2-1.7L4 7Zm0-3h16v3H4V4Zm5 7h6"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>

                    <div className="archivedEmptyStateTitle">Nessuna nota archiviata!</div>

                    <div className="archivedEmptyStateText">
                      Premi
                      <span className="archivedInlineIconChip" aria-hidden="true">
                        <svg className="dotsIcon" viewBox="0 0 1024 1024" fill="none">
                          <path
                            d="M388.8 896.4v-27.198c.6-2.2 1.6-4.2 2-6.4 8.8-57.2 56.4-102.4 112.199-106.2 62.4-4.4 115.2 31.199 132.4 89.199 2.2 7.6 3.8 15.6 5.8 23.4v27.2c-.6 1.8-1.6 3.399-1.8 5.399-8.6 52.8-46.6 93-98.6 104.4-4 .8-8 2-12 3h-27.2c-1.8-.6-3.6-1.6-5.4-1.8-52-8.4-91.599-45.4-103.6-96.8-1.2-5-2.6-9.6-3.8-14.2zm252.4-768.797-.001 27.202c-.6 2.2-1.6 4.2-1.8 6.4-9 57.6-56.8 102.6-113.2 106.2-62.2 4-114.8-32-131.8-90.2-2.2-7.401-3.8-15-5.6-22.401v-27.2c.6-1.8 1.6-3.4 2-5.2 9.6-52 39.8-86 90.2-102.2 6.6-2.2 13.6-3.4 20.4-5.2h27.2c1.8.6 3.6 1.6 5.4 1.8 52.2 8.6 91.6 45.4 103.6 96.8 1.201 4.8 2.401 9.4 3.601 13.999zm-.001 370.801v27.2c-.6 2.2-1.6 4.2-2 6.4-9 57.4-58.6 103.6-114.6 106-63 2.8-116.4-35.2-131.4-93.8-1.6-6.2-3-12.4-4.4-18.6v-27.2c.6-2.2 1.6-4.2 2-6.4 8.8-57.4 58.6-103.601 114.6-106.2 63-3 116.4 35.2 131.4 93.8 1.6 6.4 3 12.6 4.4 18.8Z"
                            fill="currentColor"
                          />
                        </svg>
                      </span>
                      e poi
                      <span className="archivedInlineActionChip">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path
                            d="M4 7h16l-1.5 11a2 2 0 0 1-2 1.7H7.5a2 2 0 0 1-2-1.7L4 7Zm0-3h16v3H4V4Zm5 7h6"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        Archivia
                      </span>
                      per archiviare una nota.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card emptySelectionCard emptySelectionCardCentered">
                  {hasEmptyFilterState ? (
                    <span className="emptySelectionIcon" aria-hidden="true">
                      <EmptySearchIcon />
                    </span>
                  ) : null}
                  <div className="emptySelectionTitle">{emptySelectionTitle}</div>
                  {hasEmptyFilterState || emptySelectionText === "Crea una nota per iniziare." ? (
                    <div className="muted emptySelectionText">{emptySelectionText}</div>
                  ) : null}
                  {!showArchived ? (
                    <div className="emptySelectionActions">
                      <button className="btn primary" onClick={newNote} type="button">+ Nuova nota</button>
                    </div>
                  ) : null}
                </div>
              )
            )}
          </div>

          <div className="customEmojiSidebar">
            <StickerPackPicker
              onPick={(src) => {
                if (!insertCustomEmojiFn.current) return;
                insertCustomEmojiFn.current(src);
              }}
            />
            <div className="appSignature" aria-label="Versione applicazione">
              <div className="appSignatureVersion">{appDisplayName} Ver. {formatDisplayVersion(appVersion)}</div>
              {cloudSyncEnabled ? (
                <div className="appSignatureVersion">
                  Cloud sync {hasCloudKey ? "attivo" : "non configurato"}
                </div>
              ) : null}
              <a
                className="appSignatureAuthor"
                href="https://www.instagram.com/jacofrau/"
                target="_blank"
                rel="noopener noreferrer"
              >
                App di @jacofrau
              </a>
              {cloudSyncEnabled ? (
                <button
                  className="appSignatureChangelog"
                  type="button"
                  onClick={openCloudKeyDialog}
                >
                  <span className="appSignatureChangelogIcon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 4 4 8v4c0 4.4 3.1 7.9 8 8.9 4.9-1 8-4.5 8-8.9V8l-8-4Z"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M12 10.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Zm0-2.2v2.2"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  {hasCloudKey ? "Cambia chiave cloud" : "Configura chiave cloud"}
                </button>
              ) : null}
              <div className="appSignatureActionRow">
                <button
                  className="appSignatureChangelog"
                  type="button"
                  onClick={openChangelog}
                >
                  <span className="appSignatureChangelogIcon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path
                        d="M18.4721 16.7023C17.3398 18.2608 15.6831 19.3584 13.8064 19.7934C11.9297 20.2284 9.95909 19.9716 8.25656 19.0701C6.55404 18.1687 5.23397 16.6832 4.53889 14.8865C3.84381 13.0898 3.82039 11.1027 4.47295 9.29011C5.12551 7.47756 6.41021 5.96135 8.09103 5.02005C9.77184 4.07875 11.7359 3.77558 13.6223 4.16623C15.5087 4.55689 17.1908 5.61514 18.3596 7.14656C19.5283 8.67797 20.1052 10.5797 19.9842 12.5023M19.9842 12.5023L21.4842 11.0023M19.9842 12.5023L18.4842 11.0023"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path d="M12 8V12L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  Changelog
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {deleteConfirmState ? (
        <DeleteConfirmDialog
          label={deleteConfirmState.label}
          onCancel={() => setDeleteConfirmState(null)}
          onConfirm={() => {
            void confirmDeleteNote();
          }}
        />
      ) : null}

      {tagDialogState ? (
        <TagManageDialog
          label={tagDialogState.label}
          hasTag={tagDialogState.hasTag}
          value={tagDialogValue}
          inputRef={tagDialogInputRef}
          canSave={Boolean(normalizeTagLabel(tagDialogValue))}
          onChange={setTagDialogValue}
          onClose={closeTagDialog}
          onRemove={() => {
            void removeTagDialog();
          }}
          onSave={() => {
            void saveTagDialog();
          }}
        />
      ) : null}

      {isOnboardingDialogOpen ? (
        <OnboardingDialog
          inputRef={onboardingInputRef}
          nameValue={onboardingNameValue}
          designValue={onboardingDesignValue}
          themeValue={onboardingThemeValue}
          onNameChange={setOnboardingNameValue}
          onDesignChange={setOnboardingDesignValue}
          onThemeChange={setOnboardingThemeValue}
          onSubmit={saveOnboardingDialog}
        />
      ) : null}

      {isSettingsDialogOpen ? (
        <div
          className="editorOverlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeSettingsDialog();
            }
          }}
        >
          <form
            className="linkDialog settingsDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              saveSettingsDialog();
            }}
          >
            <div className="linkDialogTitle" id="settings-dialog-title">Impostazioni</div>
            <div className="settingsDialogText">
              Personalizza il nome mostrato nell&apos;app e scegli design e tema.
            </div>
            <div className="settingsDialogControls">
              <label className="linkDialogField">
                <span className="linkDialogLabel linkDialogLabelWithIcon">
                  <span className="linkDialogLabelIcon" aria-hidden="true">
                    <NotesTagIcon />
                  </span>
                  <span>Il tuo nome</span>
                </span>
                <input
                  ref={settingsInputRef}
                  className="linkDialogInput"
                  value={settingsNameValue}
                  onChange={(event) => setSettingsNameValue(event.target.value.slice(0, 24))}
                  placeholder="Inserisci il tuo nome"
                  spellCheck={false}
                  maxLength={24}
                />
              </label>
              <div className="settingsTabs" role="tablist" aria-label="Categorie impostazioni">
                <button
                  className={"settingsTabButton" + (settingsActiveTab === "notes" ? " active" : "")}
                  type="button"
                  role="tab"
                  id="settings-tab-notes"
                  aria-selected={settingsActiveTab === "notes"}
                  aria-controls="settings-panel-notes"
                  onClick={() => setSettingsActiveTab("notes")}
                >
                  Note
                </button>
                <button
                  className={"settingsTabButton" + (settingsActiveTab === "design" ? " active" : "")}
                  type="button"
                  role="tab"
                  id="settings-tab-design"
                  aria-selected={settingsActiveTab === "design"}
                  aria-controls="settings-panel-design"
                  onClick={() => setSettingsActiveTab("design")}
                >
                  Design
                </button>
                <button
                  className={"settingsTabButton" + (settingsActiveTab === "user" ? " active" : "")}
                  type="button"
                  role="tab"
                  id="settings-tab-user"
                  aria-selected={settingsActiveTab === "user"}
                  aria-controls="settings-panel-user"
                  onClick={() => setSettingsActiveTab("user")}
                >
                  App
                </button>
              </div>
            </div>
            <OverlayScrollArea
              className="settingsDialogScroll"
              viewportClassName="settingsDialogScrollViewport"
              contentClassName="settingsDialogScrollContent"
            >
              {settingsActiveTab === "notes" ? (
                <section
                  className="settingsCategoryCard settingsTabPanel"
                  id="settings-panel-notes"
                  role="tabpanel"
                  aria-labelledby="settings-tab-notes"
                >
                <div className="settingsCategoryBody">
                  <div className="linkDialogField">
                    <span className="linkDialogLabel linkDialogLabelWithIcon">
                      <span className="linkDialogLabelIcon" aria-hidden="true">
                        <ChecklistSettingsIcon />
                      </span>
                      <span>Checklist:</span>
                    </span>
                    <button
                      className={"settingsToggleOption" + (settingsMoveCompletedChecklistItemsToBottomValue ? " active" : "")}
                      type="button"
                      aria-pressed={settingsMoveCompletedChecklistItemsToBottomValue}
                      onClick={() => {
                        setSettingsMoveCompletedChecklistItemsToBottomValue((prev) => !prev);
                      }}
                    >
                      <span className="settingsToggleOptionText">
                        <span className="settingsToggleOptionTitle">Ordinamento automatico</span>
                        <span className="settingsToggleOptionMeta">
                          Quando attivo, le attività completate vengono spostate automaticamente in fondo alla lista.
                        </span>
                      </span>
                      <span className="settingsToggleSwitch" aria-hidden="true">
                        <span className="settingsToggleKnob" />
                      </span>
                    </button>
                  </div>
                  <div className="linkDialogField">
                    <span className="linkDialogLabel linkDialogLabelWithIcon">
                      <span className="linkDialogLabelIcon" aria-hidden="true">
                        <MathResultsIcon />
                      </span>
                      <span>Risultati matematici</span>
                    </span>
                    <button
                      className={"settingsToggleOption" + (settingsShowMathResultsPreviewValue ? " active" : "")}
                      type="button"
                      aria-pressed={settingsShowMathResultsPreviewValue}
                      onClick={() => {
                        setSettingsShowMathResultsPreviewValue((prev) => !prev);
                      }}
                    >
                      <span className="settingsToggleOptionText">
                        <span className="settingsToggleOptionTitle">Anteprima automatica</span>
                        <span className="settingsToggleOptionMeta">
                          Mostra automaticamente l&apos;anteprima dei risultati dei calcoli. Premi Invio per confermare.
                        </span>
                      </span>
                      <span className="settingsToggleSwitch" aria-hidden="true">
                        <span className="settingsToggleKnob" />
                      </span>
                    </button>
                  </div>
                </div>
                </section>
              ) : null}
              {settingsActiveTab === "design" ? (
                <section
                  className="settingsCategoryCard settingsTabPanel"
                  id="settings-panel-design"
                  role="tabpanel"
                  aria-labelledby="settings-tab-design"
                >
                <div className="settingsCategoryBody">
                  <div className="linkDialogField">
                    <span className="linkDialogLabel linkDialogLabelWithIcon">
                      <span className="linkDialogLabelIcon" aria-hidden="true">
                        <DesignModeIcon />
                      </span>
                      <span>Stile</span>
                    </span>
                    <div className="designModeChoiceGrid" role="radiogroup" aria-label="Design app">
                      <DesignModeOption
                        mode="classic"
                        selected={settingsDesignValue === "classic"}
                        title="Classico"
                        description="Pannelli separati con look piu marcato."
                        onSelect={setSettingsDesignValue}
                      />
                      <DesignModeOption
                        mode="v103b"
                        selected={settingsDesignValue === "v103b"}
                        title="Moderno"
                        description="Layout piu essenziale con toolbar centrale."
                        onSelect={setSettingsDesignValue}
                      />
                    </div>
                  </div>
                  <div className="linkDialogField">
                    <button
                      className={"settingsToggleOption" + (settingsShowPersistentDesignSwitcherValue ? " active" : "")}
                      type="button"
                      aria-pressed={settingsShowPersistentDesignSwitcherValue}
                      onClick={() => {
                        setSettingsShowPersistentDesignSwitcherValue((prev) => !prev);
                      }}
                    >
                      <span className="settingsToggleOptionText">
                        <span className="settingsToggleOptionTitle">Pulsante Stile sempre visibile</span>
                        <span className="settingsToggleOptionMeta">
                          Rende il pulsante Stile sempre visibile, affianco al tuo nome.
                        </span>
                      </span>
                      <span className="settingsToggleSwitch" aria-hidden="true">
                        <span className="settingsToggleKnob" />
                      </span>
                    </button>
                  </div>
                  <div className="linkDialogField">
                    <span className="linkDialogLabel linkDialogLabelWithIcon">
                      <span className="linkDialogLabelIcon" aria-hidden="true">
                        <ThemePaletteIcon />
                      </span>
                      <span>Tema</span>
                    </span>
                    <div className="settingsThemeGrid" role="radiogroup" aria-label="Tema app">
                      <button
                        className={"settingsThemeOption" + (settingsThemeValue === "dark" ? " active" : "")}
                        type="button"
                        role="radio"
                        aria-checked={settingsThemeValue === "dark"}
                        onClick={() => setSettingsThemeValue("dark")}
                      >
                        <span className="settingsThemeSwatch settingsThemeSwatchDark" aria-hidden="true" />
                        <span className="settingsThemeOptionText">
                          <span className="settingsThemeOptionTitle">Scuro</span>
                          <span className="settingsThemeOptionMeta">Tema attuale dell&apos;app</span>
                        </span>
                      </button>
                    </div>
                  </div>
                  <div className="tagManageHint">Altri temi arriveranno più avanti.</div>
                </div>
                </section>
              ) : null}
              {settingsActiveTab === "user" ? (
                <section
                  className="settingsCategoryCard settingsTabPanel"
                  id="settings-panel-user"
                  role="tabpanel"
                  aria-labelledby="settings-tab-user"
                >
                <div className="settingsCategoryBody">
                  <div className="settingsInfoCard">
                    <div className="settingsInfoCardHeader">
                      <span className="settingsInfoCardIcon" aria-hidden="true">
                        <FeedbackIcon />
                      </span>
                      <span className="settingsInfoCardTitle">Hai dei suggerimenti?</span>
                    </div>
                    <div className="settingsInfoCardText">
                      Scrivili qua sotto!
                    </div>
                    <button
                      className="settingsActionButton"
                      type="button"
                      onClick={openFeedbackDialog}
                    >
                      Scrivi feedback
                    </button>
                  </div>
                  <button
                    className="settingsResetButton"
                    type="button"
                    onClick={openResetAppDialog}
                  >
                    <span className="settingsResetButtonIcon" aria-hidden="true">
                      <SettingsResetIcon />
                    </span>
                    <span>Inizializza app</span>
                  </button>
                </div>
                </section>
              ) : null}
            </OverlayScrollArea>
            <div className="linkDialogActions tagManageActions settingsDialogActions">
              <button
                className="linkDialogButton"
                type="button"
                onClick={closeSettingsDialog}
              >
                Annulla
              </button>
              <button
                className="linkDialogButton linkDialogButtonPrimary"
                type="submit"
              >
                Salva
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isResetAppDialogOpen ? (
        <ResetAppDialog
          onCancel={closeResetAppDialog}
          onConfirm={() => {
            void confirmResetApp();
          }}
        />
      ) : null}

      {isFeedbackDialogOpen ? (
        <div
          className="editorOverlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeFeedbackDialog();
            }
          }}
        >
          <div
            className="linkDialog feedbackDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="linkDialogTitle" id="feedback-dialog-title">Suggerimento / Feedback</div>
            <label className="linkDialogField">
              <span className="linkDialogLabel">Il tuo messaggio</span>
              <textarea
                ref={feedbackTextareaRef}
                className="feedbackTextarea"
                value={feedbackValue}
                onChange={(event) => setFeedbackValue(event.target.value)}
                placeholder="Scrivi qui il tuo suggerimento..."
                rows={7}
              />
            </label>
            {feedbackStatus ? (
              <div className={"feedbackDialogStatus" + (feedbackStatus.kind === "success" ? " success" : " error")}>
                {feedbackStatus.text}
              </div>
            ) : null}
            <div className="linkDialogActions tagManageActions">
              <button
                className="linkDialogButton"
                type="button"
                onClick={closeFeedbackDialog}
              >
                Annulla
              </button>
              <button
                className="linkDialogButton linkDialogButtonPrimary"
                type="button"
                onClick={() => {
                  void submitFeedbackDialog();
                }}
                disabled={!feedbackValue.trim() || isSubmittingFeedback}
              >
                {isSubmittingFeedback ? "Invio..." : "Invia feedback"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCloudKeyDialogOpen ? (
        <div
          className="editorOverlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCloudKeyDialog();
            }
          }}
        >
          <div
            className="linkDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cloud-key-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="linkDialogTitle" id="cloud-key-dialog-title">Chiave cloud</div>
            <div className="tagManageText">
              Inserisci una chiave privata lunga e difficile da indovinare. La stessa chiave deve essere usata su ogni
              dispositivo che deve leggere le stesse note.
            </div>
            <label className="linkDialogField">
              <span className="linkDialogLabel">Chiave di sync</span>
              <input
                ref={cloudKeyInputRef}
                className="linkDialogInput"
                value={cloudKeyValue}
                onChange={(event) => setCloudKeyValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeCloudKeyDialog();
                  }
                  if (event.key === "Enter" && cloudKeyValue.trim()) {
                    event.preventDefault();
                    void saveCloudKeyDialog();
                  }
                }}
                placeholder="Inserisci chiave cloud"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </label>
            <div className="tagManageHint">La chiave resta salvata solo su questo dispositivo finche non la cambi o rimuovi.</div>
            <div className="linkDialogActions tagManageActions">
              <button
                className="linkDialogButton linkDialogButtonDanger"
                type="button"
                onClick={() => {
                  void clearCloudKeyDialog();
                }}
                disabled={!hasCloudKey}
              >
                Rimuovi chiave
              </button>
              <button
                className="linkDialogButton"
                type="button"
                onClick={closeCloudKeyDialog}
              >
                Annulla
              </button>
              <button
                className="linkDialogButton linkDialogButtonPrimary"
                type="button"
                onClick={() => {
                  void saveCloudKeyDialog();
                }}
                disabled={!cloudKeyValue.trim()}
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isChangelogOpen ? (
        <div
          className="editorOverlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeChangelog();
            }
          }}
        >
          <div
            className="linkDialog changelogDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="changelog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="changelogTitleRow">
              <div className="linkDialogTitle" id="changelog-title">Changelog</div>
              <button
                className={"changelogTagLegendButton" + (isTagLegendOpen ? " active" : "")}
                type="button"
                onClick={() => setIsTagLegendOpen((prev) => !prev)}
                aria-label="Mostra tag con icone custom"
                title="Tag con icone custom"
              >
                <span className="changelogTagLegendButtonIcon" aria-hidden="true">
                  <TagLegendIcon />
                </span>
              </button>
            </div>
            <OverlayScrollArea
              className="changelogList"
              viewportClassName="changelogListViewport"
              contentClassName="changelogListContent"
            >
              {isTagLegendOpen ? (
                <section className="changelogTagLegend">
                  <div className="changelogTagLegendTitle">Tag con icone custom</div>
                  <OverlayScrollArea
                    className="changelogTagLegendScroll"
                    viewportClassName="changelogTagLegendViewport"
                    contentClassName="changelogTagLegendList"
                  >
                    {customTagLegendGroups.map((group) => (
                      <div key={group.key} className="changelogTagLegendItem">
                        <span className="changelogTagLegendVisual" aria-hidden="true">
                          {group.renderIcon({ className: "changelogTagLegendSvg" })}
                        </span>
                        <span className="changelogTagLegendText">{group.terms.join(", ")}</span>
                      </div>
                    ))}
                  </OverlayScrollArea>
                </section>
              ) : null}
              {CHANGELOG.slice(0, 1).map((entry) => (
                <section key={entry.version} className="changelogEntry">
                  <div className="changelogVersion">Ver. {entry.version}</div>
                  <div className="changelogEntryTitle">{entry.title}</div>
                  <ul className="changelogItems">
                    {entry.items.map((item, index) => (
                      <li key={`${entry.version}-${item.text}`}>
                        {item.text}
                        {item.bold ? <strong>{item.bold}</strong> : null}
                        {index === entry.items.length - 1 ? "." : ";"}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {CHANGELOG.length > 1 ? (
                <button
                  className="changelogToggleButton"
                  type="button"
                  onClick={() => setShowOlderChangelogEntries((prev) => !prev)}
                >
                  {showOlderChangelogEntries ? "Mostra meno" : "Mostra altro"}
                </button>
              ) : null}
              {showOlderChangelogEntries
                ? CHANGELOG.slice(1).map((entry) => (
                    <section key={entry.version} className="changelogEntry changelogEntryOlder">
                      <div className="changelogVersion">Ver. {entry.version}</div>
                      <div className="changelogEntryTitle">{entry.title}</div>
                      <ul className="changelogItems">
                        {entry.items.map((item, index) => (
                          <li key={`${entry.version}-${item.text}`}>
                            {item.text}
                            {item.bold ? <strong>{item.bold}</strong> : null}
                            {index === entry.items.length - 1 ? "." : ";"}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))
                : null}
            </OverlayScrollArea>
            <div className="linkDialogActions changelogActions">
              <button
                className="linkDialogButton linkDialogButtonPrimary"
                type="button"
                onClick={closeChangelog}
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
