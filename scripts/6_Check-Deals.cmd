@echo off
REM Step 6 (any time, e.g. after a show): the deal-number check. Reads the workbook; changes NOTHING.
REM   - rows that belong to a deal but have no dealID yet, with the number to type in
REM   - deal numbers that look mistyped
REM   - deals that do not balance (unpaid, layaway, or something not entered yet)
REM   - the next free D-YYMMDD-NN for a new deal today
REM It first fetches what changed in Zoho Billing (read only), so new invoices and POs are known.
cd /d "%~dp0engine"
node zoho-pull.js > nul
if errorlevel 1 echo (Could not refresh Zoho; using the last saved Zoho data.)
echo.
node check-deals.js
echo.
pause
