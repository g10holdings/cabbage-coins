@echo off
REM Double-click to RUN the import for real (creates draft listings in Sanity).
REM Safe to re-run: drafts that already exist are skipped, not duplicated.
cd /d "%~dp0"
node import-listings.js
echo.
pause
