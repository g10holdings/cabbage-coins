@echo off
REM Step 8: CHECK the website against the workbook: prices, sold coins, Website = Y flags, grades, PCGS #s.
REM Reads both; changes NOTHING in either.
cd /d "%~dp0engine"
node check-workbook.js
echo.
pause
