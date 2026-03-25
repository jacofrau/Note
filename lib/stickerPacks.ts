import JSZip from "jszip";
import { nanoid } from "nanoid";
import type { Sticker, StickerPack } from "./types";

export const ACCEPTED_STICKER_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
export const ACCEPTED_STICKER_IMPORT_TYPES = [
  ".zip",
  "application/zip",
  "application/x-zip-compressed",
  ...ACCEPTED_STICKER_IMAGE_TYPES,
];

const IMAGE_MIME_BY_EXTENSION = new Map<string, string>([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
]);

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Errore lettura file"));
    reader.readAsDataURL(file);
  });
}

export function normalizeStickerLabel(name: string): string {
  const lastSegment = name.split("/").pop() ?? name;
  const plain = lastSegment.replace(/\.[^/.]+$/, "").trim();
  return plain || "Sticker";
}

export function humanizePackName(name: string): string {
  const plain = name.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) return "Pacchetto sticker";
  return plain.replace(/\b([a-z])/gi, (match) => match.toUpperCase());
}

function getStickerMime(name: string): string | null {
  const match = name.toLowerCase().match(/\.[^.]+$/);
  if (!match) return null;
  return IMAGE_MIME_BY_EXTENSION.get(match[0]) ?? null;
}

export function isZipFile(file: File): boolean {
  return /\.zip$/i.test(file.name) || file.type === "application/zip" || file.type === "application/x-zip-compressed";
}

function getPackNameFromLooseFiles(files: File[], existingPackCount: number): string {
  if (files.length === 1) return humanizePackName(files[0]?.name ?? "");

  const relativePaths = files
    .map((file) => file.webkitRelativePath || "")
    .filter((value) => value.includes("/"))
    .map((value) => value.split("/")[0])
    .filter(Boolean);

  const sameDirectory = relativePaths.length === files.length && relativePaths.every((value) => value === relativePaths[0]);
  if (sameDirectory && relativePaths[0]) {
    return humanizePackName(relativePaths[0]);
  }

  return `Pacchetto ${existingPackCount + 1}`;
}

export function suggestStickerPackNameFromFiles(files: File[], existingPackCount: number): string {
  const zipFile = files.find((file) => isZipFile(file));
  if (zipFile) return humanizePackName(zipFile.name);
  return getPackNameFromLooseFiles(files, existingPackCount);
}

async function createStickerFromFile(file: File, createdAt: number, index: number): Promise<Sticker | null> {
  if (!ACCEPTED_STICKER_IMAGE_TYPES.includes(file.type)) return null;

  const src = await fileToDataUrl(file);
  if (!src) return null;

  return {
    id: nanoid(),
    label: normalizeStickerLabel(file.name),
    src,
    createdAt: createdAt + index,
  };
}

export async function createPackFromLooseFiles(files: File[], existingPackCount: number): Promise<StickerPack | null> {
  const createdAt = Date.now();
  const stickers = (
    await Promise.all(files.map((file, index) => createStickerFromFile(file, createdAt, index)))
  ).filter((sticker): sticker is Sticker => !!sticker);

  if (!stickers.length) return null;

  return {
    id: nanoid(),
    name: getPackNameFromLooseFiles(files, existingPackCount),
    createdAt,
    stickers,
  };
}

export async function createPackFromZip(file: File): Promise<StickerPack | null> {
  const archive = await JSZip.loadAsync(file);
  const imageEntries = Object.values(archive.files)
    .filter((entry) => !entry.dir)
    .map((entry) => ({
      entry,
      mime: getStickerMime(entry.name),
    }))
    .filter((candidate): candidate is { entry: JSZip.JSZipObject; mime: string } => !!candidate.mime)
    .sort((left, right) => left.entry.name.localeCompare(right.entry.name));

  if (!imageEntries.length) return null;

  const createdAt = Date.now();
  const stickers = await Promise.all(
    imageEntries.map(async ({ entry, mime }, index) => {
      const base64 = await entry.async("base64");
      return {
        id: nanoid(),
        label: normalizeStickerLabel(entry.name),
        src: `data:${mime};base64,${base64}`,
        createdAt: createdAt + index,
      };
    }),
  );

  return {
    id: nanoid(),
    name: humanizePackName(file.name),
    createdAt,
    stickers,
  };
}

export function reorderStickerPacks(packs: StickerPack[], sourceId: string, targetId: string): StickerPack[] | null {
  if (sourceId === targetId) return null;

  const sourceIndex = packs.findIndex((pack) => pack.id === sourceId);
  const targetIndex = packs.findIndex((pack) => pack.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return null;

  const next = [...packs];
  const [movedPack] = next.splice(sourceIndex, 1);
  if (!movedPack) return null;
  next.splice(targetIndex, 0, movedPack);

  return next;
}
