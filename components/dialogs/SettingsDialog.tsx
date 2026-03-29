"use client";

import type { ReactNode, RefObject } from "react";
import { CrossIcon, DesignModeIcon, ExportIcon, ThemePaletteIcon } from "@/components/AppIcons";
import DesignModeOption from "@/components/DesignModeOption";
import OverlayScrollArea from "@/components/OverlayScrollArea";
import { APP_THEME_OPTIONS, type AppTheme } from "@/lib/appSettings";
import type { DesignMode } from "@/lib/designMode";
import { NotesTagIcon } from "@/lib/tagDefinitions";

export type SettingsDialogTab = "notes" | "design" | "user";

type SettingsDialogProps = {
  activeTab: SettingsDialogTab;
  designValue: DesignMode;
  isOpen: boolean;
  moveCompletedChecklistItemsToBottom: boolean;
  nameInputRef: RefObject<HTMLInputElement | null>;
  nameValue: string;
  onActiveTabChange: (tab: SettingsDialogTab) => void;
  onClose: () => void;
  onDesignChange: (mode: DesignMode) => void;
  onDownloadBackup: () => void;
  onNameChange: (value: string) => void;
  onOpenFeedback: () => void;
  onOpenReset: () => void;
  onSubmit: () => void;
  onThemeChange: (theme: AppTheme) => void;
  onToggleMoveCompletedChecklistItemsToBottom: () => void;
  onToggleShowColoredTextHighlights: () => void;
  onToggleShowMathResultsPreview: () => void;
  onToggleShowPersistentDesignSwitcher: () => void;
  onToggleWhitePaperMode: () => void;
  showColoredTextHighlights: boolean;
  showMathResultsPreview: boolean;
  showPersistentDesignSwitcher: boolean;
  themeValue: AppTheme;
  whitePaperMode: boolean;
};

type SettingsToggleOptionProps = {
  active: boolean;
  badge?: string;
  icon: ReactNode;
  label: string;
  meta: string;
  title: string;
  onToggle: () => void;
};

function ChecklistSettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8.5 12.5L10.5 14.5L15.5 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TextHighlightSettingsIcon() {
  return <span className="settingsHighlightIcon" aria-hidden="true" />;
}

function MathResultsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18.707 8.535c-.391-.391-1.023-.391-1.414 0-1.264 1.264-3.321 1.264-4.586 0-2.045-2.044-5.371-2.042-7.414 0-.391.391-.391 1.023 0 1.414s1.023.391 1.414 0c.374-.374.82-.624 1.293-.776v7.827c0 .553.447 1 1 1s1-.447 1-1v-7.826c.472.152.919.401 1.293.775.768.767 1.715 1.245 2.707 1.437v5.614c0 .553.447 1 1 1s1-.447 1-1v-5.614c.992-.191 1.939-.67 2.707-1.437.391-.39.391-1.023 0-1.414z"
        fill="currentColor"
      />
    </svg>
  );
}

function WhitePaperIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M13 3.5V6.2C13 7.88016 13 8.72024 13.327 9.36197C13.6146 9.92646 14.0735 10.3854 14.638 10.673C15.2798 11 16.1198 11 17.8 11H20.5M21 12.9882V16.2C21 17.8802 21 18.7202 20.673 19.362C20.3854 19.9265 19.9265 20.3854 19.362 20.673C18.7202 21 17.8802 21 16.2 21H7.8C6.11984 21 5.27976 21 4.63803 20.673C4.07354 20.3854 3.6146 19.9265 3.32698 19.362C3 18.7202 3 17.8802 3 16.2V7.8C3 6.11984 3 5.27976 3.32698 4.63803C3.6146 4.07354 4.07354 3.6146 4.63803 3.32698C5.27976 3 6.11984 3 7.8 3H11.0118C11.7455 3 12.1124 3 12.4577 3.08289C12.7638 3.15638 13.0564 3.27759 13.3249 3.44208C13.6276 3.6276 13.887 3.88703 14.4059 4.40589L19.5941 9.59411C20.113 10.113 20.3724 10.3724 20.5579 10.6751C20.7224 10.9436 20.8436 11.2362 20.9171 11.5423C21 11.8876 21 12.2545 21 12.9882Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsResetIcon() {
  return <CrossIcon />;
}

function FeedbackIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M4.75 15.25V4.75C4.75 4.198 5.198 3.75 5.75 3.75H14.25C14.802 3.75 15.25 4.198 15.25 4.75V11.75C15.25 12.302 14.802 12.75 14.25 12.75H8.75L4.75 15.25Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7 7.5H13M7 10H11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function SettingsToggleOption({
  active,
  badge,
  icon,
  label,
  meta,
  title,
  onToggle,
}: SettingsToggleOptionProps) {
  return (
    <div className="linkDialogField">
      <span className="linkDialogLabel linkDialogLabelWithIcon">
        <span className="linkDialogLabelIcon" aria-hidden="true">
          {icon}
        </span>
        <span>{label}</span>
      </span>
      <button
        className={"settingsToggleOption" + (active ? " active" : "")}
        type="button"
        aria-pressed={active}
        onClick={onToggle}
      >
        <span className="settingsToggleOptionText">
          <span className="settingsToggleOptionTitleRow">
            <span className="settingsToggleOptionTitle">{title}</span>
            {badge ? <span className="settingsToggleOptionBadge">{badge}</span> : null}
          </span>
          <span className="settingsToggleOptionMeta">{meta}</span>
        </span>
        <span className="settingsToggleSwitch" aria-hidden="true">
          <span className="settingsToggleKnob" />
        </span>
      </button>
    </div>
  );
}

export default function SettingsDialog({
  activeTab,
  designValue,
  isOpen,
  moveCompletedChecklistItemsToBottom,
  nameInputRef,
  nameValue,
  onActiveTabChange,
  onClose,
  onDesignChange,
  onDownloadBackup,
  onNameChange,
  onOpenFeedback,
  onOpenReset,
  onSubmit,
  onThemeChange,
  onToggleMoveCompletedChecklistItemsToBottom,
  onToggleShowColoredTextHighlights,
  onToggleShowMathResultsPreview,
  onToggleShowPersistentDesignSwitcher,
  onToggleWhitePaperMode,
  showColoredTextHighlights,
  showMathResultsPreview,
  showPersistentDesignSwitcher,
  themeValue,
  whitePaperMode,
}: SettingsDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      className="editorOverlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="linkDialog tagManageDialog settingsDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form
          className="settingsDialogForm"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="settingsDialogHeader">
            <div className="linkDialogTitle" id="settings-dialog-title">Impostazioni</div>
            <label className="linkDialogField settingsNameField">
                <span className="linkDialogLabel linkDialogLabelWithIcon">
                  <span className="linkDialogLabelIcon" aria-hidden="true">
                    <NotesTagIcon />
                  </span>
                  <span>Nome</span>
                </span>
              <input
                ref={nameInputRef}
                className="linkDialogInput"
                value={nameValue}
                onChange={(event) => onNameChange(event.target.value.slice(0, 24))}
                placeholder="Inserisci il tuo nome"
                spellCheck={false}
                maxLength={24}
              />
            </label>
            <div className="settingsTabs" role="tablist" aria-label="Categorie impostazioni">
              <button
                className={"settingsTabButton" + (activeTab === "notes" ? " active" : "")}
                type="button"
                role="tab"
                id="settings-tab-notes"
                aria-selected={activeTab === "notes"}
                aria-controls="settings-panel-notes"
                onClick={() => onActiveTabChange("notes")}
              >
                Note
              </button>
              <button
                className={"settingsTabButton" + (activeTab === "design" ? " active" : "")}
                type="button"
                role="tab"
                id="settings-tab-design"
                aria-selected={activeTab === "design"}
                aria-controls="settings-panel-design"
                onClick={() => onActiveTabChange("design")}
              >
                Design
              </button>
              <button
                className={"settingsTabButton" + (activeTab === "user" ? " active" : "")}
                type="button"
                role="tab"
                id="settings-tab-user"
                aria-selected={activeTab === "user"}
                aria-controls="settings-panel-user"
                onClick={() => onActiveTabChange("user")}
              >
                App
              </button>
            </div>
          </div>
          <OverlayScrollArea
            className="settingsDialogScroll"
            viewportClassName="settingsDialogScrollViewport"
            contentClassName="settingsDialogScrollContent"
          >
            {activeTab === "notes" ? (
              <section
                className="settingsCategoryCard settingsTabPanel"
                id="settings-panel-notes"
                role="tabpanel"
                aria-labelledby="settings-tab-notes"
              >
                <div className="settingsCategoryBody">
                  <SettingsToggleOption
                    active={showColoredTextHighlights}
                    icon={<TextHighlightSettingsIcon />}
                    label="Evidenziatore"
                    title="Evidenzia il testo"
                    meta="Mostra uno sfondo colorato sotto il testo usando il colore selezionato."
                    onToggle={onToggleShowColoredTextHighlights}
                  />
                  <SettingsToggleOption
                    active={moveCompletedChecklistItemsToBottom}
                    icon={<ChecklistSettingsIcon />}
                    label="Checklist"
                    title="Ordinamento automatico"
                    meta="Quando attivo, le attivita completate vengono spostate automaticamente in fondo alla lista."
                    onToggle={onToggleMoveCompletedChecklistItemsToBottom}
                  />
                  <SettingsToggleOption
                    active={showMathResultsPreview}
                    icon={<MathResultsIcon />}
                    label="Risultati matematici"
                    title="Anteprima automatica"
                    meta="Mostra automaticamente l'anteprima dei risultati dei calcoli. Premi Invio per confermare."
                    onToggle={onToggleShowMathResultsPreview}
                  />
                  <SettingsToggleOption
                    active={whitePaperMode}
                    badge="BETA"
                    icon={<WhitePaperIcon />}
                    label="Nota attiva"
                    title="Pagina bianca"
                    meta="Mostra la nota attiva in una pagina di lavoro bianca."
                    onToggle={onToggleWhitePaperMode}
                  />
                </div>
              </section>
            ) : null}
            {activeTab === "design" ? (
              <section
                className="settingsCategoryCard settingsTabPanel"
                id="settings-panel-design"
                role="tabpanel"
                aria-labelledby="settings-tab-design"
              >
                <div className="settingsCategoryBody">
                  <div className="linkDialogField">
                    <span className="linkDialogLabel linkDialogLabelWithIcon">
                      <span className="linkDialogLabelIcon" aria-hidden="true">
                        <DesignModeIcon />
                      </span>
                      <span>Stile</span>
                    </span>
                    <div className="designModeChoiceGrid" role="radiogroup" aria-label="Design app">
                      <DesignModeOption
                        mode="classic"
                        selected={designValue === "classic"}
                        title="Classico"
                        description="Pannelli separati con look piu marcato."
                        onSelect={onDesignChange}
                      />
                      <DesignModeOption
                        mode="v103b"
                        selected={designValue === "v103b"}
                        title="Moderno"
                        description="Layout piu essenziale con toolbar centrale."
                        onSelect={onDesignChange}
                      />
                    </div>
                  </div>
                  <SettingsToggleOption
                    active={showPersistentDesignSwitcher}
                    icon={<DesignModeIcon />}
                    label="Stile"
                    title="Pulsante Stile sempre visibile"
                    meta="Rende il pulsante Stile sempre visibile, affianco al tuo nome."
                    onToggle={onToggleShowPersistentDesignSwitcher}
                  />
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
                </div>
              </section>
            ) : null}
            {activeTab === "user" ? (
              <section
                className="settingsCategoryCard settingsTabPanel"
                id="settings-panel-user"
                role="tabpanel"
                aria-labelledby="settings-tab-user"
              >
                <div className="settingsCategoryBody">
                  <button
                    className="settingsActionButton settingsBackupButton"
                    type="button"
                    onClick={onDownloadBackup}
                  >
                    <span className="settingsActionButtonIcon" aria-hidden="true">
                      <ExportIcon />
                    </span>
                    Estrai backup
                  </button>
                  <div className="settingsInfoCard">
                    <div className="settingsInfoCardHeader">
                      <span className="settingsInfoCardIcon" aria-hidden="true">
                        <FeedbackIcon />
                      </span>
                      <span className="settingsInfoCardTitle">Hai dei suggerimenti?</span>
                    </div>
                    <div className="settingsInfoCardText">Scrivili qua sotto!</div>
                    <button
                      className="settingsActionButton"
                      type="button"
                      onClick={onOpenFeedback}
                    >
                      Scrivi feedback
                    </button>
                  </div>
                  <button
                    className="settingsResetButton"
                    type="button"
                    onClick={onOpenReset}
                  >
                    <span className="settingsResetButtonIcon" aria-hidden="true">
                      <SettingsResetIcon />
                    </span>
                    <span>Inizializza app</span>
                  </button>
                </div>
              </section>
            ) : null}
          </OverlayScrollArea>
          <div className="linkDialogActions tagManageActions settingsDialogActions">
            <button
              className="linkDialogButton"
              type="button"
              onClick={onClose}
            >
              Annulla
            </button>
            <button
              className="linkDialogButton linkDialogButtonPrimary"
              type="submit"
            >
              Salva
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
