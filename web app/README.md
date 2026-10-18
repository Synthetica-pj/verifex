# Verifex - Deepfake Detector

Verifex is a deepfake detector that uses a trained **Xception** model to identify real vs. fake images.

## Project Structure
- `app_server.py`: Single-command local web server (serves UI + `/predict`) that requires the real local model runtime.
- `web/`: Static frontend (upload + results).
- `backend/`: Model file location (`backend/xception_deepfake_detector.h5`) and legacy API code.
- `frontend/`: Legacy Streamlit UI.
- `requirements.txt`: Python dependencies for local model inference / legacy apps.

## Setup & Local Run (Windows)

To ensure the app runs perfectly every time without path or dependency errors, use the provided startup script:

1. **Navigate to the App Directory**:
   ```bash
   cd "web app"
   ```

2. **Run the Startup Script**:
   Double-click `run_local.bat` or run it from the terminal:
   ```bash
   .\run_local.bat
   ```

**What this script does:**
- Automatically creates a Virtual Environment (`venv`) if it's missing.
- Activates the environment for you.
- Checks if all libraries (`cv2`, `tensorflow`, `streamlit`, etc.) are installed and installs them if they are missing.
- Launches the `app_server.py` correctly.

---

## Manual Execution (Advanced)
If you prefer manual control:
Place your trained model files in the `backend/` directory:
- `backend/verifex_model.h5` (Primary)
- `backend/xception_deepfake_detector.h5` (Legacy)

`app_server.py` serves only real local inference. If the model or dependencies are unavailable, `/predict` returns an error instead of a mock result.
