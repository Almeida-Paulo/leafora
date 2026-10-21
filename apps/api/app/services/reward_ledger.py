"""Deterministic reward ledger. Replay is also the backup validation path."""
import hashlib
import json
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator
from stellar_sdk import StrKey

UNIT = 10_000_000
SUPPLY = 1_000_000_000 * UNIT
ZERO_HASH = "0" * 64
ALLOCATIONS = {
    "testers": ("Testadores iniciais", 5),
    "users": ("Incentivos aos usuarios", 30),
    "treasury": ("Tesouraria Leafora", 20),
    "founders": ("Fundadores", 15),
    "team": ("Equipe e colaboradores", 10),
    "community": ("Comunidade e integracoes", 10),
    "security": ("Seguranca e bug bounty", 5),
    "strategic": ("Reserva estrategica", 5),
}
REWARD_RESERVES = {"testers", "users", "community", "security"}
WRITABLE_KINDS = {"campaign", "campaign_status", "award", "cancel"}
Slug = Annotated[str, Field(strict=True, pattern=r"^[a-z0-9][a-z0-9_-]{1,79}$")]
Hash = Annotated[str, Field(strict=True, pattern=r"^[a-f0-9]{64}$")]
Units = Annotated[str, Field(strict=True, pattern=r"^(0|[1-9][0-9]{0,16})$")]
Wallet = Annotated[str, Field(strict=True, pattern=r"^G[A-Z2-7]{55}$")]


class Data(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    @field_validator("wallet", "issuer", "treasury", check_fields=False)
    @classmethod
    def valid_wallet(cls, value):
        if not StrKey.is_valid_ed25519_public_key(value):
            raise ValueError("Invalid Stellar wallet checksum.")
        return value


class Campaign(Data):
    id: Slug
    title: str = Field(min_length=1, max_length=160)
    reserve: str = Field(min_length=1, max_length=30)
    budget_units: Units
    rules: str = Field(min_length=1, max_length=4000)


class CampaignStatus(Data):
    campaign: Slug
    open: bool = Field(strict=True)


class Award(Data):
    campaign: Slug
    wallet: Wallet
    activity: Slug
    amount_units: Units
    reference: str = Field(min_length=1, max_length=500)


class Cancellation(Data):
    award: Hash
    reason: str = Field(min_length=1, max_length=500)


class Epoch(Data):
    id: Slug
    issuer: Wallet
    treasury: Wallet
    anchor_ledger: StrictInt = Field(gt=0)
    anchor_hash: Hash


class CloseEpoch(Data):
    epoch: Slug


class Snapshot(Data):
    epoch: Slug
    ledger: StrictInt = Field(gt=0)
    ledger_hash: Hash
    captured_at: str = Field(max_length=40)
    issued_units: Units
    balances: dict[Wallet, Units] = Field(max_length=10000)


class Receipt(Data):
    epoch: Slug
    award: Hash
    tx_hash: Hash
    operation: str = Field(pattern=r"^[0-9]{1,30}$")
    ledger: StrictInt = Field(gt=0)
    ledger_hash: Hash
    closed_at: str = Field(max_length=40)
    proof: dict = Field(max_length=50)


SCHEMAS = {"campaign": Campaign, "campaign_status": CampaignStatus,
    "award": Award, "cancel": Cancellation, "epoch": Epoch, "close_epoch": CloseEpoch,
    "snapshot": Snapshot, "receipt": Receipt}


def canonical(value):
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def award_id(campaign, wallet, activity):
    return digest(["leafora:award:v1", campaign, wallet, activity])


def positive(value):
    amount = int(value)
    if not 0 < amount <= SUPPLY:
        raise ValueError("Amount must be positive and within the LEAF supply.")
    return amount


def instant(value):
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("Timestamp must include its timezone.")
    return result


def empty_state():
    return {"campaigns": {}, "awards": {}, "epochs": {}, "snapshots": {}, "receipts": {}}


def apply_event(state, kind, payload, recorded_at):
    if kind not in SCHEMAS:
        raise ValueError("Unsupported reward event.")
    data = SCHEMAS[kind].model_validate(payload).model_dump()
    instant(recorded_at)
    campaigns, awards, epochs = state["campaigns"], state["awards"], state["epochs"]
    if kind == "campaign":
        amount = positive(data["budget_units"])
        if data["id"] in campaigns or data["reserve"] not in REWARD_RESERVES:
            raise ValueError("Campaign already exists or reserve is invalid.")
        capacity = SUPPLY * ALLOCATIONS[data["reserve"]][1] // 100
        committed = sum(int(c["budget_units"]) for c in campaigns.values() if c["reserve"] == data["reserve"])
        if committed + amount > capacity:
            raise ValueError("Campaign budgets exceed this reserve.")
        campaigns[data["id"]] = {**data, "open": True, "awarded_units": "0", "created_at": recorded_at}
    elif kind == "campaign_status":
        campaigns[data["campaign"]]["open"] = data["open"]
    elif kind == "award":
        campaign = campaigns[data["campaign"]]
        identity = award_id(data["campaign"], data["wallet"], data["activity"])
        if identity in awards or not campaign["open"]:
            raise ValueError("Activity already rewarded or campaign is closed.")
        amount = positive(data["amount_units"])
        total = int(campaign["awarded_units"]) + amount
        if total > int(campaign["budget_units"]):
            raise ValueError("Campaign has insufficient uncommitted tokens.")
        campaign["awarded_units"] = str(total)
        awards[identity] = {**data, "id": identity, "created_at": recorded_at,
                            "cancelled": False, "receipt": None}
    elif kind == "cancel":
        award = awards[data["award"]]
        if award["cancelled"] or award["receipt"]:
            raise ValueError("Only an unpaid, active reward can be cancelled.")
        award["cancelled"] = True
        award["cancellation"] = {"reason": data["reason"], "at": recorded_at}
        campaign = campaigns[award["campaign"]]
        campaign["awarded_units"] = str(int(campaign["awarded_units"]) - int(award["amount_units"]))
    elif kind == "epoch":
        if data["id"] in epochs or any(e["open"] for e in epochs.values()):
            raise ValueError("Close the existing testnet cycle before registering a new one.")
        if data["issuer"] == data["treasury"]:
            raise ValueError("Issuer and distribution account must be different.")
        epochs[data["id"]] = {**data, "open": True, "created_at": recorded_at}
    elif kind == "close_epoch":
        epochs[data["epoch"]]["open"] = False
    elif kind == "snapshot":
        epoch = epochs[data["epoch"]]
        previous = state["snapshots"].get(data["epoch"])
        if not epoch["open"] or data["ledger"] < epoch["anchor_ledger"]:
            raise ValueError("Snapshot is outside the active testnet cycle.")
        if previous and data["ledger"] < previous["ledger"]:
            raise ValueError("Cannot replace a snapshot with older state.")
        if previous and data["ledger"] == previous["ledger"] and data != previous:
            raise ValueError("Conflicting snapshots for the same ledger.")
        instant(data["captured_at"])
        if any(not StrKey.is_valid_ed25519_public_key(w) for w in data["balances"]):
            raise ValueError("Snapshot contains an invalid wallet.")
        issued = int(data["issued_units"])
        if not 0 <= issued <= SUPPLY or sum(int(v) for v in data["balances"].values()) != issued:
            raise ValueError("Snapshot balances do not reconcile with the issued supply.")
        state["snapshots"][data["epoch"]] = data
    elif kind == "receipt":
        epoch, award = epochs[data["epoch"]], awards[data["award"]]
        if not epoch["open"] or award["cancelled"] or award["receipt"]:
            raise ValueError("Reward cannot be paid again or belongs to a closed cycle.")
        if award["wallet"] in (epoch["issuer"], epoch["treasury"]):
            raise ValueError("Issuer and distribution account cannot receive campaign rewards.")
        if data["ledger"] < epoch["anchor_ledger"] or instant(data["closed_at"]) < instant(award["created_at"]):
            raise ValueError("Payment predates the reward or this testnet cycle.")
        operation = data["proof"]
        expected = {"type": "payment", "asset_code": "LEAF", "asset_issuer": epoch["issuer"],
            "from": epoch["treasury"], "to": award["wallet"], "transaction_hash": data["tx_hash"],
            "id": data["operation"], "transaction_successful": True}
        from app.services.stellar import amount_units
        if not isinstance(operation.get("amount"), str) or operation.get("transaction_successful") is not True:
            raise ValueError("Payment does not match the approved reward.")
        if any(operation.get(k) != v for k, v in expected.items()) or amount_units(operation["amount"]) != int(award["amount_units"]):
            raise ValueError("Payment does not match the approved reward.")
        identity = data["epoch"] + ":" + data["operation"]
        if identity in state["receipts"]:
            raise ValueError("This operation already settled a reward.")
        state["receipts"][identity] = data
        award["receipt"] = data
    return data


def policy():
    return {"asset": "LEAF", "decimals": 7, "phase": "prelaunch",
            "accounting": "offchain", "transferable": False,
            "distribution_enabled": False, "delivery_network": "mainnet",
            "conversion": {"reward_units": "1", "token_units": "1"}}


def summary(state):
    reserves = []
    for key, (title, percent) in ALLOCATIONS.items():
        campaigns = [c for c in state["campaigns"].values() if c["reserve"] == key]
        awards = [a for a in state["awards"].values() if a["campaign"] in {c["id"] for c in campaigns} and not a["cancelled"]]
        allocation = SUPPLY * percent // 100
        committed = sum(int(c["budget_units"]) for c in campaigns)
        approved = sum(int(a["amount_units"]) for a in awards)
        reserves.append({"id": key, "title": title, "percent": percent,
            "allocation_units": str(allocation), "campaign_budget_units": str(committed),
            "unassigned_units": str(allocation - committed), "locked_units": str(approved),
            "unawarded_units": str(allocation - approved)})
    return {**policy(), "supply_units": str(SUPPLY),
            "reserves": reserves, "campaigns": list(state["campaigns"].values())}


def wallet_statement(state, wallet):
    awards = [a for a in state["awards"].values() if a["wallet"] == wallet]
    approved = sum(int(a["amount_units"]) for a in awards if not a["cancelled"])
    # Legacy testnet receipts and snapshots never settle a mainnet entitlement.
    return {**policy(), "wallet": wallet,
        "accumulated_units": str(approved), "locked_units": str(approved),
        "available_units": "0", "mainnet_delivered_units": "0",
        "awards": [{"id": a["id"], "campaign": a["campaign"],
            "title": state["campaigns"][a["campaign"]]["title"], "amount_units": a["amount_units"],
            "created_at": a["created_at"], "status": "cancelled" if a["cancelled"] else "locked",
            "cancelled_at": a.get("cancellation", {}).get("at")} for a in awards]}


def allocation_manifest(state, revision, head_hash):
    balances = {}
    for award in state["awards"].values():
        if not award["cancelled"]:
            wallet = award["wallet"]
            balances[wallet] = balances.get(wallet, 0) + int(award["amount_units"])
    document = {**policy(), "format": "leafora.allocations.v1",
        "revision": revision, "head_hash": head_hash, "supply_units": str(SUPPLY),
        "total_units": str(sum(balances.values())), "executes_transactions": False,
        "wallets": [{"wallet": wallet, "amount_units": str(balances[wallet])}
                    for wallet in sorted(balances)]}
    return {**document, "sha256": digest(document)}
