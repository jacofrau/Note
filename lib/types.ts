import type { JSONContent } from "@tiptap/core";

export type NoteDoc = JSONContent;

export type Note = {
  id: string;
  title: string;
  doc: NoteDoc; // JSON di tiptap
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  archived?: boolean;
  tag?: string;
};

export type Sticker = {
  id: string;
  label: string;
  src: string; // data URL
  createdAt: number;
};

export type StickerPack = {
  id: string;
  name: string;
  creditLabel?: string;
  creditHref?: string;
  createdAt: number;
  stickers: Sticker[];
};

export type LegacyCustomEmoji = Sticker & {
  categoryId?: string;
  builtin?: boolean;
};
