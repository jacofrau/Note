import { nanoid } from "nanoid";
import type { Sticker } from "./types";

const IMAGE_MIME_BY_EXTENSION = new Map<string, string>([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
  [".bmp", "image/bmp"],
  [".avif", "image/avif"],
]);

export const ACCEPTED_STICKER_FILE_TYPES = [
  "image/*",
  ...Array.from(IMAGE_MIME_BY_EXTENSION.keys()),
];

const STICKER_RENDER_TARGET_MAX = 220;
const STICKER_RENDER_OUTLINE_PX = 6;
const STICKER_DISPLAY_CACHE = new Map<string, Promise<string>>();
const SAFE_STICKER_DATA_URL_PATTERN = /^data:image\/(?:png|jpe?g|webp|gif|svg\+xml|bmp|avif);base64,[a-z0-9+/=]+$/i;

function getFileExtension(name: string): string {
  const match = name.toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

function inferImageMimeType(file: File): string | null {
  if (typeof file.type === "string" && file.type.toLowerCase().startsWith("image/")) {
    return file.type;
  }

  const extension = getFileExtension(file.name);
  return IMAGE_MIME_BY_EXTENSION.get(extension) ?? null;
}

function toBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);

  for (let index = 0; index < bytes.length; index += 0x8000) {
    const chunk = bytes.subarray(index, index + 0x8000);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export async function fileToDataUrl(file: File): Promise<string> {
  const mime = inferImageMimeType(file);
  if (!mime) return "";

  const buffer = await file.arrayBuffer();
  return `data:${mime};base64,${toBase64(buffer)}`;
}

export function isStickerImageFile(file: File): boolean {
  return !!inferImageMimeType(file);
}

export function normalizeStickerLabel(name: string): string {
  const lastSegment = name.split("/").pop() ?? name;
  const plain = lastSegment.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim();
  return plain || "Sticker";
}

export function normalizeStickerSource(src: string): string {
  const normalized = typeof src === "string" ? src.trim() : "";
  if (!normalized) return "";

  if (SAFE_STICKER_DATA_URL_PATTERN.test(normalized)) {
    return normalized;
  }

  if (normalized.startsWith("blob:")) {
    return normalized;
  }

  if (normalized.startsWith("/sticker-packs/")) {
    return normalized;
  }

  return "";
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  const safeSrc = normalizeStickerSource(src);
  if (!safeSrc) {
    return Promise.reject(new Error("Unsafe sticker image source"));
  }

  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Sticker image load failed"));
    image.src = safeSrc;

    if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
      resolve(image);
    }
  });
}

async function renderStickerWithEmbeddedBorder(src: string): Promise<string> {
  const image = await loadImageElement(src);
  const naturalWidth = Math.max(1, image.naturalWidth || image.width || 1);
  const naturalHeight = Math.max(1, image.naturalHeight || image.height || 1);
  const scale = STICKER_RENDER_TARGET_MAX / Math.max(naturalWidth, naturalHeight);
  const canvasWidth = Math.max(1, Math.round(naturalWidth * scale));
  const canvasHeight = Math.max(1, Math.round(naturalHeight * scale));
  const padding = Math.max(
    2,
    Math.min(
      STICKER_RENDER_OUTLINE_PX + 1,
      Math.round(Math.min(canvasWidth, canvasHeight) * 0.07),
    ),
  );
  const drawWidth = Math.max(1, canvasWidth - padding * 2);
  const drawHeight = Math.max(1, canvasHeight - padding * 2);
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const context = canvas.getContext("2d");
  if (!context) return src;

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = canvas.width;
  maskCanvas.height = canvas.height;
  const maskContext = maskCanvas.getContext("2d");
  if (!maskContext) return src;

  maskContext.imageSmoothingEnabled = true;
  maskContext.drawImage(image, padding, padding, drawWidth, drawHeight);
  maskContext.globalCompositeOperation = "source-in";
  maskContext.fillStyle = "#ffffff";
  maskContext.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

  context.imageSmoothingEnabled = true;
  const outlinePasses = [
    { radius: STICKER_RENDER_OUTLINE_PX * 0.55, alpha: 0.45, steps: 18 },
    { radius: STICKER_RENDER_OUTLINE_PX, alpha: 0.92, steps: 24 },
  ];

  outlinePasses.forEach(({ radius, alpha, steps }) => {
    context.globalAlpha = alpha;
    for (let index = 0; index < steps; index += 1) {
      const angle = (Math.PI * 2 * index) / steps;
      const offsetX = Math.cos(angle) * radius;
      const offsetY = Math.sin(angle) * radius;
      context.drawImage(maskCanvas, offsetX, offsetY);
    }
  });

  context.globalAlpha = 1;
  context.drawImage(image, padding, padding, drawWidth, drawHeight);

  return canvas.toDataURL("image/png");
}

export async function getStickerDisplaySource(src: string, hasBorder = false): Promise<string> {
  const safeSrc = normalizeStickerSource(src);
  if (!safeSrc) return "";

  if (!hasBorder || typeof window === "undefined" || typeof document === "undefined") {
    return safeSrc;
  }

  const cacheKey = `bordered:${safeSrc}`;
  let cached = STICKER_DISPLAY_CACHE.get(cacheKey);
  if (!cached) {
    cached = renderStickerWithEmbeddedBorder(safeSrc).catch((error) => {
      STICKER_DISPLAY_CACHE.delete(cacheKey);
      throw error;
    });
    STICKER_DISPLAY_CACHE.set(cacheKey, cached);
  }

  try {
    return await cached;
  } catch {
    return safeSrc;
  }
}

export async function createStickerFromFile(
  file: File,
  options?: {
    srcOverride?: string;
    hasBorder?: boolean;
    favorite?: boolean;
    builtin?: boolean;
    createdAt?: number;
  },
): Promise<Sticker | null> {
  if (!isStickerImageFile(file)) return null;

  const src = normalizeStickerSource(options?.srcOverride ?? await fileToDataUrl(file));
  if (!src) return null;

  return {
    id: nanoid(),
    label: normalizeStickerLabel(file.name),
    src,
    createdAt: options?.createdAt ?? Date.now(),
    favorite: options?.favorite === true,
    hasBorder: options?.hasBorder !== false,
    builtin: options?.builtin === true,
  };
}
