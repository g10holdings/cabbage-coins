@echo off
REM Double-click to DELETE the draft listings matching the current CSV.
REM Only removes DRAFTS (never published listings), scoped to the coins in the CSV.
REM It lists what it found and asks for confirmation before deleting anything.
cd /d "%~dp0"
node import-listings.js --delete
echo.
pause
