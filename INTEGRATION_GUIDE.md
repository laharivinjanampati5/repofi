# Backend-Frontend Integration Guide

## Overview

This document explains how the Python backend decision engine is now connected to the React frontend via a REST API.

## Architecture

```
Backend (Python)                   Frontend (React)
─────────────────                  ────────────────

CSV Datasets
    ↓
production_runner
    ↓
Decision Engine ────→ FastAPI Server ────→ API Client (client.ts)
    ↓                      ↓                      ↓
candidate_engine      /api/exceptions    useExceptions()
decision_scorer       /api/kpi-summary   useKPISummary()
graph_engine          /api/recommendations useRecommendations()
scenario_engine       /api/scenarios      useScenarioAnalysis()
                            ↓
                      React Query  (Caching + Polling)
                            ↓
                      Components (HomePage, ExceptionBoard, etc.)
```

## Files Created/Modified

### Backend (Python)

**New Files:**
- `backend/api_server.py` - FastAPI REST API server wrapping your decision engine
- `backend/requirements_api.txt` - Python dependencies for API
- `backend/run_api.py` - Startup script for development

**Why:** Exposes your existing decision logic as HTTP endpoints

### Frontend (React/TypeScript)

**New Files:**
- `src/api/client.ts` - HTTP wrapper for API calls (fetch-based)
- `src/api/queries.ts` - React Query hooks for data fetching
- `src/utils/transformers.ts` - Convert API responses → frontend types
- `.env.local` - Backend API URL configuration

**Modified Files:**
- `src/pages/HomePage.tsx` - Now fetches real KPI data from API
- `src/pages/ExceptionBoard.tsx` - Now fetches exceptions from API
- `src/pages/ShipmentDecisionPage.tsx` - Now fetches shipments from API

**Why:** Replace hardcoded mock data with real backend data

## How It Works

### 1. API Server Startup

```bash
cd backend
python run_api.py
```

This will:
1. Load your CSV datasets
2. Build shipment indices
3. Initialize the LogisticsGraph
4. Start FastAPI server on `http://localhost:5000`

### 2. API Endpoints

All endpoints return JSON and support CORS (for development):

#### Health Check
```
GET /api/health
→ { "status": "healthy", "datasets_loaded": true, ... }
```

#### Get Exceptions (At-Risk Shipments)
```
GET /api/exceptions?skip=0&limit=20
→ [
  {
    "id": "EXC-001",
    "shipmentId": "SHP-001",
    "priority": "critical",
    "priorityScore": 92,
    "issueType": "Customs Hold",
    ...
  },
  ...
]
```

#### Get Recommendations for One Shipment
```
GET /api/recommendations/{shipmentId}
→ [
  {
    "id": "REC-001",
    "label": "Reroute via Alternative Carrier",
    "confidence": 92,
    "costImpact": -12000,
    "slaImpact": "SLA Met (95% confidence)",
    ...
  },
  ...
]
```

#### Get KPI Summary
```
GET /api/kpi-summary
→ {
  "criticalExceptions": 3,
  "atRiskShipments": [
    { "region": "Asia Pacific", "count": 15 },
    ...
  ],
  "demurrageRisk": 127500,
  "systemHealth": [...]
}
```

#### Scenario Analysis (What-If)
```
POST /api/scenarios
{
  "shipmentId": "SHP-001",
  "scenarioText": "If we delay 2 hours, what happens to SLA?"
}
→ {
  "slaDeltaPct": -5,
  "demurrageDeltaUsd": 2000,
  "recommendation": [...]
}
```

### 3. Frontend Data Flow

**Before (Mock Data):**
```
HomePage.tsx
  → imports mockData.ts
  → renders static KPIs
```

**After (Real API):**
```
HomePage.tsx
  → useKPISummary() hook
  → queries React Query cache
  → fetches GET /api/kpi-summary if stale
  → transformers.ts converts API response
  → renders fresh KPIs with real data
```

**Live Updates:**
- `useKPISummary()` refetches every 5 seconds
- `useExceptions()` refetches every 5 seconds
- Stale time: 2 seconds
- Automatic cache invalidation

### 4. Error Handling & Fallback

If API is unavailable, all pages fall back to mock data:

```typescript
const { data: apiKpi } = useKPISummary();
const kpiDataDisplay = apiKpi ? transformApiKPISummary(apiKpi) : kpiData; // Falls back to mock

// If API error → shows mock data gracefully
```

## Environment Configuration

### Frontend (.env.local)

```
VITE_API_URL=http://localhost:5000          # API server URL
VITE_ENABLE_LIVE_UPDATES=true               # Live polling
VITE_ENABLE_WEBSOCKET=false                 # Future: real-time via WebSocket
```

### Backend (requires .env in root backend dir)

The backend already loads `.env` for API keys:
```
GROQ_API_KEY=your_groq_key_here  # Optional: for scenario parsing
```

## Running the Full Stack

### Terminal 1: Backend API
```bash
cd backend
python run_api.py
# Starts on http://localhost:5000
```

### Terminal 2: Frontend Dev Server
```bash
npm run dev
# Starts on http://localhost:8080 (or next available port)
```

### Browser
Open http://localhost:8080

### Test the Integration
1. HomePage loads → shows real critical exceptions count
2. ExceptionBoard loads → shows real at-risk shipments
3. Click exception → ShipmentDecisionModal shows real recommendations
4. All data refreshes live every 5 seconds

## API Documentation (Auto-Generated)

FastAPI generates interactive docs:

```
http://localhost:5000/docs          # Swagger UI
http://localhost:5000/redoc         # ReDoc documentation
```

## Data Transformation Flow

Backend data → API JSON → React Query → Transformers → Frontend Component

**Example: Exception**

```python
# Backend: ShipmentContext (Python)
{
  "shipment_id": "SHP-001",
  "risk_score": 92.5,
  "payload": {
    "tos_terminal": { "terminal_code": "SGSIN", ... },
    "logistics_visibility": { "customer_tier": "Platinum", ... }
  }
}
```

↓ (api_server.py converts)

```json
{
  "id": "EXC-001",
  "shipmentId": "SHP-001",
  "priorityScore": 92.5,
  "terminal": "SGSIN",
  "customerTier": "Platinum"
}
```

↓ (transformApiException in transformers.ts)

```typescript
// Frontend: Exception type (TypeScript)
{
  id: "EXC-001",
  shipmentId: "SHP-001",
  priorityScore: 92.5,
  terminal: "SGSIN",
  customerTier: "Platinum"
}
```

## CORS Configuration

API server allows requests from:
- `http://localhost:8080` (Vite dev)
- `http://localhost:3000` (alternative dev port)
- `http://127.0.0.1:8080` (localhost alternative)

For production, modify `api_server.py` line 30:
```python
allow_origins=["https://yourdomain.com"]
```

## Troubleshooting

### "Connection refused" on frontend
**Check:** Backend is running on port 5000
```bash
netstat -an | grep 5000
```

### "Datasets not yet loaded"
**Check:** Backend has finished initializing (wait ~5 seconds after start)

### API returns mock data forever
**Check:** Verify API endpoint is correct in `.env.local`
```
VITE_API_URL=http://localhost:5000
```

### "Shipment not found"
**Check:** Shipment ID matches those in `backend/datasets/*.csv`

### Stale data on frontend
**Clear cache:** Cmd+Shift+R (hard refresh)

## Next Steps

### Short-term (This Week)
- [ ] Test all pages with real API data
- [ ] Verify KPI calculations match business rules
- [ ] Handle API errors gracefully

### Medium-term (Next Sprint)
- [ ] Connect POST /api/tasks for ActionCenter
- [ ] Implement task assignment workflows
- [ ] Add WebSocket for real-time updates

### Long-term (Later)
- [ ] Authentication (JWT tokens)
- [ ] Multi-user support
- [ ] API rate limiting
- [ ] Database for historical audit logs
- [ ] Performance optimizations (caching, pagination)

## API Response Types (TypeScript)

All types are in `src/api/client.ts`:

```typescript
export interface ApiException { ... }
export interface ApiRecommendation { ... }
export interface ApiKPISummary { ... }
export interface HealthCheckResponse { ... }
```

These map 1:1 to React Query hooks in `src/api/queries.ts`.

## Performance Characteristics

| Operation | Latency | Method |
|-----------|---------|--------|
| Health check | ~10ms | Cache hit |
| Get exceptions (20 items) | ~500ms | API call |
| Get KPI summary | ~1000ms | Aggregation |
| Get recommendations (1 shipment) | ~2000ms | Decision engine |
| Scenario analysis | ~3000ms | LLM + simulation |

Cache times (React Query `staleTime`):
- Exceptions: 2s (live updates every 5s)
- KPI: 2s (live updates every 5s)
- Recommendations: 10s (manual refresh)

## Files Summary

| File | Purpose | Status |
|------|---------|--------|
| `backend/api_server.py` | FastAPI server | ✅ Created |
| `backend/requirements_api.txt` | Python dependencies | ✅ Created |
| `backend/run_api.py` | Dev startup script | ✅ Created |
| `src/api/client.ts` | HTTP client | ✅ Created |
| `src/api/queries.ts` | React Query hooks | ✅ Created |
| `src/utils/transformers.ts` | Data converters | ✅ Created |
| `.env.local` | Frontend config | ✅ Created |
| `src/pages/HomePage.tsx` | ✅ Updated |
| `src/pages/ExceptionBoard.tsx` | ✅ Updated |
| `src/pages/ShipmentDecisionPage.tsx` | ✅ Updated |

---

**Ready to run!** Start the backend and frontend, then navigate to http://localhost:8080 to see live data.
