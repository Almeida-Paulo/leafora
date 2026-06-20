from typing import Any

import httpx

from app.core.config import settings


class SuiRpcError(RuntimeError):
    pass


class SuiRpcClient:
    def __init__(self, rpc_url: str | None = None) -> None:
        self.rpc_url = rpc_url or settings.sui_rpc_url

    async def call(self, method: str, params: list[Any] | None = None) -> Any:
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params or [],
        }

        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(self.rpc_url, json=payload)
            response.raise_for_status()
            data = response.json()

        if "error" in data:
            raise SuiRpcError(str(data["error"]))

        return data.get("result")

    async def get_transaction_block(self, digest: str) -> Any:
        return await self.call(
            "sui_getTransactionBlock",
            [
                digest,
                {
                    "showEffects": True,
                    "showEvents": True,
                    "showObjectChanges": True,
                    "showInput": True,
                },
            ],
        )

