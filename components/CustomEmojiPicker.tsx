"use client";

import type { DragEvent } from "react";
import { useEffect, useState } from "react";
import Image from "next/image";
import type { StickerPack } from "@/lib/types";
import { loadStickerPacks, saveStickerPacks } from "@/lib/storage";
import {
  ACCEPTED_STICKER_IMPORT_TYPES,
  ACCEPTED_STICKER_IMAGE_TYPES,
  createPackFromLooseFiles,
  createPackFromZip,
  isZipFile,
  reorderStickerPacks,
  suggestStickerPackNameFromFiles,
} from "@/lib/stickerPacks";
import DialogOverlay from "@/components/dialogs/DialogOverlay";
import OverlayScrollArea from "@/components/OverlayScrollArea";

type CustomEmojiPickerProps = {
  onPick: (src: string) => void;
};

type PendingImportState = {
  files: File[];
  name: string;
  creditLabel: string;
  creditHref: string;
};

function HelpPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 6V18M6 12H18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 12H17M12 12V7M12 12V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DeletePackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 4.5h6m-8 3h10m-8.5 0V17m4-9.5V17m4-9.5L15.7 19H8.3L7.5 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DragHandleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="8" cy="7" r="1.5" fill="currentColor" />
      <circle cx="16" cy="7" r="1.5" fill="currentColor" />
      <circle cx="8" cy="12" r="1.5" fill="currentColor" />
      <circle cx="16" cy="12" r="1.5" fill="currentColor" />
      <circle cx="8" cy="17" r="1.5" fill="currentColor" />
      <circle cx="16" cy="17" r="1.5" fill="currentColor" />
    </svg>
  );
}

export default function StickerPackPicker({ onPick }: CustomEmojiPickerProps) {
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImportState | null>(null);
  const [openPackIds, setOpenPackIds] = useState<string[]>([]);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [draggingPackId, setDraggingPackId] = useState<string | null>(null);
  const [dragOverPackId, setDragOverPackId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      const loaded = await loadStickerPacks();
      if (!isMounted) return;

      setPacks(loaded);
      setOpenPackIds((prev) => {
        const loadedIds = loaded.map((pack) => pack.id);
        if (!prev.length) return loadedIds;
        const kept = prev.filter((id) => loadedIds.includes(id));
        const missing = loadedIds.filter((id) => !kept.includes(id));
        return [...kept, ...missing];
      });
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsHelpOpen(false);
      if (pendingImport && !busy) {
        setPendingImport(null);
      }
    };

    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("keydown", onEscape);
    };
  }, [busy, pendingImport]);

  function closeImportDialog() {
    setPendingImport(null);
  }

  function handleImportSelection(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    const zipFiles = files.filter((file) => isZipFile(file));
    const looseFiles = files.filter((file) => !isZipFile(file));

    if (zipFiles.length > 1) {
      setError("Importa un solo pacchetto zip alla volta.");
      return;
    }
    if (zipFiles.length === 1 && looseFiles.length > 0) {
      setError("Importa un pacchetto zip oppure una selezione di immagini, non entrambi insieme.");
      return;
    }

    const validLooseFiles = looseFiles.filter((file) => ACCEPTED_STICKER_IMAGE_TYPES.includes(file.type));
    if (!zipFiles.length && !validLooseFiles.length) {
      setError("Formato non supportato. Usa immagini o un pacchetto zip.");
      return;
    }

    setError(null);
    setPendingImport({
      files: zipFiles.length ? zipFiles : validLooseFiles,
      name: suggestStickerPackNameFromFiles(zipFiles.length ? zipFiles : validLooseFiles, packs.length),
      creditLabel: "",
      creditHref: "",
    });
  }

  async function confirmImport() {
    if (!pendingImport) return;

    setBusy(true);
    setError(null);
    try {
      const files = pendingImport.files;
      const zipFile = files.find((file) => isZipFile(file)) ?? null;
      const normalizedName = pendingImport.name.trim();
      const normalizedCreditLabel = pendingImport.creditLabel.trim();
      const normalizedCreditHref = pendingImport.creditHref.trim();

      const pack = zipFile
        ? await createPackFromZip(zipFile)
        : await createPackFromLooseFiles(files, packs.length);

      if (!pack) {
        setError("Import non riuscito. Il pacchetto non contiene immagini valide.");
        return;
      }

      const nextPack: StickerPack = {
        ...pack,
        name: normalizedName || pack.name,
        creditLabel: normalizedCreditLabel || undefined,
        creditHref: normalizedCreditHref || undefined,
      };

      const nextPacks = [...packs, nextPack];
      setPacks(nextPacks);
      setOpenPackIds((prev) => [...prev, nextPack.id]);
      await saveStickerPacks(nextPacks);
      closeImportDialog();
    } catch {
      setError("Import non riuscito. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  async function removePack(id: string) {
    const next = packs.filter((pack) => pack.id !== id);
    setPacks(next);
    setOpenPackIds((prev) => prev.filter((packId) => packId !== id));
    await saveStickerPacks(next);
  }

  async function reorderPack(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;

    const next = reorderStickerPacks(packs, sourceId, targetId);
    if (!next) return;

    setPacks(next);
    await saveStickerPacks(next);
  }

  function handlePackDragStart(packId: string, event: DragEvent<HTMLButtonElement>) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", packId);
    setDraggingPackId(packId);
  }

  function handlePackDragOver(packId: string, event: DragEvent<HTMLElement>) {
    if (!draggingPackId || draggingPackId === packId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dragOverPackId !== packId) setDragOverPackId(packId);
  }

  async function handlePackDrop(targetId: string, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain") || draggingPackId;
    setDragOverPackId(null);
    if (!sourceId) return;
    await reorderPack(sourceId, targetId);
  }

  function handlePackDragEnd() {
    setDraggingPackId(null);
    setDragOverPackId(null);
  }

  return (
    <div className="card">
      <div className="header">
        <div className="customEmojiHeaderTitle">
          <div className="h1">Sticker</div>
        </div>
        <div className="customEmojiHeaderActions">
          <button
            className={"customEmojiHelpBtn" + (isHelpOpen ? " active" : "")}
            type="button"
            aria-label="Come funzionano gli sticker"
            aria-expanded={isHelpOpen ? "true" : "false"}
            onClick={() => setIsHelpOpen(true)}
          >
            ?
          </button>

          <label
            className={"btn customEmojiAddBtn" + (busy ? " isBusy" : "")}
            title="Importa pacchetto sticker"
            aria-label="Importa pacchetto sticker"
          >
            <span className="customEmojiAddIcon" aria-hidden="true">
              <PlusIcon />
            </span>
            <input
              className="customEmojiFileInput"
              type="file"
              accept={ACCEPTED_STICKER_IMPORT_TYPES.join(",")}
              multiple
              disabled={busy}
              onChange={(event) => {
                handleImportSelection(event.target.files);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      </div>

      <OverlayScrollArea
        className="customEmojiSections"
        viewportClassName="customEmojiSectionsViewport"
        contentClassName="customEmojiSectionsContent"
      >
        {packs.length ? (
          packs.map((pack) => {
            const isOpen = openPackIds.includes(pack.id);
            const isDraggedOver = dragOverPackId === pack.id;

            return (
              <section
                key={pack.id}
                className={"customEmojiSection customStickerPack" + (isDraggedOver ? " dragOver" : "")}
                onDragOver={(event) => handlePackDragOver(pack.id, event)}
                onDragLeave={() => {
                  if (dragOverPackId === pack.id) setDragOverPackId(null);
                }}
                onDrop={(event) => {
                  handlePackDrop(pack.id, event);
                }}
              >
                <div className="customEmojiSectionHeader">
                  <button
                    className="customEmojiSectionToggle"
                    type="button"
                    onClick={() => {
                      setOpenPackIds((prev) =>
                        prev.includes(pack.id)
                          ? prev.filter((id) => id !== pack.id)
                          : [...prev, pack.id],
                      );
                    }}
                  >
                    <span className="customEmojiSectionInfo customStickerPackInfo">
                      <span className="customStickerPackMeta">
                        <span className="customEmojiSectionTitle">{pack.name}</span>
                        {pack.creditLabel ? (
                          pack.creditHref ? (
                            <a
                              className="customStickerPackCredit"
                              href={pack.creditHref}
                              target="_blank"
                              rel="noreferrer noopener"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {pack.creditLabel}
                            </a>
                          ) : (
                            <span className="customStickerPackCredit">{pack.creditLabel}</span>
                          )
                        ) : null}
                      </span>
                      <span className="muted">{pack.stickers.length}</span>
                    </span>
                    <svg className={"customChevron" + (isOpen ? " open" : "")} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 16 5 8h14l-7 8Z" fill="currentColor" />
                    </svg>
                  </button>

                  <div className="customStickerPackActions">
                    <button
                      className="customStickerPackAction customStickerPackDrag"
                      type="button"
                      draggable
                      title={`Trascina per riordinare ${pack.name}`}
                      aria-label={`Trascina per riordinare ${pack.name}`}
                      onClick={(event) => event.preventDefault()}
                      onDragStart={(event) => handlePackDragStart(pack.id, event)}
                      onDragEnd={handlePackDragEnd}
                    >
                      <DragHandleIcon />
                    </button>
                    <button
                      className="customStickerPackAction customStickerPackDelete"
                      type="button"
                      title={`Elimina il pacchetto ${pack.name}`}
                      aria-label={`Elimina il pacchetto ${pack.name}`}
                      onClick={() => removePack(pack.id)}
                    >
                      <DeletePackIcon />
                    </button>
                  </div>
                </div>

                {isOpen ? (
                  <div className={"customEmojiGrid customStickerGrid" + (pack.stickers.length === 1 ? " single" : "")} role="list">
                    {pack.stickers.map((sticker) => (
                      <div key={sticker.id} className="customEmojiItem" role="listitem">
                        <button
                          className="customEmojiBtn customStickerBtn"
                          type="button"
                          aria-label={`Inserisci ${sticker.label}`}
                          onClick={() => onPick(sticker.src)}
                        >
                          <Image src={sticker.src} alt="" aria-hidden="true" width={88} height={88} unoptimized />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })
        ) : (
          <div className="customEmojiEmptyState">
            <div className="customEmojiEmptyTitle">Nessun pacchetto sticker</div>
            <div className="muted">Importa un file zip o una selezione di immagini per iniziare.</div>
          </div>
        )}
      </OverlayScrollArea>

      {error ? (
        <div className="small customEmojiError">
          {error}
        </div>
      ) : null}

      {isHelpOpen ? (
        <DialogOverlay onClose={() => setIsHelpOpen(false)}>
          <div
            className="linkDialog customStickerHelpDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sticker-help-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="linkDialogTitle" id="sticker-help-dialog-title">Come funzionano gli sticker?</div>
            <div className="customStickerHelpLead">
              Puoi importare i tuoi pacchetti in formato .zip oppure selezionare diverse immagini che faranno parte del pacchetto, per iniziare premi sul{" "}
              <span className="customEmojiHelpChip" aria-hidden="true">
                <span className="customEmojiHelpChipIcon">
                  <HelpPlusIcon />
                </span>
              </span>.
            </div>
            {false && (<>
            <div className="customStickerHelpLead" hidden>
              Gli sticker ora sono organizzati in pacchetti, non più in categorie singole.
            </div>
            <div className="customStickerHelpInline" hidden>
              <span className="customEmojiHelpChip" aria-hidden="true">.zip</span>
              <span className="customEmojiHelpChip" aria-hidden="true">
                <span className="customEmojiHelpChipIcon">
                  <HelpPlusIcon />
                </span>
              </span>
            </div></>)}
            <div className="linkDialogActions tagManageActions">
              <button
                className="linkDialogButton linkDialogButtonPrimary"
                type="button"
                onClick={() => setIsHelpOpen(false)}
              >
                Chiudi
              </button>
            </div>
          </div>
        </DialogOverlay>
      ) : null}

      {pendingImport ? (
        <DialogOverlay
          onClose={() => {
            if (busy) return;
            closeImportDialog();
          }}
        >
          <div
            className="linkDialog customStickerImportDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sticker-import-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="linkDialogTitle" id="sticker-import-dialog-title">Importa pacchetto sticker</div>
            <div className="settingsDialogText">
              Scegli il nome del pacchetto e, se vuoi, aggiungi i crediti autore che appariranno sotto al titolo.
            </div>
            <label className="linkDialogField">
              <span className="linkDialogLabel">Nome pacchetto</span>
              <input
                className="linkDialogInput"
                value={pendingImport.name}
                onChange={(event) =>
                  setPendingImport((prev) => (prev ? { ...prev, name: event.target.value.slice(0, 64) } : prev))
                }
                maxLength={64}
                placeholder="Nome del pacchetto"
              />
            </label>
            <label className="linkDialogField">
              <span className="linkDialogLabel">Autore / Credito</span>
              <input
                className="linkDialogInput"
                value={pendingImport.creditLabel}
                onChange={(event) =>
                  setPendingImport((prev) => (prev ? { ...prev, creditLabel: event.target.value.slice(0, 80) } : prev))
                }
                maxLength={80}
                placeholder="Es. Image by freepik"
              />
            </label>
            <label className="linkDialogField">
              <span className="linkDialogLabel">Link autore</span>
              <input
                className="linkDialogInput"
                value={pendingImport.creditHref}
                onChange={(event) =>
                  setPendingImport((prev) => (prev ? { ...prev, creditHref: event.target.value.slice(0, 240) } : prev))
                }
                maxLength={240}
                placeholder="https://..."
              />
            </label>
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
                disabled={!pendingImport.name.trim() || busy}
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
