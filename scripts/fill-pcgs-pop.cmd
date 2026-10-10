@echo off
REM Double-click to fill in PCGS population on unsold PCGS listings (about 6 PCGS calls per coin).
REM PCGS allows 100 calls a day: it stops at the limit; double-click again tomorrow to finish.
cd /d "%~dp0"
node fill-pcgs-pop.js
echo.
pause
