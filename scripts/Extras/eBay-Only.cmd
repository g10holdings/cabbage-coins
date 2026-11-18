@echo off
REM eBay-only coins: Website column "E" in the workbook. Never on the website or CAC.
REM Lists new ones on eBay from the workbook row + the photos 1_Prep-Photos made, updates prices,
REM ends coins marked Sold in the workbook. Shows what it would do and asks first.
cd /d "%~dp0..\engine"
node ebay-only.js --ask
echo.
pause
