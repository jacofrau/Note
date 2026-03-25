import type { StickerPack } from "./types";

const DEFAULT_PACK_CREATED_AT = Date.UTC(2026, 2, 14, 12, 0, 0);

export const DEFAULT_STICKER_PACKS: StickerPack[] = [
  {
    id: "builtin-hand-drawn-funny-sticker-pack",
    name: "Hand drawn funny sticker pack",
    creditLabel: "Image by freepik",
    creditHref: "https://www.freepik.com/free-vector/hand-drawn-funny-sticker-pack_6208383.htm",
    createdAt: DEFAULT_PACK_CREATED_AT,
    stickers: [
      {
        id: "builtin-funny-pack-ghost-rainbow",
        label: "Ghost rainbow",
        src: "/sticker-packs/hand-drawn-funny-sticker-pack/ghost-rainbow.png",
        createdAt: DEFAULT_PACK_CREATED_AT,
      },
      {
        id: "builtin-funny-pack-melting-face",
        label: "Melting face",
        src: "/sticker-packs/hand-drawn-funny-sticker-pack/melting-face.png",
        createdAt: DEFAULT_PACK_CREATED_AT + 1,
      },
      {
        id: "builtin-funny-pack-screaming-donut",
        label: "Screaming donut",
        src: "/sticker-packs/hand-drawn-funny-sticker-pack/screaming-donut.png",
        createdAt: DEFAULT_PACK_CREATED_AT + 2,
      },
      {
        id: "builtin-funny-pack-bitten-sandwich",
        label: "Bitten sandwich",
        src: "/sticker-packs/hand-drawn-funny-sticker-pack/bitten-sandwich.png",
        createdAt: DEFAULT_PACK_CREATED_AT + 3,
      },
      {
        id: "builtin-funny-pack-happy-cloud",
        label: "Happy cloud",
        src: "/sticker-packs/hand-drawn-funny-sticker-pack/happy-cloud.png",
        createdAt: DEFAULT_PACK_CREATED_AT + 4,
      },
      {
        id: "builtin-funny-pack-green-monster",
        label: "Green monster",
        src: "/sticker-packs/hand-drawn-funny-sticker-pack/green-monster.png",
        createdAt: DEFAULT_PACK_CREATED_AT + 5,
      },
    ],
  },
];
