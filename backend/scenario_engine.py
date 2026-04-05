import json
from dataclasses import asdict, dataclass, field
from typing import Any, Callable, Dict, List


@dataclass
class ScenarioSpec:
    raw_text: str
    delay_hours: float = 0.0
    wait_hours: float = 0.0
    preferred_carrier: str = ""
    blocked_modes: List[str] = field(default_factory=list)
    blocked_regions: List[str] = field(default_factory=list)
    route_preference: str = "FASTEST"
    confidence: str = "LOW"
    unresolved_constraints: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        payload = asdict(self)
        payload["blocked_modes"] = [m.upper() for m in self.blocked_modes]
        payload["blocked_regions"] = [r.upper() for r in self.blocked_regions]
        payload["route_preference"] = self.route_preference.upper()
        payload["confidence"] = self.confidence.upper()
        return payload


def build_scenario_parse_messages(text: str) -> List[Dict[str, str]]:
    contract = {
        "delay_hours": "float",
        "wait_hours": "float",
        "preferred_carrier": "string",
        "blocked_modes": ["OCEAN", "RAIL", "TRUCK", "AIR", "COASTAL"],
        "blocked_regions": ["APAC", "EU", "NA", "MEA", "LATAM", "AFRICA"],
        "route_preference": "FASTEST|CHEAPEST|LOWEST_RISK|AVOID_TRANSSHIPMENT",
        "confidence": "HIGH|MEDIUM|LOW",
        "unresolved_constraints": ["string"],
    }

    system_prompt = (
        "You are a logistics scenario parser. Convert free-text scenario intent into strict JSON only. "
        "Do not add prose. Use the provided contract keys exactly."
    )
    user_prompt = (
        "Parse the scenario text into strict JSON with this contract. "
        "If any detail is ambiguous, keep the field default and add a note in unresolved_constraints.\n\n"
        f"Contract: {json.dumps(contract)}\n\n"
        f"Scenario text: {text}"
    )
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def build_scenario_validate_messages(raw_text: str, scenario_payload: Dict[str, Any]) -> List[Dict[str, str]]:
    contract = {
        "actionable": "boolean",
        "confidence": "HIGH|MEDIUM|LOW",
        "missing_fields": ["string"],
        "contradictions": ["string"],
        "clarification_questions": ["string"],
        "reason": "string",
    }

    system_prompt = (
        "You are a strict scenario quality validator for logistics what-if simulation. "
        "Evaluate if the parsed scenario is actionable and safe to execute. Return strict JSON only."
    )
    user_prompt = (
        "Validate this scenario and return JSON with the contract. "
        "If ambiguous, return actionable=false and include clarification questions.\n\n"
        f"Contract: {json.dumps(contract)}\n\n"
        f"Raw scenario text: {raw_text}\n\n"
        f"Parsed scenario JSON: {json.dumps(scenario_payload)}"
    )
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def build_scenario_resolution_messages(
    raw_text: str,
    scenario_payload: Dict[str, Any],
    shipment_context: Dict[str, Any],
) -> List[Dict[str, str]]:
    contract = {
        "delay_hours": "float",
        "wait_hours": "float",
        "preferred_carrier": "string",
        "blocked_modes": ["OCEAN", "RAIL", "TRUCK", "AIR", "COASTAL"],
        "blocked_regions": ["APAC", "EU", "NA", "MEA", "LATAM", "AFRICA"],
        "route_preference": "FASTEST|CHEAPEST|LOWEST_RISK|AVOID_TRANSSHIPMENT",
        "confidence": "HIGH|MEDIUM|LOW",
        "assumptions": ["string"],
        "clarification_questions": ["string"],
        "reason": "string",
    }

    system_prompt = (
        "You are a logistics scenario resolver. Build a usable quantified scenario from ambiguous user text "
        "using shipment context and operational signals. Return strict JSON only."
    )
    user_prompt = (
        "Resolve ambiguity by making explicit, minimal assumptions grounded in provided shipment context. "
        "The output must be directly runnable for simulation and include clarification questions for the user.\n\n"
        f"Contract: {json.dumps(contract)}\n\n"
        f"Raw scenario text: {raw_text}\n\n"
        f"Parsed scenario JSON: {json.dumps(scenario_payload)}\n\n"
        f"Shipment context: {json.dumps(shipment_context)}"
    )
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def parse_scenario_text(
    text: str,
    api_key: str,
    llm_call: Callable[[List[Dict[str, str]], str], Dict[str, Any]],
) -> ScenarioSpec:
    stripped = text.strip()
    if not stripped:
        raise ValueError("Scenario text cannot be empty")

    parsed = llm_call(build_scenario_parse_messages(stripped), api_key)
    spec = ScenarioSpec(
        raw_text=stripped,
        delay_hours=float(parsed.get("delay_hours", 0) or 0),
        wait_hours=float(parsed.get("wait_hours", 0) or 0),
        preferred_carrier=str(parsed.get("preferred_carrier", "") or "").upper(),
        blocked_modes=[str(x).upper() for x in parsed.get("blocked_modes", []) if str(x).strip()],
        blocked_regions=[str(x).upper() for x in parsed.get("blocked_regions", []) if str(x).strip()],
        route_preference=str(parsed.get("route_preference", "FASTEST") or "FASTEST").upper(),
        confidence=str(parsed.get("confidence", "MEDIUM") or "MEDIUM").upper(),
        unresolved_constraints=[str(x) for x in parsed.get("unresolved_constraints", [])],
    )
    return spec


VALID_CONFIDENCE = {"HIGH", "MEDIUM", "LOW"}


def validate_scenario_with_llm(
    spec: ScenarioSpec,
    api_key: str,
    llm_call: Callable[[List[Dict[str, str]], str], Dict[str, Any]],
) -> Dict[str, Any]:
    response = llm_call(build_scenario_validate_messages(spec.raw_text, spec.to_dict()), api_key)
    actionable = bool(response.get("actionable", True))
    confidence = str(response.get("confidence", spec.confidence) or spec.confidence).upper()
    if confidence not in VALID_CONFIDENCE:
        confidence = spec.confidence.upper()

    return {
        "actionable": actionable,
        "confidence": confidence,
        "missing_fields": [str(x) for x in response.get("missing_fields", [])],
        "contradictions": [str(x) for x in response.get("contradictions", [])],
        "clarification_questions": [str(x) for x in response.get("clarification_questions", [])],
        "reason": str(response.get("reason", "LLM semantic validation complete")),
    }


def hybrid_scenario_actionability(
    spec: ScenarioSpec,
    api_key: str,
    llm_call: Callable[[List[Dict[str, str]], str], Dict[str, Any]],
    min_confidence: str = "MEDIUM",
) -> tuple[bool, List[str], List[str], Dict[str, Any]]:
    llm_validation = validate_scenario_with_llm(spec, api_key, llm_call)

    merged_reasons: List[str] = []
    merged_questions: List[str] = list(llm_validation.get("clarification_questions", []))

    missing_fields = llm_validation.get("missing_fields", [])
    contradictions = llm_validation.get("contradictions", [])
    if missing_fields:
        merged_reasons.append(f"LLM flagged missing fields: {missing_fields}")
    if contradictions:
        merged_reasons.append(f"LLM flagged contradictions: {contradictions}")

    llm_conf = str(llm_validation.get("confidence", spec.confidence)).upper()
    llm_conf_ok = llm_conf in VALID_CONFIDENCE
    if not llm_conf_ok:
        merged_reasons.append(f"LLM returned unsupported confidence value: {llm_conf}")

    llm_actionable = bool(llm_validation.get("actionable", True))
    if not llm_actionable:
        merged_reasons.append(str(llm_validation.get("reason", "LLM marked scenario as non-actionable")))

    is_actionable = llm_actionable and llm_conf_ok and not missing_fields and not contradictions
    validation_meta = {
        "schema_ok": True,
        "llm_actionable": llm_actionable,
        "llm_confidence": llm_conf,
        "required_confidence": "LLM_DECIDES",
        "llm_reason": llm_validation.get("reason", ""),
        "missing_fields": missing_fields,
        "contradictions": contradictions,
        "clarification_questions": merged_questions,
    }

    return is_actionable, merged_reasons, merged_questions, validation_meta


def resolve_scenario_with_assumptions(
    spec: ScenarioSpec,
    shipment_context: Dict[str, Any],
    api_key: str,
    llm_call: Callable[[List[Dict[str, str]], str], Dict[str, Any]],
) -> tuple[ScenarioSpec, Dict[str, Any]]:
    response = llm_call(
        build_scenario_resolution_messages(spec.raw_text, spec.to_dict(), shipment_context),
        api_key,
    )

    resolved = ScenarioSpec(
        raw_text=spec.raw_text,
        delay_hours=float(response.get("delay_hours", spec.delay_hours) or spec.delay_hours),
        wait_hours=float(response.get("wait_hours", spec.wait_hours) or spec.wait_hours),
        preferred_carrier=str(response.get("preferred_carrier", spec.preferred_carrier) or spec.preferred_carrier).upper(),
        blocked_modes=[str(x).upper() for x in response.get("blocked_modes", spec.blocked_modes) if str(x).strip()],
        blocked_regions=[str(x).upper() for x in response.get("blocked_regions", spec.blocked_regions) if str(x).strip()],
        route_preference=str(response.get("route_preference", spec.route_preference) or spec.route_preference).upper(),
        confidence=str(response.get("confidence", spec.confidence) or spec.confidence).upper(),
        unresolved_constraints=list(spec.unresolved_constraints),
    )

    if resolved.confidence not in VALID_CONFIDENCE:
        resolved.confidence = "MEDIUM"

    assumptions = [str(item).strip() for item in response.get("assumptions", []) if str(item).strip()]
    clarification_questions = [
        str(item).strip() for item in response.get("clarification_questions", []) if str(item).strip()
    ]
    reason = str(response.get("reason", "Ambiguous scenario resolved with context-based assumptions.")).strip()

    meta = {
        "assumptions": assumptions,
        "clarification_questions": clarification_questions,
        "reason": reason,
        "confidence": resolved.confidence,
    }
    return resolved, meta


def estimate_scenario_impacts(ctx: Any, scenario: ScenarioSpec) -> Dict[str, float]:
    finance = ctx.payload.get("erp_finance", {})
    base_sla = float(finance.get("sla_breach_probability_pct", "50") or 50)
    base_demurrage = float(finance.get("demurrage_accrual_usd", "0") or 0)

    delay_pressure = (scenario.delay_hours * 1.2) + (scenario.wait_hours * 1.0)
    scenario_sla = max(0.0, min(100.0, base_sla + delay_pressure))

    demurrage_per_hour = 22.0
    scenario_demurrage = base_demurrage + (scenario.wait_hours * demurrage_per_hour)

    return {
        "base_sla_breach_probability_pct": round(base_sla, 2),
        "scenario_sla_breach_probability_pct": round(scenario_sla, 2),
        "sla_probability_delta_pct": round(scenario_sla - base_sla, 2),
        "base_demurrage_usd": round(base_demurrage, 2),
        "scenario_demurrage_usd": round(scenario_demurrage, 2),
        "demurrage_delta_usd": round(scenario_demurrage - base_demurrage, 2),
    }
