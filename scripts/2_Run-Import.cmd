@echo off
REM Step 2: create the draft listings in Sanity from the CSV, then fill in PCGS population.
REM Safe to re-run: drafts that already exist are skipped. PCGS stops at its daily limit;
REM Extras\Fill-PCGS-Pop.cmd finishes the rest another day.
cd /d "%~dp0engine"
node import-listings.js
echo.
node fill-pcgs-pop.js
echo.
pause
