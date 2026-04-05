"use client";

import type { RefObject } from "react";
import { ThemePaletteIcon } from "@/components/AppIcons";
import DialogOverlay from "@/components/dialogs/DialogOverlay";
import { APP_THEME_OPTIONS } from "@/lib/appSettings";
import { NotesTagIcon } from "@/lib/tagDefinitions";
import type { AppTheme } from "@/lib/appSettings";

type OnboardingDialogProps = {
  inputRef: RefObject<HTMLInputElement | null>;
  nameValue: string;
  themeValue: AppTheme;
  onNameChange: (value: string) => void;
  onThemeChange: (theme: AppTheme) => void;
  onSubmit: () => void;
};

export default function OnboardingDialog({
  inputRef,
  nameValue,
  themeValue,
  onNameChange,
  onThemeChange,
  onSubmit,
}: OnboardingDialogProps) {
  return (
    <DialogOverlay closeOnOverlay={false}>
      <form
        className="linkDialog welcomeSetupDialog"
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
            Prima di iniziare, scegli come vuoi firmare l&apos;app e il tema da usare.
          </div>

          <div className="welcomeSetupScroll">
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
              Potrai cambiare nome e tema in qualsiasi momento dalle impostazioni.
            </div>
          </div>

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
