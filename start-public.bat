@echo off
cd /d "%~dp0"
call "%~dp0start.bat" public
exit /b %errorlevel%
