"""Stdlib helpers for the ventipus Exgentic adapter."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any


SECRET_REPLACEMENTS = [
    (re.compile(r"sk-or-v1-[A-Za-z0-9_-]+"), "sk-or-v1-[REDACTED]"),
    (re.compile(r"sk-[A-Za-z0-9_-]{16,}"), "sk-[REDACTED]"),
    (re.compile(r"hf_[A-Za-z0-9]{16,}"), "hf_[REDACTED]"),
    (re.compile(r"KGAT_[A-Za-z0-9]{16,}"), "KGAT_[REDACTED]"),
    (re.compile(r"npm_[A-Za-z0-9]{16,}"), "npm_[REDACTED]"),
]

STOPWORDS = {
    "about",
    "after",
    "again",
    "also",
    "and",
    "any",
    "are",
    "available",
    "been",
    "before",
    "being",
    "can",
    "context",
    "could",
    "current",
    "does",
    "for",
    "from",
    "has",
    "have",
    "into",
    "latest",
    "need",
    "needs",
    "not",
    "observation",
    "only",
    "requested",
    "should",
    "task",
    "that",
    "the",
    "then",
    "this",
    "use",
    "user",
    "with",
    "you",
}


@dataclass(frozen=True)
class ActionPayload:
    """Machine-readable action selected by ventipus."""

    name: str
    arguments: dict[str, Any]


@dataclass(frozen=True)
class ActionRepairResult:
    """Deterministic repair result for benchmark action JSON."""

    payload: ActionPayload
    changed: bool
    diagnostics: dict[str, Any]


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
        elif role == "action_repair":
            diagnostics.append(
                {
                    "turn": idx,
                    "kind": "action_repair",
                    "evidence": truncate(json_dumps(item.get("content"), limit=item_limit), limit=item_limit),
                }
            )

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


def repair_exgentic_action_payload(
    payload: ActionPayload,
    action_docs: list[dict[str, Any]],
) -> ActionRepairResult:
    """Repair near-miss action names and argument keys before ActionType build.

    This is intentionally deterministic and conservative. It fixes common model
    output drift such as camelCase action names, case-only mismatches, and
    schema-key casing/separator mistakes, while leaving unresolved names intact
    so the caller can still fail or fallback explicitly.
    """

    docs = [doc for doc in action_docs or [] if isinstance(doc, dict) and doc.get("name")]
    matched_doc, match_reason, match_score = _resolve_action_doc(payload.name, docs)
    repaired_name = str(matched_doc.get("name")) if matched_doc else payload.name
    repaired_args, arg_diagnostics = _repair_action_arguments(
        payload.arguments,
        matched_doc.get("arguments_schema") if matched_doc else None,
    )

    changed = repaired_name != payload.name or repaired_args != payload.arguments
    if matched_doc is None:
        status = "unresolved_action_name"
    elif changed:
        status = "repaired"
    else:
        status = "unchanged"

    diagnostics = {
        "status": status,
        "original_name": payload.name,
        "repaired_name": repaired_name,
        "name_match_reason": match_reason,
        "name_match_score": round(match_score, 3),
        **arg_diagnostics,
    }
    return ActionRepairResult(
        payload=ActionPayload(name=repaired_name, arguments=repaired_args),
        changed=changed,
        diagnostics=diagnostics,
    )


def shortlist_exgentic_actions(
    action_docs: list[dict[str, Any]],
    *,
    task: Any = None,
    context: Any = None,
    history: list[dict[str, Any]] | None = None,
    profile: str = "generic",
    limit: int = 8,
) -> dict[str, Any]:
    """Rank available actions into a compact shortlist for the next step.

    Exgentic still receives the full action schema list below this shortlist.
    The shortlist is a deterministic scaffold: it narrows attention to likely
    actions and finish/message timing without hiding benchmark capabilities.
    """

    docs = [doc for doc in action_docs or [] if isinstance(doc, dict) and doc.get("name")]
    safe_limit = max(1, min(16, int(limit or 8)))
    latest_observation = _latest_history_content(history or [], "observation")
    latest_observation_text = json_dumps(latest_observation, limit=6000) if latest_observation is not None else ""
    target_text = " ".join(
        [
            str(task or ""),
            json_dumps(context or {}, limit=6000),
            latest_observation_text,
        ]
    ).lower()
    tokens = _keyword_tokens(target_text)
    completion_ready = _completion_ready(latest_observation_text)
    latest_action_name = _latest_selected_action_name(history or [])
    has_recent_error = _has_recent_action_error(history or [])

    scored: list[tuple[float, str, dict[str, Any], list[str], list[str]]] = []
    for doc in docs:
        name = str(doc.get("name") or "")
        action_text = _action_doc_text(doc)
        schema_keys = _schema_property_keys(doc.get("arguments_schema"))
        score = 0.0
        reasons: list[str] = []

        token_hits = [token for token in tokens if token in action_text][:6]
        if token_hits:
            score += min(12, len(token_hits) * 2)
            reasons.append(f"matches task/observation tokens: {', '.join(token_hits)}")

        schema_hits = [key for key in schema_keys if key.lower() in target_text][:6]
        if schema_hits:
            score += min(10, len(schema_hits) * 2)
            reasons.append(f"schema keys appear in current state: {', '.join(schema_hits)}")

        prior_score, prior_reason = _profile_action_prior(profile, name, action_text)
        if prior_score:
            score += prior_score
            reasons.append(prior_reason)

        name_tokens = [token for token in _keyword_tokens(name.replace("_", " ")) if token not in {"action"}]
        if name_tokens and all(token in latest_observation_text.lower() for token in name_tokens):
            score += 4
            reasons.append("action name matches explicit latest-observation cue")

        is_completion = bool(doc.get("is_finish") or doc.get("is_message"))
        if is_completion:
            if completion_ready:
                score += 8
                reasons.append("latest observation suggests completion is ready")
            else:
                score -= 7
                reasons.append("defer finish/message until benchmark-visible completion evidence")

        if latest_action_name and name.lower() == latest_action_name.lower():
            score -= 2
            reasons.append("same as previous selected action")
            if has_recent_error:
                score -= 4
                reasons.append("avoid repeating after recent action/schema error")

        scored.append((score, name.lower(), doc, reasons, schema_keys))

    scored.sort(key=lambda item: (-item[0], item[1]))
    shortlisted = [
        _shortlist_item(doc, score, reasons, schema_keys)
        for score, _name, doc, reasons, schema_keys in scored[:safe_limit]
    ]
    shortlisted_names = {str(item.get("name", "")).lower() for item in shortlisted}
    deferred_completion = [
        str(doc.get("name"))
        for doc in docs
        if (doc.get("is_finish") or doc.get("is_message"))
        and str(doc.get("name", "")).lower() not in shortlisted_names
        and not completion_ready
    ]

    return {
        "format": "ventipus-exgentic-action-shortlist-v1",
        "profile": profile,
        "action_count": len(docs),
        "shortlist_limit": safe_limit,
        "completion_ready": completion_ready,
        "shortlisted_actions": shortlisted,
        "deferred_completion_actions": deferred_completion,
        "discipline": "Prefer shortlisted actions when they fit the latest observation; use full schemas below if the current state clearly requires a non-shortlisted action.",
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


def _resolve_action_doc(
    name: str,
    docs: list[dict[str, Any]],
) -> tuple[dict[str, Any] | None, str, float]:
    raw = str(name or "")
    if not raw:
        return None, "empty", 0.0

    for doc in docs:
        candidate = str(doc.get("name") or "")
        if candidate == raw:
            return doc, "exact", 1.0

    lowered = raw.lower()
    for doc in docs:
        candidate = str(doc.get("name") or "")
        if candidate.lower() == lowered:
            return doc, "case_insensitive", 1.0

    normalized = _normalized_identifier(raw)
    for doc in docs:
        candidate = str(doc.get("name") or "")
        if _normalized_identifier(candidate) == normalized:
            return doc, "normalized_identifier", 1.0

    best_doc: dict[str, Any] | None = None
    best_score = 0.0
    second_score = 0.0
    for doc in docs:
        candidate = str(doc.get("name") or "")
        candidate_norm = _normalized_identifier(candidate)
        score = SequenceMatcher(None, normalized, candidate_norm).ratio() if normalized and candidate_norm else 0.0
        if normalized and candidate_norm and (normalized in candidate_norm or candidate_norm in normalized):
            score = max(score, 0.82)
        if score > best_score:
            second_score = best_score
            best_score = score
            best_doc = doc
        elif score > second_score:
            second_score = score

    if best_doc is not None and best_score >= 0.82 and best_score - second_score >= 0.04:
        return best_doc, "fuzzy_identifier", best_score
    return None, "unresolved", best_score


def _repair_action_arguments(
    arguments: dict[str, Any],
    schema: Any,
) -> tuple[dict[str, Any], dict[str, Any]]:
    args = dict(arguments or {})
    schema_keys = _schema_property_keys(schema)
    if not schema_keys:
        return args, {
            "argument_key_repairs": [],
            "dropped_argument_keys": [],
            "schema_keys": [],
        }

    key_by_normalized = {_normalized_identifier(key): key for key in schema_keys}
    repaired: dict[str, Any] = {}
    key_repairs: list[dict[str, str]] = []
    dropped: list[str] = []

    for key, value in args.items():
        text_key = str(key)
        if text_key in schema_keys:
            repaired[text_key] = value
            continue
        canonical = key_by_normalized.get(_normalized_identifier(text_key))
        if canonical is not None:
            repaired[canonical] = value
            key_repairs.append({"from": text_key, "to": canonical})
        else:
            dropped.append(text_key)

    return repaired, {
        "argument_key_repairs": key_repairs,
        "dropped_argument_keys": dropped,
        "schema_keys": schema_keys[:24],
    }


def _normalized_identifier(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def _latest_history_content(history: list[dict[str, Any]], role: str) -> Any | None:
    for item in reversed(history or []):
        if isinstance(item, dict) and item.get("role") == role:
            return item.get("content")
    return None


def _latest_selected_action_name(history: list[dict[str, Any]]) -> str | None:
    content = _latest_history_content(history, "selected_action")
    actions = content if isinstance(content, list) else [content]
    for action in actions:
        if isinstance(action, dict) and action.get("name"):
            return str(action.get("name"))
    return None


def _has_recent_action_error(history: list[dict[str, Any]]) -> bool:
    for item in reversed((history or [])[-4:]):
        if not isinstance(item, dict) or item.get("role") != "ventipus":
            continue
        diagnostic = _compact_ventipus_diagnostic(item, item_limit=600)
        if diagnostic is not None:
            return True
    return False


def _keyword_tokens(text: str) -> list[str]:
    seen: set[str] = set()
    tokens: list[str] = []
    for raw in re.findall(r"[A-Za-z][A-Za-z0-9_-]{2,}", text or ""):
        token = raw.lower().strip("-_")
        if token in STOPWORDS or len(token) < 3 or token in seen:
            continue
        seen.add(token)
        tokens.append(token)
        if len(tokens) >= 80:
            break
    return tokens


def _completion_ready(latest_observation_text: str) -> bool:
    text = (latest_observation_text or "").lower()
    if not text:
        return False
    if re.search(r"\b(pending|missing|need|needs|required|error|failed|invalid|not complete|unresolved)\b", text):
        return False
    return bool(re.search(r"\b(done|complete|completed|success|succeeded|confirmed|final answer|resolved)\b", text))


def _action_doc_text(doc: dict[str, Any]) -> str:
    parts = [
        str(doc.get("name") or ""),
        str(doc.get("description") or ""),
        " ".join(_schema_property_keys(doc.get("arguments_schema"))),
        json_dumps(doc.get("arguments_schema") or {}, limit=4000),
    ]
    return " ".join(parts).lower()


def _schema_property_keys(schema: Any) -> list[str]:
    if not isinstance(schema, dict):
        return []
    keys: list[str] = []
    properties = schema.get("properties")
    if isinstance(properties, dict):
        keys.extend(str(key) for key in properties.keys())
    for nested_key in ("$defs", "definitions"):
        nested = schema.get(nested_key)
        if isinstance(nested, dict):
            for value in nested.values():
                keys.extend(_schema_property_keys(value))
    seen: set[str] = set()
    deduped: list[str] = []
    for key in keys:
        lowered = key.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        deduped.append(key)
    return deduped


def _profile_action_prior(profile: str, name: str, action_text: str) -> tuple[float, str]:
    text = f"{name} {action_text}".lower()
    if profile == "appworld":
        if re.search(r"\b(get|lookup|list|search|find|query|read|fetch|load|inspect)\b", text):
            return 5, "AppWorld prior: inspect app/API state before mutating records"
        if re.search(r"\b(create|update|set|delete|cancel|submit|send)\b", text):
            return 3, "AppWorld prior: likely state-changing app action"
    elif profile == "browsecomp":
        if re.search(r"\b(search|query|browse|web|open|read|fetch|source|cite|visit)\b", text):
            return 6, "BrowseComp prior: gather and verify source evidence"
        if re.search(r"\b(answer|final|finish|message|respond)\b", text):
            return 2, "BrowseComp prior: final answer action when evidence is sufficient"
    elif profile == "tau2":
        if re.search(r"\b(policy|lookup|search|get|list|read|check|verify|order|customer|account|ticket)\b", text):
            return 5, "tau2 prior: check policy/customer/tool state before commitments"
        if re.search(r"\b(update|create|cancel|refund|transfer|confirm|submit|send)\b", text):
            return 3, "tau2 prior: policy-supported customer-service action"
    else:
        if re.search(r"\b(observe|read|search|list|get|lookup|inspect|query)\b", text):
            return 4, "generic prior: inspect available state before irreversible actions"
    return 0, ""


def _shortlist_item(
    doc: dict[str, Any],
    score: float,
    reasons: list[str],
    schema_keys: list[str],
) -> dict[str, Any]:
    return {
        "name": str(doc.get("name") or ""),
        "score": round(score, 2),
        "reason": "; ".join(reasons[:4]) or "available action",
        "argument_keys": schema_keys[:12],
        "is_finish": bool(doc.get("is_finish", False)),
        "is_message": bool(doc.get("is_message", False)),
    }


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
