"use client";

import Image from "next/image";
import type { DesignMode } from "@/lib/designMode";

type DesignModeOptionProps = {
  mode: DesignMode;
  selected: boolean;
  title: string;
  description: string;
  onSelect: (mode: DesignMode) => void;
};

export default function DesignModeOption({
  mode,
  selected,
  title,
  description,
  onSelect,
}: DesignModeOptionProps) {
  const isClassic = mode === "classic";
  const previewSrc = isClassic ? "/design-previews/classic-preview.png" : "/design-previews/modern-preview.png";

  return (
    <button
      className={"designModeOption" + (selected ? " active" : "")}
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(mode)}
    >
      <span className={"designModePreview" + (isClassic ? " classic" : " modern")} aria-hidden="true">
        <Image
          className="designModePreviewImage"
          src={previewSrc}
          alt=""
          fill
          sizes="(max-width: 720px) 100vw, 320px"
          draggable={false}
        />
        <span className="designModePreviewScrim" />
      </span>
      <span className="designModeOptionText">
        <span className="designModeOptionTitle">{title}</span>
        <span className="designModeOptionMeta">{description}</span>
      </span>
    </button>
  );
}
