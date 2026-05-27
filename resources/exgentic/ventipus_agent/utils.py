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


def safe_id(value: Any, default: str = "session") -> str:
    raw = str(value or default)
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "-", raw).strip("-")
    return safe or default


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
