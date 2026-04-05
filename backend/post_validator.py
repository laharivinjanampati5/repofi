from typing import Any, Dict, List


REQUIRED_OUTPUT_KEYS = [
    "issue_summary",
    "selected_action_id",
    "ranked_action_ids",
    "rationale_per_action_id",
    "evidence_used",
    "triggered_rules",
    "expected_impact",
    "owners",
    "due_by",
    "confidence_band",
    "missing_data",
]


def validate_output_shape(rec: Dict[str, Any]) -> None:
    for key in REQUIRED_OUTPUT_KEYS:
        if key not in rec:
            raise ValueError(f"Missing output key: {key}")


def enforce_hard_constraints(rec: Dict[str, Any], candidates_index: Dict[str, Dict[str, Any]], ctx: Any) -> Dict[str, Any]:
    constrained, _ = enforce_hard_constraints_with_trace(rec, candidates_index, ctx)
    return constrained


def enforce_hard_constraints_with_trace(
    rec: Dict[str, Any], candidates_index: Dict[str, Dict[str, Any]], ctx: Any
) -> tuple[Dict[str, Any], List[Dict[str, Any]]]:
    checks: List[Dict[str, Any]] = []
    customs = ctx.payload.get("customs_compliance", {})
    clearance_status = customs.get("clearance_status", "UNKNOWN").upper()

    selected_id = rec.get("selected_action_id", "")
    ranked_ids = [str(item) for item in rec.get("ranked_action_ids", [])]

    if selected_id not in candidates_index:
        raise ValueError("selected_action_id is missing or not present in candidate set")

    invalid_ranked = [cid for cid in ranked_ids if cid not in candidates_index]
    if invalid_ranked:
        raise ValueError(f"ranked_action_ids contains unknown ids: {invalid_ranked}")

    checks.append({"check": "selected_in_candidates", "status": "pass", "details": selected_id})

    selected = candidates_index[selected_id]
    blocked_action_types = {"REROUTE_PORT", "SWITCH_CARRIER", "EXPEDITE_TERMINAL_SLOT"}

    if clearance_status != "CLEARED" and selected.get("action_type") in blocked_action_types:
        replacement_id = ""
        for candidate_id in ranked_ids:
            candidate = candidates_index.get(candidate_id)
            if not candidate:
                continue
            if candidate.get("action_type") in blocked_action_types:
                continue
            replacement_id = candidate_id
            break

        if replacement_id:
            rec["selected_action_id"] = replacement_id
            checks.append(
                {
                    "check": "customs_dispatch_block",
                    "status": "adjusted",
                    "details": f"selected_action_id adjusted from {selected_id} to {replacement_id} due to customs status {clearance_status}",
                }
            )
            selected_id = replacement_id
            selected = candidates_index[selected_id]
        else:
            raise ValueError("Selected action violates customs dispatch constraint while customs is uncleared")
    else:
        checks.append(
            {
                "check": "customs_dispatch_block",
                "status": "pass",
                "details": clearance_status,
            }
        )

    if not rec.get("owners"):
        raise ValueError("owners field is required in strict mode")
    checks.append({"check": "owners_present", "status": "pass", "details": "owners provided"})

    if not rec.get("due_by"):
        raise ValueError("due_by field is required in strict mode")
    checks.append({"check": "due_by_present", "status": "pass", "details": rec.get("due_by")})

    return rec, checks

