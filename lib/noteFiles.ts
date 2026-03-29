import type { AppSettings } from "./appSettings";
import { normalizeAppSettings } from "./appSettings";
import type { DesignMode } from "./designMode";
import { normalizeDesignMode } from "./designMode";
import { getNoteTitleFromDoc as titleFromDoc } from "./noteText";
import { normalizeNotesData, normalizeStickerLibraryData } from "./storage";
import type { Note, Sticker } from "./types";

export const NOTE_FILE_EXTENSION = ".nby";
export const NOTE_FILE_KIND = "note-di-jaco/single-note";
export const BACKUP_FILE_KIND = "note-di-jaco/app-backup";
export const NOTE_FILE_VERSION = 1;
export const NOTE_FILE_MIME = "application/x-note-by-jaco+json";
export const BACKUP_FILE_NAME = `note_backup${NOTE_FILE_EXTENSION}`;

type ParsedBase = {
  exportedAt?: string;
};

export type ParsedNotesImportFile =
  | (ParsedBase & {
      kind: "single-note";
      format: "nby" | "legacy-single-json";
      note: Note;
      notes: [Note];
    })
  | (ParsedBase & {
      kind: "backup";
      format: "nby-backup" | "json-backup";
      notes: Note[];
      stickers: Sticker[];
      appSettings: AppSettings | null;
      designMode: DesignMode | null;
    });

function normalizeExportedAt(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function sanitizeFileSegment(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return normalized || "nota";
}

export function getSingleNoteFileStem(note: Pick<Note, "doc" | "title">) {
  return sanitizeFileSegment(titleFromDoc(note.doc) || note.title || "nota");
}

export function getSingleNoteFileName(note: Pick<Note, "doc" | "title">) {
  return `${getSingleNoteFileStem(note)}${NOTE_FILE_EXTENSION}`;
}

export function serializeSingleNoteFile(note: Note) {
  return JSON.stringify(
    {
      kind: NOTE_FILE_KIND,
      version: NOTE_FILE_VERSION,
      exportedAt: new Date().toISOString(),
      note,
    },
    null,
    2,
  );
}

export function serializeAppBackupFile(payload: {
  notes: Note[];
  stickers: Sticker[];
  appSettings: AppSettings;
  designMode: DesignMode;
}) {
  return JSON.stringify(
    {
      kind: BACKUP_FILE_KIND,
      version: NOTE_FILE_VERSION,
      exportedAt: new Date().toISOString(),
      notes: payload.notes,
      stickers: payload.stickers,
      appSettings: payload.appSettings,
      designMode: payload.designMode,
    },
    null,
    2,
  );
}

export function parseNotesImportFile(rawValue: string): ParsedNotesImportFile | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const record = parsed as {
    exportedAt?: unknown;
    kind?: unknown;
    note?: unknown;
    notes?: unknown;
    stickers?: unknown;
    stickerPacks?: unknown;
    appSettings?: unknown;
    designMode?: unknown;
    version?: unknown;
  };
  const exportedAt = normalizeExportedAt(record.exportedAt);

  if (record.kind === NOTE_FILE_KIND && record.version === NOTE_FILE_VERSION) {
    const note = normalizeNotesData([record.note])[0];
    if (!note) return null;

    return {
      kind: "single-note",
      format: "nby",
      exportedAt,
      note,
      notes: [note],
    };
  }

  if (record.kind === BACKUP_FILE_KIND && record.version === NOTE_FILE_VERSION) {
    return {
      kind: "backup",
      format: "nby-backup",
      exportedAt,
      notes: normalizeNotesData(record.notes),
      stickers: typeof record.stickers !== "undefined"
        ? normalizeStickerLibraryData(record.stickers)
        : normalizeStickerLibraryData(record.stickerPacks),
      appSettings: typeof record.appSettings === "undefined" ? null : normalizeAppSettings(record.appSettings),
      designMode: typeof record.designMode === "undefined" ? null : normalizeDesignMode(record.designMode),
    };
  }

  const notes = normalizeNotesData(record.notes);
  if (!notes.length) {
    return null;
  }

  if (notes.length === 1) {
    return {
      kind: "single-note",
      format: "legacy-single-json",
      exportedAt,
      note: notes[0],
      notes: [notes[0]],
    };
  }

  return {
    kind: "backup",
    format: "json-backup",
    exportedAt,
    notes,
    stickers: [],
    appSettings: null,
    designMode: null,
  };
}
