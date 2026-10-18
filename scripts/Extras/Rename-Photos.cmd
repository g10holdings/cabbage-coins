@echo off
REM Only for photos made by hand: renames the photos in "waiting to post" to <Folder>-1.jpg, -2 ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\engine\Rename-Photos.ps1" -Apply
pause
