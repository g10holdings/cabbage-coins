@echo off
REM Runs the rule checks: workbook rules against every live listing, nothing-writes-the-workbook, photo naming,
REM folder checks, the importer, the status report, and the photo prep rules. Changes nothing. All should say pass.
cd /d "%~dp0..\engine"
call npm test
echo.
pause
