@echo off
REM Step 8: does the eBay sync: lists new coins, updates prices/shipping, ends coins sold on the website.
cd /d "%~dp0engine"
node ebay-sync.js --send
echo.
pause
