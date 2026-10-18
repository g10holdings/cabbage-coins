@echo off
REM Step 1: make the 4 website photos for each coin folder in waiting_website (each folder named with the cert number first).
REM Crops and turns the camera shots, opens a window to check each coin edge, adds the logos, names them -1..-4.
REM Coins that already have their 4 photos are skipped.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0engine\Prep-Photos.ps1" %*
pause
