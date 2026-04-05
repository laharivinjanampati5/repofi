# Quick Start: Running the Integrated System

## 🚀 One-Minute Overview

Your backend decision engine is now connected to your frontend dashboard via REST API. Real data flows live.

## ⚙️ Prerequisites

Before starting, make sure you have:
- ✅ Python 3.8+ with pip
- ✅ Node.js 16+ with npm
- ✅ Two terminal windows

## 🔧 Installation

### 1. Install Backend Dependencies

```bash
cd backend
python -m pip install -r requirements_api.txt
```

If `pip` not found, try:
```bash
python3 -m pip install -r requirements_api.txt
```

### 2. Install Frontend Dependencies

```bash
npm install
```

(Already done if you ran it before)

## ▶️ Run the System

### Terminal 1: Backend API Server

```bash
cd backend
python run_api.py
```

**Expected output:**
```
╔════════════════════════════════════════════════════════╗
║  BITSH Control Tower API Server                        ║
║  Starting on http://localhost:5000                     ║
║                                                         ║
║  ✓ Loaded 120 shipments                               ║
║  ✓ Loaded 7 data sources                              ║
║  ✓ Graph initialized with logistics network           ║
║                                                         ║
║  Press CTRL+C to stop                                  ║
║  Docs: http://localhost:5000/docs                      ║
╚════════════════════════════════════════════════════════╝
```

### Terminal 2: Frontend Dev Server

```bash
npm run dev
```

**Expected output:**
```
  Local:        http://localhost:8080/
  press h to show help
```

## 🌐 Test the Integration

1. **Open browser:** http://localhost:8080
2. **Navigate to Control Tower Home**
   - Should show real critical exceptions from backend
   - Should show real demurrage risk
   - Should show real at-risk shipments by region

3. **Navigate to Exception Board**
   - Should list shipments from backend
   - Can search/filter

4. **Click on a Shipment**
   - Should show real recommendations from decision engine

## ✅ Verify It's Working

### Check Backend API

```bash
curl http://localhost:5000/api/health
```

Should return:
```json
{
  "status": "healthy",
  "datasets_loaded": true,
  "timestamp": "2024-04-04T..."
}
```

### Check API Docs

Open http://localhost:5000/docs in browser

You'll see interactive Swagger UI with all endpoints

### Check Real Data

In browser console:
```javascript
fetch('http://localhost:5000/api/kpi-summary')
  .then(r => r.json())
  .then(console.log)
```

Should show real KPI numbers

## 📊 What's Connected

| Page | Data Source | Status |
|------|-----------|--------|
| **Home** | `GET /api/kpi-summary` | ✅ Live |
| **Exception Board** | `GET /api/exceptions` | ✅ Live |
| **Shipment Decision** | `GET /api/exceptions`, `GET /api/recommendations/{id}` | ✅ Live |
| **Scenario Analysis** | `POST /api/scenarios` | ✅ Ready |
| **Knowledge Graph** | Mock (next step) | ⏳ |
| **Risk Heatmap** | Mock (next step) | ⏳ |

## 🔄 Auto-Refresh

Frontend automatically refreshes data every 5 seconds:
- Exception Board updates live
- KPI counts update live
- Demurrage tracker updates live

No page reload needed.

## 🛑 Stop the System

**Terminal 1 (Backend):** Press `Ctrl+C`
**Terminal 2 (Frontend):** Press `Ctrl+C`

## 🐛 Troubleshooting

### Issue: "Connection refused"

**Fix:** Make sure backend is running on port 5000

```bash
netstat -ann | grep 5000
```

If nothing shows, backend didn't start. Check for errors.

### Issue: "Datasets not loaded"

**Fix:** Wait 5 seconds after backend starts - it's loading CSVs

### Issue: Frontend shows mock data

**Fix:** Open browser console (F12) and check for network errors

Look for failed requests to `http://localhost:5000/api/*`

### Issue: Python not found

**Fix:** Use `python3` or add Python to PATH

```bash
python3 run_api.py
```

Or:
```bash
cd backend
python3 -m run_api
```

### Issue: Port 5000 already in use

**Fix:** Change port in `run_api.py` line 51 and `.env.local`

```python
port=5001  # Change this
```

Then update `.env.local`:
```
VITE_API_URL=http://localhost:5001
```

## 📖 Next Steps

1. **Customize mock data fallback** (src/data/mockData.ts)
   - Adjust for your business rules

2. **Add more API endpoints** (backend/api_server.py)
   - Implement POST /api/tasks
   - Implement PUT /api/tasks/{id}
   - Add audit logging endpoints

3. **Connect remaining pages** (src/pages/*.tsx)
   - KnowledgeGraphPage (use /api/recommendations)
   - RiskHeatmapPage (use /api/kpi-summary)
   - ActionCenter (use /api/tasks)

4. **Production deployment**
   - Use gunicorn/uvicorn for backend
   - Build frontend: `npm run build`
   - Deploy to cloud (Vercel, AWS, GCP, etc.)

## 📝 Configuration

### Backend API URL (.env.local)

```
VITE_API_URL=http://localhost:5000          # Point to your API
VITE_ENABLE_LIVE_UPDATES=true               # Auto-refresh
```

### Python Path (.env in backend/)

```
PYTHONPATH=backend:.
```

## 💾 Important Files

Created for integration:
- `backend/api_server.py` - REST API wrapper
- `src/api/client.ts` - HTTP client
- `src/api/queries.ts` - React Query hooks
- `src/utils/transformers.ts` - Data conversion
- `INTEGRATION_GUIDE.md` - Full technical docs
- `.env.local` - Configuration

Modified existing:
- `src/pages/HomePage.tsx` - Now uses real KPI data
- `src/pages/ExceptionBoard.tsx` - Now uses real exceptions
- `src/pages/ShipmentDecisionPage.tsx` - Now uses real shipments

## 🎯 You're All Set!

The integration is complete. Your backend decision engine is now powering your frontend dashboard with real, live data.

**Start both servers and watch it work!**

Questions? Check `INTEGRATION_GUIDE.md` for detailed documentation.
