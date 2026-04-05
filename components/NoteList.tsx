"use client";

import { type ReactNode, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { DesignMode } from "@/lib/designMode";
import { getNoteBodySearchTextFromDoc, getNoteBodyTextFromDoc, getNoteLinesFromDoc } from "@/lib/noteText";
import { getTagIcon } from "@/lib/tagDefinitions";
import type { Note } from "@/lib/types";
import OverlayScrollArea from "@/components/OverlayScrollArea";
import PrintIcon from "@/components/PrintIcon";
import { PencilCircleIcon } from "@/components/AppIcons";

function fmt(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

type DocNode = {
  type?: string;
  text?: string;
  attrs?: { src?: string; alt?: string };
  content?: DocNode[];
};

type TitlePart =
  | { kind: "text"; text: string }
  | { kind: "emoji"; src: string; alt: string }
  | { kind: "unicodeEmoji"; text: string };
type HighlightSegment = { text: string; matched: boolean };
type ContentPreview = {
  text: string;
  trimmedStart: boolean;
  trimmedEnd: boolean;
  hasMatch: boolean;
};

const titlePartsCache = new WeakMap<object, TitlePart[]>();

function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M11.9999 17V21M6.9999 12.6667V6C6.9999 4.89543 7.89533 4 8.9999 4H14.9999C16.1045 4 16.9999 4.89543 16.9999 6V12.6667L18.9135 15.4308C19.3727 16.094 18.898 17 18.0913 17H5.90847C5.1018 17 4.62711 16.094 5.08627 15.4308L6.9999 12.6667Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function pushTitlePart(parts: TitlePart[], part: TitlePart) {
  const lastPart = parts[parts.length - 1];
  if (part.kind === "text" && lastPart?.kind === "text") {
    lastPart.text += part.text;
    return;
  }
  if (part.kind === "unicodeEmoji" && lastPart?.kind === "unicodeEmoji") {
    lastPart.text += part.text;
    return;
  }
  parts.push(part);
}

function pushTitleTextParts(value: string, parts: TitlePart[]) {
  if (!value) return;

  const emojiMatch = value.match(
    /^((?:(?:\p{Extended_Pictographic}|[\u2600-\u27BF])\uFE0F?(?:\u200D(?:\p{Extended_Pictographic}|[\u2600-\u27BF])\uFE0F?)*\s*)+)/u,
  );

  if (emojiMatch) {
    const emojiText = emojiMatch[1].trim();
    if (emojiText) {
      pushTitlePart(parts, { kind: "unicodeEmoji", text: emojiText });
    }

    const remainingText = value.slice(emojiMatch[0].length);
    if (remainingText) {
      pushTitlePart(parts, { kind: "text", text: remainingText });
    }
    return;
  }

  pushTitlePart(parts, { kind: "text", text: value });
}

function collectTitleParts(node: DocNode | null | undefined, parts: TitlePart[]): boolean {
  if (!node) return false;

  if (node.type === "hardBreak") return true;

  if (node.type === "text") {
    const value = node.text ?? "";
    const lineBreakIndex = value.search(/\r|\n/);
    if (lineBreakIndex >= 0) {
      const slice = value.slice(0, lineBreakIndex);
      pushTitleTextParts(slice, parts);
      return true;
    }
    pushTitleTextParts(value, parts);
    return false;
  }

  if (node.type === "image" && node.attrs?.src) {
    pushTitlePart(parts, { kind: "emoji", src: node.attrs.src, alt: node.attrs.alt ?? "emoji custom" });
    return false;
  }

  if (!Array.isArray(node.content)) return false;

  for (const child of node.content) {
    const stop = collectTitleParts(child, parts);
    if (stop) return true;
  }

  return false;
}

function buildTitlePartsFromDoc(doc: unknown): TitlePart[] {
  const root = doc as DocNode | null | undefined;
  const blocks = Array.isArray(root?.content) ? root.content : [];

  for (const block of blocks) {
    const parts: TitlePart[] = [];
    collectTitleParts(block, parts);
    const plain = parts
      .filter((part): part is Extract<TitlePart, { kind: "text" }> => part.kind === "text")
      .map((part) => part.text)
      .join("")
      .trim();
    const hasEmoji = parts.some((part) => part.kind === "emoji");
    if (plain.length > 0 || hasEmoji) return parts;
  }

  return [];
}

function titlePartsFromDoc(doc: unknown): TitlePart[] {
  if (doc && typeof doc === "object") {
    const cached = titlePartsCache.get(doc as object);
    if (cached) return cached;

    const parts = buildTitlePartsFromDoc(doc);
    titlePartsCache.set(doc as object, parts);
    return parts;
  }

  return buildTitlePartsFromDoc(doc);
}

function secondLineFromDoc(doc: unknown): string {
  return sanitizePreviewText(getNoteLinesFromDoc(doc)[1] ?? "").slice(0, 90);
}

function formatNotesCount(count: number): string {
  return `${count} ${count === 1 ? "nota" : "note"}`;
}

function sanitizePreviewText(text: string): string {
  const trimmedStart = text.trimStart();
  if (!trimmedStart) return "";

  const withoutBullets = trimmedStart.replace(/^(?:[-*\u2022>]+\s*)+/u, "");
  const withoutEmoji = withoutBullets.replace(
    /^(?:(?:\p{Extended_Pictographic}|[\u2600-\u27BF])\uFE0F?(?:\u200D(?:\p{Extended_Pictographic}|[\u2600-\u27BF])\uFE0F?)*\s*)+/u,
    "",
  );

  return (withoutEmoji || withoutBullets || trimmedStart).trimStart();
}

function normalizeSearchQuery(value: string): string {
  return value.trim().toLocaleLowerCase("it-IT");
}

function splitTextByQuery(text: string, rawQuery: string): HighlightSegment[] {
  if (!text) return [];

  const query = normalizeSearchQuery(rawQuery);
  if (!query) return [{ text, matched: false }];

  const loweredText = text.toLocaleLowerCase("it-IT");
  const segments: HighlightSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const index = loweredText.indexOf(query, cursor);
    if (index < 0) break;

    if (index > cursor) {
      segments.push({ text: text.slice(cursor, index), matched: false });
    }

    segments.push({ text: text.slice(index, index + query.length), matched: true });
    cursor = index + query.length;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), matched: false });
  }

  return segments.length > 0 ? segments : [{ text, matched: false }];
}

function renderHighlightedText(text: string, rawQuery: string, keyPrefix: string): ReactNode[] {
  return splitTextByQuery(text, rawQuery).map((segment, index) =>
    segment.matched ? (
      <mark key={`${keyPrefix}-${index}`} className="noteSearchHighlight">
        {segment.text}
      </mark>
    ) : (
      <span key={`${keyPrefix}-${index}`}>{segment.text}</span>
    ),
  );
}

function buildContentPreview(doc: unknown, rawQuery: string): ContentPreview {
  const fallbackText = secondLineFromDoc(doc);
  const query = normalizeSearchQuery(rawQuery);
  if (!query) {
    return {
      text: fallbackText,
      trimmedStart: false,
      trimmedEnd: false,
      hasMatch: false,
    };
  }

  const bodyText = getNoteBodyTextFromDoc(doc);
  if (!bodyText) {
    return {
      text: fallbackText,
      trimmedStart: false,
      trimmedEnd: false,
      hasMatch: false,
    };
  }

  const loweredBody = getNoteBodySearchTextFromDoc(doc);
  const matchIndex = loweredBody.indexOf(query);
  if (matchIndex < 0) {
    return {
      text: fallbackText,
      trimmedStart: false,
      trimmedEnd: false,
      hasMatch: false,
    };
  }

  // Keep the match close to the beginning of the preview so it stays visible
  // even in the compact note list layout.
  const leadingContext = 4;
  const trailingContext = 42;
  const targetLength = Math.max(48, query.length + trailingContext);
  let start = Math.max(0, matchIndex - leadingContext);
  let end = Math.min(bodyText.length, matchIndex + query.length + trailingContext);

  if (end - start < targetLength) {
    const missing = targetLength - (end - start);
    end = Math.min(bodyText.length, end + missing);
  }

  if (start > 0) {
    const previousSpace = bodyText.lastIndexOf(" ", start - 1);
    if (previousSpace >= 0 && matchIndex - previousSpace <= 12) {
      start = previousSpace + 1;
    } else {
      start = matchIndex;
    }
  }

  if (end < bodyText.length) {
    const nextSpace = bodyText.indexOf(" ", end);
    if (nextSpace >= 0 && nextSpace - end <= 24) {
      end = nextSpace;
    }
  }

  return {
    text: sanitizePreviewText(bodyText.slice(start, end)),
    trimmedStart: start > 0,
    trimmedEnd: end < bodyText.length,
    hasMatch: true,
  };
}

type NoteListProps = {
  designMode: DesignMode;
  notes: Note[];
  activeId: string | null;
  showArchived: boolean;
  activeCount: number;
  archivedCount: number;
  selectedTag: string | null;
  availableTags: string[];
  query: string;
  setQuery: (s: string) => void;
  onSelectTag: (tag: string | null) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onCloseArchived: () => void;
  onImport: (file: File) => void | Promise<void>;
  onExportOne: (id: string) => void;
  onPrint: (id: string) => void;
  onManageTag: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onTagPickerOpenChange?: (open: boolean) => void;
};

export default function NoteList({
  designMode,
  notes,
  activeId,
  showArchived,
  activeCount,
  archivedCount,
  selectedTag,
  availableTags,
  query,
  setQuery,
  onSelectTag,
  onSelect,
  onNew,
  onCloseArchived,
  onImport,
  onExportOne,
  onPrint,
  onManageTag,
  onTogglePin,
  onToggleArchive,
  onDelete,
  onTagPickerOpenChange,
}: NoteListProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openMenuPlacement, setOpenMenuPlacement] = useState<"up" | "down">("down");
  const [contextMenuState, setContextMenuState] = useState<{ id: string; left: number; top: number } | null>(null);
  const [isTagFilterMenuOpen, setIsTagFilterMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const trimmedQuery = query.trim();
  const deferredQuery = useDeferredValue(query);
  const usesContextMenu = designMode === "v103b";
  const contextMenuNote = useMemo(
    () => (contextMenuState ? notes.find((note) => note.id === contextMenuState.id) ?? null : null),
    [contextMenuState, notes],
  );
  const noteRows = useMemo(
    () =>
      notes.map((note) => {
        const titleParts = titlePartsFromDoc(note.doc);
        const preview = buildContentPreview(note.doc, deferredQuery);
        const plainTitle = titleParts
          .filter((part): part is Extract<TitlePart, { kind: "text" }> => part.kind === "text")
          .map((part) => part.text)
          .join("")
          .trim();

        return {
          note,
          titleParts,
          preview,
          plainTitle,
        };
      }),
    [deferredQuery, notes],
  );

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      const target = event.target as Node;
      if (rootRef.current.contains(target)) {
        if (!(target instanceof Element) || !target.closest(".noteMenu")) {
          setOpenMenuId(null);
          setContextMenuState(null);
        }
        return;
      }
      setOpenMenuId(null);
      setContextMenuState(null);
      setIsTagFilterMenuOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenMenuId(null);
      setContextMenuState(null);
      setIsTagFilterMenuOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  const tagOptions = useMemo(
    () => [
      { value: null as string | null, label: "#all", icon: null as ReactNode },
      ...availableTags.map((tag) => ({
        value: tag,
        label: `#${tag.toLowerCase()}`,
        icon: getTagIcon(tag, "tagMenuItemIcon"),
      })),
    ],
    [availableTags],
  );
  const activeTagLabel = selectedTag ? `#${selectedTag.toLowerCase()}` : "#all";
  const shouldShowTagPanel = isTagFilterMenuOpen && !showArchived;

  useEffect(() => {
    onTagPickerOpenChange?.(shouldShowTagPanel);
  }, [onTagPickerOpenChange, shouldShowTagPanel]);

  useEffect(() => {
    return () => {
      onTagPickerOpenChange?.(false);
    };
  }, [onTagPickerOpenChange]);

  function resolveNoteMenuPlacement(trigger: HTMLButtonElement): "up" | "down" {
    const listBounds = listRef.current?.getBoundingClientRect();
    if (!listBounds) return "down";

    const triggerBounds = trigger.getBoundingClientRect();
    const estimatedMenuHeight = 340;
    const spaceBelow = listBounds.bottom - triggerBounds.bottom;
    const spaceAbove = triggerBounds.top - listBounds.top;

    if (spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow) {
      return "up";
    }

    return "down";
  }

  function resolveContextMenuPosition(clientX: number, clientY: number) {
    const menuWidth = 196;
    const menuHeight = 294;
    const margin = 12;

    const left = Math.max(margin, Math.min(clientX, window.innerWidth - menuWidth - margin));
    const top = Math.max(margin, Math.min(clientY, window.innerHeight - menuHeight - margin));

    return { left, top };
  }

  return (
    <div className="card noteListCard" ref={rootRef}>
      <div className="header">
        <div className="headerTitleWrap">
          {showArchived ? (
            <button className="archiveBackBtn" type="button" onClick={onCloseArchived} aria-label="Torna alle note attive">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m15 5-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null}
          <div className={"noteHeaderCopy" + (showArchived ? " noteHeaderCopyArchived" : "")}>
            <div className="h1">{showArchived ? "Note archiviate" : "Le mie note"}</div>
            <div className="muted">
              {showArchived ? `${archivedCount} archiviate` : formatNotesCount(activeCount)}
            </div>
          </div>
        </div>
        {!showArchived ? (
          <div className="noteHeaderActions">
            {!usesContextMenu ? (
              <button
                className="btn primary newNoteIconBtn"
                onClick={() => {
                  setIsTagFilterMenuOpen(false);
                  setContextMenuState(null);
                  onNew();
                }}
                type="button"
                aria-label="Nuova nota"
                title="Nuova nota"
              >
                <span className="newNoteIcon" aria-hidden="true">
                  <PencilCircleIcon />
                </span>
              </button>
            ) : null}
            <button
              className="btn noteHeaderImportBtn"
              type="button"
              title="Importa note o backup"
              aria-label="Importa note o backup"
              onClick={() => {
                setOpenMenuId(null);
                setContextMenuState(null);
                setIsTagFilterMenuOpen(false);
                importInputRef.current?.click();
              }}
            >
              <svg className="noteHeaderImportIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 20V9m0 0 4 4m-4-4-4 4M5 10V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <input
              ref={importInputRef}
              className="noteImportInputHidden"
              type="file"
              accept=".json,.nby,application/json"
              aria-label="Importa note da file JSON o NBY"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImport(f);
                e.currentTarget.value = "";
              }}
            />
          </div>
        ) : null}
      </div>

      <div className="searchTopSpacer" aria-hidden="true" />

      <div className="searchFilterRow">
        <div className="searchInputWrap">
          <span className="searchInputIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.9" />
              <path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </span>
          <input
            className="input searchFilterInput"
            placeholder={showArchived ? "cerca nell'archivio..." : selectedTag ? `cerca in #${selectedTag.toLowerCase()}...` : "cerca nota..."}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsTagFilterMenuOpen(false)}
          />
        </div>
      </div>

      {!showArchived ? (
        <div className="tagFilterPanel">
          <button
            className={"btn tagFilterPanelBtn tagFilterScopeBtn" + (shouldShowTagPanel ? " active" : "")}
            type="button"
            onClick={() => {
              setIsTagFilterMenuOpen((prev) => !prev);
              setOpenMenuId(null);
              setContextMenuState(null);
            }}
            title={`Seleziona tag (${activeTagLabel})`}
            aria-label="Apri selettore tag"
            aria-haspopup="dialog"
            aria-expanded={shouldShowTagPanel ? "true" : "false"}
          >
            <svg className="tagFilterIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M20 12 12 20l-8-8V4h8l8 8Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="9" cy="9" r="1.2" fill="currentColor" />
            </svg>
            <span className="tagFilterScopeLabel">{activeTagLabel}</span>
            <span className="tagFilterScopeChevron" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
        </div>
      ) : null}

      <div className="list">
        <OverlayScrollArea
          className="listScrollArea"
          viewportClassName="listViewport"
          contentClassName="listContent"
          viewportRef={listRef}
        >
          {noteRows.map(({ note: n, titleParts, preview, plainTitle }) => {
            return (
              <div
                key={n.id}
                className={"noteRow" + (n.id === activeId ? " active" : "")}
              >
                <button
                  className="noteRowMain"
                  type="button"
                  onClick={() => {
                    setOpenMenuId(null);
                    setIsTagFilterMenuOpen(false);
                    setContextMenuState(null);
                    onSelect(n.id);
                  }}
                  onContextMenu={(event) => {
                    if (!usesContextMenu) return;

                    event.preventDefault();
                    event.stopPropagation();
                    setOpenMenuId(null);
                    setIsTagFilterMenuOpen(false);
                    setContextMenuState({
                      id: n.id,
                      ...resolveContextMenuPosition(event.clientX, event.clientY),
                    });
                  }}
                  aria-label={`Apri nota ${plainTitle || "Senza titolo"}`}
                >
                  <div className="noteRowBody">
                  <div className="noteTitle noteTitleRow">
                    <span className="noteTitleText">
                      {titleParts.length > 0
                        ? titleParts.map((part, index) =>
                            part.kind === "text" ? (
                              <span key={`${n.id}-t-${index}`}>
                                {renderHighlightedText(part.text, deferredQuery, `${n.id}-t-${index}`)}
                              </span>
                            ) : part.kind === "unicodeEmoji" ? (
                              <span key={`${n.id}-ue-${index}`} className="noteTitleUnicodeEmoji" aria-hidden="true">
                                {part.text}
                              </span>
                            ) : (
                              <Image
                                key={`${n.id}-e-${index}`}
                                className="noteTitleEmoji"
                                src={part.src}
                                alt={part.alt}
                                width={16}
                                height={16}
                                unoptimized
                              />
                            ),
                          )
                        : "Senza titolo"}
                    </span>

                    {n.pinned ? (
                      <span className="pinBadge" title="Nota pinnata" aria-label="Nota pinnata">
                        <PinIcon className="pinBadgeIcon" />
                      </span>
                    ) : null}

                    {n.tag ? (
                      <span className="noteTagBadge">
                        {getTagIcon(n.tag, "noteTagBadgeIcon")}
                        <span>{n.tag}</span>
                      </span>
                    ) : null}
                  </div>
                  <div className="noteMeta">
                    <span className="noteMetaTimestamp">{fmt(n.updatedAt)}</span>
                    {preview.text ? (
                      <span className={"noteMetaPreview" + (preview.hasMatch ? " noteMetaPreviewMatched" : "")}>
                        {preview.trimmedStart ? <span aria-hidden="true">...</span> : null}
                        {renderHighlightedText(preview.text, preview.hasMatch ? deferredQuery : "", `${n.id}-preview`)}
                        {preview.trimmedEnd ? <span aria-hidden="true">...</span> : null}
                      </span>
                    ) : null}
                  </div>
                  </div>
                </button>

                {!usesContextMenu ? (
                  <div className="noteActions">
                    <button
                      className={"btn noteActionBtn noteMenuTrigger" + (openMenuId === n.id ? " active" : "")}
                      onClick={(e) => {
                        e.stopPropagation();
                        const nextOpenId = openMenuId === n.id ? null : n.id;
                        if (nextOpenId) {
                          setOpenMenuPlacement(resolveNoteMenuPlacement(e.currentTarget));
                        }
                        setOpenMenuId(nextOpenId);
                        setContextMenuState(null);
                        setIsTagFilterMenuOpen(false);
                      }}
                      type="button"
                      title="Azioni nota"
                      aria-label="Azioni nota"
                      aria-haspopup="menu"
                      aria-expanded={openMenuId === n.id ? "true" : "false"}
                    >
                      <svg className="dotsIcon" viewBox="0 0 1024 1024" fill="none" aria-hidden="true">
                        <path
                          d="M388.8 896.4v-27.198c.6-2.2 1.6-4.2 2-6.4 8.8-57.2 56.4-102.4 112.199-106.2 62.4-4.4 115.2 31.199 132.4 89.199 2.2 7.6 3.8 15.6 5.8 23.4v27.2c-.6 1.8-1.6 3.399-1.8 5.399-8.6 52.8-46.6 93-98.6 104.4-4 .8-8 2-12 3h-27.2c-1.8-.6-3.6-1.6-5.4-1.8-52-8.4-91.599-45.4-103.6-96.8-1.2-5-2.6-9.6-3.8-14.2zm252.4-768.797-.001 27.202c-.6 2.2-1.6 4.2-1.8 6.4-9 57.6-56.8 102.6-113.2 106.2-62.2 4-114.8-32-131.8-90.2-2.2-7.401-3.8-15-5.6-22.401v-27.2c.6-1.8 1.6-3.4 2-5.2 9.6-52 39.8-86 90.2-102.2 6.6-2.2 13.6-3.4 20.4-5.2h27.2c1.8.6 3.6 1.6 5.4 1.8 52.2 8.6 91.6 45.4 103.6 96.8 1.201 4.8 2.401 9.4 3.601 13.999zm-.001 370.801v27.2c-.6 2.2-1.6 4.2-2 6.4-9 57.4-58.6 103.6-114.6 106-63 2.8-116.4-35.2-131.4-93.8-1.6-6.2-3-12.4-4.4-18.6v-27.2c.6-2.2 1.6-4.2 2-6.4 8.8-57.4 58.6-103.601 114.6-106.2 63-3 116.4 35.2 131.4 93.8 1.6 6.4 3 12.6 4.4 18.8Z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>

                    {openMenuId === n.id ? (
                      <div
                        className={"noteMenu" + (openMenuPlacement === "up" ? " noteMenuUp" : "")}
                        role="menu"
                        onClick={(e) => e.stopPropagation()}
                      >
                      <button
                        className="noteMenuItem"
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setOpenMenuId(null);
                          onTogglePin(n.id);
                        }}
                      >
                        <PinIcon className="pinMenuIcon" />
                        {n.pinned ? "Rimuovi fissato" : "Fissa"}
                      </button>
                      <button
                        className="noteMenuItem"
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setOpenMenuId(null);
                          onManageTag(n.id);
                        }}
                      >
                        <svg className="noteMenuIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path
                            d="M20 12 12 20l-8-8V4h8l8 8Z"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <circle cx="9" cy="9" r="1.2" fill="currentColor" />
                        </svg>
                        Gestisci tag
                      </button>
                      <button
                        className="noteMenuItem"
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setOpenMenuId(null);
                          onExportOne(n.id);
                        }}
                      >
                        <svg className="noteMenuIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path
                            d="M12 4v11M8 8l4-4 4 4M5 14v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        Salva nota
                      </button>
                      <button
                        className="noteMenuItem"
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setOpenMenuId(null);
                          onPrint(n.id);
                        }}
                      >
                        <PrintIcon className="noteMenuIcon" />
                        Stampa nota
                      </button>
                      <button
                        className="noteMenuItem"
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setOpenMenuId(null);
                          onToggleArchive(n.id);
                        }}
                      >
                        <svg className="noteMenuIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path
                            d="M4 7h16l-1.5 11a2 2 0 0 1-2 1.7H7.5a2 2 0 0 1-2-1.7L4 7Zm0-3h16v3H4V4Zm5 7h6"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {n.archived ? "Ripristina" : "Archivia"}
                      </button>
                      <div className="noteMenuDivider" />
                      <button
                        className="noteMenuItem danger"
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setOpenMenuId(null);
                          onDelete(n.id);
                        }}
                      >
                        <svg className="trashIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path
                            d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        Elimina nota
                      </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          {!showArchived && notes.length === 0 && !trimmedQuery && selectedTag ? (
            <div className="muted noteListEmptyState">
              {`Nessuna nota nel tag "${selectedTag}"`}
            </div>
          ) : null}
          <div className="noteListFiller" aria-hidden="true" />
        </OverlayScrollArea>
        {shouldShowTagPanel ? (
          <div
            className="tagFilterPanelOverlay"
            role="dialog"
            aria-modal="false"
            aria-label="Seleziona tag"
            onClick={() => setIsTagFilterMenuOpen(false)}
          >
            <div className="tagFilterPanelSheet" onClick={(event) => event.stopPropagation()}>
              <div className="tagFilterPanelSheetBody">
                {tagOptions.map((option) => (
                  <button
                    key={option.label}
                    className={"tagFilterSheetOption" + (selectedTag === option.value ? " active" : "")}
                    type="button"
                    onClick={() => {
                      onSelectTag(option.value);
                      setIsTagFilterMenuOpen(false);
                    }}
                  >
                    <span className="tagFilterSheetOptionMain">
                      <span className="tagFilterSheetOptionLabel">{option.label}</span>
                    </span>
                    {option.icon ? (
                      <span className="tagFilterSheetOptionVisual" aria-hidden="true">
                        {option.icon}
                      </span>
                    ) : null}
                  </button>
                ))}
                {availableTags.length === 0 ? (
                  <div className="tagFilterSheetEmpty">Nessun tag creato: per ora puoi tornare a #all.</div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
        {usesContextMenu && contextMenuState ? (
          <div
            className="noteMenu noteContextMenu"
            role="menu"
            style={{ left: contextMenuState.left, top: contextMenuState.top }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="noteMenuItem"
              type="button"
              role="menuitem"
              onClick={() => {
                setContextMenuState(null);
                onTogglePin(contextMenuState.id);
              }}
            >
              <PinIcon className="pinMenuIcon" />
              {contextMenuNote?.pinned ? "Rimuovi fissato" : "Fissa"}
            </button>
            <button
              className="noteMenuItem"
              type="button"
              role="menuitem"
              onClick={() => {
                setContextMenuState(null);
                onManageTag(contextMenuState.id);
              }}
            >
              <svg className="noteMenuIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M20 12 12 20l-8-8V4h8l8 8Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="9" cy="9" r="1.2" fill="currentColor" />
              </svg>
              {contextMenuNote?.tag ? "Gestisci tag" : "Aggiungi tag"}
            </button>
            <button
              className="noteMenuItem"
              type="button"
              role="menuitem"
              onClick={() => {
                setContextMenuState(null);
                onExportOne(contextMenuState.id);
              }}
            >
              <svg className="noteMenuIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 4v11M8 8l4-4 4 4M5 14v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Salva nota
            </button>
            <button
              className="noteMenuItem"
              type="button"
              role="menuitem"
              onClick={() => {
                setContextMenuState(null);
                onToggleArchive(contextMenuState.id);
              }}
            >
              <svg className="noteMenuIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 7h16l-1.5 11a2 2 0 0 1-2 1.7H7.5a2 2 0 0 1-2-1.7L4 7Zm0-3h16v3H4V4Zm5 7h6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {contextMenuNote?.archived ? "Ripristina" : "Archivia"}
            </button>
            <div className="noteMenuDivider" />
            <button
              className="noteMenuItem danger"
              type="button"
              role="menuitem"
              onClick={() => {
                setContextMenuState(null);
                onDelete(contextMenuState.id);
              }}
            >
              <svg className="trashIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Elimina
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
