@echo off
REM Step 7: PREVIEW the eBay sync: new listings (checked by eBay, not posted), price updates, coins to end. Changes NOTHING.
cd /d "%~dp0engine"
node ebay-sync.js
echo.
pause
