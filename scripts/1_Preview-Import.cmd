@echo off
REM Step 1: PREVIEW the new listings: every coin marked Website = Y in the workbook that has no listing yet.
REM Reads the workbook (never changes it). Writes NOTHING to Sanity.
cd /d "%~dp0engine"
node import-listings.js --dry-run
echo.
pause
