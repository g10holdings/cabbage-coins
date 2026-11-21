@echo off
REM One time: connects the scripts to the Cabbage Coins YouTube channel. Needs engine\.youtube-client.json from Google Cloud.
cd /d "%~dp0..\engine"
node connect-youtube.js
echo.
pause
