@echo off
REM After dragging Shorts into YouTube Studio: sets their titles, descriptions, tags, Unlisted; links each to its listing; rebuilds the site.
cd /d "%~dp0..\engine"
node youtube-shorts.js --ask
echo.
pause
