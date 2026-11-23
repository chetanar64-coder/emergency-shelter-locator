@echo off
title Emergency Shelter Locator Backend
cd /d "%~dp0backend"
echo ====================================================
echo Starting Emergency Shelter FastAPI Backend on port 8000...
echo ====================================================
py -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
if %errorlevel% neq 0 (
    echo Retrying with python directly...
    python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
)
pause
