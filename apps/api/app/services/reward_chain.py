"""Read-only testnet evidence. Never signs, submits, or uses a mainnet URL."""
from contextlib import contextmanager
from datetime import datetime, timezone

import httpx
from stellar_sdk import Network, StrKey

from app.services.stellar import amount_units
from app.services.reward_ledger import SUPPLY

HORIZON = "https://horizon-testnet.stellar.org"


def units(value):
    return 0 if value in ("0", "0.0000000") else amount_units(value)


class TestnetReader:
    def __init__(self, client):
        self.client = client

    def get(self, path, **params):
        result = self.client.get(path, params=params)
        result.raise_for_status()
        return result.json()

    def verify_network(self):
        if self.get("/").get("network_passphrase") != Network.TESTNET_NETWORK_PASSPHRASE:
            raise ValueError("Rewards reader is not connected to Stellar testnet.")

    def tip(self):
        return self.get("/ledgers", order="desc", limit=1)["_embedded"]["records"][0]

    def verify_anchor(self, epoch, snapshot=None):
        self.verify_network()
        sequence = snapshot["ledger"] if snapshot else epoch["anchor_ledger"]
        expected = snapshot["ledger_hash"] if snapshot else epoch["anchor_hash"]
        ledger = self.get(f"/ledgers/{sequence}")
        if ledger["hash"] != expected:
            raise ValueError("Testnet cycle changed. Preserve the old snapshot and register a new cycle.")

    def snapshot(self, epoch, previous=None):
        self.verify_anchor(epoch, previous)
        start = self.tip()
        assets = self.get("/assets", asset_code="LEAF", asset_issuer=epoch["issuer"])["_embedded"]["records"]
        if len(assets) != 1:
            raise ValueError("LEAF asset is unavailable. No zero balance was inferred.")
        asset = assets[0]
        if (asset.get("asset_code"), asset.get("asset_issuer")) != ("LEAF", epoch["issuer"]):
            raise ValueError("Asset identity does not match the configured cycle.")
        required = ("contracts_amount", "claimable_balances_amount", "liquidity_pools_amount")
        if any(key not in asset for key in required):
            raise ValueError("Provider omitted custody totals; snapshot cannot be verified.")
        if any(units(asset[key]) for key in required):
            raise ValueError("LEAF exists in contracts, pools or claimable balances. This release cannot restore that custody; snapshot blocked.")
        issued = sum(units(v) for v in asset["balances"].values())
        if not 0 <= issued <= SUPPLY:
            raise ValueError("Issued LEAF supply is outside the configured limit.")
        balances, cursor = {}, None
        while True:
            params = {"asset": "LEAF:" + epoch["issuer"], "limit": 200, "order": "asc"}
            if cursor:
                params["cursor"] = cursor
            rows = self.get("/accounts", **params)["_embedded"]["records"]
            if not rows:
                break
            for account in rows:
                wallet = account["account_id"]
                if not StrKey.is_valid_ed25519_public_key(wallet) or wallet in balances:
                    raise ValueError("Invalid or repeated account in snapshot.")
                matching = [b for b in account["balances"] if b.get("asset_code") == "LEAF" and b.get("asset_issuer") == epoch["issuer"]]
                if len(matching) != 1:
                    raise ValueError("Account did not include the requested asset balance.")
                balances[wallet] = str(units(matching[0]["balance"]))
            if len(balances) > 10000:
                raise ValueError("Snapshot exceeds the reviewed holder limit; no partial snapshot was saved.")
            next_cursor = rows[-1]["paging_token"]
            if next_cursor == cursor:
                raise ValueError("Provider did not advance pagination.")
            cursor = next_cursor
            if len(rows) < 200:
                break
        finish = self.tip()
        if (start["sequence"], start["hash"]) != (finish["sequence"], finish["hash"]):
            raise ValueError("Ledger advanced during snapshot. Retry; previous snapshot was preserved.")
        if sum(int(v) for v in balances.values()) != issued:
            raise ValueError("Holder balances do not reconcile with total issued LEAF.")
        return {"epoch": epoch["id"], "ledger": start["sequence"], "ledger_hash": start["hash"],
            "captured_at": datetime.now(timezone.utc).isoformat(), "issued_units": str(issued), "balances": balances}

    def receipt(self, epoch, award, tx_hash, operation_id, previous=None):
        self.verify_anchor(epoch, previous)
        tx = self.get("/transactions/" + tx_hash)
        operation = self.get("/operations/" + operation_id)
        if tx.get("hash") != tx_hash or tx.get("successful") is not True:
            raise ValueError("Transaction is not confirmed successful.")
        ledger = self.get(f"/ledgers/{tx['ledger']}")
        return {"epoch": epoch["id"], "award": award["id"], "tx_hash": tx_hash,
            "operation": operation_id, "ledger": tx["ledger"], "ledger_hash": ledger["hash"],
            "closed_at": tx["created_at"], "proof": {k: v for k, v in operation.items() if k != "_links"}}


@contextmanager
def reader():
    with httpx.Client(base_url=HORIZON, timeout=15, follow_redirects=False) as client:
        yield TestnetReader(client)
