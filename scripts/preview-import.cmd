@echo off
REM Double-click to PREVIEW the import (generates AI alt text, writes NOTHING to Sanity).
cd /d "%~dp0"
node import-listings.js --dry-run
echo.
pause
