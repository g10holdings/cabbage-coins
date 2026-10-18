@echo off
REM Step 3: create the draft listings in Sanity from the workbook (Website = R, no listing yet), put each one's
REM 4 photos on it (found by cert #), then fill in PCGS population.
REM Safe to re-run: drafts that already exist are skipped, and drafts still missing photos get them once they're made.
REM PCGS stops at its daily limit; Extras\Fill-PCGS-Pop.cmd finishes the rest another day.
cd /d "%~dp0engine"
node import-listings.js
echo.
node fill-pcgs-pop.js
echo.
pause
