@echo off
REM Redo the photos for a coin or two: reopens the check window starting from your last choices.
REM Type part of the folder name (e.g. 1895-O or the cert number). PgDn switches to your other exposure.
:again
set "COIN="
echo.
set /p COIN=Part of the coin's folder name to redo (or just Enter to finish): 
if "%COIN%"=="" goto end
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\engine\Prep-Photos.ps1" -Redo -Only "%COIN%"
goto again
:end
