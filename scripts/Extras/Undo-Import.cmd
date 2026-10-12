@echo off
REM DELETES the draft listings matching the current CSV (never published listings).
REM It lists what it found and asks before deleting anything.
cd /d "%~dp0..\engine"
node import-listings.js --delete
echo.
pause
