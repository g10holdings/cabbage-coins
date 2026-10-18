@echo off
REM Step 5 (after publishing): shows what would go to CAC's marketplace (new coins, changes, sold coins to take down). Sends nothing.
cd /d "%~dp0engine"
node cac-marketplace.js
echo.
pause
