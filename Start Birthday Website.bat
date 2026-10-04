@echo off
setlocal
cd /d "%~dp0"

where python >nul 2>&1
if errorlevel 1 (
  echo Python 3 was not found. Install Python 3 to start the birthday website.
  pause
  exit /b 1
)

python serve.py
if errorlevel 1 pause
