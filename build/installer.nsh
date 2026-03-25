!include "MUI2.nsh"
!include "FileFunc.nsh"

!define NOTE_DI_JACO_INSTALLER_BG "F7F7FA"
!define NOTE_DI_JACO_TEXT_MAIN "121319"
!define NOTE_DI_JACO_TEXT_MUTED "656B76"
!define NOTE_DI_JACO_TEXT_SOFT "8A90A1"

!macro customHeader
  !insertmacro MUI_PAGE_FUNCTION_FULLWINDOW
!macroend

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!ifndef BUILD_UNINSTALLER
Var WelcomeDirInput
Var FinishRunCheckbox
Var FinishDesktopCheckbox

!macro customWelcomePage
  Page custom installerWelcomePageCreate installerWelcomePageLeave
!macroend

!macro customPageAfterChangeDir
  !define MUI_PAGE_HEADER_TEXT "Installazione in corso..."
  !define MUI_PAGE_HEADER_SUBTEXT "Stiamo preparando ${PRODUCT_NAME} sul tuo PC."
  !define MUI_INSTFILESPAGE_FINISHHEADER_TEXT "Installazione completata!"
  !define MUI_INSTFILESPAGE_FINISHHEADER_SUBTEXT "${PRODUCT_NAME} e pronto per essere usato."
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW installerProgressShow
!macroend

!macro customFinishPage
  Page custom installerFinishPageCreate installerFinishPageLeave
!macroend

Function normalizeInstallDir
  Exch $0
  Push $1

  ${If} $0 == ""
    Pop $1
    Exch $0
    Return
  ${EndIf}

  ${GetFileName} "$0" $1
  ${If} $1 != "${PRODUCT_FILENAME}"
    StrCpy $0 "$0\${PRODUCT_FILENAME}"
  ${EndIf}

  Pop $1
  Exch $0
FunctionEnd

Function installerWelcomeBrowse
  nsDialogs::SelectFolderDialog "Scegli la cartella di destinazione" "$INSTDIR"
  Pop $0

  ${If} $0 == error
    Return
  ${EndIf}

  Push $0
  Call normalizeInstallDir
  Pop $0

  StrCpy $INSTDIR $0
  SendMessage $WelcomeDirInput ${WM_SETTEXT} 0 "STR:$0"
FunctionEnd

Function installerWelcomePageCreate
  nsDialogs::Create 1044
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  SetCtlColors $0 "" "${NOTE_DI_JACO_INSTALLER_BG}"
  CreateFont $4 "$(^Font)" "13" "700"
  CreateFont $5 "$(^Font)" "18" "700"
  CreateFont $6 "$(^Font)" "10" "400"
  CreateFont $7 "$(^Font)" "9" "700"

  ${NSD_CreateIcon} 20u 18u 28u 28u ""
  Pop $1
  ${NSD_SetIconFromInstaller} $1 $2

  ${NSD_CreateLabel} 56u 22u 180u 15u "Setup"
  Pop $1
  SetCtlColors $1 "${NOTE_DI_JACO_TEXT_MAIN}" "${NOTE_DI_JACO_INSTALLER_BG}"
  SendMessage $1 ${WM_SETFONT} $4 1

  ${NSD_CreateLabel} 20u 58u 270u 22u "Note (by Jaco)"
  Pop $1
  SetCtlColors $1 "${NOTE_DI_JACO_TEXT_MAIN}" "${NOTE_DI_JACO_INSTALLER_BG}"
  SendMessage $1 ${WM_SETFONT} $5 1

  ${NSD_CreateLabel} 20u 84u 270u 22u "Stai installando l'app ${PRODUCT_NAME} sul tuo PC."
  Pop $1
  SetCtlColors $1 "${NOTE_DI_JACO_TEXT_MAIN}" "${NOTE_DI_JACO_INSTALLER_BG}"
  SendMessage $1 ${WM_SETFONT} $4 1

  ${NSD_CreateLabel} 20u 107u 270u 30u "Funziona in locale, anche offline, e mantiene note e impostazioni tra un aggiornamento e l'altro."
  Pop $1
  SetCtlColors $1 "${NOTE_DI_JACO_TEXT_MUTED}" "${NOTE_DI_JACO_INSTALLER_BG}"
  SendMessage $1 ${WM_SETFONT} $6 1

  ${NSD_CreateHLine} 20u 145u 270u 6u
  Pop $1

  ${NSD_CreateLabel} 20u 159u 170u 12u "Cartella di destinazione"
  Pop $1
  SetCtlColors $1 "${NOTE_DI_JACO_TEXT_MAIN}" "${NOTE_DI_JACO_INSTALLER_BG}"
  SendMessage $1 ${WM_SETFONT} $7 1

  ${NSD_CreateText} 20u 174u 208u 14u "$INSTDIR"
  Pop $WelcomeDirInput
  SendMessage $WelcomeDirInput ${WM_SETFONT} $6 1

  ${NSD_CreateButton} 233u 173u 57u 14u "Sfoglia..."
  Pop $1
  SendMessage $1 ${WM_SETFONT} $6 1
  ${NSD_OnClick} $1 installerWelcomeBrowse

  ${NSD_CreateLabel} 20u 198u 270u 24u "Alla fine potrai scegliere se creare il collegamento sul desktop e se avviare subito l'app."
  Pop $1
  SetCtlColors $1 "${NOTE_DI_JACO_TEXT_SOFT}" "${NOTE_DI_JACO_INSTALLER_BG}"
  SendMessage $1 ${WM_SETFONT} $6 1

  ShowWindow $mui.Button.Back ${SW_HIDE}
  SendMessage $mui.Button.Next ${WM_SETTEXT} 0 "STR:Installa"
  SendMessage $mui.Button.Cancel ${WM_SETTEXT} 0 "STR:Annulla"

  Call muiPageLoadFullWindow
  nsDialogs::Show
  Call muiPageUnloadFullWindow
FunctionEnd

Function installerWelcomePageLeave
  ${NSD_GetText} $WelcomeDirInput $0

  ${If} $0 == ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "Scegli una cartella di destinazione valida."
    Abort
  ${EndIf}

  Push $0
  Call normalizeInstallDir
  Pop $0

  StrCpy $INSTDIR $0
FunctionEnd

Function installerProgressShow
  ShowWindow $mui.Button.Back ${SW_HIDE}

  FindWindow $0 "#32770" "" $HWNDPARENT
  GetDlgItem $1 $0 1027
  ShowWindow $1 ${SW_HIDE}

  GetDlgItem $1 $0 1006
  SendMessage $1 ${WM_SETTEXT} 0 "STR:Stai installando Note (by Jaco) sul tuo PC..."
  SetCtlColors $1 "${NOTE_DI_JACO_TEXT_MUTED}" "${NOTE_DI_JACO_INSTALLER_BG}"
FunctionEnd

Function installerFinishPageCreate
  nsDialogs::Create 1044
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  SetCtlColors $0 "" "${NOTE_DI_JACO_INSTALLER_BG}"
  CreateFont $4 "$(^Font)" "13" "700"
  CreateFont $5 "$(^Font)" "18" "700"
  CreateFont $6 "$(^Font)" "10" "400"

  ${NSD_CreateIcon} 20u 18u 28u 28u ""
  Pop $1
  ${NSD_SetIconFromInstaller} $1 $2

  ${NSD_CreateLabel} 56u 22u 180u 15u "Setup"
  Pop $1
  SetCtlColors $1 "${NOTE_DI_JACO_TEXT_MAIN}" "${NOTE_DI_JACO_INSTALLER_BG}"
  SendMessage $1 ${WM_SETFONT} $4 1

  ${NSD_CreateLabel} 20u 58u 270u 22u "Installazione completata!"
  Pop $1
  SetCtlColors $1 "${NOTE_DI_JACO_TEXT_MAIN}" "${NOTE_DI_JACO_INSTALLER_BG}"
  SendMessage $1 ${WM_SETFONT} $5 1

  ${NSD_CreateLabel} 20u 84u 270u 24u "${PRODUCT_NAME} e stato installato correttamente. Ora puoi decidere come trovarlo e se aprirlo subito."
  Pop $1
  SetCtlColors $1 "${NOTE_DI_JACO_TEXT_MUTED}" "${NOTE_DI_JACO_INSTALLER_BG}"
  SendMessage $1 ${WM_SETFONT} $6 1

  ${NSD_CreateHLine} 20u 122u 270u 6u
  Pop $1

  ${NSD_CreateCheckbox} 20u 138u 260u 10u "Crea collegamento sul desktop"
  Pop $FinishDesktopCheckbox
  SetCtlColors $FinishDesktopCheckbox "${NOTE_DI_JACO_TEXT_MAIN}" "${NOTE_DI_JACO_INSTALLER_BG}"
  SendMessage $FinishDesktopCheckbox ${WM_SETFONT} $6 1
  ${NSD_Check} $FinishDesktopCheckbox

  ${NSD_CreateCheckbox} 20u 156u 260u 10u "Avvia ${PRODUCT_NAME}"
  Pop $FinishRunCheckbox
  SetCtlColors $FinishRunCheckbox "${NOTE_DI_JACO_TEXT_MAIN}" "${NOTE_DI_JACO_INSTALLER_BG}"
  SendMessage $FinishRunCheckbox ${WM_SETFONT} $6 1
  ${NSD_Check} $FinishRunCheckbox

  ShowWindow $mui.Button.Back ${SW_HIDE}
  ShowWindow $mui.Button.Cancel ${SW_HIDE}
  SendMessage $mui.Button.Next ${WM_SETTEXT} 0 "STR:Fine"

  Call muiPageLoadFullWindow
  nsDialogs::Show
  Call muiPageUnloadFullWindow
FunctionEnd

Function installerFinishPageLeave
  ${NSD_GetState} $FinishDesktopCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    ${IfNot} ${FileExists} "$DESKTOP\${SHORTCUT_NAME}.lnk"
      CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\${PRODUCT_FILENAME}.exe" "" "$INSTDIR\${PRODUCT_FILENAME}.exe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
    ${EndIf}
  ${Else}
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  ${EndIf}

  ClearErrors
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'

  ${NSD_GetState} $FinishRunCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    ExecShell "open" "$INSTDIR\${PRODUCT_FILENAME}.exe"
  ${EndIf}
FunctionEnd
!endif
