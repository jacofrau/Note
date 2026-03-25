"use client";

import type { ReactNode } from "react";

type DialogOverlayProps = {
  children: ReactNode;
  closeOnOverlay?: boolean;
  onClose?: () => void;
};

export default function DialogOverlay({
  children,
  closeOnOverlay = true,
  onClose,
}: DialogOverlayProps) {
  return (
    <div
      className="editorOverlay"
      onMouseDown={(event) => {
        if (!closeOnOverlay) return;
        if (event.target !== event.currentTarget) return;
        onClose?.();
      }}
    >
      {children}
    </div>
  );
}
