@echo off
REM Only for photos made by hand: PREVIEW renaming the photos in "waiting to post" to <Folder>-1.jpg, -2 ... Changes nothing.
REM (1_Prep-Photos names its photos itself.)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\engine\Rename-Photos.ps1"
pause
