@echo off
REM One time: connects the scripts to your Zoho Billing account (invoices and quotes), READ ONLY. Asks for keys from api-console.zoho.com.
cd /d "%~dp0..\engine"
node connect-zoho.js
echo.
pause
