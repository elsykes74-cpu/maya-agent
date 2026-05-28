@echo off
cd /d "C:\Users\E Sykes\Documents\maya-agent\app"
echo === Current git status ===
git status --short
echo.
echo === Removing index.lock if exists ===
if exist ".git\index.lock" del /f ".git\index.lock"
echo === Adding all changes ===
git add -A
echo === Committing ===
git commit -m "feat: twilio sms + schema enum fixes + telegram bot"
echo === Pushing ===
git push
echo.
echo === Done. Press any key to close. ===
pause
