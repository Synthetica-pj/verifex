@echo off
setlocal
echo ==========================================
echo Verifex Project Run (Windows)
echo ==========================================

:: 1. Setup Node.js Path (Portable)
set "NODE_VER=v20.12.2"
set "NODE_DIR=.tools\node-%NODE_VER%-win-x64"

:: Add Node to PATH for this session
if exist "%NODE_DIR%\node.exe" (
    set "PATH=%CD%\%NODE_DIR%;%PATH%"
)

:: 2. Setup Python
set "PYTHON_CMD=python"
if exist ".tools\python\python.exe" (
    echo [Info] Found embedded portable Python.
    set "PYTHON_CMD=.tools\python\python.exe"
) else if exist ".tools\python313\python.exe" (
    echo [Info] Found embedded portable Python 3.13.
    set "PYTHON_CMD=.tools\python313\python.exe"
) else (
    python --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo Python is not installed globally and embedded Python was not found!
        echo Please install Python 3.9+ to continue or ensure .tools/python exists.
        pause
        exit /b
    )
)

:: 3. Start Convex
echo [Info] Starting Convex backend in a new window...
start "Convex Dev" cmd /k "npx convex dev"

:: 4. Start Python Server
echo [Info] Starting the application server...
echo Access the application at http://localhost:8501
%PYTHON_CMD% app_server.py

pause
endlocal
