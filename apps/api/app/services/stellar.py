"""Non-custodial Soroban transactions and chain-derived funding state."""
import hashlib
import json
import re
import time
from contextlib import contextmanager

from fastapi import HTTPException
from stellar_sdk import Account, Asset, Network, SorobanServer, StrKey, TransactionBuilder, scval
from stellar_sdk.client.requests_client import RequestsClient
from app.core.config import settings

UNIT = 10_000_000
LIMIT = 10**18
EDITORIAL_FIELDS = ("slug", "name", "category", "biome", "country", "region",
                    "location_label", "image_uri", "objective", "impact_summary", "story", "risks")


def amount_units(value: str) -> int:
    if not re.fullmatch(r"(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,7})?", value):
        raise ValueError("Use a positive decimal amount with at most seven decimal places.")
    whole, _, fraction = value.partition(".")
    units = int(whole) * UNIT + int(fraction.ljust(7, "0"))
    if not 0 < units <= LIMIT:
        raise ValueError("Amount is outside the supported range.")
    return units


def project_id(slug: str) -> bytes:
    return hashlib.sha256(("leafora:project:v1:" + slug).encode()).digest()


def metadata(project) -> dict:
    return {key: getattr(project, key) for key in EDITORIAL_FIELDS}


def metadata_hash(project) -> bytes:
    return hashlib.sha256(json.dumps(metadata(project), ensure_ascii=False,
                                    sort_keys=True, separators=(",", ":")).encode()).digest()


def public_config():
    ready = bool(settings.stellar_contract and settings.stellar_admin and settings.stellar_usdc_issuer)
    if settings.stellar_network not in ("testnet", "public"):
        raise HTTPException(503, "Invalid Stellar network configuration.")
    if settings.stellar_network == "public":
        raise HTTPException(503, "This release is restricted to Stellar testnet pending contract validation.")
    passphrase = Network.TESTNET_NETWORK_PASSPHRASE if settings.stellar_network == "testnet" else Network.PUBLIC_NETWORK_PASSPHRASE
    asset = Asset("USDC", settings.stellar_usdc_issuer).contract_id(passphrase) if ready else ""
    return {"ready": ready, "network": settings.stellar_network, "passphrase": passphrase,
            "contract": settings.stellar_contract, "asset": asset, "decimals": 7,
            "issuer": settings.stellar_usdc_issuer, "walletconnect_project_id": settings.walletconnect_project_id}


@contextmanager
def chain():
    config = public_config()
    if not config["ready"]:
        raise HTTPException(503, "Stellar funding is not configured.")
    try:
        client = SorobanServer(settings.stellar_rpc_url, client=RequestsClient(request_timeout=15))
        yield Chain(client, config)
    except HTTPException:
        raise
    except Exception as error:
        # RPC diagnostics can contain XDR and provider credentials; never expose them publicly.
        raise HTTPException(503, "The blockchain could not complete this request. No balance was inferred.") from error
    finally:
        if "client" in locals():
            client.close()


class Chain:
    def __init__(self, rpc, config):
        self.rpc, self.config = rpc, config

    def envelope(self, source, method, args, load=False):
        account = self.rpc.load_account(source) if load else Account(source, 0)
        return (TransactionBuilder(account, network_passphrase=self.config["passphrase"], base_fee=100)
                .append_invoke_contract_function_op(self.config["contract"], method, args)
                .set_timeout(300).build())

    def read(self, method, args):
        response = self.rpc.simulate_transaction(self.envelope(settings.stellar_admin, method, args), use_upgraded_auth=False)
        if response.error or response.restore_preamble or not response.results:
            raise HTTPException(503, "Contract state unavailable or awaiting archival restoration.")
        return scval.to_native(response.results[0].xdr)

    def verify_configuration(self):
        if self.rpc.get_network().passphrase != self.config["passphrase"]:
            raise HTTPException(503, "RPC network does not match the configured network.")
        administrator, asset = self.read("configuration", [])
        if administrator.address != settings.stellar_admin or asset.address != self.config["asset"]:
            raise HTTPException(503, "Contract administrator or USDC asset does not match configuration.")

    def project(self, slug):
        return self.read("get_project", [scval.to_bytes(project_id(slug))])

    def position(self, slug, wallet):
        return self.read("get_position", [scval.to_bytes(project_id(slug)), scval.to_address(wallet)])

    def prepare(self, wallet, method, args):
        if not StrKey.is_valid_ed25519_public_key(wallet):
            raise HTTPException(422, "Invalid Stellar wallet address.")
        self.verify_configuration()
        envelope = self.envelope(wallet, method, args, load=True)
        simulation = self.rpc.simulate_transaction(envelope, use_upgraded_auth=False)
        if simulation.restore_preamble:
            raise HTTPException(409, "Contract data requires restoration before signing.")
        if simulation.error:
            raise HTTPException(409, "Cannot authorize this transaction. Check network, USDC balance, XLM fees and project deadline.")
        return self.rpc.prepare_transaction(envelope, simulation, use_upgraded_auth=False)


def funding_read(chain_client, project):
    result = chain_client.project(project.slug)
    if result is None:
        return None
    if result["metadata"] != metadata_hash(project) or result["goal"] <= 0:
        raise HTTPException(409, "Published project metadata does not match its on-chain commitment.")
    return {"id": project_id(project.slug).hex(), "goal_units": str(result["goal"]),
            "raised_units": str(result["raised"]), "points_units": str(result["raised"]),
            "deadline": result["deadline"], "supporters": result["supporters"],
            "paused": result["paused"], "open": not result["paused"] and int(time.time()) < result["deadline"],
            "contract": chain_client.config["contract"], "network": chain_client.config["network"]}
