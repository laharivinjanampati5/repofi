# Railway Deployment Guide

## Quick Setup

You have a **monorepo** with React frontend + FastAPI backend. Here's how to deploy it on Railway:

### ✅ What I've configured for you:

1. **Dockerfile** - Multi-stage build:
   - Stage 1: Builds React frontend with Vite
   - Stage 2: Runs Python backend + serves frontend static files

2. **API Client** - Frontend now uses relative paths:
   - `${window.location.origin}/api` for production
   - Falls back to `http://localhost:8000/api` for local dev

3. **Backend Updates**:
   - CORS configured for all origins
   - Static file serving mounted at `/`
   - Changed port from 5000 → 8000

4. **Railway Config** - `railway.json` tells Railway to use Dockerfile

### 🚀 Step-by-Step Deployment on Railway:

1. **Push changes to GitHub:**
   ```powershell
   git add .
   git commit -m "setup: configure dockerized deployment with monorepo"
   git push
   ```

2. **Go to Railway Dashboard:**
   - Visit: https://railway.app
   - Click "New Project" → "Deploy from GitHub"
   - Select your `repofi` repository

3. **Railway will automatically:**
   - Detect the `Dockerfile` and build it
   - Build frontend
   - Install Python dependencies
   - Start the backend server on port 8000

4. **Add Environment Variables (if needed):**
   - Go to Railway Project → Variables
   - Add any environment variables your backend needs (API keys, etc.)

### 📝 Important Notes:

- **Backend starts on port 8000** (Railway auto-detects)
- **Frontend served from backend** at the root path `/`
- **API calls** go to `/api/*` endpoints
- **No database needed** (per your config)

### ✅ Local Testing Before Deploy:

```bash
# Build frontend
npm run build

# Test backend locally
cd backend
pip install -r requirements_api.txt
cd ..
python -m uvicorn backend.api_server:app --host 0.0.0.0 --port 8000
```

Then visit `http://localhost:8000` - you should see your React app.

### 🔍 Troubleshooting:

**If frontend doesn't load:**
- Check Railway logs: `railway logs`
- Verify `dist/` folder was built

**If backend API returns 404:**
- Check that API endpoints start with `/api/` (e.g., `/api/exceptions/`)
- Verify backend is running on port 8000

**If CORS errors:**
- Check browser console for specific errors
- Backend now allows all origins (`*`)

### 📦 Backend Requirements:
Currently in `backend/requirements_api.txt`:
```
fastapi==0.104.1
uvicorn==0.24.0
pydantic==2.5.0
pydantic-settings==2.1.0
```

If you need to add more dependencies later, update that file and redeploy.

---

**Next Step:** Push your changes and trigger the Railway deployment! 🚀
