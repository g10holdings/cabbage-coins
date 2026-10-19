@echo off
REM Name banners for a YouTube inventory video: lists the coins for sale (website first, then Website = R
REM coins not on it yet), you type the numbers of the ones in the video, and it makes one transparent PNG each.
REM Reads the website and the workbook; changes nothing.
cd /d "%~dp0..\engine"
node video-graphics.js
echo.
pause
