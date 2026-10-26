@echo off
rem JMG Ultra Studio - removes the panel from Premiere Pro. Settings and analysis results stay in
rem %APPDATA%\JMG Ultra Studio (delete that folder too if you want them gone).
set "DEST=%APPDATA%\Adobe\CEP\extensions\JMGUltraStudio"
if exist "%DEST%" ( rmdir /S /Q "%DEST%" & echo JMG Ultra Studio has been removed. Restart Premiere Pro. ) else ( echo JMG Ultra Studio isn't installed. )
pause
