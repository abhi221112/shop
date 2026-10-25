# API on http://localhost:8000 (docs at /api/docs), using the venv in this folder and settings from .env.
Set-Location "$PSScriptRoot\backend"
& "$PSScriptRoot\venv\Scripts\python.exe" -m uvicorn app.main:app --reload --env-file "$PSScriptRoot\.env"
