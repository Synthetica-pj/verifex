@echo off
SETLOCAL EnableDelayedExpansion

echo ==========================================
echo    Verifex 1.0 - Local Startup Script
echo ==========================================

:: Check if running from correct directory
if not exist "app_server.py" (
    echo [Error] Please run this script from inside the 'web app' folder.
    pause
    exit /b
)

:: 1. Check for Virtual Environment
if not exist "venv" (
    echo [Info] Virtual environment not found. Creating one...
    python -m venv venv
    if !errorlevel! neq 0 (
        echo [Error] Failed to create virtual environment. Is Python installed?
        pause
        exit /b
    )
)

:: 2. Activate Virtual Environment
echo [Info] Activating virtual environment...
call venv\Scripts\activate
if !errorlevel! neq 0 (
    echo [Error] Failed to activate virtual environment.
    pause
    exit /b
)

:: 3. Verify Dependencies (Silent Check)
echo [Info] Verifying dependencies...
python -c "import cv2, streamlit, tensorflow, scipy" >nul 2>&1
if !errorlevel! neq 0 (
    echo [Warning] Missing dependencies detected. Installing...
    python -m pip install --upgrade pip
    pip install -r requirements.txt
    if !errorlevel! neq 0 (
        echo [Error] Installation failed. Check your internet connection.
        pause
        exit /b
    )
)

:: 4. Launch Application
echo [Success] Environment ready. Starting Verifex...
echo Access the UI at: http://localhost:8501
python app_server.py

pause
