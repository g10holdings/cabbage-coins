@echo off
REM Step 4: actually rename the photos. Then upload them to the drafts in the Studio.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0engine\Rename-Photos.ps1" -Apply
pause
