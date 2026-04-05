#!/usr/bin/env python
"""
Startup script for the FastAPI backend server.
This starts the API server on http://localhost:5000

Requirements:
- Python 3.8+
- Dependencies from requirements_api.txt installed

Usage:
    python api_server.py

Or with uvicorn directly:
    uvicorn api_server:app --host 0.0.0.0 --port 5000 --reload
"""

import os
import sys
from pathlib import Path

# Add parent directory to path to import modules
sys.path.insert(0, str(Path(__file__).parent))

# Environment setup
os.environ.setdefault('PYTHONDONTWRITEBYTECODE', '1')

if __name__ == '__main__':
    import uvicorn

    print("""
    ╔════════════════════════════════════════════════════════╗
    ║  BITSH Control Tower API Server                        ║
    ║  Starting on http://localhost:5000                     ║
    ║                                                         ║
    ║  Endpoints:                                             ║
    ║  - GET  /health                                        ║
    ║  - GET  /api/health                                    ║
    ║  - GET  /api/exceptions                                ║
    ║  - GET  /api/kpi-summary                               ║
    ║  - POST /api/scenarios                                 ║
    ║                                                         ║
    ║  Press CTRL+C to stop                                  ║
    ║  Docs: http://localhost:5000/docs                      ║
    ╚════════════════════════════════════════════════════════╝
    """)

    uvicorn.run(
        'api_server:app',
        host='0.0.0.0',
        port=5000,
        reload=True,
        log_level='info',
    )
