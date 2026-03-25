"use client";

import DialogOverlay from "@/components/dialogs/DialogOverlay";

type ResetAppDialogProps = {
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ResetAppDialog({
  onCancel,
  onConfirm,
}: ResetAppDialogProps) {
  return (
    <DialogOverlay onClose={onCancel}>
      <div
        className="linkDialog resetAppDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-app-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="linkDialogTitle" id="reset-app-title">Inizializza app</div>
        <div className="resetAppDialogText">
          Stai per inizializzare l&apos;app. Questa azione &egrave; irreversibile, tutti i tuoi dati
          saranno eliminati e ritornerai a una versione &quot;pulita&quot; dell&apos;app.
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
            Inizializza
          </button>
        </div>
      </div>
    </DialogOverlay>
  );
}
