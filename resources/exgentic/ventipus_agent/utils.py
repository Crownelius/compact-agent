"""Stdlib helpers for the ventipus Exgentic adapter."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any


SECRET_REPLACEMENTS = [
    (re.compile(r"sk-or-v1-[A-Za-z0-9_-]+"), "sk-or-v1-[REDACTED]"),
    (re.compile(r"sk-[A-Za-z0-9_-]{16,}"), "sk-[REDACTED]"),
    (re.compile(r"hf_[A-Za-z0-9]{16,}"), "hf_[REDACTED]"),
    (re.compile(r"KGAT_[A-Za-z0-9]{16,}"), "KGAT_[REDACTED]"),
    (re.compile(r"npm_[A-Za-z0-9]{16,}"), "npm_[REDACTED]"),
]


@dataclass(frozen=True)
class ActionPayload:
    """Machine-readable action selected by ventipus."""

    name: str
    arguments: dict[str, Any]


def redact(value: Any) -> str:
    text = str(value or "")
    for pattern, replacement in SECRET_REPLACEMENTS:
        text = pattern.sub(replacement, text)
    return text


def truncate(value: Any, limit: int = 80000) -> str:
    text = redact(value)
    if len(text) <= limit:
        return text
    omitted = len(text) - limit
    return text[:limit] + f"\n...[truncated {omitted} chars]"


def json_dumps(value: Any, *, limit: int = 80000) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True, default=str)
    except Exception:
        text = str(value)
    return truncate(text, limit=limit)


def fold_exgentic_history(
    history: list[dict[str, Any]],
    *,
    profile: str = "generic",
    max_items: int = 16,
    item_limit: int = 1200,
) -> dict[str, Any]:
    """Build a compact task-relevant ledger for long Exgentic sessions.

    The adapter keeps the full raw history in memory. This folded view is what
    goes back into the next model call, so noisy stdout does not crowd out the
    latest app state, policy evidence, source evidence, or selected actions.
    """

    observations: list[dict[str, Any]] = []
    actions: list[dict[str, Any]] = []
    diagnostics: list[dict[str, Any]] = []
    action_counts: dict[str, int] = {}

    for idx, item in enumerate(history or [], start=1):
        role = str(item.get("role", ""))
        if role == "observation":
            observations.append(
                {
                    "turn": idx,
                    "summary": truncate(json_dumps(item.get("content"), limit=item_limit), limit=item_limit),
                }
            )
        elif role == "selected_action":
            compact_actions = _compact_selected_actions(item.get("content"), item_limit=item_limit)
            for action in compact_actions:
                name = action.get("name") or "unknown"
                action_counts[name] = action_counts.get(name, 0) + 1
            actions.append({"turn": idx, "actions": compact_actions})
        elif role == "ventipus":
            diagnostic = _compact_ventipus_diagnostic(item, item_limit=item_limit)
            if diagnostic is not None:
                diagnostics.append({"turn": idx, **diagnostic})

    latest_observation = observations[-1] if observations else None
    latest_action = actions[-1] if actions else None
    return {
        "format": "ventipus-exgentic-folded-history-v1",
        "profile": profile,
        "turns_seen": len(history or []),
        "latest_observation": latest_observation,
        "latest_action": latest_action,
        "recent_observations": observations[-max_items:],
        "recent_actions": actions[-max_items:],
        "diagnostics": diagnostics[-max_items:],
        "action_counts": action_counts,
        "discipline": _folding_discipline(profile),
    }


def safe_id(value: Any, default: str = "session") -> str:
    raw = str(value or default)
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "-", raw).strip("-")
    return safe or default


def _compact_selected_actions(value: Any, *, item_limit: int) -> list[dict[str, Any]]:
    actions = value if isinstance(value, list) else [value]
    compact: list[dict[str, Any]] = []
    for action in actions:
        if not isinstance(action, dict):
            compact.append({"name": "unknown", "summary": truncate(action, limit=item_limit)})
            continue
        raw_args = action.get("arguments", {})
        args = raw_args if isinstance(raw_args, dict) else {"value": raw_args}
        compact.append(
            {
                "name": str(action.get("name") or "unknown"),
                "argument_keys": sorted(str(key) for key in args.keys()),
                "arguments": truncate(json_dumps(args, limit=item_limit), limit=item_limit),
            }
        )
    return compact


def _compact_ventipus_diagnostic(item: dict[str, Any], *, item_limit: int) -> dict[str, Any] | None:
    returncode = item.get("returncode")
    stderr = str(item.get("stderr") or "")
    stdout = str(item.get("stdout") or "")
    text = "\n".join(part for part in [stderr, stdout] if part)
    if returncode in (None, 0) and not re.search(
        r"\b(error|invalid|unknown action|schema|malformed|permission|timed out|timeout|failed)\b",
        text,
        flags=re.IGNORECASE,
    ):
        return None
    return {
        "returncode": returncode,
        "evidence": truncate(text, limit=item_limit),
    }


def _folding_discipline(profile: str) -> str:
    if profile == "appworld":
        return "Use latest_observation as authoritative app/API state; preserve IDs, dates, permissions, and record integrity."
    if profile == "browsecomp":
        return "Carry forward verified sources and unresolved search facets; do not treat snippets or stale single-source claims as final evidence."
    if profile == "tau2":
        return "Carry forward policy constraints, customer intent, tool results, and pending confirmations before selecting the next action."
    return "Use the folded ledger as orientation, then rely on the latest observation and available action schemas for the next action."


def extract_action_payload(text: str) -> ActionPayload | None:
    """Return the last valid action payload from ventipus output.

    Supported shapes:
      {"name": "finish", "arguments": {"answer": "..."}}
      {"action": "finish", "arguments": {"answer": "..."}}
      {"action": {"name": "finish", "arguments": {"answer": "..."}}}
    """

    for candidate in reversed(_json_candidates(text)):
        payload = _coerce_action_payload(candidate)
        if payload is not None:
            return payload
    return None


def _json_candidates(text: str) -> list[Any]:
    candidates: list[Any] = []

    for block in re.findall(r"```(?:json|JSON)?\s*(.*?)```", text or "", flags=re.DOTALL):
        value = _parse_json(block.strip())
        if value is not None:
            candidates.append(value)

    marker_re = re.compile(r"ventipus-exgentic action JSON\s*:\s*(\{.*?\})\s*$", re.IGNORECASE | re.DOTALL)
    marker = marker_re.search(text or "")
    if marker:
        value = _parse_json(marker.group(1))
        if value is not None:
            candidates.append(value)

    decoder = json.JSONDecoder()
    for match in re.finditer(r"\{", text or ""):
        try:
            value, _ = decoder.raw_decode(text[match.start() :])
        except Exception:
            continue
        candidates.append(value)

    return candidates


def _parse_json(text: str) -> Any | None:
    try:
        return json.loads(text)
    except Exception:
        return None


def _coerce_action_payload(value: Any) -> ActionPayload | None:
    if not isinstance(value, dict):
        return None

    nested = value.get("action")
    if isinstance(nested, dict):
        nested_args = nested.get("arguments")
        if nested_args is None:
            nested_args = nested.get("args")
        value = {
            "name": nested.get("name") or nested.get("action") or nested.get("tool"),
            "arguments": nested_args,
        }

    name = value.get("name") or value.get("action") or value.get("tool")
    if not isinstance(name, str) or not name.strip():
        return None

    arguments = value.get("arguments")
    if arguments is None:
        arguments = value.get("args")
    if arguments is None:
        arguments = value.get("action_input")
    if arguments is None:
        arguments = {}
    if not isinstance(arguments, dict):
        arguments = {"value": arguments}

    return ActionPayload(name=name.strip(), arguments=arguments)
