from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List

from audit_logger import write_audit_event
from candidate_engine import generate_candidate_actions
from data_provider import get_dataset_dir
from decision_scorer import candidate_to_dict, rank_candidates, score_candidate_components
from graph_engine import LogisticsGraph
from initial import ENV_FILE, ROOT_DIR, ShipmentContext, build_indices, load_core_datasets_with_meta, load_env_file, score_shipment
from post_validator import enforce_hard_constraints_with_trace
from scenario_engine import estimate_scenario_impacts, parse_scenario_text
from task_store import ensure_tasks_seeded, load_tasks, update_task_status, upsert_task


load_env_file(ENV_FILE)


PORT_DETAILS: Dict[str, Dict[str, Any]] = {
    "SGSIN": {"name": "Singapore", "x": 84, "y": 60},
    "NLRTM": {"name": "Rotterdam", "x": 49, "y": 18},
    "USNYC": {"name": "New York", "x": 14, "y": 38},
    "AEDXB": {"name": "Jebel Ali", "x": 66, "y": 40},
    "USLAX": {"name": "Los Angeles", "x": 9, "y": 48},
    "INNSA": {"name": "Nhava Sheva Feeder", "x": 72, "y": 46},
    "INBOM": {"name": "Mumbai", "x": 74, "y": 50},
}

REGION_LABELS = {
    "APAC": "Asia Pacific",
    "EU": "Europe",
    "NA": "North America",
    "MEA": "Middle East",
    "LATAM": "Latin America",
    "AFRICA": "Africa",
}

SOURCE_LABELS = {
    "tos_terminal": "Terminal Operations",
    "tms_transport": "Transport Management",
    "wms_warehouse": "Warehouse Management",
    "customs_compliance": "Customs Compliance",
    "erp_finance": "ERP Finance",
    "logistics_visibility": "Visibility Network",
    "iot_telemetry": "IoT Telemetry",
}

ALERT_LABELS = {
    "yard_occupancy_pct": "Yard Congestion",
    "yard_occupancy_rate_of_change": "Yard Throughput Spike",
    "container_dwell_time_hrs": "Container Dwell Risk",
    "crane_plan_execution_pct": "Crane Execution Gap",
    "crane_downtime_min": "Crane Downtime",
    "gate_throughput_trucks_per_hr": "Gate Bottleneck",
    "vessel_departure_delay_min": "Vessel Delay",
    "cargo_hold_flag": "Cargo Hold",
    "delivery_delay_min": "Delivery Delay",
    "carrier_reliability_score": "Carrier Reliability Drop",
    "vehicle_breakdown_flag": "Vehicle Breakdown",
    "gate_queue_depth": "Gate Queue Build-up",
    "unassigned_shipments_count": "Unassigned Shipment Volume",
    "truck_slot_fill_rate_pct": "Truck Utilization Gap",
    "driver_hours_of_service_remaining": "Driver HOS Risk",
    "spot_market_rate_spike_pct": "Spot Rate Spike",
    "picking_backlog_hours": "Picking Backlog",
    "dock_slot_availability": "Dock Slot Shortage",
    "dispatch_slot_missed_flag": "Dispatch Slot Missed",
    "inventory_readiness_pct": "Inventory Readiness Gap",
    "clearance_duration_hrs": "Customs Delay",
    "document_completeness_pct": "Documentation Gap",
    "inspection_flag": "Customs Inspection",
    "holiday_proximity_flag": "Holiday Clearance Risk",
    "sanctions_screening_flag": "Sanctions Screening Block",
    "hs_code_mismatch_flag": "HS Code Mismatch",
    "free_time_expiry_hrs_remaining": "Free Time Expiry",
    "demurrage_accrual_usd": "Demurrage Accrual",
    "sla_breach_probability_pct": "SLA Breach Risk",
    "time_to_sla_breach_hrs": "SLA Clock",
    "transhipment_missed_flag": "Transshipment Miss",
    "load_completion_pct": "Load Completion Risk",
    "temperature_exceedance_duration_min": "Temperature Excursion",
}

SEVERITY_ORDER = {"CRITICAL": 3, "HIGH": 2, "MEDIUM": 1}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def format_currency(value: float) -> str:
    return f"${round(value):,}"


def format_hours_short(hours: float) -> str:
    if hours <= 0:
        return "Now"
    whole_hours = int(hours)
    minutes = int(round((hours - whole_hours) * 60))
    if whole_hours <= 0:
        return f"{minutes}m"
    return f"{whole_hours}h {minutes:02d}m"


def format_delta_hours(hours: float) -> str:
    if hours < 0:
        return f"{abs(hours):.1f}h faster"
    if hours > 0:
        return f"{hours:.1f}h slower"
    return "No ETA change"


def format_display_time(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return "--:--"
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).astimezone(timezone.utc).strftime("%H:%M")
    except ValueError:
        return text


def format_due_display(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return "Unscheduled"
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).astimezone(timezone.utc).strftime("%b %d, %H:%M UTC")
    except ValueError:
        return text


def region_label(code: str) -> str:
    normalized = str(code or "").strip().upper()
    return REGION_LABELS.get(normalized, normalized or "Unassigned")


def port_detail(port_code: str) -> Dict[str, Any]:
    normalized = str(port_code or "").strip().upper()
    base = PORT_DETAILS.get(normalized, {})
    return {
        "code": normalized or "UNKNOWN",
        "name": base.get("name", normalized or "Unknown Port"),
        "x": base.get("x", 50),
        "y": base.get("y", 50),
    }


def current_port_for_context(ctx: ShipmentContext, graph: LogisticsGraph) -> str:
    return str(graph.get_current_port(ctx.payload) or "UNKNOWN").upper()


def destination_port_for_context(ctx: ShipmentContext, graph: LogisticsGraph) -> str:
    return str(graph.get_destination_port(ctx.shipment_id) or current_port_for_context(ctx, graph)).upper()


def latest_payload_timestamp(ctx: ShipmentContext) -> str:
    values = []
    for row in ctx.payload.values():
        timestamp = str(row.get("timestamp", "")).strip()
        if timestamp:
            values.append(timestamp)
    return max(values) if values else _utc_now_iso()


def priority_for_context(ctx: ShipmentContext) -> str:
    critical_alerts = sum(1 for alert in ctx.alerts if alert["severity"] == "CRITICAL")
    sla_prob = to_float(ctx.payload.get("erp_finance", {}).get("sla_breach_probability_pct", "0"))
    time_to_sla = to_float(ctx.payload.get("erp_finance", {}).get("time_to_sla_breach_hrs", "24"))

    if critical_alerts >= 2 or sla_prob >= 85 or time_to_sla <= 4:
        return "critical"
    if critical_alerts >= 1 or ctx.risk_score >= 58 or sla_prob >= 70:
        return "high"
    if ctx.risk_score >= 45:
        return "medium"
    return "low"


def top_alerts(ctx: ShipmentContext, limit: int = 3) -> List[Dict[str, Any]]:
    ordered = sorted(
        ctx.alerts,
        key=lambda item: (-SEVERITY_ORDER.get(item["severity"], 0), item["parameter"]),
    )
    return ordered[:limit]


def primary_issue_label(ctx: ShipmentContext) -> str:
    alert = next(iter(top_alerts(ctx, limit=1)), None)
    if not alert:
        return "Operational Risk"
    return ALERT_LABELS.get(alert["parameter"], alert["message"])


def data_sources_for_context(ctx: ShipmentContext) -> List[str]:
    names = []
    for source_name, row in ctx.payload.items():
        if row:
            names.append(SOURCE_LABELS.get(source_name, source_name))
    names.append("Route Planning Graph")
    return names


def action_confidence(score: float, feasible: bool) -> int:
    base = clamp(52 + (score * 0.38), 35, 97)
    if not feasible:
        base -= 18
    return int(clamp(base, 20, 97))


def sla_impact_label(item: Dict[str, Any]) -> str:
    eta_delta = to_float(item.get("eta_delta_hours", 0))
    feasible = bool(item.get("feasibility", False))
    if not feasible:
        return "Blocked by current constraints"
    if eta_delta < 0:
        return "Improves SLA recovery path"
    if eta_delta > 0:
        return "Adds execution delay"
    return "Stabilizes current plan"
