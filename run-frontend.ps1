# Website on http://localhost:5173 — forwards /api and /uploads to the backend on :8000.
Set-Location "$PSScriptRoot\frontend"
if (-not (Test-Path node_modules)) { npm install }
npm run dev
