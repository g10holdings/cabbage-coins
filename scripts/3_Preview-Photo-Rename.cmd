@echo off
REM Step 3: PREVIEW renaming the photos in "waiting to post" to <Folder>-1.jpg, -2 ... Changes nothing.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0engine\Rename-Photos.ps1"
pause
