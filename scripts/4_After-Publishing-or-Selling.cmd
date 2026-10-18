@echo off
REM Step 4: run after publishing coins, marking coins Sold, changing prices, or ticking "Keep off eBay".
REM Each part shows what it would do and asks first:
REM   photos - files published coins' folders in doneUnsold (camera shots deleted), sold ones in doneSOLD
REM   CAC    - adds new coins to CAC's marketplace, updates changed ones, takes sold ones down
REM   eBay   - lists new coins, updates prices/shipping, ends sold or kept-off coins
cd /d "%~dp0engine"
echo ===== PHOTO FOLDERS =====
node file-photos.js --ask
echo.
echo ===== CAC MARKETPLACE =====
node cac-marketplace.js --ask
echo.
echo ===== EBAY =====
node ebay-sync.js --ask
echo.
pause
