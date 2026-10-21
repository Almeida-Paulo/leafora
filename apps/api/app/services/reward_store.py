"""Append-only journal with optimistic locking and portable, verified exports."""
from datetime import datetime, timezone
from hmac import compare_digest

from sqlalchemy import select, update

from app.models.reward import RewardBook, RewardEvent
from app.services.reward_ledger import (
    SUPPLY, ZERO_HASH, SCHEMAS, WRITABLE_KINDS, apply_event, canonical, digest, empty_state, instant, policy,
)


def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def record(event):
    import json
    return {"sequence": event.sequence, "key": event.key, "kind": event.kind,
        "payload": json.loads(event.payload), "recorded_at": event.recorded_at,
        "previous_hash": event.previous_hash, "event_hash": event.event_hash}


def replay(records):
    state, head, keys = empty_state(), ZERO_HASH, set()
    previous_time = None
    for sequence, event in enumerate(records, 1):
        if set(event) != {"sequence", "key", "kind", "payload", "recorded_at", "previous_hash", "event_hash"}:
            raise ValueError("Backup event has unsupported fields.")
        if type(event["sequence"]) is not int or event["sequence"] != sequence or event["previous_hash"] != head:
            raise ValueError("Reward history is incomplete or out of order.")
        if not isinstance(event["key"], str) or not 1 <= len(event["key"]) <= 200 or event["key"] in keys:
            raise ValueError("Duplicate or invalid operation key in reward history.")
        keys.add(event["key"])
        at = instant(event["recorded_at"])
        if previous_time and at < previous_time:
            raise ValueError("Reward timestamps are out of order.")
        previous_time = at
        head = digest({k: v for k, v in event.items() if k != "event_hash"})
        if not isinstance(event["event_hash"], str) or not compare_digest(head, event["event_hash"]):
            raise ValueError("Reward history integrity check failed.")
        apply_event(state, event["kind"], event["payload"], event["recorded_at"])
    return state, head


def load(db, *, locked=False):
    query = select(RewardBook).where(RewardBook.id == 1).execution_options(populate_existing=True)
    book = db.scalar(query.with_for_update() if locked else query)
    if book is None:
        raise ValueError("Reward ledger migration has not been applied.")
    records = [record(e) for e in db.scalars(select(RewardEvent)
        .where(RewardEvent.sequence <= book.revision).order_by(RewardEvent.sequence))]
    state, head = replay(records)
    if len(records) != book.revision or head != book.head_hash:
        raise ValueError("Reward ledger does not reconcile. Writes are blocked.")
    return book, state, records


def append(db, key, kind, payload):
    if kind not in WRITABLE_KINDS:
        raise ValueError("LEAF rewards are locked until launch. Testnet token operations are disabled.")
    normalized = SCHEMAS[kind].model_validate(payload).model_dump()
    book, state, records = load(db, locked=True)
    existing = next((e for e in records if e["key"] == key), None)
    if existing:
        if existing["kind"] != kind or existing["payload"] != normalized:
            raise ValueError("This operation key already exists with different data.")
        return state
    now = timestamp()
    if records and instant(now) < instant(records[-1]["recorded_at"]):
        raise ValueError("Server clock moved backwards. Ledger write blocked.")
    apply_event(state, kind, normalized, now)
    event = {"sequence": book.revision + 1, "key": key, "kind": kind,
             "payload": normalized, "recorded_at": now, "previous_hash": book.head_hash}
    head = digest(event)
    result = db.execute(update(RewardBook).where(RewardBook.id == 1,
        RewardBook.revision == book.revision, RewardBook.head_hash == book.head_hash)
        .values(revision=event["sequence"], head_hash=head).execution_options(synchronize_session=False))
    if result.rowcount != 1:
        raise ValueError("Reward ledger changed concurrently. Retry the same request.")
    db.add(RewardEvent(**{**event, "payload": canonical(normalized), "event_hash": head}))
    db.flush()
    return state


def export_book(db):
    book, _, records = load(db)
    document = {"format": "leafora.rewards.v2", "policy": policy(), "asset": "LEAF",
        "supply_units": str(SUPPLY), "revision": book.revision, "head_hash": book.head_hash,
        "exported_at": timestamp(), "events": records}
    return {**document, "sha256": digest(document)}


def restore_book(db, document, expected_hash):
    if not isinstance(document, dict):
        raise ValueError("Invalid rewards backup document.")
    legacy = document.get("format") == "leafora.rewards.v1"
    context_field = "network" if legacy else "policy"
    if set(document) != {"format", context_field, "asset", "supply_units",
            "revision", "head_hash", "exported_at", "events", "sha256"}:
        raise ValueError("Invalid rewards backup document.")
    expected_context = "testnet" if legacy else policy()
    if (document["format"], document[context_field], document["asset"], document["supply_units"]) != (
            "leafora.rewards.v1" if legacy else "leafora.rewards.v2", expected_context, "LEAF", str(SUPPLY)):
        raise ValueError("Backup format, network or supply does not match this release.")
    computed = digest({k: v for k, v in document.items() if k != "sha256"})
    if not isinstance(document["sha256"], str) or not compare_digest(computed, document["sha256"]) or not compare_digest(computed, expected_hash):
        raise ValueError("Backup does not match the independently supplied checksum.")
    instant(document["exported_at"])
    if not isinstance(document["events"], list) or len(document["events"]) > 100000:
        raise ValueError("Backup event count is invalid.")
    state, head = replay(document["events"])
    if type(document["revision"]) is not int or document["revision"] != len(document["events"]) or document["head_hash"] != head:
        raise ValueError("Backup revision does not reconcile.")
    book, _, records = load(db, locked=True)
    if records or book.revision or db.scalar(select(RewardEvent.sequence).limit(1)) is not None:
        raise ValueError("Restore is only allowed into an empty rewards ledger. Existing history is never replaced.")
    for event in document["events"]:
        db.add(RewardEvent(**{**event, "payload": canonical(event["payload"])}))
    result = db.execute(update(RewardBook).where(RewardBook.id == 1, RewardBook.revision == 0)
        .values(revision=document["revision"], head_hash=head).execution_options(synchronize_session=False))
    if result.rowcount != 1:
        raise ValueError("Reward ledger changed during restore.")
    db.flush()
    return state
