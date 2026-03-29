"use client";

import type { RefObject } from "react";
import OverlayScrollArea from "@/components/OverlayScrollArea";
import { DesignModeIcon, ThemePaletteIcon } from "@/components/AppIcons";
import DesignModeOption from "@/components/DesignModeOption";
import DialogOverlay from "@/components/dialogs/DialogOverlay";
import { APP_THEME_OPTIONS } from "@/lib/appSettings";
import type { DesignMode } from "@/lib/designMode";
import { NotesTagIcon } from "@/lib/tagDefinitions";
import type { AppTheme } from "@/lib/appSettings";

type OnboardingDialogProps = {
  inputRef: RefObject<HTMLInputElement | null>;
  nameValue: string;
  designValue: DesignMode;
  themeValue: AppTheme;
  onNameChange: (value: string) => void;
  onDesignChange: (mode: DesignMode) => void;
  onThemeChange: (theme: AppTheme) => void;
  onSubmit: () => void;
};

export default function OnboardingDialog({
  inputRef,
  nameValue,
  designValue,
  themeValue,
  onNameChange,
  onDesignChange,
  onThemeChange,
  onSubmit,
}: OnboardingDialogProps) {
  return (
    <DialogOverlay closeOnOverlay={false}>
      <form
        className="linkDialog settingsDialog welcomeSetupDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="welcomeSetupMain">
          <div className="linkDialogTitle" id="welcome-dialog-title">Benvenuto in Note</div>
          <div className="settingsDialogText welcomeSetupLead">
            Prima di iniziare, scegli come vuoi firmare l&apos;app, il design che preferisci e il tema da usare.
          </div>

          <OverlayScrollArea
            className="welcomeSetupScroll"
            viewportClassName="welcomeSetupScrollViewport"
            contentClassName="welcomeSetupScrollContent"
          >
            <label className="linkDialogField">
              <span className="linkDialogLabel linkDialogLabelWithIcon">
                <span className="linkDialogLabelIcon" aria-hidden="true">
                  <NotesTagIcon />
                </span>
                <span>Come ti chiami?</span>
              </span>
              <input
                ref={inputRef}
                className="linkDialogInput"
                value={nameValue}
                onChange={(event) => onNameChange(event.target.value.slice(0, 24))}
                placeholder="Il tuo nome"
                spellCheck={false}
                maxLength={24}
              />
            </label>

            <div className="linkDialogField">
              <span className="linkDialogLabel linkDialogLabelWithIcon">
                <span className="linkDialogLabelIcon" aria-hidden="true">
                  <DesignModeIcon />
                </span>
                <span>Scegli il design</span>
              </span>
              <div className="designModeChoiceGrid" role="radiogroup" aria-label="Design app">
                <DesignModeOption
                  mode="classic"
                  selected={designValue === "classic"}
                  title="Classico"
                  description="Layout a tre pannelli con card piu evidenti."
                  onSelect={onDesignChange}
                />
                <DesignModeOption
                  mode="v103b"
                  selected={designValue === "v103b"}
                  title="Moderno"
                  description="Layout piu pulito con toolbar centrale e stile iCloud-inspired."
                  onSelect={onDesignChange}
                />
              </div>
            </div>

            <div className="linkDialogField">
              <span className="linkDialogLabel linkDialogLabelWithIcon">
                <span className="linkDialogLabelIcon" aria-hidden="true">
                  <ThemePaletteIcon />
                </span>
                <span>Tema</span>
              </span>
              <div className="settingsThemeGrid" role="radiogroup" aria-label="Tema app">
                {APP_THEME_OPTIONS.map((themeOption) => (
                  <button
                    key={themeOption.value}
                    className={"settingsThemeOption" + (themeValue === themeOption.value ? " active" : "")}
                    type="button"
                    role="radio"
                    data-theme={themeOption.value}
                    aria-checked={themeValue === themeOption.value}
                    aria-label={themeOption.label}
                    title={themeOption.label}
                    onClick={() => onThemeChange(themeOption.value)}
                  >
                    <span className="settingsThemeSwatch" data-theme={themeOption.value} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>

            <div className="tagManageHint welcomeSetupHint">
              Potrai cambiare nome, design e tema in qualsiasi momento dalle impostazioni.
            </div>
          </OverlayScrollArea>

          <div className="linkDialogActions welcomeSetupActions">
            <button
              className="linkDialogButton linkDialogButtonPrimary"
              type="submit"
            >
              Inizia
            </button>
          </div>
        </div>
      </form>
    </DialogOverlay>
  );
}
