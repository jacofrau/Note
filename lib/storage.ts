import { del, get, set } from "idb-keyval";
import {
  getDesktopStoredValue,
  getDesktopStoredValueSync,
  isDesktopStorageAvailable,
  removeDesktopStoredValue,
  removeDesktopStoredValueSync,
  setDesktopStoredValue,
  setDesktopStoredValueSync,
} from "./desktopBridge";
import type { LegacyCustomEmoji, Note, Sticker, StickerPack } from "./types";
import { normalizeCloudState, type CloudState } from "./cloud-shared";
import { DEFAULT_STICKER_PACKS } from "./defaultStickerPacks";

const KEY = "notes_v1";
const LEGACY_CUSTOM_EMOJI_KEY = "custom_emoji_v1";
const STICKER_PACK_KEY = "sticker_packs_v1";
const CLOUD_SYNC_ENABLED = process.env.NEXT_PUBLIC_ENABLE_CLOUD_SYNC === "true";
const CLOUD_SYNC_ACCESS_KEY_STORAGE_KEY = "cloud_sync_access_key_v1";

const LEGACY_STICKER_PACK_TITLES = new Map<string, string>([
  ["smiley-persone", "Smiley e Persone"],
  ["animali-natura", "Animali e Natura"],
  ["cibo-bevande", "Cibo e Bevande"],
  ["attivita-sport", "Attivita / Sport"],
  ["viaggi-luoghi", "Viaggi e Luoghi"],
  ["oggetto", "Oggetti"],
  ["simboli", "Simboli"],
  ["bandiere", "Bandiere"],
]);

const LEGACY_STICKER_PACK_ORDER = Array.from(LEGACY_STICKER_PACK_TITLES.keys());

let cloudStateCache: CloudState | null = null;
let cloudStatePromise: Promise<CloudState | null> | null = null;

function normalizeCloudAccessKey(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function canUseWindowStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

async function getLocalPersistenceValue<T>(key: string): Promise<T | undefined> {
  const desktopValue = await getDesktopStoredValue<T>(key);
  if (typeof desktopValue !== "undefined") {
    return desktopValue;
  }

  const browserValue = (await get(key)) as T | undefined;
  if (typeof browserValue !== "undefined" && isDesktopStorageAvailable()) {
    await setDesktopStoredValue(key, browserValue);
  }

  return browserValue;
}

async function getLocalPersistenceEntry<T>(key: string): Promise<{ hasValue: boolean; value: T | undefined }> {
  const value = await getLocalPersistenceValue<T>(key);
  return {
    hasValue: typeof value !== "undefined",
    value,
  };
}

async function setLocalPersistenceValue(key: string, value: unknown) {
  if (isDesktopStorageAvailable()) {
    await setDesktopStoredValue(key, value);
  }

  await set(key, value);
}

async function removeLocalPersistenceValue(key: string) {
  if (isDesktopStorageAvailable()) {
    await removeDesktopStoredValue(key);
  }

  await del(key);
}

function getCloudAccessKey() {
  const desktopValue = getDesktopStoredValueSync<string>(CLOUD_SYNC_ACCESS_KEY_STORAGE_KEY);
  if (typeof desktopValue === "string") {
    return normalizeCloudAccessKey(desktopValue);
  }

  if (!canUseWindowStorage()) return null;

  try {
    const normalized = normalizeCloudAccessKey(window.localStorage.getItem(CLOUD_SYNC_ACCESS_KEY_STORAGE_KEY));

    if (normalized && isDesktopStorageAvailable()) {
      setDesktopStoredValueSync(CLOUD_SYNC_ACCESS_KEY_STORAGE_KEY, normalized);
    }

    return normalized;
  } catch {
    return null;
  }
}

function buildCloudHeaders(baseHeaders: Record<string, string> = {}) {
  const accessKey = getCloudAccessKey();
  if (!accessKey) return null;

  return {
    ...baseHeaders,
    "x-cloud-access-key": accessKey,
  };
}

function resetCloudStateCache() {
  cloudStateCache = null;
  cloudStatePromise = null;
}

export function isCloudSyncEnabledClient() {
  return CLOUD_SYNC_ENABLED;
}

export function hasCloudSyncAccessKey() {
  return !!getCloudAccessKey();
}

export function getStoredCloudSyncAccessKey() {
  return getCloudAccessKey();
}

export function setStoredCloudSyncAccessKey(value: string | null | undefined) {
  const normalized = normalizeCloudAccessKey(value);

  if (isDesktopStorageAvailable()) {
    if (normalized) {
      setDesktopStoredValueSync(CLOUD_SYNC_ACCESS_KEY_STORAGE_KEY, normalized);
    } else {
      removeDesktopStoredValueSync(CLOUD_SYNC_ACCESS_KEY_STORAGE_KEY);
    }
  }

  if (canUseWindowStorage()) {
    try {
      if (normalized) {
        window.localStorage.setItem(CLOUD_SYNC_ACCESS_KEY_STORAGE_KEY, normalized);
      } else {
        window.localStorage.removeItem(CLOUD_SYNC_ACCESS_KEY_STORAGE_KEY);
      }
    } catch {
      return null;
    }
  }

  resetCloudStateCache();
  return normalized;
}

function emptyDoc() {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

function defaultWelcomeDoc() {
  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: {
          lineHeight: null,
          indent: 0,
          level: 1,
        },
        content: [
          {
            type: "text",
            marks: [
              {
                type: "bold",
              },
            ],
            text: "Benvenuto/a!\u2B50",
          },
        ],
      },
      {
        type: "paragraph",
        attrs: {
          lineHeight: null,
          indent: 0,
        },
        content: [
          {
            type: "text",
            text: "Qui puoi creare e organizzare le tue note personali con tante opzioni di personalizzazione.",
          },
        ],
      },
      {
        type: "paragraph",
        attrs: {
          lineHeight: null,
          indent: 0,
        },
        content: [
          {
            type: "text",
            text: "\u270F\uFE0F ",
          },
          {
            type: "text",
            marks: [
              {
                type: "bold",
              },
            ],
            text: "Seleziona il testo",
          },
          {
            type: "text",
            text: " per aprire il menu di modifica e applicare ",
          },
          {
            type: "text",
            marks: [
              {
                type: "italic",
              },
              {
                type: "underline",
              },
            ],
            text: "stili",
          },
          {
            type: "text",
            text: ", ",
          },
          {
            type: "text",
            marks: [
              {
                type: "textStyle",
                attrs: {
                  color: "#b8a6ff",
                },
              },
            ],
            text: "c",
          },
          {
            type: "text",
            marks: [
              {
                type: "textStyle",
                attrs: {
                  color: "#79f2c0",
                },
              },
            ],
            text: "o",
          },
          {
            type: "text",
            marks: [
              {
                type: "textStyle",
                attrs: {
                  color: "#ffd45c",
                },
              },
            ],
            text: "l",
          },
          {
            type: "text",
            marks: [
              {
                type: "textStyle",
                attrs: {
                  color: "#ff7db7",
                },
              },
            ],
            text: "o",
          },
          {
            type: "text",
            marks: [
              {
                type: "textStyle",
                attrs: {
                  color: "#b8a6ff",
                },
              },
            ],
            text: "r",
          },
          {
            type: "text",
            marks: [
              {
                type: "textStyle",
                attrs: {
                  color: "#79f2c0",
                },
              },
            ],
            text: "i",
          },
          {
            type: "text",
            text: " e ",
          },
          {
            type: "text",
            marks: [
              {
                type: "code",
              },
            ],
            text: "formattazioni",
          },
          {
            type: "text",
            text: ".",
          },
          {
            type: "hardBreak",
          },
          {
            type: "text",
            text: "\u2B50 ",
          },
          {
            type: "text",
            marks: [
              {
                type: "bold",
              },
            ],
            text: "Aggiungi sticker",
          },
          {
            type: "text",
            text: " per rendere le tue note pi\u00F9 visive e personali.",
          },
          {
            type: "hardBreak",
          },
          {
            type: "text",
            text: "\u2753 Il pulsante ",
          },
          {
            type: "text",
            marks: [
              {
                type: "bold",
              },
            ],
            text: "\u201C?\u201D",
          },
          {
            type: "text",
            text: " ti guider\u00E0 nelle funzioni principali dell\u2019app.",
          },
        ],
      },
      {
        type: "paragraph",
        attrs: {
          lineHeight: null,
          indent: 0,
        },
        content: [
          {
            type: "text",
            text: "Questa applicazione \u00E8 in ",
          },
          {
            type: "text",
            marks: [
              {
                type: "bold",
              },
            ],
            text: "continua evoluzione",
          },
          {
            type: "text",
            text: ", quindi alcune funzionalit\u00E0 potrebbero cambiare o migliorare nel tempo.",
          },
        ],
      },
      {
        type: "paragraph",
        attrs: {
          lineHeight: null,
          indent: 0,
        },
        content: [
          {
            type: "text",
            text: "Se hai suggerimenti o vuoi segnalare un problema, puoi contattarmi al mio ",
          },
          {
            type: "text",
            marks: [
              {
                type: "link",
                attrs: {
                  href: "https://www.instagram.com/jacofrau/",
                  target: "_blank",
                  rel: "noopener noreferrer nofollow",
                  class: null,
                  title: null,
                },
              },
            ],
            text: "Instagram",
          },
          {
            type: "text",
            text: ".",
          },
        ],
      },
    ],
  };
}

function createWelcomeNotes(): Note[] {
  const timestamp = Date.now();

  return [
    {
      id: "welcome-note",
      title: "Benvenuto/a!\u2B50",
      doc: defaultWelcomeDoc(),
      createdAt: timestamp,
      updatedAt: timestamp,
      pinned: true,
      archived: false,
      tag: "tutorial",
    },
  ];
}

function cloneDefaultStickerPacks(): StickerPack[] {
  return DEFAULT_STICKER_PACKS.map((pack) => ({
    ...pack,
    stickers: pack.stickers.map((sticker) => ({ ...sticker })),
  }));
}

function normalizeTagValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const compact = value.replace(/\s+/g, " ").trim();
  return compact ? compact.slice(0, 24) : undefined;
}

function normalizeSingleNote(value: unknown, fallbackIndex = 0): Note {
  const raw = value as Partial<Note> | null | undefined;
  const now = Date.now();
  const id = typeof raw?.id === "string" && raw.id.trim() ? raw.id : `note-${now}-${fallbackIndex}`;
  const createdAt = typeof raw?.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : now;
  const updatedAt = typeof raw?.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt;

  return {
    id,
    title: typeof raw?.title === "string" ? raw.title : "",
    doc: raw?.doc && typeof raw.doc === "object" ? raw.doc : emptyDoc(),
    createdAt,
    updatedAt,
    pinned: !!raw?.pinned,
    archived: !!raw?.archived,
    tag: normalizeTagValue(raw?.tag),
  };
}

export function normalizeNotesData(value: unknown): Note[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: Note[] = [];

  value.forEach((entry, index) => {
    const note = normalizeSingleNote(entry, index);
    if (seen.has(note.id)) return;
    seen.add(note.id);
    normalized.push(note);
  });

  return normalized;
}

function normalizeSingleSticker(value: unknown, fallbackIndex = 0): Sticker | null {
  const raw = value as Partial<Sticker> | null | undefined;
  const now = Date.now();

  if (typeof raw?.src !== "string" || !raw.src.trim()) return null;

  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : `sticker-${now}-${fallbackIndex}`,
    label: typeof raw.label === "string" && raw.label.trim() ? raw.label : "Sticker",
    src: raw.src,
    createdAt: typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : now,
  };
}

function normalizeSingleStickerPack(value: unknown, fallbackIndex = 0): StickerPack | null {
  const raw = value as Partial<StickerPack> | null | undefined;
  const now = Date.now();
  const stickers = Array.isArray(raw?.stickers)
    ? raw.stickers
        .map((sticker, index) => normalizeSingleSticker(sticker, index))
        .filter((sticker): sticker is Sticker => !!sticker)
    : [];

  if (!stickers.length) return null;

  return {
    id: typeof raw?.id === "string" && raw.id.trim() ? raw.id : `sticker-pack-${now}-${fallbackIndex}`,
    name: typeof raw?.name === "string" && raw.name.trim() ? raw.name.trim() : `Pacchetto ${fallbackIndex + 1}`,
    creditLabel: typeof raw?.creditLabel === "string" && raw.creditLabel.trim() ? raw.creditLabel.trim() : undefined,
    creditHref: typeof raw?.creditHref === "string" && raw.creditHref.trim() ? raw.creditHref.trim() : undefined,
    createdAt: typeof raw?.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    stickers,
  };
}

export function normalizeStickerPacksData(value: unknown): StickerPack[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: StickerPack[] = [];

  value.forEach((entry, index) => {
    const pack = normalizeSingleStickerPack(entry, index);
    if (!pack || seen.has(pack.id)) return;
    seen.add(pack.id);
    normalized.push(pack);
  });

  return normalized;
}

function normalizeSingleLegacyCustomEmoji(value: unknown, fallbackIndex = 0): LegacyCustomEmoji | null {
  const raw = value as Partial<LegacyCustomEmoji> | null | undefined;
  const sticker = normalizeSingleSticker(value, fallbackIndex);
  if (!sticker) return null;

  return {
    ...sticker,
    categoryId: typeof raw?.categoryId === "string" && raw.categoryId.trim() ? raw.categoryId : undefined,
    builtin: raw?.builtin === true,
  };
}

function normalizeLegacyCustomEmojisData(value: unknown): LegacyCustomEmoji[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: LegacyCustomEmoji[] = [];

  value.forEach((entry, index) => {
    const emoji = normalizeSingleLegacyCustomEmoji(entry, index);
    if (!emoji || seen.has(emoji.id)) return;
    seen.add(emoji.id);
    normalized.push(emoji);
  });

  return normalized;
}

function migrateLegacyCustomEmojisToStickerPacks(emojis: LegacyCustomEmoji[]): StickerPack[] {
  if (!emojis.length) return [];

  const grouped = new Map<string, LegacyCustomEmoji[]>();
  const order: string[] = [];

  for (const emoji of emojis) {
    const categoryId = emoji.categoryId && LEGACY_STICKER_PACK_TITLES.has(emoji.categoryId)
      ? emoji.categoryId
      : "legacy-imported";
    if (!grouped.has(categoryId)) {
      grouped.set(categoryId, []);
      order.push(categoryId);
    }
    grouped.get(categoryId)?.push(emoji);
  }

  const orderedCategoryIds = [
    ...LEGACY_STICKER_PACK_ORDER.filter((categoryId) => grouped.has(categoryId)),
    ...order.filter((categoryId) => !LEGACY_STICKER_PACK_ORDER.includes(categoryId)),
  ];

  return orderedCategoryIds.map((categoryId, index) => {
    const stickers = grouped.get(categoryId) ?? [];
    const createdAt = stickers.reduce((minValue, sticker) => Math.min(minValue, sticker.createdAt || Date.now()), stickers[0]?.createdAt ?? Date.now());

    return {
      id: `legacy-pack-${categoryId}-${index}`,
      name: LEGACY_STICKER_PACK_TITLES.get(categoryId) ?? "Sticker importati",
      createdAt,
      stickers: stickers.map((sticker) => ({
        id: sticker.id,
        label: sticker.label,
        src: sticker.src,
        createdAt: sticker.createdAt,
      })),
    };
  });
}

function normalizeStoredStickerPacksData(value: unknown): StickerPack[] {
  if (!Array.isArray(value)) return [];
  if (!value.length) return [];

  const hasStickerPackShape = value.some((entry) => {
    const candidate = entry as Partial<StickerPack> | null | undefined;
    return !!candidate && Array.isArray(candidate.stickers);
  });

  if (hasStickerPackShape) {
    return normalizeStickerPacksData(value);
  }

  return migrateLegacyCustomEmojisToStickerPacks(normalizeLegacyCustomEmojisData(value));
}

async function loadCloudStateClient(force = false) {
  if (!CLOUD_SYNC_ENABLED || typeof window === "undefined") return null;
  const headers = buildCloudHeaders({
    "Cache-Control": "no-store",
  });
  if (!headers) return null;
  if (!force && cloudStateCache) return cloudStateCache;
  if (!force && cloudStatePromise) return cloudStatePromise;

  cloudStatePromise = (async () => {
    try {
      const response = await fetch("/api/cloud-state", {
        method: "GET",
        cache: "no-store",
        headers,
      });

      if (!response.ok) return null;

      const payload = (await response.json()) as { enabled?: boolean; state?: unknown };
      if (!payload?.enabled) return null;

      const state = normalizeCloudState(payload.state);
      cloudStateCache = state;
      return state;
    } catch {
      return null;
    } finally {
      cloudStatePromise = null;
    }
  })();

  return cloudStatePromise;
}

async function saveCloudPatchClient(patch: { notes?: Note[]; customEmojis?: StickerPack[] }) {
  if (!CLOUD_SYNC_ENABLED || typeof window === "undefined") return;
  const headers = buildCloudHeaders({
    "Content-Type": "application/json",
  });
  if (!headers) return;

  try {
    const response = await fetch("/api/cloud-state", {
      method: "PUT",
      headers,
      body: JSON.stringify(patch),
    });

    if (!response.ok) return;

    const payload = (await response.json()) as { enabled?: boolean; state?: unknown };
    if (!payload?.enabled) return;

    cloudStateCache = normalizeCloudState(payload.state);
  } catch {
    // Fallback silenzioso: la cache locale resta la fonte disponibile.
  }
}

export async function loadNotes(): Promise<Note[]> {
  const local = await getLocalPersistenceValue<Note[]>(KEY);
  const normalizedLocal = normalizeNotesData(local);
  const remote = await loadCloudStateClient();

  if (remote) {
    const normalizedRemote = normalizeNotesData(remote.notes);
    const hasRemoteNotes = remote.notesUpdatedAt > 0 || normalizedRemote.length > 0;

    if (hasRemoteNotes) {
      await setLocalPersistenceValue(KEY, normalizedRemote);
      return normalizedRemote;
    }

    if (normalizedLocal.length > 0) {
      await saveCloudPatchClient({ notes: normalizedLocal });
      await setLocalPersistenceValue(KEY, normalizedLocal);
      return normalizedLocal;
    }
  }

  if (typeof local === "undefined") {
    const seeded = createWelcomeNotes();
    await setLocalPersistenceValue(KEY, seeded);
    if (remote && remote.notesUpdatedAt === 0) {
      await saveCloudPatchClient({ notes: seeded });
    }
    return seeded;
  }

  return normalizedLocal;
}

export async function saveNotes(notes: Note[]): Promise<void> {
  const normalized = normalizeNotesData(notes);
  await setLocalPersistenceValue(KEY, normalized);
  await saveCloudPatchClient({ notes: normalized });
}

export function saveNotesLocallyImmediately(notes: Note[]): void {
  const normalized = normalizeNotesData(notes);

  if (isDesktopStorageAvailable()) {
    setDesktopStoredValueSync(KEY, normalized);
    return;
  }

  void set(KEY, normalized);
}

export function saveNotesImmediately(notes: Note[]): void {
  const normalized = normalizeNotesData(notes);
  saveNotesLocallyImmediately(normalized);
  void saveCloudPatchClient({ notes: normalized });
}

export async function resetStoredAppData(): Promise<void> {
  await removeLocalPersistenceValue(KEY);
  await removeLocalPersistenceValue(STICKER_PACK_KEY);
  await removeLocalPersistenceValue(LEGACY_CUSTOM_EMOJI_KEY);
  setStoredCloudSyncAccessKey("");
}

async function writeStickerPacks(packs: StickerPack[]) {
  await setLocalPersistenceValue(STICKER_PACK_KEY, packs);
  await removeLocalPersistenceValue(LEGACY_CUSTOM_EMOJI_KEY);
}

export async function loadStickerPacks(): Promise<StickerPack[]> {
  const localNewEntry = await getLocalPersistenceEntry<unknown>(STICKER_PACK_KEY);
  const hasNewLocal = localNewEntry.hasValue;
  const localNew = localNewEntry.value;
  const localLegacyEntry = hasNewLocal
    ? { hasValue: false, value: undefined as unknown }
    : await getLocalPersistenceEntry<unknown>(LEGACY_CUSTOM_EMOJI_KEY);
  const localLegacy = localLegacyEntry.value;
  const normalizedLocal = hasNewLocal
    ? normalizeStoredStickerPacksData(localNew)
    : normalizeStoredStickerPacksData(localLegacy);
  const remote = await loadCloudStateClient();

  if (remote) {
    const normalizedRemote = normalizeStoredStickerPacksData(remote.customEmojis);
    const hasRemoteStickerPacks = remote.customEmojisUpdatedAt > 0 || normalizedRemote.length > 0;

    if (hasRemoteStickerPacks) {
      await writeStickerPacks(normalizedRemote);
      return normalizedRemote;
    }

    if (hasNewLocal) {
      await saveCloudPatchClient({ customEmojis: normalizedLocal });
      await writeStickerPacks(normalizedLocal);
      return normalizedLocal;
    }

    if (typeof localLegacy !== "undefined") {
      await writeStickerPacks(normalizedLocal);
      await saveCloudPatchClient({ customEmojis: normalizedLocal });
      return normalizedLocal;
    }
  }

  if (hasNewLocal) {
    return normalizedLocal;
  }

  if (typeof localLegacy !== "undefined") {
    await writeStickerPacks(normalizedLocal);
    return normalizedLocal;
  }

  const seeded = cloneDefaultStickerPacks();
  await writeStickerPacks(seeded);
  if (remote && remote.customEmojisUpdatedAt === 0) {
    await saveCloudPatchClient({ customEmojis: seeded });
  }
  return seeded;
}

export async function saveStickerPacks(packs: StickerPack[]): Promise<void> {
  const normalized = normalizeStickerPacksData(packs);
  await writeStickerPacks(normalized);
  await saveCloudPatchClient({ customEmojis: normalized });
}

export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    const ap = a.pinned ? 1 : 0;
    const bp = b.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  });
}
