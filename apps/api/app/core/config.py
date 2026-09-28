from functools import cached_property
from os import getenv


class Settings:
    env: str = getenv("LEAFORA_ENV", "development")
    api_host: str = getenv("LEAFORA_API_HOST", "0.0.0.0")
    api_port: int = int(getenv("LEAFORA_API_PORT", "18473"))
    database_url: str = getenv(
        "LEAFORA_DATABASE_URL",
        "postgresql+psycopg://DB_USER:DB_PASSWORD@127.0.0.1:5432/DB_NAME",
    )
    admin_token: str = getenv("LEAFORA_ADMIN_TOKEN", "")
    sui_rpc_url: str = getenv("LEAFORA_SUI_RPC_URL", "https://fullnode.devnet.sui.io:443")
    sui_network: str = getenv("LEAFORA_SUI_NETWORK", "devnet")
    stellar_network: str = getenv("LEAFORA_STELLAR_NETWORK", "testnet")
    stellar_rpc_url: str = getenv("LEAFORA_STELLAR_RPC_URL", "https://soroban-testnet.stellar.org")
    stellar_contract: str = getenv("LEAFORA_STELLAR_CONTRACT", "")
    stellar_admin: str = getenv("LEAFORA_STELLAR_ADMIN", "")
    stellar_usdc_issuer: str = getenv("LEAFORA_STELLAR_USDC_ISSUER", "")
    walletconnect_project_id: str = getenv("LEAFORA_WALLETCONNECT_PROJECT_ID", "")

    @cached_property
    def cors_origins(self) -> list[str]:
        raw = getenv("LEAFORA_CORS_ORIGINS", "http://localhost:8000,http://localhost:5173")
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    @property
    def is_development(self) -> bool:
        return self.env in {"development", "local", "test"}


settings = Settings()
