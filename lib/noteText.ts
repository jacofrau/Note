type DocNode = {
  type?: string;
  text?: string;
  content?: DocNode[];
};

type NoteTextSnapshot = {
  title: string;
  titleSearchText: string;
  bodyText: string;
  bodySearchText: string;
  lines: string[];
};

const noteTextCache = new WeakMap<object, NoteTextSnapshot>();

function toSearchText(value: string): string {
  return value.toLocaleLowerCase("it-IT");
}

function nodeToText(node: DocNode | null | undefined): string {
  if (!node) return "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === "text") return node.text ?? "";
  if (!Array.isArray(node.content)) return "";
  return node.content.map((child) => nodeToText(child)).join("");
}

function buildNoteTextSnapshot(doc: unknown): NoteTextSnapshot {
  const root = doc as DocNode | null | undefined;
  const blocks = Array.isArray(root?.content) ? root.content : [];
  const lines: string[] = [];

  for (const block of blocks) {
    const text = nodeToText(block).replace(/\u00a0/g, " ");
    const splitLines = text
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line.length > 0);

    lines.push(...splitLines);
  }

  const title = lines[0]?.slice(0, 80) ?? "";
  const bodyText = lines.slice(1).join(" ");

  return {
    title,
    titleSearchText: toSearchText(title),
    bodyText,
    bodySearchText: toSearchText(bodyText),
    lines,
  };
}

function getNoteTextSnapshot(doc: unknown): NoteTextSnapshot {
  if (doc && typeof doc === "object") {
    const cached = noteTextCache.get(doc as object);
    if (cached) return cached;

    const snapshot = buildNoteTextSnapshot(doc);
    noteTextCache.set(doc as object, snapshot);
    return snapshot;
  }

  return buildNoteTextSnapshot(doc);
}

export function getNoteTitleFromDoc(doc: unknown): string {
  return getNoteTextSnapshot(doc).title;
}

export function getNoteTitleSearchTextFromDoc(doc: unknown): string {
  return getNoteTextSnapshot(doc).titleSearchText;
}

export function getNoteBodyTextFromDoc(doc: unknown): string {
  return getNoteTextSnapshot(doc).bodyText;
}

export function getNoteBodySearchTextFromDoc(doc: unknown): string {
  return getNoteTextSnapshot(doc).bodySearchText;
}

export function getNoteLinesFromDoc(doc: unknown): string[] {
  return getNoteTextSnapshot(doc).lines;
}
