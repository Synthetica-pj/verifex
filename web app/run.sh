#!/bin/bash

echo "=========================================="
echo "Verifex Project Setup and Run (Mac/Linux)"
echo "=========================================="

# Check if local Python exists
if [ -f ".tools/python313/bin/python3" ] || [ -f ".tools/python313/python" ]; then
    if [ -f ".tools/python313/bin/python3" ]; then
        PYTHON_CMD=".tools/python313/bin/python3"
    else
        PYTHON_CMD=".tools/python313/python"
    fi
    echo "[1/3] Found local Python environment in .tools/python313"
    
    echo "[2/3] Verifying dependencies in local environment..."
    "$PYTHON_CMD" -m pip install -r requirements.txt --quiet
    if [ $? -ne 0 ]; then
        echo "Failed to install dependencies. Check your internet connection or requirements.txt."
        exit 1
    fi
else
    # Check if Python is installed
    if ! command -v python3 &> /dev/null; then
        echo "Python3 is not installed or not in PATH! Please install Python 3.9+ to continue."
        exit 1
    fi

    # Check if virtual environment exists
    if [ ! -d "venv" ]; then
        echo "[1/3] Creating virtual environment..."
        python3 -m venv venv
    else
        echo "[1/3] Virtual environment already exists."
    fi

    # Activate virtual environment and install requirements
    echo "[2/3] Activating virtual environment and installing dependencies..."
    source venv/bin/activate
    pip install -r requirements.txt --quiet
    if [ $? -ne 0 ]; then
        echo "Failed to install dependencies. Check your internet connection or requirements.txt."
        exit 1
    fi
    PYTHON_CMD="python3"
fi

# Check for model file
if [ ! -f "backend/xception_deepfake_detector.h5" ]; then
    echo ""
    echo "ERROR: Model file not found at backend/xception_deepfake_detector.h5"
    echo "The application requires the model file to run predictions."
    echo "Please place the model file in the backend directory."
    echo ""
fi

# Run the application
echo "[3/3] Starting the application server..."
echo "Access the application at http://localhost:8501 (or the port specified below)"

# Open preview in default browser
if command -v xdg-open > /dev/null; then
  xdg-open http://localhost:8501 &
elif command -v open > /dev/null; then
  open http://localhost:8501 &
fi

"$PYTHON_CMD" app_server.py
