"use client";

import type { DragEvent, ImgHTMLAttributes } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Sticker } from "@/lib/types";
import { loadStickers, saveStickers } from "@/lib/storage";
import {
  ACCEPTED_STICKER_FILE_TYPES,
  createStickerFromFile,
  fileToDataUrl,
  getStickerDisplaySource,
  isStickerImageFile,
  normalizeStickerSource,
} from "@/lib/stickers";
import DialogOverlay from "@/components/dialogs/DialogOverlay";
import OverlayScrollArea from "@/components/OverlayScrollArea";
import { AddIcon, StarIcon, StickerIcon } from "@/components/AppIcons";

const MAX_FAVORITE_STICKERS = 9;

type CustomEmojiPickerProps = {
  onPick: (sticker: { src: string; hasBorder?: boolean }) => void;
  onShowNotice?: (message: string, options?: { icon?: "favorite" }) => void;
};

type StickerDraft = {
  file: File | null;
  rawSrc: string;
  previewSrc: string;
  hasBorder: boolean;
};

type StickerAssetImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  hasBorder?: boolean;
};

function createEmptyDraft(hasBorder = false): StickerDraft {
  return {
    file: null,
    rawSrc: "",
    previewSrc: "",
    hasBorder,
  };
}

function StickerAssetImage({ src, hasBorder = false, className, alt, ...props }: StickerAssetImageProps) {
  const [renderedSource, setRenderedSource] = useState<{ input: string; output: string } | null>(null);
  const resolvedSrc = hasBorder && renderedSource?.input === src ? renderedSource.output : src;
  const isRendered = hasBorder && renderedSource?.input === src && renderedSource.output !== src;
  const safeSrc = normalizeStickerSource(resolvedSrc);
  const canRenderSafeStickerSource =
    safeSrc.startsWith("data:image/") ||
    safeSrc.startsWith("blob:") ||
    safeSrc.startsWith("/sticker-packs/");

  useEffect(() => {
    let disposed = false;

    if (!hasBorder) {
      return () => {
        disposed = true;
      };
    }

    void getStickerDisplaySource(src, true).then((nextSrc) => {
      if (disposed) return;
      setRenderedSource((current) => {
        if (current?.input === src && current.output === nextSrc) {
          return current;
        }
        return {
          input: src,
          output: nextSrc,
        };
      });
    });

    return () => {
      disposed = true;
    };
  }, [src, hasBorder]);

  if (!canRenderSafeStickerSource) {
    return null;
  }

  return (
    // next/image can't render this async, locally generated asset pipeline.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      className={className}
      src={safeSrc}
      alt={alt}
      draggable={false}
      decoding="async"
      data-sticker-border-rendered={hasBorder && isRendered ? "true" : undefined}
    />
  );
}

function isFileDrag(event: DragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function pickFirstStickerImage(files: FileList | File[] | null | undefined): File | null {
  if (!files) return null;
  const items = Array.isArray(files) ? files : Array.from(files);
  return items.find((file) => isStickerImageFile(file)) ?? null;
}

async function buildDraftFromFile(file: File, hasBorder: boolean): Promise<StickerDraft | null> {
  if (!isStickerImageFile(file)) return null;

  const rawSrc = await fileToDataUrl(file);
  if (!rawSrc) return null;
  const previewSrc = await getStickerDisplaySource(rawSrc, hasBorder);

  return {
    file,
    rawSrc,
    previewSrc,
    hasBorder,
  };
}

async function buildEmbeddedStickerSource(rawSrc: string, hasBorder: boolean): Promise<string> {
  if (!rawSrc) return "";
  return getStickerDisplaySource(rawSrc, hasBorder);
}

function sortStickerLibrary(stickers: Sticker[]) {
  return [...stickers].sort((left, right) => {
    const favoriteDiff = Number(right.favorite === true) - Number(left.favorite === true);
    if (favoriteDiff !== 0) return favoriteDiff;

    const createdDiff = (right.createdAt ?? 0) - (left.createdAt ?? 0);
    if (createdDiff !== 0) return createdDiff;

    return left.label.localeCompare(right.label, "it-IT", { sensitivity: "base" });
  });
}

export default function StickerPackPicker({ onPick, onShowNotice }: CustomEmojiPickerProps) {
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<StickerDraft | null>(null);
  const [contextMenuState, setContextMenuState] = useState<{ id: string; left: number; top: number } | null>(null);
  const [isLibraryDropTarget, setIsLibraryDropTarget] = useState(false);
  const [isDialogDropTarget, setIsDialogDropTarget] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const libraryDropDepthRef = useRef(0);
  const dialogDropDepthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      const loaded = await loadStickers();
      if (!isMounted) return;
      const migrated = await Promise.all(
        loaded.map(async (sticker) => {
          if (sticker.hasBorder !== true) {
            return sticker;
          }

          const nextSrc = await getStickerDisplaySource(sticker.src, true);
          if (!nextSrc || nextSrc === sticker.src) {
            return sticker;
          }

          return {
            ...sticker,
            src: nextSrc,
            hasBorder: false,
          };
        }),
      );

      if (!isMounted) return;

      const changed = migrated.some((sticker, index) =>
        sticker.src !== loaded[index]?.src || sticker.hasBorder !== loaded[index]?.hasBorder,
      );
      const sorted = sortStickerLibrary(migrated);
      setStickers(sorted);

      if (changed) {
        await saveStickers(sorted);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      setContextMenuState(null);
      if (draft && !busy) {
        setDraft(null);
      }
    };

    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("keydown", onEscape);
    };
  }, [busy, draft]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      const target = event.target as Node;
      if (rootRef.current.contains(target)) {
        if (!(target instanceof Element) || !target.closest(".noteMenu")) {
          setContextMenuState(null);
        }
        return;
      }

      setContextMenuState(null);
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, []);

  const orderedStickers = useMemo(() => sortStickerLibrary(stickers), [stickers]);
  const favoriteStickers = useMemo(
    () => orderedStickers.filter((sticker) => sticker.favorite === true),
    [orderedStickers],
  );
  const otherStickers = useMemo(
    () => orderedStickers.filter((sticker) => sticker.favorite !== true),
    [orderedStickers],
  );

  async function persistStickers(next: Sticker[]) {
    const sorted = sortStickerLibrary(next);
    setStickers(sorted);
    await saveStickers(sorted);
  }

  async function loadDraftFile(file: File, hasBorder: boolean) {
    setBusy(true);
    setError(null);

    try {
      const nextDraft = await buildDraftFromFile(file, hasBorder);
      if (!nextDraft) {
        setError("Formato non supportato. Carica un'immagine valida.");
        return;
      }

      setDraft(nextDraft);
    } catch {
      setError("Caricamento non riuscito. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  function openImportDialog() {
    setError(null);
    setDraft(createEmptyDraft());
  }

  function closeImportDialog() {
    if (busy) return;
    setDraft(null);
    setIsDialogDropTarget(false);
    dialogDropDepthRef.current = 0;
  }

  function handleImportSelection(fileList: FileList | null) {
    const selectedFile = pickFirstStickerImage(fileList);
    if (!selectedFile) {
      setError("Formato non supportato. Carica un'immagine valida.");
      return;
    }

    const hasBorder = draft?.hasBorder ?? false;
    void loadDraftFile(selectedFile, hasBorder);
  }

  async function confirmImport() {
    if (!draft?.file) {
      setError("Scegli un'immagine prima di importare lo sticker.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const sticker = await createStickerFromFile(draft.file, {
        srcOverride: draft.previewSrc,
        hasBorder: false,
      });

      if (!sticker) {
        setError("Import non riuscito. Riprova con un'immagine diversa.");
        return;
      }

      await persistStickers([sticker, ...stickers]);
      setDraft(null);
      resetDialogDropTarget();
    } catch {
      setError("Import non riuscito. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleFavorite(id: string) {
    const targetSticker = stickers.find((sticker) => sticker.id === id);
    if (!targetSticker) return;

    if (!targetSticker.favorite && favoriteStickers.length >= MAX_FAVORITE_STICKERS) {
      onShowNotice?.("Puoi mettere massimo 9 sticker nei preferiti", { icon: "favorite" });
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await persistStickers(
        stickers.map((sticker) =>
          sticker.id === id ? { ...sticker, favorite: !sticker.favorite } : sticker,
        ),
      );
    } catch {
      setError("Non sono riuscito ad aggiornare i preferiti.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSticker(id: string) {
    setBusy(true);
    setError(null);
    setContextMenuState(null);

    try {
      await persistStickers(stickers.filter((sticker) => sticker.id !== id));
    } catch {
      setError("Non sono riuscito a eliminare lo sticker.");
    } finally {
      setBusy(false);
    }
  }

  function resetLibraryDropTarget() {
    libraryDropDepthRef.current = 0;
    setIsLibraryDropTarget(false);
  }

  function resetDialogDropTarget() {
    dialogDropDepthRef.current = 0;
    setIsDialogDropTarget(false);
  }

  function handleLibraryDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event) || draft) return;
    event.preventDefault();
    libraryDropDepthRef.current += 1;
    setIsLibraryDropTarget(true);
  }

  function handleLibraryDragOver(event: DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event) || draft) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleLibraryDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event) || draft) return;
    event.preventDefault();
    libraryDropDepthRef.current = Math.max(0, libraryDropDepthRef.current - 1);
    if (libraryDropDepthRef.current === 0) {
      setIsLibraryDropTarget(false);
    }
  }

  function handleLibraryDrop(event: DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event) || draft) return;
    event.preventDefault();
    const file = pickFirstStickerImage(event.dataTransfer.files);
    resetLibraryDropTarget();

    if (!file) {
      setError("Formato non supportato. Carica un'immagine valida.");
      return;
    }

    setDraft(createEmptyDraft());
    void loadDraftFile(file, false);
  }

  function handleDialogDragEnter(event: DragEvent<HTMLButtonElement>) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dialogDropDepthRef.current += 1;
    setIsDialogDropTarget(true);
  }

  function handleDialogDragOver(event: DragEvent<HTMLButtonElement>) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDialogDragLeave(event: DragEvent<HTMLButtonElement>) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dialogDropDepthRef.current = Math.max(0, dialogDropDepthRef.current - 1);
    if (dialogDropDepthRef.current === 0) {
      setIsDialogDropTarget(false);
    }
  }

  function handleDialogDrop(event: DragEvent<HTMLButtonElement>) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    const file = pickFirstStickerImage(event.dataTransfer.files);
    resetDialogDropTarget();

    if (!file) {
      setError("Formato non supportato. Carica un'immagine valida.");
      return;
    }

    void loadDraftFile(file, draft?.hasBorder ?? false);
  }

  function resolveContextMenuPosition(clientX: number, clientY: number) {
    const menuWidth = 176;
    const menuHeight = 64;
    const margin = 12;

    const left = Math.max(margin, Math.min(clientX, window.innerWidth - menuWidth - margin));
    const top = Math.max(margin, Math.min(clientY, window.innerHeight - menuHeight - margin));

    return { left, top };
  }

  function renderStickerGrid(items: Sticker[], favoriteSection = false) {
    return (
      <div className="customEmojiGrid customStickerFlatGrid" role="list">
        {items.map((sticker) => (
          <div
            key={sticker.id}
            className={"customEmojiItem customStickerTile" + (sticker.favorite ? " isFavorite" : "")}
            role="listitem"
          >
            <button
              className="customEmojiBtn customStickerTileButton"
              type="button"
              aria-label={`Inserisci ${sticker.label}`}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => onPick({ src: sticker.src, hasBorder: sticker.hasBorder })}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenuState({
                  id: sticker.id,
                  ...resolveContextMenuPosition(event.clientX, event.clientY),
                });
              }}
            >
              <span className="customStickerTileImageWrap">
                <StickerAssetImage
                  className={"customStickerAsset" + (sticker.hasBorder ? " hasBorder" : "")}
                  src={sticker.src}
                  hasBorder={sticker.hasBorder}
                  alt=""
                  aria-hidden="true"
                  width={120}
                  height={120}
                />
              </span>
            </button>

            <button
              className={
                "customStickerFavoriteButton" +
                (sticker.favorite ? " isActive" : "") +
                (favoriteSection ? " isPinnedVisible" : "")
              }
              type="button"
              title={sticker.favorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
              aria-label={sticker.favorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
              onClick={(event) => {
                event.stopPropagation();
                void toggleFavorite(sticker.id);
              }}
            >
              <span className="customStickerFavoriteIcon" aria-hidden="true">
                <StarIcon filled={sticker.favorite} />
              </span>
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={"card customStickerLibraryCard" + (isLibraryDropTarget ? " isDropTarget" : "")}
      onDragEnter={handleLibraryDragEnter}
      onDragOver={handleLibraryDragOver}
      onDragLeave={handleLibraryDragLeave}
      onDrop={handleLibraryDrop}
    >
      <div className="header">
        <div className="customEmojiHeaderTitle">
          <div className="h1">Sticker</div>
        </div>

        <div className="customEmojiHeaderActions">
          <button
            className={"btn customEmojiAddBtn" + (busy ? " isBusy" : "")}
            type="button"
            title="Aggiungi sticker"
            aria-label="Aggiungi sticker"
            disabled={busy}
            onClick={openImportDialog}
          >
            <span className="customEmojiAddIcon" aria-hidden="true">
              <AddIcon />
            </span>
          </button>
        </div>
      </div>

      <OverlayScrollArea
        className="customEmojiSections"
        viewportClassName="customEmojiSectionsViewport"
        contentClassName="customEmojiSectionsContent"
      >
        {favoriteStickers.length ? (
          <section className="customEmojiSection customStickerLibrarySection">
            <div className="customStickerSectionHeader">
              <span className="customEmojiSectionTitle customStickerSectionTitle">Preferiti</span>
              <span className="muted customStickerSectionCount">{favoriteStickers.length}/9</span>
            </div>
            {renderStickerGrid(favoriteStickers, true)}
          </section>
        ) : null}

        <section className="customEmojiSection customStickerLibrarySection">
          <div className="customStickerSectionHeader">
            <span className="customEmojiSectionTitle customStickerSectionTitle">Tutti</span>
            <span className="muted customStickerSectionCount">{otherStickers.length}</span>
          </div>

          {otherStickers.length ? (
            renderStickerGrid(otherStickers)
          ) : (
            <div className="customEmojiEmptyState customStickerEmptyState">
              <div className="customEmojiEmptyTitle">Aggiungi qualche sticker col tasto +</div>
            </div>
          )}
        </section>
      </OverlayScrollArea>

      {isLibraryDropTarget ? (
        <div className="customStickerDropOverlay" aria-hidden="true">
          <div className="customStickerDropOverlayTitle">Rilascia qui la tua immagine</div>
          <div className="customStickerDropOverlayText">La apro subito nel popup di anteprima.</div>
        </div>
      ) : null}

      {error ? (
        <div className="small customEmojiError">
          {error}
        </div>
      ) : null}

      {contextMenuState ? (
        <div
          className="noteMenu noteContextMenu"
          role="menu"
          style={{ left: contextMenuState.left, top: contextMenuState.top }}
        >
          <button
            className="noteMenuItem danger"
            type="button"
            role="menuitem"
            onClick={() => {
              void deleteSticker(contextMenuState.id);
            }}
          >
            <svg className="trashIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Elimina
          </button>
        </div>
      ) : null}

      {draft ? (
        <DialogOverlay onClose={closeImportDialog}>
          <div
            className="linkDialog customStickerImportDialog customStickerUploadDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sticker-upload-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="linkDialogTitle customStickerUploadTitle" id="sticker-upload-dialog-title">Aggiungi sticker</div>

            <button
              className={"customStickerUploadDropzone" + (isDialogDropTarget ? " isDragOver" : "")}
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={handleDialogDragEnter}
              onDragOver={handleDialogDragOver}
              onDragLeave={handleDialogDragLeave}
              onDrop={handleDialogDrop}
            >
              <input
                ref={fileInputRef}
                className="customEmojiFileInput"
                type="file"
                accept={ACCEPTED_STICKER_FILE_TYPES.join(",")}
                onChange={(event) => {
                  handleImportSelection(event.target.files);
                  event.currentTarget.value = "";
                }}
              />

              {draft.previewSrc ? (
                <div className="customStickerUploadPreviewShell">
                  <span className="customStickerUploadPreviewLabel">Anteprima</span>
                  <span className="customStickerUploadPreviewCard">
                    <StickerAssetImage
                      className="customStickerAsset customStickerUploadPreviewImage"
                      src={draft.previewSrc}
                      hasBorder={false}
                      alt=""
                      aria-hidden="true"
                      width={180}
                      height={180}
                    />
                  </span>
                </div>
              ) : (
                <div className="customStickerUploadEmpty">
                  <span className="customStickerUploadEmptyIcon" aria-hidden="true">
                    <StickerIcon />
                  </span>
                  <span className="customStickerUploadEmptyTitle">Carica o trascina un&apos;immagine</span>
                </div>
              )}
            </button>

            {draft.file ? (
              <div className="customStickerUploadControls">
                <div className="customStickerUploadToggleCard">
                  <div className="customStickerUploadToggleRow">
                    <span className="customStickerUploadToggleLabel">Bordo</span>
                    <button
                      className={"settingsToggleSwitch customStickerUploadToggle" + (draft.hasBorder ? " active" : "")}
                      type="button"
                      aria-pressed={draft.hasBorder}
                      onClick={() => {
                        if (!draft) return;

                        const nextHasBorder = !draft.hasBorder;
                        setDraft((prev) => (prev ? { ...prev, hasBorder: nextHasBorder } : prev));

                        void buildEmbeddedStickerSource(draft.rawSrc, nextHasBorder).then((nextPreviewSrc) => {
                          setDraft((prev) => {
                            if (!prev || prev.rawSrc !== draft.rawSrc || prev.hasBorder !== nextHasBorder) {
                              return prev;
                            }

                            return {
                              ...prev,
                              previewSrc: nextPreviewSrc || prev.rawSrc,
                            };
                          });
                        });
                      }}
                    >
                      <span className="settingsToggleKnob" />
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="linkDialogActions tagManageActions">
              <button
                className="linkDialogButton"
                type="button"
                onClick={closeImportDialog}
                disabled={busy}
              >
                Annulla
              </button>
              <button
                className="linkDialogButton linkDialogButtonPrimary"
                type="button"
                onClick={() => {
                  void confirmImport();
                }}
                disabled={!draft.file || busy}
              >
                Importa
              </button>
            </div>
          </div>
        </DialogOverlay>
      ) : null}
    </div>
  );
}
