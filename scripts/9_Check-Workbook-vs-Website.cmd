@echo off
REM Step 9: CHECK the website against the workbook: prices, sold coins, Website R/Y flags, grades, PCGS #s.
REM Reads both; changes NOTHING in either.
cd /d "%~dp0engine"
node check-workbook.js
echo.
pause
