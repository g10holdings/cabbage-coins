@echo off
REM Fills in PCGS population on unsold PCGS listings that are still missing it.
REM PCGS allows 100 calls a day: it stops at the limit; run again tomorrow to finish.
cd /d "%~dp0..\engine"
node fill-pcgs-pop.js
echo.
pause
