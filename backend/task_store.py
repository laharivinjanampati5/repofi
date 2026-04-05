from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List


TASK_STORE_NAME = "action_tasks.json"
VALID_STATUSES = {"pending", "in-progress", "completed", "escalated"}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _task_store_path(root_dir: Path) -> Path:
    return (root_dir / "logs" / TASK_STORE_NAME).resolve()


def load_tasks(root_dir: Path) -> List[Dict[str, Any]]:
    path = _task_store_path(root_dir)
    if not path.exists():
        return []

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []

    if not isinstance(data, list):
        return []

    return [item for item in data if isinstance(item, dict)]


def save_tasks(root_dir: Path, tasks: List[Dict[str, Any]]) -> Path:
    path = _task_store_path(root_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(tasks, ensure_ascii=True, indent=2), encoding="utf-8")
    return path


def ensure_tasks_seeded(root_dir: Path, seed_tasks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    existing = load_tasks(root_dir)
    if existing:
        return existing

    save_tasks(root_dir, seed_tasks)
    return seed_tasks


def upsert_task(root_dir: Path, task: Dict[str, Any]) -> Dict[str, Any]:
    tasks = load_tasks(root_dir)
    now = _utc_now_iso()

    match = next(
        (
            item
            for item in tasks
            if item.get("relatedShipment") == task.get("relatedShipment")
            and item.get("actionId") == task.get("actionId")
        ),
        None,
    )

    if match is not None:
        match.update(task)
        match["updatedAt"] = now
    else:
        item = dict(task)
        item.setdefault("createdAt", now)
        item["updatedAt"] = now
        tasks.append(item)
        match = item

    save_tasks(root_dir, tasks)
    return match


def update_task_status(root_dir: Path, task_id: str, status: str) -> Dict[str, Any] | None:
    normalized = status.strip().lower()
    if normalized not in VALID_STATUSES:
        raise ValueError(f"Unsupported task status: {status}")

    tasks = load_tasks(root_dir)
    for task in tasks:
        if task.get("id") == task_id:
            task["status"] = normalized
            task["updatedAt"] = _utc_now_iso()
            save_tasks(root_dir, tasks)
            return task

    return None
