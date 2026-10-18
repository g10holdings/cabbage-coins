@echo off
REM Step 5 (any time): where every coin stands, from workbook to website to CAC and eBay, plus the
REM workbook check (sold coins still for sale, price and grade differences...). Opens in your browser.
REM Reads everything; changes NOTHING anywhere.
cd /d "%~dp0engine"
node status-report.js
echo.
pause
