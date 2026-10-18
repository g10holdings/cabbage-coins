@echo off
REM Step 4: suggests captions for drafts with all 4 photos and no caption,
REM then opens the chooser in your browser. "Save to Studio" writes your picks into the drafts.
cd /d "%~dp0engine"
node choose-captions.js
echo.
pause
