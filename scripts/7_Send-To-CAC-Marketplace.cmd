@echo off
REM Step 7: sends the feed to CAC's marketplace: adds new coins, updates changed ones, takes sold ones down.
cd /d "%~dp0engine"
node cac-marketplace.js --send
echo.
pause
