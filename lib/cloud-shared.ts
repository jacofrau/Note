import type { Note, Sticker } from "./types";

export type CloudState = {
  notes: Note[];
  customEmojis: Sticker[];
  notesUpdatedAt: number;
  customEmojisUpdatedAt: number;
  updatedAt: number;
};

export type CloudStatePatch = {
  notes?: Note[];
  customEmojis?: Sticker[];
};

export function emptyCloudState(): CloudState {
  return {
    notes: [],
    customEmojis: [],
    notesUpdatedAt: 0,
    customEmojisUpdatedAt: 0,
    updatedAt: 0,
  };
}

export function normalizeCloudState(value: unknown): CloudState {
  const data = value as Partial<CloudState> | null | undefined;

  return {
    notes: Array.isArray(data?.notes) ? data.notes : [],
    customEmojis: Array.isArray(data?.customEmojis) ? data.customEmojis : [],
    notesUpdatedAt: typeof data?.notesUpdatedAt === "number" ? data.notesUpdatedAt : 0,
    customEmojisUpdatedAt: typeof data?.customEmojisUpdatedAt === "number" ? data.customEmojisUpdatedAt : 0,
    updatedAt: typeof data?.updatedAt === "number" ? data.updatedAt : 0,
  };
}

export function normalizeCloudStatePatch(value: unknown): CloudStatePatch {
  const data = value as CloudStatePatch | null | undefined;
  const patch: CloudStatePatch = {};

  if (Array.isArray(data?.notes)) patch.notes = data.notes;
  if (Array.isArray(data?.customEmojis)) patch.customEmojis = data.customEmojis;

  return patch;
}

export function hasCloudPatchContent(patch: CloudStatePatch): boolean {
  return "notes" in patch || "customEmojis" in patch;
}
