"""
FastAPI server for AI Control Tower orchestration.
Exposes REST endpoints wrapping backend decision logic.
"""

import os
import ast
from uuid import uuid4
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from audit_logger import build_audit_event, write_audit_event
from candidate_engine import generate_candidate_actions
from data_provider import get_dataset_dir, load_source_rows_with_meta
from data_quality import source_health_summary
from decision_scorer import candidate_to_dict, rank_candidates, score_candidate_components
from graph_engine import LogisticsGraph
from initial import (
    ENV_FILE,
    ROOT_DIR,
    build_indices,
    build_llm_messages,
    call_groq,
    load_core_datasets_with_meta,
    load_env_file,
    score_shipment,
)
from llm_router import has_llm_credentials, llm_status
from post_validator import enforce_hard_constraints_with_trace, validate_output_shape
from scenario_engine import (
    estimate_scenario_impacts,
    hybrid_scenario_actionability,
    parse_scenario_text,
    resolve_scenario_with_assumptions,
)
from task_store import ensure_tasks_seeded, load_tasks, upsert_task, update_task_status

# Load environment
load_env_file(ENV_FILE)

# Initialize FastAPI app
app = FastAPI(
    title="BITSH Control Tower API",
    description="AI Orchestration Engine for Logistics Decision Intelligence",
    version="1.0.0",
)

# CORS middleware - allow all origins for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state (loaded once at startup)
_DATASETS: Dict[str, Any] = {}
_SOURCE_META: Dict[str, Any] = {}
_SHIPMENT_INDEX: Dict[str, List[Any]] = {}
_GRAPH: Optional[LogisticsGraph] = None


# ============================================================================
# Pydantic Models
# ============================================================================


class ExceptionResponse(BaseModel):
    id: str
    shipmentId: str
    containerId: str
    priority: str
    priorityScore: float
    issueType: str
    region: str
    terminal: str
    customerTier: str
    timeToSLA: str
    recommendedAction: str
    owner: str
    status: str
    cost: float
    createdAt: str


class RecommendationResponse(BaseModel):
    id: str
    label: str
    confidence: float
    costImpact: float
    timeImpact: str
    slaImpact: str
    explanation: str
    dataSources: List[str]
    requiredOwner: str
    dueBy: str


class KPISummaryResponse(BaseModel):
    criticalExceptions: int
    atRiskShipments: List[Dict[str, Any]]
    demurrageRisk: float
    systemHealth: List[Dict[str, Any]]
    lastUpdated: str


class ScenarioSubmissionRequest(BaseModel):
    shipmentId: str
    scenarioText: str


class ScenarioResponseData(BaseModel):
    slaDeltaPct: float
    demurrageDeltaUsd: float
    recommendation: Dict[str, Any]


class HealthCheckResponse(BaseModel):
    status: str
    datasets_loaded: bool
    timestamp: str


class LLMStatusResponse(BaseModel):
    credentialsConfigured: bool
    apiKeyCount: int
    apiKeyFingerprints: List[str]
    models: List[str]
    modelCount: int


class TaskResponse(BaseModel):
    id: str
    title: str
    assignee: str
    dueTime: str
    status: str
    relatedShipment: str
    priority: str


# ============================================================================
# Initialization
# ============================================================================


@app.on_event("startup")
async def startup_event():
    """Load datasets and initialize indices on server startup."""
    global _DATASETS, _SOURCE_META, _SHIPMENT_INDEX, _GRAPH

    try:
        dataset_dir = get_dataset_dir(ROOT_DIR)
        print(f"Loading datasets from {dataset_dir}...")

        _DATASETS, _SOURCE_META = load_core_datasets_with_meta(dataset_dir)
        _SHIPMENT_INDEX = build_indices(_DATASETS)
        _GRAPH = LogisticsGraph(dataset_dir)
        seeded_tasks = ensure_tasks_seeded(ROOT_DIR, _default_tasks())

        print(f"✓ Loaded {len(_SHIPMENT_INDEX)} shipments")
        print(f"✓ Loaded {len(_SOURCE_META)} data sources")
        print(f"✓ Graph initialized with logistics network")
        print(f"✓ Task store ready with {len(seeded_tasks)} tasks")

    except Exception as e:
        print(f"✗ Startup error: {e}")
        raise


# ============================================================================
# Helper Functions
# ============================================================================


def _get_exception_for_shipment(shipment_id: str) -> Optional[ExceptionResponse]:
    """Convert shipment context to exception response."""
    if shipment_id not in _SHIPMENT_INDEX:
        return None

    ctx = score_shipment(shipment_id, _SHIPMENT_INDEX[shipment_id])

    # Determine priority from context
    critical_alerts = sum(1 for alert in ctx.alerts if alert["severity"] == "CRITICAL")
    sla_prob = float(ctx.payload.get("erp_finance", {}).get("sla_breach_probability_pct", "50") or 50)
    time_to_sla = float(ctx.payload.get("erp_finance", {}).get("time_to_sla_breach_hrs", "24") or 24)

    if critical_alerts >= 2 or sla_prob >= 85 or time_to_sla <= 4:
        priority = "critical"
    elif critical_alerts >= 1 or ctx.risk_score >= 58 or sla_prob >= 70:
        priority = "high"
    elif ctx.risk_score >= 45:
        priority = "medium"
    else:
        priority = "low"

    priority_score = ctx.risk_score

    # Extract info from payload
    tos_data = ctx.payload.get("tos_terminal", {})
    tms_data = ctx.payload.get("tms_transport", {})
    logistics_data = ctx.payload.get("logistics_visibility", {})

    terminal = str(tos_data.get("terminal_code", "Unknown"))
    container_id = str(tms_data.get("container_id", "Unknown"))
    region = str(logistics_data.get("origin_region", "Unknown"))
    customer_tier = str(logistics_data.get("customer_tier", "Silver"))

    # Top alert as issue type
    top_alert = ctx.alerts[0] if ctx.alerts else {"parameter": "Unknown Issue"}
    issue_type = str(top_alert.get("parameter", "Unknown Issue"))

    # Format time to SLA
    hours = int(time_to_sla)
    minutes = int((time_to_sla - hours) * 60)
    time_to_sla_str = f"{hours}h {minutes:02d}m"

    return ExceptionResponse(
        id=f"EXC-{shipment_id.split('-')[-1]}",
        shipmentId=shipment_id,
        containerId=container_id,
        priority=priority,
        priorityScore=priority_score,
        issueType=issue_type,
        region=region,
        terminal=terminal,
        customerTier=customer_tier,
        timeToSLA=time_to_sla_str,
        recommendedAction="Analyze decision engine recommendations",
        owner="Ops Manager",
        status="open",
        cost=float(ctx.payload.get("erp_finance", {}).get("demurrage_accrual_usd", "0") or 0),
        createdAt=datetime.now(timezone.utc).isoformat(),
    )


def _get_recommendations_for_shipment(
    shipment_id: str,
    scenario_override: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Generate LLM-ranked recommendations for a shipment using initial.py style contract."""
    if shipment_id not in _SHIPMENT_INDEX:
        return []

    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not has_llm_credentials(api_key):
        raise RuntimeError("Missing LLM credentials. Configure GROQ_API_KEY or LLM_API_KEYS for strict LLM recommendation mode")

    ctx = score_shipment(shipment_id, _SHIPMENT_INDEX[shipment_id])

    ranked = rank_candidates(
        generate_candidate_actions(
            ctx,
            _GRAPH,
            datetime.now(timezone.utc),
            scenario=scenario_override,
        ),
        ctx,
    )

    ranked_candidates = [candidate_to_dict(candidate, score) for candidate, score in ranked]
    if not ranked_candidates:
        return []

    candidates_index = {item["action_id"]: item for item in ranked_candidates}

    llm_output = call_groq(build_llm_messages(ctx, ranked_candidates), api_key)
    validate_output_shape(llm_output)
    recommendation, _ = enforce_hard_constraints_with_trace(llm_output, candidates_index, ctx)

    ordered_ids = [
        cid
        for cid in recommendation.get("ranked_action_ids", [])
        if isinstance(cid, str) and cid in candidates_index
    ]
    if not ordered_ids:
        raise RuntimeError("LLM output did not include valid ranked_action_ids")

    recommendations = []
    for idx, action_id in enumerate(ordered_ids[:5]):
        cand = candidates_index[action_id]
        score = float(cand.get("score", 0.0) or 0.0)
        confidence = max(20.0, min(97.0, 52.0 + (0.38 * score)))
        if not bool(cand.get("feasibility", False)):
            confidence = max(20.0, confidence - 18.0)

        eta_delta = float(cand.get("eta_delta_hours", 0.0) or 0.0)
        if eta_delta > 0:
            time_impact = f"{eta_delta:.1f}h slower"
        elif eta_delta < 0:
            time_impact = f"{abs(eta_delta):.1f}h faster"
        else:
            time_impact = "No ETA change"

        raw_rationale = recommendation.get("rationale_per_action_id", {}).get(action_id, "LLM rationale unavailable")
        explanation = _format_white_box_rationale(raw_rationale)

        recommendations.append(
            {
                "id": f"{shipment_id}-REC-{idx + 1}",
                "label": cand.get("summary", "Recommended Action"),
                "confidence": round(confidence, 1),
                "costImpact": cand.get("cost_delta_usd", 0),
                "timeImpact": time_impact,
                "slaImpact": "Improves SLA recovery path" if cand.get("feasibility") else "Blocked by current constraints",
                "explanation": explanation,
                "dataSources": list(cand.get("evidence", {}).keys()),
                "requiredOwner": cand.get("owner", "Operations Manager"),
                "dueBy": cand.get("due_by", recommendation.get("due_by", "")),
            }
        )

    return recommendations


def _format_white_box_rationale(raw_rationale: Any) -> str:
    raw_text = str(raw_rationale or "").strip()
    if not raw_text:
        return "LLM rationale unavailable"

    parsed: Any = None
    try:
        parsed = ast.literal_eval(raw_text)
    except (ValueError, SyntaxError):
        return raw_text

    if not isinstance(parsed, dict):
        return raw_text

    ordered_sections = [
        "Situation",
        "Evidence",
        "Constraint check",
        "Action items",
        "Why this over alternatives",
    ]
    lines: List[str] = []

    for section in ordered_sections:
        value = parsed.get(section)
        if value is None:
            continue
        if isinstance(value, list):
            items = [str(item).strip() for item in value if str(item).strip()]
            if not items:
                continue
            lines.append(f"{section}:")
            lines.extend([f"- {item}" for item in items])
            continue
        text = str(value).strip()
        if text:
            lines.append(f"{section}: {text}")

    if lines:
        return "\n".join(lines)
    return raw_text


def _default_tasks() -> List[Dict[str, Any]]:
    shipment_ids = list(_SHIPMENT_INDEX.keys())[:6]
    if not shipment_ids:
        return []

    assignees = ["Ops Manager", "Terminal Planner", "Control Tower Manager"]
    priorities = ["critical", "critical", "high", "high", "medium", "medium"]
    titles = [
        "Book alternate carrier option",
        "Escalate customs hold to broker",
        "Coordinate terminal slot adjustment",
        "Validate transport handoff times",
        "Prepare customer delay notification",
        "Re-check document readiness",
    ]
    due_times = ["10:30", "11:00", "12:30", "14:00", "16:00", "18:00"]

    seed: List[Dict[str, Any]] = []
    for idx, shipment_id in enumerate(shipment_ids):
        seed.append(
            {
                "id": f"TASK-{idx + 1:03d}",
                "title": titles[idx % len(titles)],
                "assignee": assignees[idx % len(assignees)],
                "dueTime": due_times[idx % len(due_times)],
                "status": "pending" if idx % 3 else "in-progress",
                "relatedShipment": shipment_id,
                "priority": priorities[idx % len(priorities)],
                "actionId": f"AUTO-{idx + 1:03d}",
            }
        )
    return seed


# ============================================================================
# Health & Status Endpoints
# ============================================================================


@app.get("/health", response_model=HealthCheckResponse)
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy" if _DATASETS else "initializing",
        "datasets_loaded": len(_DATASETS) > 0,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/health", response_model=HealthCheckResponse)
async def api_health_check():
    """API health check endpoint."""
    return {
        "status": "healthy" if _DATASETS else "initializing",
        "datasets_loaded": len(_DATASETS) > 0,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/llm-status", response_model=LLMStatusResponse)
async def get_llm_status():
    """Return strict LLM connectivity and rotation configuration status."""
    return llm_status()


# ============================================================================
# Exception Endpoints
# ============================================================================


@app.get("/api/exceptions", response_model=List[ExceptionResponse])
async def list_exceptions(skip: int = 0, limit: int = 20):
    """Get risk-ranked exceptions in initial.py board style (highest risk first)."""
    if not _DATASETS:
        raise HTTPException(status_code=503, detail="Datasets not yet loaded")

    scored_ids = [
        (shipment_id, score_shipment(shipment_id, payload).risk_score)
        for shipment_id, payload in _SHIPMENT_INDEX.items()
    ]
    scored_ids.sort(key=lambda item: item[1], reverse=True)

    exceptions: List[ExceptionResponse] = []
    for shipment_id, _ in scored_ids[skip : skip + limit]:
        exc = _get_exception_for_shipment(shipment_id)
        if exc is not None:
            exceptions.append(exc)

    return exceptions


@app.get("/api/exceptions/{shipment_id}", response_model=ExceptionResponse)
async def get_exception(shipment_id: str):
    """Get exception details for a specific shipment."""
    if not _DATASETS:
        raise HTTPException(status_code=503, detail="Datasets not yet loaded")

    exc = _get_exception_for_shipment(shipment_id)
    if not exc:
        raise HTTPException(status_code=404, detail=f"Shipment {shipment_id} not found")

    return exc


# ============================================================================
# Recommendation Endpoints
# ============================================================================


@app.get("/api/recommendations/{shipment_id}", response_model=List[Dict[str, Any]])
async def get_recommendations(shipment_id: str):
    """Get ranked recommendations/actions for a shipment."""
    if not _DATASETS:
        raise HTTPException(status_code=503, detail="Datasets not yet loaded")

    try:
        recs = _get_recommendations_for_shipment(shipment_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not recs:
        raise HTTPException(status_code=404, detail=f"No recommendations found for {shipment_id}")

    return recs


# ============================================================================
# KPI Summary Endpoints
# ============================================================================


@app.get("/api/kpi-summary", response_model=KPISummaryResponse)
async def get_kpi_summary():
    """Get high-level KPI summary from current datasets."""
    if not _DATASETS:
        raise HTTPException(status_code=503, detail="Datasets not yet loaded")

    # Count critical exceptions
    critical_count = 0
    at_risk_by_region = {}
    total_demurrage = 0.0

    for shipment_id in _SHIPMENT_INDEX:
        ctx = score_shipment(shipment_id, _SHIPMENT_INDEX[shipment_id])
        sla_prob = float(ctx.payload.get("erp_finance", {}).get("sla_breach_probability_pct", "0") or 0)
        time_to_sla = float(ctx.payload.get("erp_finance", {}).get("time_to_sla_breach_hrs", "24") or 24)

        if sla_prob >= 85 or time_to_sla <= 4:
            critical_count += 1

        region = str(ctx.payload.get("logistics_visibility", {}).get("origin_region", "Unknown"))
        if ctx.risk_score >= 45:
            at_risk_by_region[region] = at_risk_by_region.get(region, 0) + 1

        demurrage = float(ctx.payload.get("erp_finance", {}).get("demurrage_accrual_usd", "0") or 0)
        total_demurrage += demurrage

    # System health from source metadata and row counts.
    system_health = []
    for source_name, meta in _SOURCE_META.items():
        health = meta.get("health", {}) if isinstance(meta, dict) else {}
        status = str(health.get("status", "healthy"))
        row_count = int(meta.get("row_count", 0) or 0)
        latency = max(20, min(300, int(22000 / max(1, row_count))))
        display_name = source_name.replace("_", " ").title()
        system_health.append(
            {
                "name": display_name,
                "status": status,
                "latency": latency,
            }
        )

    return {
        "criticalExceptions": critical_count,
        "atRiskShipments": [{"region": k, "count": v} for k, v in sorted(at_risk_by_region.items())],
        "demurrageRisk": total_demurrage,
        "systemHealth": system_health,
        "lastUpdated": datetime.now(timezone.utc).isoformat(),
    }


# ============================================================================
# Scenario Analysis Endpoints
# ============================================================================


@app.post("/api/scenarios")
async def submit_scenario(request: ScenarioSubmissionRequest):
    """Analyze what-if scenario for a shipment."""
    if not _DATASETS:
        raise HTTPException(status_code=503, detail="Datasets not yet loaded")

    if request.shipmentId not in _SHIPMENT_INDEX:
        raise HTTPException(status_code=404, detail=f"Shipment {request.shipmentId} not found")

    if not str(request.scenarioText or "").strip():
        raise HTTPException(status_code=400, detail="scenarioText cannot be empty")

    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not has_llm_credentials(api_key):
        raise HTTPException(
            status_code=503,
            detail="Missing LLM credentials. Configure GROQ_API_KEY or LLM_API_KEYS for strict LLM scenario mode",
        )

    ctx = score_shipment(request.shipmentId, _SHIPMENT_INDEX[request.shipmentId])

    logistics_data = ctx.payload.get("logistics_visibility", {})
    transport_data = ctx.payload.get("tms_transport", {})
    current_port = _GRAPH.get_current_port(ctx.payload) if _GRAPH else ""
    destination_port = _GRAPH.get_destination_port(request.shipmentId) if _GRAPH else ""
    origin_region = str(logistics_data.get("origin_region", "") or "").strip()
    destination_region = str(logistics_data.get("destination_region", "") or "").strip()
    if _GRAPH:
        if not origin_region and current_port:
            origin_region = str(_GRAPH.port_region_lookup.get(str(current_port).upper(), "") or "").strip()
        if not destination_region and destination_port:
            destination_region = str(_GRAPH.port_region_lookup.get(str(destination_port).upper(), "") or "").strip()

    scenario_with_context = (
        f"{request.scenarioText.strip()}\n\n"
        "Known shipment context (do not ask for these unless contradictory):\n"
        f"- shipment_id: {request.shipmentId}\n"
        f"- origin_region: {origin_region}\n"
        f"- destination_region: {destination_region}\n"
        f"- current_port: {current_port or logistics_data.get('origin_port', '')}\n"
        f"- destination_port: {destination_port or logistics_data.get('destination_port', '')}\n"
        f"- carrier_id: {transport_data.get('carrier_id', '')}\n"
    )

    try:
        parsed_scenario = parse_scenario_text(scenario_with_context, api_key, call_groq)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid scenario input: {str(exc)}")
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=f"LLM scenario parse failed: {str(exc)}")
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Scenario parsing failed due to runtime error: {str(exc)}")

    try:
        actionable, reasons, clarification_questions, validation_meta = hybrid_scenario_actionability(
            parsed_scenario,
            api_key,
            call_groq,
            min_confidence="MEDIUM",
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"LLM scenario validation failed: {str(exc)}")

    assumptions_used: List[str] = []
    if not actionable:
        resolution_context = {
            "shipment_id": request.shipmentId,
            "scores": {
                "risk_score": ctx.risk_score,
                "urgency_score": ctx.urgency_score,
                "impact_score": ctx.impact_score,
                "feasibility_score": ctx.feasibility_score,
            },
            "alerts": ctx.alerts[:8],
            "signals": ctx.payload,
            "known_context": {
                "origin_region": origin_region,
                "destination_region": destination_region,
                "current_port": current_port,
                "destination_port": destination_port,
                "carrier_id": transport_data.get("carrier_id", ""),
            },
        }

        try:
            resolved_scenario, resolution_meta = resolve_scenario_with_assumptions(
                parsed_scenario,
                resolution_context,
                api_key,
                call_groq,
            )
            parsed_scenario = resolved_scenario
            assumptions_used = list(resolution_meta.get("assumptions", []))
            clarification_questions = list(resolution_meta.get("clarification_questions", clarification_questions))
            validation_meta["assumption_resolution"] = {
                "applied": True,
                "reason": resolution_meta.get("reason", ""),
                "confidence": resolution_meta.get("confidence", parsed_scenario.confidence),
                "assumptions": assumptions_used,
            }
            validation_meta["llm_actionable"] = True
            reasons = reasons + [
                "Scenario had ambiguity; executed with context-grounded assumptions to provide outcome.",
            ]
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Scenario is not actionable based on LLM validation",
                    "reasons": reasons,
                    "clarificationQuestions": clarification_questions,
                    "validation": validation_meta,
                    "resolutionError": str(exc),
                },
            )

    impact = estimate_scenario_impacts(ctx, parsed_scenario)

    try:
        recommendations = _get_recommendations_for_shipment(
            request.shipmentId,
            scenario_override=parsed_scenario.to_dict(),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "slaDeltaPct": impact.get("sla_probability_delta_pct", 0),
        "demurrageDeltaUsd": impact.get("demurrage_delta_usd", 0),
        "recommendation": recommendations,
        "assumptionsUsed": assumptions_used,
        "clarificationQuestions": clarification_questions,
        "validation": validation_meta,
        "analysisNotes": reasons,
    }


# ============================================================================
# Shipment & Tasks Endpoints
# ============================================================================


@app.get("/api/shipments")
async def list_shipments(skip: int = 0, limit: int = 20):
    """List all available shipments."""
    if not _DATASETS:
        raise HTTPException(status_code=503, detail="Datasets not yet loaded")

    shipment_ids = list(_SHIPMENT_INDEX.keys())[skip : skip + limit]
    return {"shipments": shipment_ids, "total": len(_SHIPMENT_INDEX)}


@app.get("/api/tasks", response_model=List[TaskResponse])
async def list_tasks(status: Optional[str] = None):
    """List tasks, optionally filtered by status."""
    if not _DATASETS:
        raise HTTPException(status_code=503, detail="Datasets not yet loaded")

    tasks = load_tasks(ROOT_DIR)
    if status:
        tasks = [task for task in tasks if str(task.get("status", "")).lower() == status.lower()]

    return [
        {
            "id": task.get("id", ""),
            "title": task.get("title", "Untitled Task"),
            "assignee": task.get("assignee", "Unassigned"),
            "dueTime": task.get("dueTime", "TBD"),
            "status": task.get("status", "pending"),
            "relatedShipment": task.get("relatedShipment", "Unknown"),
            "priority": task.get("priority", "medium"),
        }
        for task in tasks
    ]


@app.post("/api/tasks", response_model=TaskResponse)
async def create_task(task_data: Dict[str, Any]):
    """Create or upsert a task in task store."""
    if not _DATASETS:
        raise HTTPException(status_code=503, detail="Datasets not yet loaded")

    shipment_id = str(task_data.get("relatedShipment", "")).strip()
    if shipment_id and shipment_id not in _SHIPMENT_INDEX:
        raise HTTPException(status_code=404, detail=f"Shipment {shipment_id} not found")

    payload = {
        "id": str(task_data.get("id", "")).strip() or f"TASK-{uuid4().hex[:6].upper()}",
        "title": str(task_data.get("title", "Manual task")).strip() or "Manual task",
        "assignee": str(task_data.get("assignee", "Ops Manager")).strip() or "Ops Manager",
        "dueTime": str(task_data.get("dueTime", "TBD")).strip() or "TBD",
        "status": str(task_data.get("status", "pending")).strip() or "pending",
        "relatedShipment": shipment_id,
        "priority": str(task_data.get("priority", "medium")).strip() or "medium",
        "actionId": str(task_data.get("actionId", "")).strip() or f"MANUAL-{uuid4().hex[:8]}",
    }

    stored = upsert_task(ROOT_DIR, payload)

    return {
        "id": stored.get("id", payload["id"]),
        "title": stored.get("title", payload["title"]),
        "assignee": stored.get("assignee", payload["assignee"]),
        "dueTime": stored.get("dueTime", payload["dueTime"]),
        "status": stored.get("status", payload["status"]),
        "relatedShipment": stored.get("relatedShipment", payload["relatedShipment"]),
        "priority": stored.get("priority", payload["priority"]),
    }


@app.put("/api/tasks/{task_id}", response_model=TaskResponse)
async def update_task(task_id: str, task_data: Dict[str, Any]):
    """Update task status in task store."""
    status = str(task_data.get("status", "")).strip()
    if not status:
        raise HTTPException(status_code=400, detail="Missing required field: status")

    try:
        updated = update_task_status(ROOT_DIR, task_id, status)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if updated is None:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")

    return {
        "id": updated.get("id", task_id),
        "title": updated.get("title", "Untitled Task"),
        "assignee": updated.get("assignee", "Unassigned"),
        "dueTime": updated.get("dueTime", "TBD"),
        "status": updated.get("status", "pending"),
        "relatedShipment": updated.get("relatedShipment", "Unknown"),
        "priority": updated.get("priority", "medium"),
    }


# ============================================================================
# Static file serving (for frontend)
# ============================================================================

try:
    dist_path = Path(__file__).parent.parent / "dist"
    if dist_path.exists():
        app.mount("/", StaticFiles(directory=str(dist_path), html=True), name="static")
except Exception as e:
    print(f"Warning: Could not mount static files: {e}")


# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "api_server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
