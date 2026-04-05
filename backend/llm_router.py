import json
import os
import threading
import hashlib
import time
import ssl
import urllib.error
import urllib.request
from typing import Any, Dict, List, Tuple

GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"
_DEFAULT_MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "qwen/qwen3-32b",
]

_model_lock = threading.Lock()
_model_cursor = 0
_key_lock = threading.Lock()
_key_cursor = 0


def _build_ssl_context() -> ssl.SSLContext:
    insecure = str(os.getenv("LLM_TLS_INSECURE", "")).strip().lower() in {"1", "true", "yes"}
    if insecure:
        return ssl._create_unverified_context()

    cafile = str(
        os.getenv("LLM_CA_BUNDLE", "")
        or os.getenv("SSL_CERT_FILE", "")
        or os.getenv("REQUESTS_CA_BUNDLE", "")
    ).strip()
    if cafile:
        return ssl.create_default_context(cafile=cafile)

    return ssl.create_default_context()


def _parse_response_json(content: str) -> Dict[str, Any]:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        parts = cleaned.split("```")
        if len(parts) >= 3:
            cleaned = parts[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()
    return json.loads(cleaned)


def _request_completion_content(
    messages: List[Dict[str, str]],
    model: str,
    key: str,
    temperature: float,
    timeout_seconds: int,
) -> str:
    ssl_context = _build_ssl_context()
    payload = {
        "model": model,
        "temperature": temperature,
        "messages": messages,
        "response_format": {"type": "json_object"},
    }
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        GROQ_ENDPOINT,
        data=data,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "bitsh-control-tower/1.0 (+https://localhost)",
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=timeout_seconds, context=ssl_context) as response:
        response_body = response.read().decode("utf-8")
        parsed = json.loads(response_body)

    return str(parsed["choices"][0]["message"]["content"])


def _repair_json_with_llm(
    invalid_content: str,
    model: str,
    key: str,
    timeout_seconds: int,
) -> Dict[str, Any]:
    repair_messages = [
        {
            "role": "system",
            "content": (
                "You are a JSON repair assistant. Return valid JSON object only. "
                "Do not add markdown, explanation, or extra keys."
            ),
        },
        {
            "role": "user",
            "content": (
                "Repair this malformed JSON to valid JSON object preserving intent:\n"
                f"{invalid_content}"
            ),
        },
    ]
    repaired_content = _request_completion_content(
        repair_messages,
        model=model,
        key=key,
        temperature=0.0,
        timeout_seconds=timeout_seconds,
    )
    return _parse_response_json(repaired_content)


def _configured_models() -> List[str]:
    raw = str(os.getenv("LLM_MODEL_ROTATION", "")).strip()
    if raw:
        models = [item.strip() for item in raw.split(",") if item.strip()]
        if models:
            return models

    single = str(os.getenv("GROQ_MODEL", "")).strip()
    if single:
        return [single]

    return list(_DEFAULT_MODELS)


def _configured_api_keys(primary_key: str = "") -> List[str]:
    keys: List[str] = []
    if primary_key.strip():
        keys.append(primary_key.strip())

    raw_many = str(os.getenv("LLM_API_KEYS", "")).strip()
    if raw_many:
        keys.extend([item.strip() for item in raw_many.split(",") if item.strip()])

    env_single = str(os.getenv("GROQ_API_KEY", "")).strip()
    if env_single:
        keys.append(env_single)

    unique: List[str] = []
    seen = set()
    for key in keys:
        if key not in seen:
            seen.add(key)
            unique.append(key)
    return unique


def _rotate_order(models: List[str]) -> List[str]:
    global _model_cursor
    with _model_lock:
        if not models:
            return []
        start = _model_cursor % len(models)
        _model_cursor = (_model_cursor + 1) % len(models)
    return models[start:] + models[:start]


def _rotate_keys(keys: List[str]) -> List[str]:
    global _key_cursor
    with _key_lock:
        if not keys:
            return []
        start = _key_cursor % len(keys)
        _key_cursor = (_key_cursor + 1) % len(keys)
    return keys[start:] + keys[:start]


def has_llm_credentials(primary_key: str = "") -> bool:
    return len(_configured_api_keys(primary_key)) > 0


def _key_fingerprint(key: str) -> str:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return digest[:10]


def llm_status(primary_key: str = "") -> Dict[str, Any]:
    keys = _configured_api_keys(primary_key)
    models = _configured_models()
    return {
        "credentialsConfigured": len(keys) > 0,
        "apiKeyCount": len(keys),
        "apiKeyFingerprints": [_key_fingerprint(k) for k in keys],
        "models": models,
        "modelCount": len(models),
    }


def call_llm_with_rotation(
    messages: List[Dict[str, str]],
    api_key: str,
    temperature: float = 0.1,
    timeout_seconds: int = 45,
) -> Tuple[Dict[str, Any], str]:
    keys = _configured_api_keys(api_key)
    if not keys:
        raise ValueError("Missing LLM credentials. Set GROQ_API_KEY or LLM_API_KEYS")

    models = _configured_models()
    if not models:
        raise ValueError("No LLM models configured")

    ordered_models = list(models)
    ordered_keys = _rotate_keys(keys)
    failures: List[str] = []
    unauthorized_key_count = 0
    rate_limit_hits = 0

    for key_index, key in enumerate(ordered_keys, start=1):
        key_is_unauthorized = False
        for model in ordered_models:
            try:
                content = _request_completion_content(
                    messages,
                    model=model,
                    key=key,
                    temperature=temperature,
                    timeout_seconds=timeout_seconds,
                )
                try:
                    return _parse_response_json(content), model
                except json.JSONDecodeError:
                    repaired = _repair_json_with_llm(
                        str(content),
                        model=model,
                        key=key,
                        timeout_seconds=timeout_seconds,
                    )
                    return repaired, model
            except urllib.error.HTTPError as exc:
                body_text = ""
                try:
                    body_bytes = exc.read()
                    if body_bytes:
                        body_text = body_bytes.decode("utf-8", errors="ignore").strip()
                except Exception:
                    body_text = ""

                body_fragment = f":{body_text[:220]}" if body_text else ""
                failures.append(f"key#{key_index}:{model}:HTTPError:{exc.code}:{exc.reason}{body_fragment}")
                if exc.code in (401, 403):
                    key_is_unauthorized = True
                    break
                if exc.code == 429:
                    rate_limit_hits += 1
                    retry_after_raw = exc.headers.get("Retry-After", "") if exc.headers else ""
                    try:
                        retry_after = float(retry_after_raw)
                    except (TypeError, ValueError):
                        retry_after = 0.0
                    backoff_seconds = max(retry_after, min(2.0 * (2 ** min(rate_limit_hits, 2)), 8.0))
                    time.sleep(backoff_seconds)
                continue
            except Exception as exc:
                failures.append(f"key#{key_index}:{model}:{type(exc).__name__}:{exc}")
                continue

        if key_is_unauthorized:
            unauthorized_key_count += 1

    if unauthorized_key_count == len(ordered_keys):
        sample = " | ".join(failures[:3])
        raise RuntimeError(
            "All configured API keys were rejected (401/403). "
            "Verify GROQ_API_KEY/LLM_API_KEYS and key permissions for selected models. "
            f"sample={sample}"
        )

    summary = " | ".join(failures[:6])
    raise RuntimeError(
        "All LLM attempts failed across keys/models. "
        f"attempts={len(failures)} details={summary}"
    )
