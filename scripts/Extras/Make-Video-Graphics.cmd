@echo off
REM Name banners for a YouTube inventory video: lists the coins for sale (website first, then Website = R
REM coins not on it yet), you type the numbers of the ones in the video, and it makes one transparent PNG each.
REM Then, if you want, the video's YouTube thumbnail: 4 designs at a time, in looks not used before.
REM Reads the website and the workbook; changes nothing.
cd /d "%~dp0..\engine"
node video-graphics.js
echo.
pause
