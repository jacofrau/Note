export type ChangelogEntry = {
  version: string;
  title: string;
  items: Array<{
    bold?: string;
    text: string;
  }>;
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.0.6b",
    title: "Tags and Stickers Update",
    items: [
      {
        text: "\u{1F3F7}\uFE0F Migliorato il sistema dei tag: ora raccolgono meglio le note",
      },
      {
        text: "\u{1F5BC}\uFE0F Revamp completo del sistema degli sticker: era troppo complesso",
      },
      {
        text: "\u2728 Leggere migliorie all'interfaccia grafica",
      },
      {
        text: "\u{1FAB2} Risolti parecchi bug",
      },
    ],
  },
  {
    version: "1.0.5b",
    title: "Colorful Update",
    items: [
      {
        text: "🎨 Aggiunti i temi in-app",
      },
      {
        text: "🖍️ Aggiunta la possibilità di evidenziare il testo",
      },
      {
        text: "✉️ Ora puoi inviarmi feedback direttamente dall'app (Impostazioni → App)",
      },
      {
        text: "🪲 Risolti parecchi bug",
      },
    ],
  },
  {
    version: "1.0.4b",
    title: "User-Experience Update",
    items: [
      {
        text: "👤 Esperienza utente migliorata (ora l'app è davvero tua!)",
      },
      {
        text: "⚙️ Ora l'app ha un suo pannello Impostazioni dedicato",
      },
      {
        text: "✨ Grafica migliorata (anche l'occhio vuole la sua parte 👀)",
      },
      {
        text: "🪲 Risolti parecchi bug",
      },
    ],
  },
  {
    version: "1.0.3b",
    title: "New design!",
    items: [
      {
        text: "🎨 Nuovo design dell'app disponibile",
      },
      {
        text: "🔎 Ricerca migliorata",
      },
      {
        text: "🪲 Corretti alcuni bug",
      },
    ],
  },
  {
    version: "1.0.2b",
    title: "Printing Update",
    items: [
      {
        text: "🖨️ Introdotta la possibilità di stampare le proprie note",
      },
      {
        text: "🪲 Corretti alcuni bug",
      },
    ],
  },
  {
    version: "1.0.1b",
    title: "Refinement Update",
    items: [
      {
        text: "🔗 Aggiunta la funzione ",
        bold: "Link",
      },
      {
        text: "✨ Piccole migliorie all'interfaccia grafica",
      },
      {
        text: "🪲 Corretti alcuni bug",
      },
    ],
  },
  {
    version: "1.0.0b",
    title: "Prima Release",
    items: [
      {
        text: "🚀 Pubblicata la prima release",
      },
    ],
  },
];
