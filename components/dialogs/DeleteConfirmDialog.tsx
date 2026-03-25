"use client";

import DialogOverlay from "@/components/dialogs/DialogOverlay";

type DeleteConfirmDialogProps = {
  label: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function DeleteConfirmDialog({
  label,
  onCancel,
  onConfirm,
}: DeleteConfirmDialogProps) {
  return (
    <DialogOverlay onClose={onCancel}>
      <div
        className="linkDialog deleteConfirmDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="linkDialogTitle" id="delete-confirm-title">Elimina nota</div>
        <div className="deleteConfirmText">
          Eliminare &quot;{label}&quot;? Questa azione non si puo annullare.
        </div>
        <div className="linkDialogActions">
          <button
            className="linkDialogButton"
            type="button"
            onClick={onCancel}
          >
            Annulla
          </button>
          <button
            className="linkDialogButton linkDialogButtonDanger"
            type="button"
            onClick={onConfirm}
          >
            Elimina
          </button>
        </div>
      </div>
    </DialogOverlay>
  );
}
