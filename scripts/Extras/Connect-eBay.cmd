@echo off
REM One time: connects the scripts to your eBay seller account. Asks for the keys from developer.ebay.com.
cd /d "%~dp0engine"
node connect-ebay.js
echo.
pause
