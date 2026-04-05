import type { StickerPack } from "./types";

const DEFAULT_PACK_CREATED_AT = Date.UTC(2026, 3, 5, 12, 0, 0);

export const DEFAULT_STICKER_PACKS: StickerPack[] = [
  {
    id: "builtin-jaco-default-sticker-pack",
    name: "Jaco default sticker pack",
    createdAt: DEFAULT_PACK_CREATED_AT,
    stickers: [
      {
        id: "builtin-jaco-pack-notes",
        label: "Notes",
        src: "/sticker-packs/jaco-default-sticker-pack/notes.png",
        createdAt: DEFAULT_PACK_CREATED_AT,
      },
      {
        id: "builtin-jaco-pack-to-do",
        label: "To do",
        src: "/sticker-packs/jaco-default-sticker-pack/to-do.png",
        createdAt: DEFAULT_PACK_CREATED_AT + 1,
      },
      {
        id: "builtin-jaco-pack-goals",
        label: "Goals",
        src: "/sticker-packs/jaco-default-sticker-pack/goals.png",
        createdAt: DEFAULT_PACK_CREATED_AT + 2,
      },
      {
        id: "builtin-jaco-pack-idea",
        label: "Idea",
        src: "/sticker-packs/jaco-default-sticker-pack/idea.png",
        createdAt: DEFAULT_PACK_CREATED_AT + 3,
      },
      {
        id: "builtin-jaco-pack-music",
        label: "Music",
        src: "/sticker-packs/jaco-default-sticker-pack/music.png",
        createdAt: DEFAULT_PACK_CREATED_AT + 4,
      },
      {
        id: "builtin-jaco-pack-workout",
        label: "Workout",
        src: "/sticker-packs/jaco-default-sticker-pack/workout.png",
        createdAt: DEFAULT_PACK_CREATED_AT + 5,
      },
    ],
  },
];
