@echo off
REM Step 6: sends the feed to CAC's marketplace: adds new coins, updates changed ones, takes sold ones down.
cd /d "%~dp0engine"
node cac-marketplace.js --send
echo.
pause
