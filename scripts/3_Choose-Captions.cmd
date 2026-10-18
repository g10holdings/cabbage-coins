@echo off
REM Step 3: suggests captions for drafts with all 4 photos and no caption, then opens the chooser
REM in your browser. "Save to Studio" writes your picks into the drafts.
cd /d "%~dp0engine"
node choose-captions.js
echo.
pause
