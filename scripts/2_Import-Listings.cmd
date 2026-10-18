@echo off
REM Step 2: shows the new listings (workbook Website = R, no listing yet) and each one's photos, then asks.
REM Yes: creates the drafts in Sanity, puts the 4 photos on each, then fills in PCGS population.
REM Safe to re-run: existing drafts are skipped; drafts still missing photos get them once they're made.
cd /d "%~dp0engine"
node import-listings.js
if %errorlevel%==0 (
  echo.
  node fill-pcgs-pop.js
)
echo.
pause
