@echo off
REM Step 2: PREVIEW the new listings: every coin marked Website = R in the workbook that has no listing yet,
REM and whether each one's photos are ready. Reads the workbook (never changes it). Writes NOTHING to Sanity.
cd /d "%~dp0engine"
node import-listings.js --dry-run
pause
