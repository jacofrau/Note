"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Extension, Mark, mergeAttributes, type ChainedCommands } from "@tiptap/core";
import Heading from "@tiptap/extension-heading";
import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import ListItem from "@tiptap/extension-list-item";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Fragment, NodeRange, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, TextSelection, type EditorState } from "@tiptap/pm/state";
import { ReplaceAroundStep, canJoin, liftTarget } from "@tiptap/pm/transform";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { DesignMode } from "@/lib/designMode";
import { getStickerDisplaySource, normalizeStickerSource } from "@/lib/stickers";
import type { NoteDoc } from "@/lib/types";
import OverlayScrollArea from "@/components/OverlayScrollArea";
import { PencilCircleIcon } from "@/components/AppIcons";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    lineHeight: {
      setLineHeight: (lineHeight: string) => ReturnType;
      unsetLineHeight: () => ReturnType;
    };
    indent: {
      setIndent: (level: number) => ReturnType;
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
    spoiler: {
      setSpoiler: () => ReturnType;
      toggleSpoiler: () => ReturnType;
      unsetSpoiler: () => ReturnType;
    };
  }
}

const InlineCustomEmoji = Image.extend({
  addOptions() {
    const parentOptions = this.parent?.();
    return {
      inline: true,
      allowBase64: parentOptions?.allowBase64 ?? true,
      resize: parentOptions?.resize ?? false,
      HTMLAttributes: {
        ...(parentOptions?.HTMLAttributes ?? {}),
        class: "inline-custom-emoji",
        draggable: "false",
      },
    };
  },
  draggable: false,
  selectable: false,
  addAttributes() {
    return {
      ...this.parent?.(),
      stickerBorder: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-sticker-border") === "true",
        renderHTML: (attributes) => (
          attributes.stickerBorder
            ? { "data-sticker-border": "true" }
            : {}
        ),
      },
    };
  },
});

const CustomBulletList = BulletList.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      bulletSymbol: {
        default: "\u2022",
        parseHTML: (element) => element.getAttribute("data-bullet-symbol") ?? "\u2022",
        renderHTML: (attributes) => {
          const symbol = typeof attributes.bulletSymbol === "string" && attributes.bulletSymbol.length > 0
            ? attributes.bulletSymbol
            : "\u2022";
          return {
            "data-bullet-symbol": symbol,
            style: `--bullet-symbol: "${symbol}";`,
          };
        },
      },
    };
  },
});

const CustomListItem = ListItem.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      bulletSymbol: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-bullet-symbol"),
        renderHTML: (attributes) => {
          const symbol = typeof attributes.bulletSymbol === "string" && attributes.bulletSymbol.length > 0
            ? attributes.bulletSymbol
            : null;
          if (!symbol) {
            return {};
          }
          return {
            "data-bullet-symbol": symbol,
            style: `--item-bullet-symbol: "${symbol}";`,
          };
        },
      },
    };
  },
});

const checklistCompletionDateFormatter = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const lastUpdatedDateFormatter = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const lastUpdatedDateWithYearFormatter = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const lastUpdatedTimeFormatter = new Intl.DateTimeFormat("it-IT", {
  hour: "2-digit",
  minute: "2-digit",
});
const MATH_RESULT_COLOR = "#ffd45c";

function normalizeChecklistCompletedAt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function formatChecklistCompletedAt(value: unknown): string | null {
  const normalized = normalizeChecklistCompletedAt(value);
  if (!normalized) return null;
  return checklistCompletionDateFormatter.format(new Date(normalized));
}

function formatLastUpdatedAt(value: number): string {
  const date = new Date(value);
  const currentYear = new Date().getFullYear();
  const formattedDate = date.getFullYear() < currentYear
    ? lastUpdatedDateWithYearFormatter.format(date)
    : lastUpdatedDateFormatter.format(date);

  return `${formattedDate}, ${lastUpdatedTimeFormatter.format(date)}`;
}

function evaluateMathExpression(rawExpression: string): number | null {
  const source = rawExpression.replace(/\s+/g, "").replace(/,/g, ".");
  if (!source || !/[+\-*/]/.test(source) || !/\d/.test(source)) return null;

  let index = 0;

  function parseExpression(): number | null {
    let value = parseTerm();
    if (value == null) return null;

    while (index < source.length) {
      const operator = source[index];
      if (operator !== "+" && operator !== "-") break;
      index += 1;

      const right = parseTerm();
      if (right == null) return null;
      value = operator === "+" ? value + right : value - right;
    }

    return value;
  }

  function parseTerm(): number | null {
    let value = parseFactor();
    if (value == null) return null;

    while (index < source.length) {
      const operator = source[index];
      if (operator !== "*" && operator !== "/") break;
      index += 1;

      const right = parseFactor();
      if (right == null) return null;
      if (operator === "/" && right === 0) return null;
      value = operator === "*" ? value * right : value / right;
    }

    return value;
  }

  function parseFactor(): number | null {
    if (index >= source.length) return null;

    const current = source[index];
    if (current === "+") {
      index += 1;
      return parseFactor();
    }
    if (current === "-") {
      index += 1;
      const value = parseFactor();
      return value == null ? null : -value;
    }
    if (current === "(") {
      index += 1;
      const value = parseExpression();
      if (value == null || source[index] !== ")") return null;
      index += 1;
      return value;
    }

    return parseNumber();
  }

  function parseNumber(): number | null {
    const start = index;
    let sawDigit = false;
    let sawDot = false;

    while (index < source.length) {
      const current = source[index];
      if (/\d/.test(current)) {
        sawDigit = true;
        index += 1;
        continue;
      }
      if (current === "." && !sawDot) {
        sawDot = true;
        index += 1;
        continue;
      }
      break;
    }

    if (!sawDigit) return null;

    const parsed = Number.parseFloat(source.slice(start, index));
    return Number.isFinite(parsed) ? parsed : null;
  }

  const result = parseExpression();
  if (result == null || index !== source.length || !Number.isFinite(result)) return null;

  const normalized = Math.abs(result) < 1e-10 ? 0 : Number(result.toFixed(10));
  return Number.isFinite(normalized) ? normalized : null;
}

function formatMathResult(value: number): string {
  const normalized = Math.abs(value) < 1e-10 ? 0 : Number(value.toFixed(10));
  let text = normalized.toString();

  if (text.includes("e") || text.includes("E")) {
    text = normalized.toFixed(10);
  }

  if (text.includes(".")) {
    text = text.replace(/\.0+$/, "").replace(/(\.\d*?[1-9])0+$/, "$1");
  }

  return text.replace(".", ",");
}

function getMathResultPreview(state: EditorState, enabled: boolean): { pos: number; resultText: string } | null {
  if (!enabled) return null;

  const { selection } = state;
  if (!selection.empty) return null;

  const { $from } = selection;
  if (!$from.parent.isTextblock) return null;
  if ($from.parent.type.spec.code) return null;
  if ($from.parentOffset !== $from.parent.textContent.length) return null;

  const rawText = $from.parent.textContent.slice(0, $from.parentOffset).replace(/\s+$/u, "");
  if (!rawText.endsWith("=")) return null;

  const match = rawText.match(/([0-9+\-*/().,\s]+)=$/u);
  const expression = match?.[1]?.trim() ?? "";
  if (!expression || !/[+\-*/]/.test(expression) || !/\d/.test(expression)) return null;

  const result = evaluateMathExpression(expression);
  if (result == null) return null;

  return {
    pos: selection.from,
    resultText: formatMathResult(result),
  };
}

const CustomTaskItem = TaskItem.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      completedAt: {
        default: null,
        parseHTML: (element) => normalizeChecklistCompletedAt(element.getAttribute("data-completed-at")),
        renderHTML: (attributes) => {
          const completedAt = normalizeChecklistCompletedAt(attributes.completedAt);
          if (!completedAt) {
            return {};
          }

          const title = attributes.checked ? formatChecklistCompletedAt(completedAt) : null;
          return {
            "data-completed-at": String(completedAt),
            ...(title ? { title } : {}),
          };
        },
      },
    };
  },
});

function buildChecklistNormalizationTransaction(
  state: EditorState,
  previousState: EditorState | null,
  moveCompletedChecklistItemsToBottom: boolean,
) {
  const taskItemType = state.schema.nodes.taskItem;
  const taskListType = state.schema.nodes.taskList;
  if (!taskItemType || !taskListType) return null;

  let tr = state.tr;
  let changed = false;
  const canInferCompletionTransition = previousState !== null;

  state.doc.descendants((node, pos) => {
    if (node.type !== taskItemType) return true;

    const completedAt = normalizeChecklistCompletedAt(node.attrs.completedAt);
    const previousNode = previousState?.doc.nodeAt(pos);
    const previousChecked = previousNode?.type === taskItemType ? previousNode.attrs.checked === true : false;
    const previousCompletedAt = previousNode?.type === taskItemType
      ? normalizeChecklistCompletedAt(previousNode.attrs.completedAt)
      : null;

    if (node.attrs.checked === true) {
      const nextCompletedAt = completedAt
        ?? (canInferCompletionTransition
          ? (!previousChecked ? Date.now() : previousCompletedAt)
          : null);
      if (nextCompletedAt && nextCompletedAt !== completedAt) {
        tr = tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          completedAt: nextCompletedAt,
        });
        changed = true;
      }
      return true;
    }

    if (completedAt) {
      tr = tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        completedAt: null,
      });
      changed = true;
    }

    return true;
  });

  if (!moveCompletedChecklistItemsToBottom) {
    return changed ? tr : null;
  }

  const sourceDoc = changed ? tr.doc : state.doc;
  const taskLists: Array<{ pos: number; node: typeof sourceDoc }> = [];

  sourceDoc.descendants((node, pos) => {
    if (node.type === taskListType) {
      taskLists.push({ pos, node });
    }
    return true;
  });

  for (let index = taskLists.length - 1; index >= 0; index -= 1) {
    const entry = taskLists[index];
    const children: ProseMirrorNode[] = [];
    entry.node.forEach((child) => {
      children.push(child);
    });
    if (children.length < 2) continue;

    const unchecked = children
      .map((child, childIndex) => ({ child, childIndex }))
      .filter(({ child }) => child.attrs.checked !== true);
    const checked = children
      .map((child, childIndex) => ({
        child,
        childIndex,
        completedAt: normalizeChecklistCompletedAt(child.attrs.completedAt) ?? Number.NEGATIVE_INFINITY,
      }))
      .filter(({ child }) => child.attrs.checked === true)
      .sort((left, right) => {
        if (right.completedAt !== left.completedAt) {
          return right.completedAt - left.completedAt;
        }
        return left.childIndex - right.childIndex;
      });

    const sortedChildren = [
      ...unchecked.map(({ child }) => child),
      ...checked.map(({ child }) => child),
    ];

    const hasOrderChanged = sortedChildren.some((child, childIndex) => child !== children[childIndex]);
    if (!hasOrderChanged) continue;

    tr = tr.replaceWith(
      entry.pos + 1,
      entry.pos + entry.node.nodeSize - 1,
      Fragment.fromArray(sortedChildren),
    );
    changed = true;
  }

  return changed ? tr : null;
}

const ChecklistMetadata = Extension.create<{
  getShouldMoveCompletedToBottom: () => boolean;
}>({
  name: "checklistMetadata",

  addOptions() {
    return {
      getShouldMoveCompletedToBottom: () => false,
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }

          return buildChecklistNormalizationTransaction(
            newState,
            oldState,
            this.options.getShouldMoveCompletedToBottom(),
          );
        },
      }),
    ];
  },
});

const MathResultPreview = Extension.create<{
  getShouldShowPreview: () => boolean;
}>({
  name: "mathResultPreview",

  addOptions() {
    return {
      getShouldShowPreview: () => false,
    };
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const preview = getMathResultPreview(this.editor.state, this.options.getShouldShowPreview());
        if (!preview) return false;

        return this.editor
          .chain()
          .focus()
          .insertContent({
            type: "text",
            text: preview.resultText,
            marks: [
              {
                type: "textStyle",
                attrs: {
                  color: MATH_RESULT_COLOR,
                },
              },
            ],
          })
          .unsetColor()
          .run();
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: (state) => {
            const preview = getMathResultPreview(state, this.options.getShouldShowPreview());
            if (!preview) return null;

            return DecorationSet.create(state.doc, [
              Decoration.widget(
                preview.pos,
                () => {
                  const span = document.createElement("span");
                  span.className = "mathInlinePreview";
                  span.textContent = preview.resultText;
                  span.setAttribute("aria-hidden", "true");
                  return span;
                },
                {
                  side: 1,
                  ignoreSelection: true,
                },
              ),
            ]);
          },
        },
      }),
    ];
  },
});

const SmartListBackspace = Extension.create({
  name: "smartListBackspace",

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { selection } = this.editor.state;
        if (!selection.empty) return false;

        const { $from } = selection;
        if ($from.parentOffset !== 0) return false;

        for (let depth = $from.depth; depth > 0; depth -= 1) {
          if ($from.node(depth).type.name !== "listItem") continue;
          return liftCurrentListItem(this.editor.state, this.editor.view.dispatch);
        }

        return false;
      },
    };
  },
});

function liftCurrentListItem(state: EditorState, dispatch?: (tr: EditorState["tr"]) => void): boolean {
  const itemType = state.schema.nodes.listItem;
  if (!itemType) return false;

  const { $from } = state.selection;
  let listItemDepth = -1;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type === itemType) {
      listItemDepth = depth;
      break;
    }
  }

  if (listItemDepth < 0) return false;

  const itemStart = $from.before(listItemDepth);
  const itemEnd = $from.after(listItemDepth);
  const range = state.doc.resolve(itemStart + 1).blockRange(
    state.doc.resolve(itemEnd - 1),
    (node) => node.childCount > 0 && node.firstChild?.type === itemType,
  );

  if (!range) return false;
  if (!dispatch) return true;

  if ($from.node(range.depth - 1).type === itemType) {
    return liftCurrentItemToOuterList(state, dispatch, itemType, range);
  }

  return liftCurrentItemOutOfList(state, dispatch, range);
}

function liftCurrentItemToOuterList(
  state: EditorState,
  dispatch: (tr: EditorState["tr"]) => void,
  itemType: NonNullable<EditorState["schema"]["nodes"]["listItem"]>,
  range: NodeRange,
): boolean {
  const tr = state.tr;
  const end = range.end;
  const endOfList = range.$to.end(range.depth);

  if (end < endOfList) {
    tr.step(
      new ReplaceAroundStep(
        end - 1,
        endOfList,
        end,
        endOfList,
        new Slice(Fragment.from(itemType.create(null, range.parent.copy())), 1, 0),
        1,
        true,
      ),
    );
    range = new NodeRange(tr.doc.resolve(range.$from.pos), tr.doc.resolve(endOfList), range.depth);
  }

  const target = liftTarget(range);
  if (target == null) return false;

  tr.lift(range, target);
  const $after = tr.doc.resolve(tr.mapping.map(end, -1) - 1);
  if (canJoin(tr.doc, $after.pos) && $after.nodeBefore?.type === $after.nodeAfter?.type) {
    tr.join($after.pos);
  }

  dispatch(tr.scrollIntoView());
  return true;
}

function liftCurrentItemOutOfList(
  state: EditorState,
  dispatch: (tr: EditorState["tr"]) => void,
  range: NodeRange,
): boolean {
  const tr = state.tr;
  const list = range.parent;
  const $start = tr.doc.resolve(range.start);
  const item = $start.nodeAfter;

  if (!item) return false;

  const atStart = range.startIndex === 0;
  const atEnd = range.endIndex === list.childCount;
  const parent = $start.node(-1);
  const indexBefore = $start.index(-1);

  if (
    !parent.canReplace(
      indexBefore + (atStart ? 0 : 1),
      indexBefore + 1,
      item.content.append(atEnd ? Fragment.empty : Fragment.from(list.copy(Fragment.empty))),
    )
  ) {
    return false;
  }

  const start = $start.pos;
  const end = start + item.nodeSize;
  tr.step(
    new ReplaceAroundStep(
      start - (atStart ? 1 : 0),
      end + (atEnd ? 1 : 0),
      start + 1,
      end - 1,
      new Slice(
        (atStart ? Fragment.empty : Fragment.from(list.copy(Fragment.empty)))
          .append(atEnd ? Fragment.empty : Fragment.from(list.copy(Fragment.empty))),
        atStart ? 0 : 1,
        atEnd ? 0 : 1,
      ),
      atStart ? 0 : 1,
    ),
  );

  dispatch(tr.scrollIntoView());
  return true;
}

function TypeIcon() {
  return (
    <svg className="editorToolbarTypeIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 18L8 5H7L3 18M4.23077 14H10.7692M14.5 10C16 9 20 8 20 11.5C20 15 20 18 20 18M20 12.5C18.5 13 14 13 14 16C14 19 18.5 18 20 15.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const SmartTableBackspace = Extension.create({
  name: "smartTableBackspace",

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { selection } = this.editor.state;
        if (!selection.empty) return false;

        const { $from } = selection;
        if ($from.parentOffset !== 0 || $from.parent.textContent.trim().length > 0) {
          return false;
        }

        for (let depth = $from.depth; depth > 0; depth -= 1) {
          const node = $from.node(depth);
          if (node.type.name !== "table") continue;

          if (node.textContent.trim().length > 0) {
            return false;
          }

          return this.editor.commands.deleteTable();
        }

        return false;
      },
    };
  },
});

const LineHeight = Extension.create({
  name: "lineHeight",

  addOptions() {
    return {
      types: ["paragraph", "heading", "listItem"],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attributes) => {
              if (!attributes.lineHeight) {
                return {};
              }
              return {
                "data-line-height": String(attributes.lineHeight),
                style: `line-height: ${attributes.lineHeight}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineHeight:
        (lineHeight: string) =>
        ({ commands }) => {
          let applied = false;
          this.options.types.forEach((type: string) => {
            if (commands.updateAttributes(type, { lineHeight })) {
              applied = true;
            }
          });
          return applied;
        },
      unsetLineHeight:
        () =>
        ({ commands }) => {
          let cleared = false;
          this.options.types.forEach((type: string) => {
            if (commands.resetAttributes(type, "lineHeight")) {
              cleared = true;
            }
          });
          return cleared;
        },
    };
  },
});

const Spoiler = Mark.create({
  name: "spoiler",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-spoiler="true"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-spoiler": "true",
        class: "spoilerText",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setSpoiler:
        () =>
        ({ commands }) =>
          commands.setMark(this.name),
      toggleSpoiler:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
      unsetSpoiler:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

function getActiveIndentTarget(state: EditorState): { type: "listItem" | "heading" | "paragraph"; level: number } | null {
  const priorities = ["listItem", "heading", "paragraph"] as const;
  const { $from } = state.selection;

  for (const target of priorities) {
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      if (node.type.name !== target) continue;
      const rawLevel = typeof node.attrs.indent === "number" ? node.attrs.indent : Number(node.attrs.indent ?? 0);
      return {
        type: target,
        level: Number.isFinite(rawLevel) ? clamp(Math.round(rawLevel), 0, 6) : 0,
      };
    }
  }

  return null;
}

const Indent = Extension.create({
  name: "indent",

  addOptions() {
    return {
      types: ["paragraph", "heading", "listItem"],
      minLevel: 0,
      maxLevel: 6,
      step: "1.25rem",
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => {
              const raw = element.getAttribute("data-indent");
              if (!raw) return 0;
              const parsed = Number.parseInt(raw, 10);
              return Number.isFinite(parsed) ? clamp(parsed, this.options.minLevel, this.options.maxLevel) : 0;
            },
            renderHTML: (attributes) => {
              const level = typeof attributes.indent === "number"
                ? attributes.indent
                : Number(attributes.indent ?? 0);

              if (!Number.isFinite(level) || level <= 0) {
                return {};
              }

              const clampedLevel = clamp(Math.round(level), this.options.minLevel, this.options.maxLevel);
              return {
                "data-indent": String(clampedLevel),
                style: `margin-left: calc(${clampedLevel} * ${this.options.step});`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    const resolveTarget = (state: EditorState) => getActiveIndentTarget(state)?.type ?? "paragraph";
    const resolveLevel = (state: EditorState) => getActiveIndentTarget(state)?.level ?? 0;

    return {
      setIndent:
        (level: number) =>
        ({ state, commands }) => {
          const target = resolveTarget(state);
          const nextLevel = clamp(Math.round(level), this.options.minLevel, this.options.maxLevel);

          if (nextLevel <= 0) {
            return commands.resetAttributes(target, "indent");
          }

          return commands.updateAttributes(target, { indent: nextLevel });
        },
      indent:
        () =>
        ({ state, commands }) => {
          const currentLevel = resolveLevel(state);
          const nextLevel = clamp(currentLevel + 1, this.options.minLevel, this.options.maxLevel);
          return commands.setIndent(nextLevel);
        },
      outdent:
        () =>
        ({ state, commands }) => {
          const currentLevel = resolveLevel(state);
          const nextLevel = clamp(currentLevel - 1, this.options.minLevel, this.options.maxLevel);
          return commands.setIndent(nextLevel);
        },
    };
  },
});

const COLORS = [
  { name: "Bianco", value: "#f2f2f7" },
  { name: "Blu oltremare", value: "#4c63ff" },
  { name: "Menta", value: "#79f2c0" },
  { name: "Giallo", value: "#ffd45c" },
  { name: "Rosa", value: "#ff7db7" },
  { name: "Lilla", value: "#b8a6ff" },
];

const LIST_SYMBOLS = ["-", "\u2022", "\u25E6", "\u25AA", "\u2192", "\u2937", "\u2713", "\u2605", "\u2726", "\u25C6"];
const DEFAULT_LINE_HEIGHT = "1.55";
const LINE_HEIGHT_OPTIONS = ["1", "1.2", "1.4", DEFAULT_LINE_HEIGHT, "1.8", "2"];
const WHITE_TEXT_SWATCH = "#f2f2f7";
const WHITE_PAPER_TEXT_SWATCH = "#111111";

type EditorProps = {
  designMode: DesignMode;
  noteId: string;
  doc: NoteDoc;
  lastUpdatedAt: number;
  showColoredTextHighlights: boolean;
  moveCompletedChecklistItemsToBottom: boolean;
  showMathResultsPreview: boolean;
  whitePaperMode: boolean;
  onChangeDoc: (d: NoteDoc) => void;
  onDeleteNote: () => void;
  onNewNote: () => void;
  onInsertCustomEmoji?: (insertFn: (sticker: { src: string; hasBorder?: boolean }) => void) => void;
  onHistoryStateChange?: (state: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void } | null) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeSingleVisualSymbol(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const Segmenter = Intl.Segmenter;
  if (typeof Segmenter === "function") {
    const iterator = new Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed)[Symbol.iterator]();
    const first = iterator.next().value;
    if (first?.segment) return first.segment;
  }

  return Array.from(trimmed)[0] ?? "";
}

function normalizeExternalUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function TableInsertIcon() {
  return (
    <svg className="tableInsertIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.9" />
      <path d="M4 9.5h16M4 14.5h16M9.5 4v16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function AdjustmentsIcon() {
  return (
    <svg className="tableInsertIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 6H21M8 12H21M8 18H21M3 6.5H4V5.5H3V6.5ZM3 12.5H4V11.5H3V12.5ZM3 18.5H4V17.5H3V18.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashToolbarIcon() {
  return (
    <svg className="tableInsertIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NewNoteToolbarIcon() {
  return <PencilCircleIcon className="tableInsertIcon" />;
}

type EditorModeButtonProps = {
  active?: boolean;
  className?: string;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
};

function EditorModeButton({
  active = false,
  className = "",
  disabled = false,
  icon,
  label,
  onClick,
}: EditorModeButtonProps) {
  return (
    <button
      className={"editorModeButton" + (active ? " active" : "") + (className ? ` ${className}` : "")}
      disabled={disabled}
      onClick={onClick}
      type="button"
      aria-label={label}
      title={label}
    >
      <span className="editorModeButtonIcon" aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}

const EditorLink = Link.extend({
  inclusive: false,
});

export default function Editor({
  designMode,
  noteId,
  doc,
  lastUpdatedAt,
  showColoredTextHighlights,
  moveCompletedChecklistItemsToBottom,
  showMathResultsPreview,
  whitePaperMode,
  onChangeDoc,
  onDeleteNote,
  onNewNote,
  onInsertCustomEmoji,
  onHistoryStateChange,
}: EditorProps) {
  const [isFormatOpen, setIsFormatOpen] = useState(false);
  const [isStyleToolsOpen, setIsStyleToolsOpen] = useState(false);
  const [isListMenuOpen, setIsListMenuOpen] = useState(false);
  const [isTableMenuOpen, setIsTableMenuOpen] = useState(false);
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [listSymbol, setListSymbol] = useState("-");
  const [hasSelection, setHasSelection] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [menuLeft, setMenuLeft] = useState<number | null>(null);
  const [menuPlacement, setMenuPlacement] = useState<"top" | "bottom">("top");
  const [lineHeight, setLineHeight] = useState("1.55");
  const [customListSymbol, setCustomListSymbol] = useState("");
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [linkDialogLabel, setLinkDialogLabel] = useState("");
  const [linkDialogUrl, setLinkDialogUrl] = useState("https://");
  const [showLastUpdatedBanner, setShowLastUpdatedBanner] = useState(false);

  const textSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const linkDialogSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const allowCollapsedBubbleRef = useRef(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const linkLabelInputRef = useRef<HTMLInputElement | null>(null);
  const editorViewportRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTopRef = useRef(0);
  const moveCompletedChecklistItemsToBottomRef = useRef(moveCompletedChecklistItemsToBottom);
  const showMathResultsPreviewRef = useRef(showMathResultsPreview);
  const lastUpdatedLabel = formatLastUpdatedAt(lastUpdatedAt);

  useEffect(() => {
    moveCompletedChecklistItemsToBottomRef.current = moveCompletedChecklistItemsToBottom;
  }, [moveCompletedChecklistItemsToBottom]);

  useEffect(() => {
    showMathResultsPreviewRef.current = showMathResultsPreview;
  }, [showMathResultsPreview]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        link: false,
        underline: false,
      }),
      Heading.configure({
        levels: [1, 2],
      }),
      CustomListItem,
      CustomBulletList,
      OrderedList,
      Underline,
      EditorLink.configure({
        autolink: true,
        openOnClick: false,
        defaultProtocol: "https",
        HTMLAttributes: {
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
      }),
      TextStyle,
      Color,
      InlineCustomEmoji,
      Spoiler,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      LineHeight,
      Indent,
      TaskList,
      CustomTaskItem,
      ChecklistMetadata.configure({
        getShouldMoveCompletedToBottom: () => moveCompletedChecklistItemsToBottomRef.current,
      }),
      MathResultPreview.configure({
        getShouldShowPreview: () => showMathResultsPreviewRef.current,
      }),
      SmartListBackspace,
      SmartTableBackspace,
    ],
    content: doc ?? { type: "doc", content: [{ type: "paragraph" }] },
    autofocus: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "tiptap",
      },
      handleDOMEvents: {
        dragstart: (_view, event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement) || !target.matches("img.inline-custom-emoji")) {
            return false;
          }

          event.preventDefault();
          return true;
        },
      },
    },
    onUpdate({ editor }) {
      onChangeDoc(editor.getJSON());
    },
  });

  const hideBubble = useCallback(() => {
    setHasSelection(false);
    setMenuPos(null);
    setMenuLeft(null);
    setMenuPlacement("top");
    setIsFormatOpen(false);
    setIsStyleToolsOpen(false);
    setIsListMenuOpen(false);
    setIsTableMenuOpen(false);
    allowCollapsedBubbleRef.current = false;
    textSelectionRef.current = null;
  }, []);

  useEffect(() => {
    if (!editor) return;
    hideBubble();
    setIsEditorFocused(false);
    editor.commands.setContent(doc ?? { type: "doc", content: [{ type: "paragraph" }] }, { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, hideBubble, noteId, designMode]);

  useEffect(() => {
    if (!editor) return;
    let disposed = false;

    void (async () => {
      const pendingMigrations: Array<{ pos: number; nextSrc: string }> = [];

      editor.state.doc.descendants((node, pos) => {
        if (node.type.name !== "image") return;
        if (node.attrs.stickerBorder !== true) return;
        if (typeof node.attrs.src !== "string" || !node.attrs.src) return;

        pendingMigrations.push({
          pos,
          nextSrc: node.attrs.src,
        });
      });

      if (!pendingMigrations.length) return;

      const resolved = await Promise.all(
        pendingMigrations.map(async (entry) => ({
          pos: entry.pos,
          nextSrc: await getStickerDisplaySource(entry.nextSrc, true),
        })),
      );

      if (disposed) return;

      let tr = editor.state.tr;
      let changed = false;

      resolved.forEach(({ pos, nextSrc }) => {
        const node = tr.doc.nodeAt(pos);
        if (!node || node.type.name !== "image") return;
        if (node.attrs.stickerBorder !== true) return;
        if (typeof node.attrs.src !== "string" || !node.attrs.src) return;

        tr = tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          src: nextSrc,
          stickerBorder: false,
        });
        changed = true;
      });

      if (changed) {
        editor.view.dispatch(tr);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [editor, noteId]);

  useEffect(() => {
    if (!editor) return;

    const normalizationTransaction = buildChecklistNormalizationTransaction(
      editor.state,
      null,
      moveCompletedChecklistItemsToBottom,
    );

    if (normalizationTransaction) {
      editor.view.dispatch(normalizationTransaction);
    }
  }, [editor, moveCompletedChecklistItemsToBottom, noteId]);

  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.setMeta("math-result-preview-refresh", true));
  }, [editor, showMathResultsPreview, noteId]);

  useEffect(() => {
    if (!editor) return;
    editor.view.dom.classList.toggle("tiptapTextHighlightEnabled", showColoredTextHighlights);
  }, [editor, showColoredTextHighlights]);

  useEffect(() => {
    if (!editor) return;
    editor.view.dom.classList.toggle("tiptapWhitePaperMode", whitePaperMode);
  }, [editor, whitePaperMode]);

  useEffect(() => {
    if (!editor || !onInsertCustomEmoji) return;
    onInsertCustomEmoji(({ src, hasBorder }) => {
      const safeSrc = normalizeStickerSource(src);
      if (!safeSrc) return;

      editor
        .chain()
        .focus()
        .insertContent({
          type: "image",
          attrs: {
            src: safeSrc,
            stickerBorder: hasBorder === true,
          },
        })
        .run();
    });
  }, [editor, onInsertCustomEmoji]);

  useEffect(() => {
    const viewport = editorViewportRef.current;
    setShowLastUpdatedBanner(false);
    lastScrollTopRef.current = viewport?.scrollTop ?? 0;
  }, [noteId]);

  useEffect(() => {
    const viewport = editorViewportRef.current;
    if (!viewport) return;

    const handleScroll = () => {
      const currentScrollTop = viewport.scrollTop;
      const previousScrollTop = lastScrollTopRef.current;
      const delta = currentScrollTop - previousScrollTop;
      lastScrollTopRef.current = currentScrollTop;

      if (currentScrollTop <= 48) {
        setShowLastUpdatedBanner(false);
        return;
      }

      if (delta < -2) {
        setShowLastUpdatedBanner(true);
        return;
      }

      if (delta > 2) {
        setShowLastUpdatedBanner(false);
      }
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      viewport.removeEventListener("scroll", handleScroll);
    };
  }, [noteId]);

  useEffect(() => {
    if (!onHistoryStateChange) return;
    if (!editor) {
      onHistoryStateChange(null);
      return;
    }

    const emitHistoryState = () => {
      onHistoryStateChange({
        canUndo: editor.can().chain().focus().undo().run(),
        canRedo: editor.can().chain().focus().redo().run(),
        undo: () => {
          editor.chain().focus().undo().run();
        },
        redo: () => {
          editor.chain().focus().redo().run();
        },
      });
    };

    emitHistoryState();
    editor.on("transaction", emitHistoryState);

    return () => {
      onHistoryStateChange(null);
      editor.off("transaction", emitHistoryState);
    };
  }, [editor, onHistoryStateChange]);

  const applyCommand = useCallback(
    (command: (chain: ChainedCommands) => ChainedCommands, keepSelection = false) => {
      if (!editor) return;

      let chain = editor.chain().focus();
      if (!keepSelection) {
        const current = editor.state.selection;
        const targetSelection = !current.empty
          ? { from: current.from, to: current.to }
          : textSelectionRef.current;

        if (targetSelection) {
          chain = chain.setTextSelection({
            from: targetSelection.from,
            to: targetSelection.to,
          });
        }
      }
      command(chain).run();
    },
    [editor],
  );

  const applyLineHeight = useCallback(
    (value: string) => {
      setLineHeight(value);
      if (value === DEFAULT_LINE_HEIGHT) {
        applyCommand((chain) => chain.unsetLineHeight());
        return;
      }
      applyCommand((chain) => chain.setLineHeight(value));
    },
    [applyCommand],
  );

  const shiftLineHeight = useCallback(
    (direction: -1 | 1) => {
      const currentIndex = Math.max(0, LINE_HEIGHT_OPTIONS.indexOf(lineHeight));
      const nextIndex = clamp(currentIndex + direction, 0, LINE_HEIGHT_OPTIONS.length - 1);
      applyLineHeight(LINE_HEIGHT_OPTIONS[nextIndex]);
    },
    [applyLineHeight, lineHeight],
  );

  const applyListSymbol = useCallback(
    (symbol: string) => {
      if (!editor) return;

      const current = editor.state.selection;
      let chain = editor.chain().focus();
      const targetSelection = !current.empty
        ? { from: current.from, to: current.to }
        : textSelectionRef.current;

      if (targetSelection) {
        chain = chain.setTextSelection(targetSelection);
      }

      if (!editor.isActive("bulletList")) {
        chain = chain.toggleBulletList();
      }

      const normalizedSymbol = normalizeSingleVisualSymbol(symbol);
      if (!normalizedSymbol) return;

      chain.updateAttributes("listItem", { bulletSymbol: normalizedSymbol }).run();
      setListSymbol(normalizedSymbol);
      setCustomListSymbol(normalizedSymbol);
      setIsListMenuOpen(false);
    },
    [editor],
  );

  const applyCustomListSymbol = useCallback(() => {
    const normalized = normalizeSingleVisualSymbol(customListSymbol);
    if (!normalized) return;
    setCustomListSymbol(normalized);
    applyListSymbol(normalized);
  }, [applyListSymbol, customListSymbol]);

  const clampMenuLeft = useCallback(
    (left: number) => {
      const margin = 12;
      const measuredWidth = menuRef.current?.offsetWidth ?? (
        isFormatOpen && isTableMenuOpen ? 560 : isFormatOpen || isTableMenuOpen ? 520 : 120
      );
      const half = measuredWidth / 2;
      return Math.max(margin + half, Math.min(window.innerWidth - margin - half, left));
    },
    [isFormatOpen, isTableMenuOpen],
  );

  const updateBubbleAnchor = useCallback(() => {
    if (!editor) return;
    const selection = editor.state.selection;
    const anchorSelection = selection.empty
      ? (allowCollapsedBubbleRef.current ? textSelectionRef.current : null)
      : { from: selection.from, to: selection.to };

    if (!anchorSelection) {
      hideBubble();
      return;
    }

    let startCoords: { left: number; top: number; bottom: number };
    let endCoords: { left: number; top: number; bottom: number };
    try {
      startCoords = editor.view.coordsAtPos(anchorSelection.from);
      endCoords = editor.view.coordsAtPos(anchorSelection.to);
    } catch {
      hideBubble();
      return;
    }

    const rawLeft = (startCoords.left + endCoords.left) / 2;
    const nextLeft = clampMenuLeft(rawLeft);
    const selectionTop = Math.min(startCoords.top, endCoords.top);
    const selectionBottom = Math.max(startCoords.bottom, endCoords.bottom);
    const gap = 8;
    const margin = 10;
    const estimatedHeight = menuRef.current?.offsetHeight ?? (
      isFormatOpen || isTableMenuOpen ? 320 : 46
    );
    const spaceAbove = selectionTop - margin;
    const spaceBelow = window.innerHeight - selectionBottom - margin;
    const shouldOpenBelow = spaceAbove < estimatedHeight + gap && spaceBelow > spaceAbove;
    const nextPlacement: "top" | "bottom" = shouldOpenBelow ? "bottom" : "top";
    const unclampedTop = nextPlacement === "top"
      ? selectionTop - gap
      : selectionBottom + gap;
    const nextTop = nextPlacement === "top"
      ? Math.max(margin + estimatedHeight, Math.min(window.innerHeight - margin, unclampedTop))
      : Math.max(margin, Math.min(window.innerHeight - margin - estimatedHeight, unclampedTop));

    setHasSelection(true);
    setMenuPos({ left: nextLeft, top: nextTop });
    setMenuLeft(nextLeft);
    setMenuPlacement(nextPlacement);
    textSelectionRef.current = anchorSelection;
  }, [clampMenuLeft, editor, hideBubble, isFormatOpen, isTableMenuOpen]);

  const handleLinkAction = useCallback(() => {
    if (!editor) return;

    const selection = editor.state.selection;
    const targetSelection = !selection.empty
      ? { from: selection.from, to: selection.to }
      : textSelectionRef.current;
    const hasRangeSelection = !!targetSelection && targetSelection.from !== targetSelection.to;
    const currentLabel = hasRangeSelection && targetSelection
      ? editor.state.doc.textBetween(targetSelection.from, targetSelection.to, " ")
      : "";
    const currentHref = typeof editor.getAttributes("link")?.href === "string"
      ? editor.getAttributes("link").href as string
      : "";
    linkDialogSelectionRef.current = targetSelection ?? { from: editor.state.selection.from, to: editor.state.selection.from };
    setLinkDialogLabel(currentLabel);
    setLinkDialogUrl(currentHref || "https://");
    setIsLinkDialogOpen(true);
  }, [editor]);

  const closeLinkDialog = useCallback(() => {
    setIsLinkDialogOpen(false);
    setLinkDialogLabel("");
    setLinkDialogUrl("https://");
    linkDialogSelectionRef.current = null;
  }, []);

  const submitLinkDialog = useCallback(() => {
    if (!editor) return;

    const label = linkDialogLabel.trim();
    if (!label) return;

    const normalizedUrl = normalizeExternalUrl(linkDialogUrl);
    if (!normalizedUrl) return;

    const targetSelection = linkDialogSelectionRef.current ?? { from: editor.state.selection.from, to: editor.state.selection.from };
    const { state, view } = editor;
    const linkMarkType = state.schema.marks.link;
    if (!linkMarkType) return;

    const linkTextNode = state.schema.text(label, [linkMarkType.create({ href: normalizedUrl })]);
    let tr = state.tr.replaceWith(targetSelection.from, targetSelection.to, linkTextNode);
    const cursorPos = targetSelection.from + linkTextNode.nodeSize;
    tr = tr.setSelection(TextSelection.create(tr.doc, cursorPos));
    tr = tr.removeStoredMark(linkMarkType);
    view.dispatch(tr.scrollIntoView());
    view.focus();

    textSelectionRef.current = null;
    setHasSelection(false);
    setIsEditorFocused(true);
    closeLinkDialog();
  }, [closeLinkDialog, editor, linkDialogLabel, linkDialogUrl]);

  const handleSpoilerAction = useCallback(() => {
    applyCommand((chain) => chain.toggleSpoiler());
  }, [applyCommand]);

  const usesStaticToolbar = designMode === "v103b";
  const can = !!editor;
  const showBubble = !usesStaticToolbar && !!menuPos && hasSelection && isEditorFocused;
  const activeEditor = editor;
  const isTableActive = !!activeEditor?.isActive("table");
  const showTablePanel = isTableMenuOpen;
  const hasPrimaryPanelOpen = isFormatOpen || isStyleToolsOpen || showTablePanel;
  const hasBothPrimaryPanelsOpen = [isFormatOpen, isStyleToolsOpen, showTablePanel].filter(Boolean).length > 1;

  const toggleFormatPanel = useCallback(() => {
    setIsFormatOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsStyleToolsOpen(false);
        setIsTableMenuOpen(false);
        setIsListMenuOpen(false);
      }
      return next;
    });
  }, []);

  const toggleStyleToolsPanel = useCallback(() => {
    setIsStyleToolsOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsFormatOpen(false);
        setIsTableMenuOpen(false);
      } else {
        setIsListMenuOpen(false);
      }
      return next;
    });
  }, []);

  const toggleTablePanel = useCallback(() => {
    if (!editor) return;

    setIsTableMenuOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsFormatOpen(false);
        setIsStyleToolsOpen(false);
        setIsListMenuOpen(false);
      }
      return next;
    });
  }, [editor]);

  const formatPanelContent = activeEditor ? (
    <>
      <div className="bubbleRow bubbleFormatRow">
        <button
          className={"tool" + (activeEditor.isActive("heading", { level: 1 }) ? " active" : "")}
          disabled={!can}
          onClick={() => applyCommand((chain) => chain.toggleHeading({ level: 1 }))}
          type="button"
        >
          Titolo
        </button>
        <button
          className={"tool" + (activeEditor.isActive("heading", { level: 2 }) ? " active" : "")}
          disabled={!can}
          onClick={() => applyCommand((chain) => chain.toggleHeading({ level: 2 }))}
          type="button"
        >
          Sottotitolo
        </button>
        <button
          className={"tool monoTool" + (activeEditor.isActive("code") ? " active" : "")}
          disabled={!can}
          onClick={() => applyCommand((chain) => chain.toggleCode())}
          type="button"
        >
          Monostile
        </button>
        <button
          className={"tool" + (activeEditor.isActive("blockquote") ? " active" : "")}
          disabled={!can}
          onClick={() => applyCommand((chain) => chain.toggleBlockquote())}
          type="button"
        >
          Citazione
        </button>
        <button
          className={"tool" + (activeEditor.isActive("paragraph") && !activeEditor.isActive("heading") && !activeEditor.isActive("blockquote") && !activeEditor.isActive("bulletList") && !activeEditor.isActive("orderedList") && !activeEditor.isActive("taskList") ? " active" : "")}
          disabled={!can}
          onClick={() => {
            if (!editor) return;

            const currentSelection = editor.state.selection;
            const targetSelection = !currentSelection.empty
              ? { from: currentSelection.from, to: currentSelection.to }
              : textSelectionRef.current;

            let next = editor.chain().focus();
            if (targetSelection) {
              next = next.setTextSelection(targetSelection);
            }

            next = next.clearNodes().unsetLineHeight();

            const applied = next.run();
            if (applied) {
              setLineHeight(DEFAULT_LINE_HEIGHT);
              return;
            }
            if (!targetSelection) return;

            editor.chain().focus().setTextSelection(targetSelection.from).clearNodes().unsetLineHeight().run();
            setLineHeight(DEFAULT_LINE_HEIGHT);
          }}
          type="button"
        >
          Corpo
        </button>
        <button
          className={"tool" + (activeEditor.isActive("spoiler") ? " active" : "")}
          disabled={!can}
          onClick={handleSpoilerAction}
          type="button"
        >
          Spoiler
        </button>
        {usesStaticToolbar ? (
          <button
            className={"tool" + (activeEditor.isActive("link") ? " active" : "")}
            disabled={!can}
            onClick={handleLinkAction}
            type="button"
          >
            Link
          </button>
        ) : null}
      </div>

      <div className="bubbleRow bubbleColorRow">
        <button
          className={"tool" + (activeEditor.isActive("bold") ? " active" : "")}
          disabled={!can}
          onClick={() => applyCommand((chain) => chain.toggleBold())}
          type="button"
        >
          B
        </button>
        <button
          className={"tool" + (activeEditor.isActive("italic") ? " active" : "")}
          disabled={!can}
          onClick={() => applyCommand((chain) => chain.toggleItalic())}
          type="button"
        >
          <i>I</i>
        </button>
        <button
          className={"tool" + (activeEditor.isActive("underline") ? " active" : "")}
          disabled={!can}
          onClick={() => applyCommand((chain) => chain.toggleUnderline())}
          type="button"
        >
          <u>U</u>
        </button>
        <button
          className={"tool" + (activeEditor.isActive("strike") ? " active" : "")}
          disabled={!can}
          onClick={() => applyCommand((chain) => chain.toggleStrike())}
          type="button"
        >
          <s>S</s>
        </button>
        <div className="bubbleSwatches">
          {COLORS.map((c) => (
            <button
              key={c.value}
              className={"tool swatchTool" + (activeEditor.getAttributes("textStyle")?.color === c.value ? " active" : "")}
              data-paper-white={whitePaperMode && c.value === WHITE_TEXT_SWATCH ? "true" : undefined}
              disabled={!can}
              onClick={() => applyCommand((chain) => chain.setColor(c.value))}
              type="button"
              title={c.name}
              aria-label={c.name}
            >
              <span
                className={"colorSwatch" + (whitePaperMode && c.value === WHITE_TEXT_SWATCH ? " isWhitePaperPreview" : "")}
                style={{ background: whitePaperMode && c.value === WHITE_TEXT_SWATCH ? WHITE_PAPER_TEXT_SWATCH : c.value }}
              />
            </button>
          ))}
        </div>
      </div>
    </>
  ) : null;

  const styleToolsPanelContent = activeEditor ? (
    <>
      <div className="bubbleRow bubbleToolsRow">
        <button
          className={"tool" + (isListMenuOpen ? " active" : "")}
          disabled={!can}
          onClick={() => setIsListMenuOpen((prev) => !prev)}
          type="button"
        >
          Elenco
        </button>
        <button
          className="tool indentTool"
          disabled={!can}
          onClick={() => applyCommand((chain) => chain.outdent())}
          type="button"
          title="Sposta a sinistra"
          aria-label="Sposta a sinistra"
        >
          <svg className="indentActionIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M6 4v16M18 12H8m0 0 3.5-3.5M8 12l3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          className="tool indentTool"
          disabled={!can}
          onClick={() => applyCommand((chain) => chain.indent())}
          type="button"
          title="Sposta a destra"
          aria-label="Sposta a destra"
        >
          <svg className="indentActionIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M18 4v16M6 12h10m0 0-3.5-3.5M16 12l-3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          className={"tool" + (activeEditor.isActive("taskList") ? " active" : "")}
          disabled={!can}
          onClick={() => applyCommand((chain) => chain.toggleTaskList())}
          type="button"
        >
          Checklist
        </button>
        {!usesStaticToolbar ? (
          <button
            className={"tool" + (activeEditor.isActive("link") ? " active" : "")}
            disabled={!can}
            onClick={handleLinkAction}
            type="button"
          >
            Link
          </button>
        ) : null}
        <label className="lineHeightControl" title="Spaziatura righe">
          <span className="lineHeightIconWrap" aria-hidden="true">
            <svg className="lineHeightIcon" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 4v16m0 0-2.5-2.5M6 20l2.5-2.5M6 4 3.5 6.5M6 4l2.5 2.5M12 7h8M12 12h8M12 17h8"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <button
            className="tool spacingStepTool"
            disabled={!can}
            onClick={() => shiftLineHeight(-1)}
            type="button"
            title="Riduci distanza righe"
            aria-label="Riduci distanza righe"
          >
            -
          </button>
          <select
            className="bubbleSelect"
            value={lineHeight}
            onChange={(e) => applyLineHeight(e.target.value)}
          >
            {LINE_HEIGHT_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}x
              </option>
            ))}
          </select>
          <button
            className="tool spacingStepTool"
            disabled={!can}
            onClick={() => shiftLineHeight(1)}
            type="button"
            title="Aumenta distanza righe"
            aria-label="Aumenta distanza righe"
          >
            +
          </button>
        </label>
      </div>

      {isListMenuOpen ? (
        <>
          <div className="bubbleRow bubbleListRow">
            <button
              className={"tool listSymbolTool" + (activeEditor.isActive("orderedList") ? " active" : "")}
              disabled={!can}
              onClick={() => {
                applyCommand((chain) => chain.toggleOrderedList());
                setIsListMenuOpen(false);
              }}
              type="button"
              title="Elenco numerato"
            >
              1.
            </button>
            {LIST_SYMBOLS.map((symbol) => (
              <button
                key={symbol}
                className={"tool listSymbolTool" + (listSymbol === symbol ? " active" : "")}
                disabled={!can}
                onClick={() => applyListSymbol(symbol)}
                type="button"
                title={`Usa ${symbol}`}
              >
                {symbol}
              </button>
            ))}
          </div>
          <div className="bubbleRow bubbleListCustomRow">
            <input
              className="listSymbolInput"
              value={customListSymbol}
              onChange={(e) => setCustomListSymbol(normalizeSingleVisualSymbol(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyCustomListSymbol();
                }
              }}
              placeholder="Simbolo"
              spellCheck={false}
              aria-label="Simbolo elenco personalizzato"
            />
            <button
              className="tool listApplyTool"
              disabled={!can || !customListSymbol.trim()}
              onClick={applyCustomListSymbol}
              type="button"
            >
              OK
            </button>
          </div>
        </>
      ) : null}
    </>
  ) : null;

  const tablePanelContent = activeEditor ? (
    <div className="bubbleTablePanel">
      <div className="bubbleRow bubbleTableRow">
        <button
          className="tool"
          disabled={!can}
          onClick={() => {
            if (!editor) return;
            if (!editor.isActive("table")) {
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
              return;
            }
            editor.chain().focus().addRowAfter().run();
          }}
          type="button"
        >
          {isTableActive ? "Riga +" : "Tabella 3x3"}
        </button>
        <button
          className="tool"
          disabled={!can || !isTableActive}
          onClick={() => applyCommand((chain) => chain.addColumnAfter(), true)}
          type="button"
        >
          Colonna +
        </button>
        <button
          className="tool"
          disabled={!can || !isTableActive}
          onClick={() => applyCommand((chain) => chain.toggleHeaderRow(), true)}
          type="button"
        >
          Header riga
        </button>
        <button
          className="tool"
          disabled={!can || !isTableActive}
          onClick={() => applyCommand((chain) => chain.toggleHeaderColumn(), true)}
          type="button"
        >
          Header col.
        </button>
      </div>
      <div className="bubbleRow bubbleTableRow">
        <button
          className="tool"
          disabled={!can || !isTableActive}
          onClick={() => applyCommand((chain) => chain.addRowBefore(), true)}
          type="button"
        >
          Riga sopra
        </button>
        <button
          className="tool"
          disabled={!can || !isTableActive}
          onClick={() => applyCommand((chain) => chain.addColumnBefore(), true)}
          type="button"
        >
          Colonna prima
        </button>
        <button
          className="tool"
          disabled={!can || !isTableActive}
          onClick={() => applyCommand((chain) => chain.deleteRow(), true)}
          type="button"
        >
          Elimina riga
        </button>
        <button
          className="tool"
          disabled={!can || !isTableActive}
          onClick={() => applyCommand((chain) => chain.deleteColumn(), true)}
          type="button"
        >
          Elimina col.
        </button>
        <button
          className="tool danger"
          disabled={!can || !isTableActive}
          onClick={() => {
            applyCommand((chain) => chain.deleteTable(), true);
            setIsTableMenuOpen(false);
          }}
          type="button"
        >
          Elimina tabella
        </button>
      </div>
    </div>
  ) : null;

  useEffect(() => {
    if (!showBubble && !usesStaticToolbar) {
      setIsFormatOpen(false);
      setIsStyleToolsOpen(false);
      setIsListMenuOpen(false);
      setIsTableMenuOpen(false);
    }
  }, [showBubble, usesStaticToolbar]);

  useEffect(() => {
    if (!showBubble) return;
    const frame = window.requestAnimationFrame(() => updateBubbleAnchor());
    return () => window.cancelAnimationFrame(frame);
  }, [showBubble, isFormatOpen, isListMenuOpen, isTableMenuOpen, updateBubbleAnchor]);

  useEffect(() => {
    if (!showBubble) return;
    const onViewportChange = () => updateBubbleAnchor();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [showBubble, updateBubbleAnchor]);

  useEffect(() => {
    if (!isLinkDialogOpen) return;
    const frame = window.requestAnimationFrame(() => {
      linkLabelInputRef.current?.focus();
      linkLabelInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isLinkDialogOpen]);

  useEffect(() => {
    if (!editor) return;

    const syncFormattingState = () => {
      const activeSymbol =
        editor.getAttributes("listItem")?.bulletSymbol ??
        editor.getAttributes("bulletList")?.bulletSymbol;
      if (typeof activeSymbol === "string" && activeSymbol.length > 0) {
        const normalizedActiveSymbol = normalizeSingleVisualSymbol(activeSymbol);
        setListSymbol(normalizedActiveSymbol || activeSymbol);
        setCustomListSymbol(normalizedActiveSymbol || activeSymbol);
      }

      const activeLineHeight =
        editor.getAttributes("listItem")?.lineHeight ??
        editor.getAttributes("heading")?.lineHeight ??
        editor.getAttributes("paragraph")?.lineHeight;
      if (typeof activeLineHeight === "string" && LINE_HEIGHT_OPTIONS.includes(activeLineHeight)) {
        setLineHeight(activeLineHeight);
      } else {
        setLineHeight(DEFAULT_LINE_HEIGHT);
      }
    };

    const handleContextMenu = (event: MouseEvent) => {
      if (usesStaticToolbar) return;

      const selection = editor.state.selection;
      const clickedPos = editor.view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      });

      if (!selection.empty) {
        const clickedInsideSelection = clickedPos?.pos != null
          && clickedPos.pos >= selection.from
          && clickedPos.pos <= selection.to;

        if (clickedInsideSelection || clickedPos?.pos == null) {
          textSelectionRef.current = { from: selection.from, to: selection.to };
          allowCollapsedBubbleRef.current = false;
        } else {
          textSelectionRef.current = { from: clickedPos.pos, to: clickedPos.pos };
          allowCollapsedBubbleRef.current = true;
          setHasSelection(true);
          editor.chain().focus().setTextSelection(clickedPos.pos).run();
        }
      } else if (clickedPos?.pos != null) {
        textSelectionRef.current = { from: clickedPos.pos, to: clickedPos.pos };
        allowCollapsedBubbleRef.current = true;
        setHasSelection(true);
        editor.chain().focus().setTextSelection(clickedPos.pos).run();
      } else {
        textSelectionRef.current = { from: selection.from, to: selection.to };
        allowCollapsedBubbleRef.current = true;
        setHasSelection(true);
      }

      event.preventDefault();
      setIsEditorFocused(true);
      window.requestAnimationFrame(() => {
        updateBubbleAnchor();
      });
    };

    const handleEditorPointerDown = (event: PointerEvent) => {
      if (usesStaticToolbar) return;
      if (event.button === 2) {
        return;
      }

      allowCollapsedBubbleRef.current = false;
    };

    const handleSpoilerClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const spoiler = target.closest('[data-spoiler="true"]');
      if (!(spoiler instanceof HTMLElement) || !editor.view.dom.contains(spoiler)) {
        return;
      }

      spoiler.classList.toggle("is-revealed");
    };

    editor.view.dom.addEventListener("click", handleSpoilerClick);
    if (!usesStaticToolbar) {
      editor.view.dom.addEventListener("contextmenu", handleContextMenu);
      editor.view.dom.addEventListener("pointerdown", handleEditorPointerDown);
    }

    const handlePointerDownOutside = (event: PointerEvent) => {
      if (usesStaticToolbar) return;

      const target = event.target;
      if (!(target instanceof Node)) return;

      if (menuRef.current?.contains(target)) {
        return;
      }

      if (editor.view.dom.contains(target)) {
        return;
      }

      setIsEditorFocused(false);
      hideBubble();
    };

    const syncColorFromSelection = () => {
      setIsEditorFocused(editor.isFocused);
      const selection = editor.state.selection;
      if (usesStaticToolbar) {
        textSelectionRef.current = { from: selection.from, to: selection.to };
        syncFormattingState();
        return;
      }

      if (!editor.isFocused) {
        hideBubble();
      } else if (!selection.empty) {
        allowCollapsedBubbleRef.current = false;
        textSelectionRef.current = { from: selection.from, to: selection.to };
        updateBubbleAnchor();
      } else if (allowCollapsedBubbleRef.current && textSelectionRef.current) {
        updateBubbleAnchor();
      } else {
        hideBubble();
      }

      syncFormattingState();
    };

    const handleEditorBlur = () => {
      setIsEditorFocused(false);
      if (!usesStaticToolbar) {
        hideBubble();
      }
    };

    editor.on("selectionUpdate", syncColorFromSelection);
    editor.on("focus", syncColorFromSelection);
    editor.on("blur", handleEditorBlur);
    if (!usesStaticToolbar) {
      window.addEventListener("pointerdown", handlePointerDownOutside);
    }
    return () => {
      if (!usesStaticToolbar) {
        editor.view.dom.removeEventListener("contextmenu", handleContextMenu);
        editor.view.dom.removeEventListener("pointerdown", handleEditorPointerDown);
      }
      editor.view.dom.removeEventListener("click", handleSpoilerClick);
      if (!usesStaticToolbar) {
        window.removeEventListener("pointerdown", handlePointerDownOutside);
      }
      editor.off("selectionUpdate", syncColorFromSelection);
      editor.off("focus", syncColorFromSelection);
      editor.off("blur", handleEditorBlur);
    };
  }, [editor, hideBubble, updateBubbleAnchor, usesStaticToolbar]);

  return (
    <div className={"card" + (whitePaperMode ? " editorWhitePaperCard" : "")}>
      <div className="editorWrap">
        {usesStaticToolbar ? (
          <>
            <div className="editorToolbarV103EdgeActions">
              <button
                className="editorToolbarV103Button editorToolbarV103IconButton editorToolbarV103DangerButton editorToolbarV103EdgeAction"
                onClick={onDeleteNote}
                type="button"
                aria-label="Elimina nota"
                title="Elimina nota"
              >
                <TrashToolbarIcon />
              </button>
              <button
                className="editorToolbarV103Button editorToolbarV103IconButton editorToolbarV103AccentButton editorToolbarV103EdgeAction"
                onClick={onNewNote}
                type="button"
                aria-label="Nuova nota"
                title="Nuova nota"
              >
                <NewNoteToolbarIcon />
              </button>
            </div>
            <div className="editorToolbarV103Shell">
              <div className="editorToolbarV103Bar">
                <div
                  className="editorToolbarV103"
                  onMouseDown={(event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest("input, select")) return;
                    event.preventDefault();
                  }}
                >
                  <div className="editorToolbarV103Cluster">
                    <EditorModeButton
                      active={isFormatOpen}
                      disabled={!can}
                      icon={<TypeIcon />}
                      label="Formato"
                      onClick={toggleFormatPanel}
                    />
                    <EditorModeButton
                      active={isStyleToolsOpen}
                      disabled={!can}
                      icon={<AdjustmentsIcon />}
                      label="Elenco"
                      onClick={toggleStyleToolsPanel}
                    />
                    <EditorModeButton
                      active={showTablePanel}
                      disabled={!can}
                      icon={<TableInsertIcon />}
                      label="Tabella"
                      onClick={toggleTablePanel}
                    />
                  </div>
                </div>
              </div>

              {isFormatOpen || isStyleToolsOpen || showTablePanel ? (
                <div
                  className="editorToolbarV103Panels"
                  onMouseDown={(event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest("input, select")) return;
                    event.preventDefault();
                  }}
                >
                  {isFormatOpen ? (
                    <div className="editorToolbarV103Panel">
                      {formatPanelContent}
                    </div>
                  ) : null}
                  {isStyleToolsOpen ? (
                    <div className="editorToolbarV103Panel">
                      {styleToolsPanelContent}
                    </div>
                  ) : null}
                  {showTablePanel ? (
                    <div className="editorToolbarV103Panel editorToolbarV103PanelWide">
                      {tablePanelContent}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {showBubble && activeEditor ? (
          <div
            ref={menuRef}
            className={
              `bubbleMenu bubbleMenuFloating bubbleMenuFloating${menuPlacement === "bottom" ? "Bottom" : "Top"}`
              + (hasPrimaryPanelOpen ? "" : " bubbleMenuCompact")
            }
            style={{ left: menuLeft ?? menuPos.left, top: menuPos.top }}
            onMouseDown={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest("input, select")) return;
              e.preventDefault();
            }}
          >
            <div className={"bubbleToggleColumn" + (hasPrimaryPanelOpen ? " bubbleToggleColumnExpanded" : "")}>
              <EditorModeButton
                active={isFormatOpen}
                className="bubbleToggle"
                disabled={!can}
                icon={<TypeIcon />}
                label="Formato"
                onClick={toggleFormatPanel}
              />
              <EditorModeButton
                active={isStyleToolsOpen}
                className="bubbleToggle"
                disabled={!can}
                icon={<AdjustmentsIcon />}
                label="Elenco"
                onClick={toggleStyleToolsPanel}
              />
              <EditorModeButton
                active={showTablePanel || isTableActive}
                className="bubbleToggle"
                disabled={!can}
                icon={<TableInsertIcon />}
                label="Tabella"
                onClick={toggleTablePanel}
              />
            </div>

            {hasPrimaryPanelOpen ? (
            <div
              className={
                "bubblePanels"
                + (hasPrimaryPanelOpen ? " bubblePanelsExpanded" : "")
                + (hasBothPrimaryPanelsOpen ? " bubblePanelsStacked" : "")
              }
            >
            {isFormatOpen ? (
              <div className="bubblePanel">
                {formatPanelContent}
              </div>
            ) : null}
            {isStyleToolsOpen ? (
              <div className="bubblePanel">
                {styleToolsPanelContent}
              </div>
            ) : null}
            {showTablePanel ? (
              <div className="bubblePanel bubbleTableControlsPanel">
                {tablePanelContent}
              </div>
            ) : null}
            </div>
            ) : null}
          </div>
        ) : null}

        <OverlayScrollArea
          className="editorScrollArea"
          viewportClassName="editorScrollViewport"
          contentClassName="editorScrollContent"
          viewportRef={editorViewportRef}
        >
          {showLastUpdatedBanner ? (
            <div className="editorLastUpdatedWrap" aria-hidden="true">
              <div className="editorLastUpdatedBadge">
                Ultima modifica: {lastUpdatedLabel}
              </div>
            </div>
          ) : null}
          <EditorContent editor={editor} />
        </OverlayScrollArea>
        {isLinkDialogOpen ? (
          <div
            className="editorOverlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeLinkDialog();
              }
            }}
          >
            <div
              className="linkDialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="link-dialog-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="linkDialogTitle" id="link-dialog-title">Crea link</div>
              <label className="linkDialogField">
                <span className="linkDialogLabel">Testo</span>
                <input
                  ref={linkLabelInputRef}
                  className="linkDialogInput"
                  value={linkDialogLabel}
                  onChange={(event) => setLinkDialogLabel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      closeLinkDialog();
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      submitLinkDialog();
                    }
                  }}
                />
              </label>
              <label className="linkDialogField">
                <span className="linkDialogLabel">URL</span>
                <input
                  className="linkDialogInput"
                  value={linkDialogUrl}
                  onChange={(event) => setLinkDialogUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      closeLinkDialog();
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      submitLinkDialog();
                    }
                  }}
                  spellCheck={false}
                  inputMode="url"
                />
              </label>
              <div className="linkDialogActions">
                <button className="linkDialogButton" type="button" onClick={closeLinkDialog}>
                  Annulla
                </button>
                <button
                  className="linkDialogButton linkDialogButtonPrimary"
                  type="button"
                  onClick={submitLinkDialog}
                  disabled={!linkDialogLabel.trim() || !normalizeExternalUrl(linkDialogUrl)}
                >
                  Crea
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
