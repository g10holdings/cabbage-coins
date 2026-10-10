@echo off
REM Double-click to RUN the import for real (creates draft listings in Sanity).
REM Safe to re-run: drafts that already exist are skipped, not duplicated.
cd /d "%~dp0"
node import-listings.js
echo.
REM Then PCGS population for the new PCGS listings (stops at the PCGS daily limit; fill-pcgs-pop.cmd finishes the rest).
node fill-pcgs-pop.js
echo.
pause
