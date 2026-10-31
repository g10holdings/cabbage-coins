@echo off
REM Saves CAC population on unsold CAC coins (one CAC call each). Needs a site build to show.
cd /d "%~dp0..\engine"
node fill-cac-pop.js
echo.
pause
