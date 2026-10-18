@echo off
REM DELETES the drafts the import made: Website = R coins that have only a draft, no published listing.
REM It lists what it found and asks before deleting anything.
cd /d "%~dp0..\engine"
node import-listings.js --delete
echo.
pause
