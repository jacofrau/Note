"use client";

import type { RefObject } from "react";
import DialogOverlay from "@/components/dialogs/DialogOverlay";

type TagManageDialogProps = {
  label: string;
  hasTag: boolean;
  value: string;
  inputRef: RefObject<HTMLInputElement | null>;
  canSave: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onRemove: () => void;
  onSave: () => void;
};

export default function TagManageDialog({
  label,
  hasTag,
  value,
  inputRef,
  canSave,
  onChange,
  onClose,
  onRemove,
  onSave,
}: TagManageDialogProps) {
  return (
    <DialogOverlay onClose={onClose}>
      <div
        className="linkDialog tagManageDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tag-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="linkDialogTitle" id="tag-dialog-title">Gestisci tag</div>
        <div className="tagManageText">
          Modifica il tag di &quot;{label}&quot; oppure rimuovilo.
        </div>
        <label className="linkDialogField">
          <span className="linkDialogLabel">Tag</span>
          <input
            ref={inputRef}
            className="linkDialogInput"
            value={value}
            onChange={(event) => onChange(event.target.value.slice(0, 24))}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
              if (event.key === "Enter") {
                event.preventDefault();
                onSave();
              }
            }}
            placeholder="Inserisci nome tag"
            spellCheck={false}
            maxLength={24}
          />
        </label>
        <div className="tagManageHint">Massimo 24 caratteri.</div>
        <div className="linkDialogActions tagManageActions">
          <button
            className="linkDialogButton linkDialogButtonDanger"
            type="button"
            onClick={onRemove}
            disabled={!hasTag}
          >
            Rimuovi tag
          </button>
          <button
            className="linkDialogButton"
            type="button"
            onClick={onClose}
          >
            Annulla
          </button>
          <button
            className="linkDialogButton linkDialogButtonPrimary"
            type="button"
            onClick={onSave}
            disabled={!canSave}
          >
            Salva
          </button>
        </div>
      </div>
    </DialogOverlay>
  );
}
