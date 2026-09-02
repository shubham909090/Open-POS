!include "WordFunc.nsh"

!ifndef BUILD_UNINSTALLER
Var gposLegacyVersion
Var gposLegacyVersionOrder
Var gposLegacyLocation
Var gposRepairMode

!macro customUnInstallCheck
  IfErrors gpos_uninstall_failed
  ${If} $R0 == 0
    Goto gpos_uninstall_done
  ${EndIf}

  # Legacy macOS cross-builds can contain an uninstaller with an invalid CRC.
  # Use this installer's native-built uninstaller, never disable integrity checks.
  ${If} $R0 == 2
    ReadRegStr $gposLegacyVersion SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" DisplayVersion
    ReadRegStr $gposLegacyLocation SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
    StrCpy $gposLegacyVersionOrder $gposLegacyVersion 4
    ${If} $gposLegacyVersionOrder == "0.1."
    ${AndIf} $gposLegacyLocation == $INSTDIR
    ${AndIf} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      ${VersionCompare} $gposLegacyVersion "0.1.20" $gposLegacyVersionOrder
      ${If} $gposLegacyVersionOrder == 2
        DetailPrint "Repairing legacy Hub uninstaller; keeping application data."
        ClearErrors
        File /oname=$PLUGINSDIR\gpos-repair-uninstaller.exe "${UNINSTALLER_OUT_FILE}"
        IfErrors gpos_uninstall_failed
        StrCpy $gposRepairMode "/currentuser"
        ${If} $installMode == "all"
          StrCpy $gposRepairMode "/allusers"
        ${EndIf}
        ExecWait '"$PLUGINSDIR\gpos-repair-uninstaller.exe" /S /KEEP_APP_DATA $gposRepairMode --keep-shortcuts --updated _?=$INSTDIR' $R0
        IfErrors gpos_uninstall_failed
        ${If} $R0 == 0
          Goto gpos_uninstall_done
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}

  gpos_uninstall_failed:
    MessageBox MB_OK|MB_ICONEXCLAMATION "The previous Hub installation could not be updated. Your application data has been kept. Close Hub and retry this installer. Error: $R0" /SD IDOK
    SetErrorLevel 2
    Quit
  gpos_uninstall_done:
!macroend
!endif
