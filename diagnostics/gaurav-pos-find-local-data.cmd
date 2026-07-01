@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0gaurav-pos-find-local-data.ps1" %*
echo.
echo Finished. Check the Desktop for the gaurav-pos-data-search report folder/zip.
pause
