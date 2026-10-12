@echo off
REM Step 1: PREVIEW this month's CSV import. Writes NOTHING to Sanity.
cd /d "%~dp0engine"
node import-listings.js --dry-run
echo.
pause
