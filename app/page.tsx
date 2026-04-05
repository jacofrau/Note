"use client";

import dynamic from "next/dynamic";
import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { nanoid } from "nanoid";
import packageJson from "../package.json";
import { InstagramIcon, PencilCircleIcon, StarIcon, TagLabelIcon } from "@/components/AppIcons";
import DeleteConfirmDialog from "@/components/dialogs/DeleteConfirmDialog";
import OnboardingDialog from "@/components/dialogs/OnboardingDialog";
import ResetAppDialog from "@/components/dialogs/ResetAppDialog";
import SettingsDialog, { type SettingsDialogTab } from "@/components/dialogs/SettingsDialog";
import TagManageDialog from "@/components/dialogs/TagManageDialog";
import NoteList from "@/components/NoteList";
import OverlayScrollArea from "@/components/OverlayScrollArea";
import PrintIcon from "@/components/PrintIcon";
import { CHANGELOG } from "@/lib/changelog";
import {
  saveDesktopNoteFileToDesktop,
  subscribeDesktopOpenNoteFile,
  type DesktopOpenNoteFilePayload,
  type DesktopUpdateState,
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
  getAppThemeDisplayIconPath,
  getStoredAppSettings,
  normalizeAppUserName,
  setDocumentAppSettings,
  setStoredAppSettings,
  subscribeAppSettings,
  type AppSettings,
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
import { getCustomTagLegendGroups } from "@/lib/tagDefinitions";
import type { Note } from "@/lib/types";
import {
  getStoredCloudSyncAccessKey,
  hasCloudSyncAccessKey,
  isCloudSyncEnabledClient,
  loadStickers,
  loadNotes,
  normalizeNotesData,
  resetStoredAppData,
  saveNotesLocallyImmediately,
  saveNotes,
  saveNotesImmediately,
  saveStickers,
  setStoredCloudSyncAccessKey,
  sortNotes,
} from "@/lib/storage";
import {
  useAppChrome,
  useAutoFocusAndSelect,
  useDesktopUpdateSupport,
  usePendingSaveLifecycle,
} from "@/lib/homeClientHooks";

const appVersion = packageJson.version || "1.0.0";
const cloudSyncEnabled = isCloudSyncEnabledClient();
const updateManifestUrl = process.env.NEXT_PUBLIC_UPDATE_MANIFEST_URL?.trim() || "/api/app-release";
const SAVE_DEBOUNCE_MS = 220;
const MAX_PINNED_NOTES = 3;
const MAX_FEEDBACK_ATTACHMENT_SIZE = 10 * 1024 * 1024;

type ShellNoticeIcon = "default" | "favorite";

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
        <div className="deferredPanelText">Sto caricando i tuoi sticker.</div>
      </div>
    </div>
  ),
});

type SpecialAppBrandIcon = {
  imageClassName?: string;
  src: string;
};
type FeedbackRequestResponse = {
  error?: string;
  ok?: boolean;
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

function shouldShowDesktopUpdateBadge(updateState: DesktopUpdateState | null): updateState is DesktopUpdateState {
  if (!updateState) return false;

  return (
    updateState.kind === "available" ||
    updateState.kind === "downloading" ||
    updateState.kind === "downloaded" ||
    (updateState.kind === "error" && Boolean(updateState.availableVersion))
  );
}

function getDesktopUpdateBadgeText(updateState: DesktopUpdateState): string {
  const versionLabel = updateState.availableVersion ? formatDisplayVersion(updateState.availableVersion) : "";

  if (updateState.kind === "available") {
    return versionLabel ? `Aggiorna a ${versionLabel}` : "Aggiorna";
  }

  if (updateState.kind === "downloading") {
    const progressPercent = Number.isFinite(updateState.progressPercent)
      ? Math.max(0, Math.min(100, Math.round(updateState.progressPercent)))
      : 0;

    return versionLabel
      ? progressPercent > 0
        ? `Scarico ${versionLabel} ${progressPercent}%`
        : `Scarico ${versionLabel}`
      : progressPercent > 0
        ? `Scarico ${progressPercent}%`
        : "Scarico update";
  }

  if (updateState.kind === "downloaded") {
    return versionLabel ? `Riavvia per installare ${versionLabel}` : "Riavvia per installare";
  }

  if (updateState.kind === "error") {
    return versionLabel ? `Riprova aggiornamento ${versionLabel}` : "Riprova aggiornamento";
  }

  return "";
}

function getDesktopUpdateBadgeTitle(updateState: DesktopUpdateState): string {
  if (updateState.kind === "error" && updateState.error) {
    return `Aggiornamento non riuscito: ${updateState.error}`;
  }

  return getDesktopUpdateBadgeText(updateState);
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

function FeedbackAttachmentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14.264 15.938L12.596 14.283C11.791 13.485 11.388 13.086 10.927 12.94C10.52 12.812 10.084 12.817 9.68 12.954C9.222 13.11 8.828 13.517 8.041 14.333L4.044 18.28M14.264 15.938L14.605 15.599C15.411 14.8 15.814 14.4 16.277 14.254C16.683 14.126 17.12 14.131 17.524 14.269C17.982 14.425 18.376 14.834 19.163 15.651L20 16.493M14.264 15.938L18.275 19.957M18.275 19.957C17.918 20 17.454 20 16.8 20H7.2C6.08 20 5.52 20 5.092 19.782C4.716 19.59 4.41 19.284 4.218 18.908C4.128 18.731 4.075 18.532 4.044 18.28M18.275 19.957C18.529 19.926 18.73 19.873 18.908 19.782C19.284 19.59 19.59 19.284 19.782 18.908C20 18.48 20 17.92 20 16.8V16.493M4.044 18.28C4 17.922 4 17.458 4 16.8V7.2C4 6.08 4 5.52 4.218 5.092C4.41 4.716 4.716 4.41 5.092 4.218C5.52 4 6.08 4 7.2 4H16.8C17.92 4 18.48 4 18.908 4.218C19.284 4.41 19.59 4.716 19.782 5.092C20 5.52 20 6.08 20 7.2V16.493M17 9C17 10.104 16.105 11 15 11C13.895 11 13 10.104 13 9C13 7.895 13.895 7 15 7C16.105 7 17 7.895 17 9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false);
  const insertCustomEmojiFn = useRef<null | ((sticker: { src: string; hasBorder?: boolean }) => void)>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef(false);
  const latestNotesRef = useRef<Note[]>([]);
  const [editorHistory, setEditorHistory] = useState<{
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
  } | null>(null);
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
  const [feedbackAttachment, setFeedbackAttachment] = useState<File | null>(null);
  const [isFeedbackDropTarget, setIsFeedbackDropTarget] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pinLimitNotice, setPinLimitNotice] = useState<string | null>(null);
  const [pinLimitNoticeIcon, setPinLimitNoticeIcon] = useState<ShellNoticeIcon>("default");
  const [pinLimitNoticePhase, setPinLimitNoticePhase] = useState<"enter" | "leave">("enter");
  const [settingsNameValue, setSettingsNameValue] = useState("");
  const [settingsThemeValue, setSettingsThemeValue] = useState<AppTheme>(DEFAULT_APP_SETTINGS.theme);
  const [settingsDesignValue, setSettingsDesignValue] = useState<DesignMode>(DEFAULT_DESIGN_MODE);
  const [settingsActiveTab, setSettingsActiveTab] = useState<SettingsDialogTab>("notes");
  const [settingsShowColoredTextHighlightsValue, setSettingsShowColoredTextHighlightsValue] = useState(
    DEFAULT_APP_SETTINGS.showColoredTextHighlights,
  );
  const [settingsMoveCompletedChecklistItemsToBottomValue, setSettingsMoveCompletedChecklistItemsToBottomValue] = useState(
    DEFAULT_APP_SETTINGS.moveCompletedChecklistItemsToBottom,
  );
  const [settingsShowMathResultsPreviewValue, setSettingsShowMathResultsPreviewValue] = useState(
    DEFAULT_APP_SETTINGS.showMathResultsPreview,
  );
  const [settingsWhitePaperModeValue, setSettingsWhitePaperModeValue] = useState(
    DEFAULT_APP_SETTINGS.whitePaperMode,
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
  const pinLimitNoticeHideTimeoutRef = useRef<number | null>(null);
  const pinLimitNoticeClearTimeoutRef = useRef<number | null>(null);
  const tagDialogInputRef = useRef<HTMLInputElement | null>(null);
  const cloudKeyInputRef = useRef<HTMLInputElement | null>(null);
  const feedbackTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const feedbackFileInputRef = useRef<HTMLInputElement | null>(null);
  const feedbackDropDepthRef = useRef(0);
  const settingsInputRef = useRef<HTMLInputElement | null>(null);
  const onboardingInputRef = useRef<HTMLInputElement | null>(null);
  const settingsPreviewBaselineRef = useRef<{ appSettings: AppSettings; designMode: DesignMode } | null>(null);
  const {
    availableUpdate,
    desktopPlatformState,
    desktopUpdateState,
    handleDesktopUpdateAction,
  } = useDesktopUpdateSupport({ appVersion, updateManifestUrl });

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
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("it-IT");
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
      if (normalizedTag && !note.archived) {
        tagSet.add(normalizedTag);
      }

      if (Boolean(note.archived) === showArchived) {
        nextVisibleNotes.push(note);
      }
    }

    const nextAvailableTags = [...tagSet].sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
    const nextEffectiveSelectedTag = !showArchived && selectedTag && tagSet.has(selectedTag) ? selectedTag : null;
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
  const themeAppIconPath = useMemo(() => getAppThemeDisplayIconPath(appSettings.theme), [appSettings.theme]);
  const isOnboardingDialogOpen = !appSettings.hasCompletedOnboarding;
  const isDesktopApp = Boolean(desktopPlatformState);
  const showDesktopUpdateBadge = shouldShowDesktopUpdateBadge(desktopUpdateState);
  const desktopUpdateBadgeText = showDesktopUpdateBadge ? getDesktopUpdateBadgeText(desktopUpdateState) : "";
  const desktopUpdateBadgeTitle = showDesktopUpdateBadge ? getDesktopUpdateBadgeTitle(desktopUpdateState) : "";
  const isDesktopUpdateBusy = desktopUpdateState?.kind === "downloading";
  useAppChrome(appSettings.theme, appDisplayName);

  useEffect(() => {
    if (!isOnboardingDialogOpen) return;

    const storedSettings = getStoredAppSettings();
    const storedDesignMode = getStoredDesignMode();

    setOnboardingNameValue(storedSettings.userName);
    setOnboardingThemeValue(storedSettings.theme);
    setOnboardingDesignValue(storedDesignMode);
  }, [isOnboardingDialogOpen]);

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
  usePendingSaveLifecycle(flushPendingSave);

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

  const clearPinLimitNoticeTimers = useCallback(() => {
    if (pinLimitNoticeHideTimeoutRef.current) {
      window.clearTimeout(pinLimitNoticeHideTimeoutRef.current);
      pinLimitNoticeHideTimeoutRef.current = null;
    }
    if (pinLimitNoticeClearTimeoutRef.current) {
      window.clearTimeout(pinLimitNoticeClearTimeoutRef.current);
      pinLimitNoticeClearTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearPinLimitNoticeTimers();
    };
  }, [clearPinLimitNoticeTimers]);

  const showPinLimitNotice = useCallback(
    (
      message = `Puoi fissare massimo ${MAX_PINNED_NOTES} note`,
      options?: { icon?: Exclude<ShellNoticeIcon, "default"> },
    ) => {
      clearPinLimitNoticeTimers();
      setPinLimitNotice(message);
      setPinLimitNoticeIcon(options?.icon ?? "default");
      setPinLimitNoticePhase("enter");
      pinLimitNoticeHideTimeoutRef.current = window.setTimeout(() => {
        setPinLimitNoticePhase("leave");
        pinLimitNoticeHideTimeoutRef.current = null;
        pinLimitNoticeClearTimeoutRef.current = window.setTimeout(() => {
          setPinLimitNotice(null);
          setPinLimitNoticeIcon("default");
          pinLimitNoticeClearTimeoutRef.current = null;
        }, 240);
      }, 2600);
    },
    [clearPinLimitNoticeTimers],
  );

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
      stickers: Awaited<ReturnType<typeof loadStickers>>;
    }) => {
      flushPendingSave();

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      pendingSaveRef.current = false;

      const nextNotes = normalizeTitles(sortNotes(options.notes));
      await saveNotes(nextNotes);
      await saveStickers(options.stickers);

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
        alert("Backup ripristinato. L'app verrÃ  ricaricata per applicare tutto.");
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
    const targetNote = notes.find((note) => note.id === id);
    if (!targetNote) return;

    if (!targetNote.pinned && notes.filter((note) => note.pinned).length >= MAX_PINNED_NOTES) {
      showPinLimitNotice();
      return;
    }

    clearPinLimitNoticeTimers();
    setPinLimitNotice(null);

    const updatedAt = now();
    const next = targetNote.pinned
      ? notes.map((n) => (n.id === id ? { ...n, pinned: false, pinnedAt: undefined, updatedAt } : n))
      : [
          { ...targetNote, pinned: true, pinnedAt: undefined, updatedAt },
          ...notes.filter((note) => note.id !== id),
        ];
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

  function closeSettingsDialog(options?: { restorePreview?: boolean }) {
    const shouldRestorePreview = options?.restorePreview ?? true;
    const baseline = settingsPreviewBaselineRef.current;

    if (shouldRestorePreview && baseline) {
      setDocumentAppSettings(baseline.appSettings);
      setDocumentDesignMode(baseline.designMode);
    }

    settingsPreviewBaselineRef.current = null;
    setIsSettingsDialogOpen(false);
    setIsResetAppDialogOpen(false);
    closeFeedbackDialog();
  }

  function applyDesignMode(nextMode: DesignMode) {
    setDocumentDesignMode(nextMode);
    setStoredDesignMode(nextMode);
  }

  function persistAppSettings(nextSettings: typeof appSettings) {
    setDocumentAppSettings(nextSettings);
    setStoredAppSettings(nextSettings);
  }

  function openSettingsDialog() {
    settingsPreviewBaselineRef.current = {
      appSettings: appSettings,
      designMode,
    };
    setSettingsNameValue(appSettings.userName);
    setSettingsThemeValue(appSettings.theme);
    setSettingsDesignValue(designMode);
    setSettingsShowColoredTextHighlightsValue(appSettings.showColoredTextHighlights);
    setSettingsMoveCompletedChecklistItemsToBottomValue(appSettings.moveCompletedChecklistItemsToBottom);
    setSettingsShowMathResultsPreviewValue(appSettings.showMathResultsPreview);
    setSettingsWhitePaperModeValue(appSettings.whitePaperMode);
    setSettingsShowPersistentDesignSwitcherValue(appSettings.showPersistentDesignSwitcher);
    setSettingsActiveTab("notes");
    setIsSettingsDialogOpen(true);
  }

  function saveSettingsDialog() {
    const nextSettings = {
      userName: settingsNameValue,
      theme: settingsThemeValue,
      hasCompletedOnboarding:
        settingsPreviewBaselineRef.current?.appSettings.hasCompletedOnboarding ?? appSettings.hasCompletedOnboarding,
      showColoredTextHighlights: settingsShowColoredTextHighlightsValue,
      moveCompletedChecklistItemsToBottom: settingsMoveCompletedChecklistItemsToBottomValue,
      showMathResultsPreview: settingsShowMathResultsPreviewValue,
      whitePaperMode: settingsWhitePaperModeValue,
      showPersistentDesignSwitcher: settingsShowPersistentDesignSwitcherValue,
    };
    persistAppSettings(nextSettings);
    applyDesignMode(settingsDesignValue);
    closeSettingsDialog({ restorePreview: false });
  }

  function openResetAppDialog() {
    setIsResetAppDialogOpen(true);
  }

  function closeResetAppDialog() {
    setIsResetAppDialogOpen(false);
  }

  function openFeedbackDialog() {
    setFeedbackValue("");
    setFeedbackAttachment(null);
    feedbackDropDepthRef.current = 0;
    setIsFeedbackDropTarget(false);
    setFeedbackStatus(null);
    setIsFeedbackDialogOpen(true);
    if (feedbackFileInputRef.current) {
      feedbackFileInputRef.current.value = "";
    }
  }

  function closeFeedbackDialog() {
    setIsFeedbackDialogOpen(false);
    setIsSubmittingFeedback(false);
    setFeedbackValue("");
    setFeedbackAttachment(null);
    feedbackDropDepthRef.current = 0;
    setIsFeedbackDropTarget(false);
    setFeedbackStatus(null);
    if (feedbackFileInputRef.current) {
      feedbackFileInputRef.current.value = "";
    }
  }

  function resetFeedbackDropTarget() {
    feedbackDropDepthRef.current = 0;
    setIsFeedbackDropTarget(false);
  }

  function clearFeedbackAttachment() {
    setFeedbackAttachment(null);
    if (feedbackFileInputRef.current) {
      feedbackFileInputRef.current.value = "";
    }
  }

  function formatFeedbackAttachmentSize(size: number) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function openFeedbackAttachmentPicker() {
    if (isSubmittingFeedback) return;
    feedbackFileInputRef.current?.click();
  }

  function applyFeedbackAttachment(nextFile: File | null) {
    if (!nextFile) return;

    if (!nextFile.type.startsWith("image/")) {
      clearFeedbackAttachment();
      setFeedbackStatus({
        kind: "error",
        text: "Puoi allegare solo immagini.",
      });
      return;
    }

    if (nextFile.size > MAX_FEEDBACK_ATTACHMENT_SIZE) {
      clearFeedbackAttachment();
      setFeedbackStatus({
        kind: "error",
        text: "Lo screenshot supera 10 MB. Scegli un'immagine piu leggera.",
      });
      return;
    }

    setFeedbackAttachment(nextFile);
    setFeedbackStatus(null);
  }

  function handleFeedbackAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    applyFeedbackAttachment(event.target.files?.[0] ?? null);
  }

  function handleFeedbackDragEnter(event: DragEvent<HTMLDivElement>) {
    if (isSubmittingFeedback) return;
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;

    event.preventDefault();
    feedbackDropDepthRef.current += 1;
    setIsFeedbackDropTarget(true);
  }

  function handleFeedbackDragOver(event: DragEvent<HTMLDivElement>) {
    if (isSubmittingFeedback) return;
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleFeedbackDragLeave(event: DragEvent<HTMLDivElement>) {
    if (isSubmittingFeedback) return;
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;

    event.preventDefault();
    feedbackDropDepthRef.current = Math.max(0, feedbackDropDepthRef.current - 1);

    if (feedbackDropDepthRef.current === 0) {
      setIsFeedbackDropTarget(false);
    }
  }

  function handleFeedbackDrop(event: DragEvent<HTMLDivElement>) {
    if (isSubmittingFeedback) return;
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;

    event.preventDefault();
    resetFeedbackDropTarget();
    applyFeedbackAttachment(event.dataTransfer.files?.[0] ?? null);
  }

  async function submitFeedbackDialog() {
    const message = feedbackValue.trim();
    if (!message || isSubmittingFeedback) return;

    setIsSubmittingFeedback(true);
    setFeedbackStatus(null);

    try {
      const formData = new FormData();
      formData.set("designMode", designMode);
      formData.set("message", message);
      formData.set("userName", normalizedAppUserName);
      formData.set("version", formatDisplayVersion(appVersion));

      if (feedbackAttachment) {
        formData.set("screenshot", feedbackAttachment);
      }

      const response = await fetch("/api/feedback", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as FeedbackRequestResponse | null;

      if (!response.ok || !payload?.ok) {
        setFeedbackStatus({
          kind: "error",
          text: payload?.error || "Invio non riuscito. Riprova tra poco.",
        });
        return;
      }

      setFeedbackValue("");
      clearFeedbackAttachment();
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
    setSettingsShowColoredTextHighlightsValue(DEFAULT_APP_SETTINGS.showColoredTextHighlights);
    setSettingsMoveCompletedChecklistItemsToBottomValue(DEFAULT_APP_SETTINGS.moveCompletedChecklistItemsToBottom);
    setSettingsShowMathResultsPreviewValue(DEFAULT_APP_SETTINGS.showMathResultsPreview);
    setSettingsWhitePaperModeValue(DEFAULT_APP_SETTINGS.whitePaperMode);
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
    closeSettingsDialog({ restorePreview: false });
    window.location.reload();
  }

  function saveOnboardingDialog() {
    const nextSettings = {
      userName: onboardingNameValue,
      theme: onboardingThemeValue,
      hasCompletedOnboarding: true,
      showColoredTextHighlights: DEFAULT_APP_SETTINGS.showColoredTextHighlights,
      moveCompletedChecklistItemsToBottom: DEFAULT_APP_SETTINGS.moveCompletedChecklistItemsToBottom,
      showMathResultsPreview: DEFAULT_APP_SETTINGS.showMathResultsPreview,
      whitePaperMode: DEFAULT_APP_SETTINGS.whitePaperMode,
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
    if (!isSettingsDialogOpen) return;

    const preservedSettings = settingsPreviewBaselineRef.current?.appSettings ?? DEFAULT_APP_SETTINGS;
    setDocumentAppSettings({
      userName: settingsNameValue,
      theme: settingsThemeValue,
      hasCompletedOnboarding: preservedSettings.hasCompletedOnboarding,
      showColoredTextHighlights: settingsShowColoredTextHighlightsValue,
      moveCompletedChecklistItemsToBottom: settingsMoveCompletedChecklistItemsToBottomValue,
      showMathResultsPreview: settingsShowMathResultsPreviewValue,
      whitePaperMode: settingsWhitePaperModeValue,
      showPersistentDesignSwitcher: settingsShowPersistentDesignSwitcherValue,
    });
    setDocumentDesignMode(settingsDesignValue);
  }, [
    isSettingsDialogOpen,
    settingsDesignValue,
    settingsMoveCompletedChecklistItemsToBottomValue,
    settingsNameValue,
    settingsShowColoredTextHighlightsValue,
    settingsShowMathResultsPreviewValue,
    settingsShowPersistentDesignSwitcherValue,
    settingsThemeValue,
    settingsWhitePaperModeValue,
  ]);

  useEffect(() => {
    if (!isSettingsDialogOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (isResetAppDialogOpen) {
        setIsResetAppDialogOpen(false);
        return;
      }

      const baseline = settingsPreviewBaselineRef.current;
      if (baseline) {
        setDocumentAppSettings(baseline.appSettings);
        setDocumentDesignMode(baseline.designMode);
      }

      settingsPreviewBaselineRef.current = null;
      setIsSettingsDialogOpen(false);
      setIsResetAppDialogOpen(false);
      setIsFeedbackDialogOpen(false);
      setIsSubmittingFeedback(false);
      setFeedbackValue("");
      setFeedbackAttachment(null);
      feedbackDropDepthRef.current = 0;
      setIsFeedbackDropTarget(false);
      setFeedbackStatus(null);
      if (feedbackFileInputRef.current) {
        feedbackFileInputRef.current.value = "";
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isResetAppDialogOpen, isSettingsDialogOpen]);

  useAutoFocusAndSelect(Boolean(tagDialogState), tagDialogInputRef);
  useAutoFocusAndSelect(isCloudKeyDialogOpen, cloudKeyInputRef);
  useAutoFocusAndSelect(isFeedbackDialogOpen, feedbackTextareaRef);
  useAutoFocusAndSelect(isSettingsDialogOpen, settingsInputRef);
  useAutoFocusAndSelect(isOnboardingDialogOpen, onboardingInputRef);

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
      stickers: await loadStickers(),
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
        alert("Backup ripristinato. L'app verrÃ  ricaricata per applicare tutto.");
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
          <div className={"appBrandIcon" + (specialAppBrandIcon ? " appBrandIconSpecial" : " appBrandIconTheme")} aria-hidden="true">
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
                  src={themeAppIconPath}
                  alt=""
                  width={34}
                  height={34}
                  className="appBrandIconImage appBrandIconThemeImage"
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
          </div>
          {isDesktopApp && showDesktopUpdateBadge ? (
            <button
              className={"appUpdateBadge" + (isDesktopUpdateBusy ? " appUpdateBadgeBusy" : "")}
              type="button"
              onClick={handleDesktopUpdateAction}
              disabled={isDesktopUpdateBusy}
              title={desktopUpdateBadgeTitle}
              aria-label={desktopUpdateBadgeTitle}
            >
              <span className="appUpdateBadgeIcon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  {desktopUpdateState?.kind === "downloaded" ? (
                    <path
                      d="M7 12L11 16L17 8M5 20h14"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : (
                    <path
                      d="M12 4v10m0 0 4-4m-4 4-4-4M5 18h14"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </svg>
              </span>
              <span className="appUpdateBadgeText">{desktopUpdateBadgeText}</span>
            </button>
          ) : availableUpdate ? (
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
            className={"btn appHeaderHistoryBtn" + (showArchived ? " active" : "")}
            onClick={() => setShowArchived((prev) => !prev)}
            type="button"
            title={showArchived ? "Torna alle note attive" : "Archivio"}
            aria-label={showArchived ? "Torna alle note attive" : "Archivio"}
            aria-pressed={showArchived}
          >
            <svg className="undoRedoIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 7h16l-1.5 11a2 2 0 0 1-2 1.7H7.5a2 2 0 0 1-2-1.7L4 7Zm0-3h16v3H4V4Zm5 7h6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
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

      <div className={"shell" + (designMode === "v103b" && isTagPickerOpen ? " shellTagPickerOpen" : "")}>
        <NoteList
          key={showArchived ? "archived" : "active"}
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
          onCloseArchived={() => setShowArchived(false)}
          onImport={importBackup}
          onExportOne={downloadSingleNote}
          onPrint={requestPrint}
          onManageTag={openTagDialog}
          onTogglePin={togglePin}
          onToggleArchive={toggleArchive}
          onDelete={deleteNote}
          onTagPickerOpenChange={setIsTagPickerOpen}
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
                  showColoredTextHighlights={appSettings.showColoredTextHighlights}
                  moveCompletedChecklistItemsToBottom={appSettings.moveCompletedChecklistItemsToBottom}
                  showMathResultsPreview={appSettings.showMathResultsPreview}
                  whitePaperMode={appSettings.whitePaperMode}
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
                      <button className="btn primary" onClick={newNote} type="button">
                        <span className="newNoteIcon" aria-hidden="true">
                          <PencilCircleIcon />
                        </span>
                        Nuova nota
                      </button>
                    </div>
                  ) : null}
                </div>
              )
            )}

            {pinLimitNotice ? (
              <div
                className={"shellToastOverlay" + (pinLimitNoticePhase === "leave" ? " is-leaving" : "")}
                role="status"
                aria-live="polite"
              >
                <span className="shellToastOverlayIcon" aria-hidden="true">
                  {pinLimitNoticeIcon === "favorite" ? (
                    <StarIcon />
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none">
                      <path
                        d="M11.9999 17V21M6.9999 12.6667V6C6.9999 4.89543 7.89533 4 8.9999 4H14.9999C16.1045 4 16.9999 4.89543 16.9999 6V12.6667L18.9135 15.4308C19.3727 16.094 18.898 17 18.0913 17H5.90847C5.1018 17 4.62711 16.094 5.08627 15.4308L6.9999 12.6667Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span>{pinLimitNotice}</span>
              </div>
            ) : null}
          </div>

          <div className="customEmojiSidebar">
            <StickerPackPicker
              onPick={(sticker) => {
                if (!insertCustomEmojiFn.current) return;
                insertCustomEmojiFn.current(sticker);
              }}
              onShowNotice={showPinLimitNotice}
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
                <span>App di</span>
                <span className="appSignatureAuthorHandle">
                  <InstagramIcon className="appSignatureAuthorIcon" />
                  <span>jacofrau</span>
                </span>
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
          themeValue={onboardingThemeValue}
          onNameChange={setOnboardingNameValue}
          onThemeChange={setOnboardingThemeValue}
          onSubmit={saveOnboardingDialog}
        />
      ) : null}

      <SettingsDialog
        activeTab={settingsActiveTab}
        isOpen={isSettingsDialogOpen}
        moveCompletedChecklistItemsToBottom={settingsMoveCompletedChecklistItemsToBottomValue}
        nameInputRef={settingsInputRef}
        nameValue={settingsNameValue}
        onActiveTabChange={setSettingsActiveTab}
        onClose={closeSettingsDialog}
        onDownloadBackup={() => {
          void downloadBackup();
        }}
        onNameChange={setSettingsNameValue}
        onOpenFeedback={openFeedbackDialog}
        onOpenReset={openResetAppDialog}
        onSubmit={saveSettingsDialog}
        onThemeChange={setSettingsThemeValue}
        onToggleMoveCompletedChecklistItemsToBottom={() => {
          setSettingsMoveCompletedChecklistItemsToBottomValue((prev) => !prev);
        }}
        onToggleShowColoredTextHighlights={() => {
          setSettingsShowColoredTextHighlightsValue((prev) => !prev);
        }}
        onToggleShowMathResultsPreview={() => {
          setSettingsShowMathResultsPreviewValue((prev) => !prev);
        }}
        onToggleWhitePaperMode={() => {
          setSettingsWhitePaperModeValue((prev) => !prev);
        }}
        showColoredTextHighlights={settingsShowColoredTextHighlightsValue}
        showMathResultsPreview={settingsShowMathResultsPreviewValue}
        themeValue={settingsThemeValue}
        whitePaperMode={settingsWhitePaperModeValue}
      />

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
            <div
              className={"feedbackDropZone" + (isFeedbackDropTarget ? " dragOver" : "")}
              onDragEnter={handleFeedbackDragEnter}
              onDragOver={handleFeedbackDragOver}
              onDragLeave={handleFeedbackDragLeave}
              onDrop={handleFeedbackDrop}
            >
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
              <div className="feedbackAttachmentSection">
                <input
                  ref={feedbackFileInputRef}
                  className="feedbackFileInput"
                  type="file"
                  accept="image/*"
                  onChange={handleFeedbackAttachmentChange}
                  tabIndex={-1}
                />
                <button
                  className="feedbackAttachmentButton"
                  type="button"
                  onClick={openFeedbackAttachmentPicker}
                  disabled={isSubmittingFeedback}
                >
                  <span className="feedbackAttachmentButtonIcon" aria-hidden="true">
                    <FeedbackAttachmentIcon />
                  </span>
                  <span>Allega screenshot</span>
                </button>
                {feedbackAttachment ? (
                  <div className="feedbackAttachmentMeta">
                    <div className="feedbackAttachmentMetaText">
                      <span className="feedbackAttachmentName">{feedbackAttachment.name}</span>
                      <span className="feedbackAttachmentSize">{formatFeedbackAttachmentSize(feedbackAttachment.size)}</span>
                    </div>
                    <button
                      className="feedbackAttachmentRemoveButton"
                      type="button"
                      onClick={clearFeedbackAttachment}
                      disabled={isSubmittingFeedback}
                    >
                      Rimuovi
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
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

