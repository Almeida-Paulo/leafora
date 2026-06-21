import { leaforaConfig } from "./config.js";

const SUI_DEVNET_CHAIN = "sui:devnet";
const SUI_SIGN_FEATURES = ["sui:signAndExecuteTransaction", "sui:signAndExecuteTransactionBlock"];

export async function listSuiWallets() {
  const standardWallets = await discoverWalletStandard();
  const providers = standardWallets
    .filter((wallet) => supportsAnySuiChain(wallet))
    .map((wallet, index) => ({
      id: `standard:${index}`,
      kind: "wallet-standard",
      name: wallet.name || "Sui wallet",
      icon: wallet.icon || "",
      wallet,
      canSign: hasSuiSigningFeature(wallet),
      supportsDevnet: walletSupportsChain(wallet, SUI_DEVNET_CHAIN)
    }));

  for (const legacy of getLegacySuiProviders()) {
    providers.push({
      id: `legacy:${legacy.name}`,
      kind: "legacy",
      name: legacy.name || "Sui injected wallet",
      icon: "",
      wallet: legacy.wallet,
      canSign: Boolean(legacy.wallet.signAndExecuteTransactionBlock || legacy.wallet.signAndExecuteTransaction),
      supportsDevnet: true
    });
  }

  return dedupeProviders(providers);
}

export async function connectSuiWallet(provider) {
  const selected = provider || (await listSuiWallets())[0];
  if (!selected) {
    throw new Error("Nenhuma Sui wallet foi encontrada. Instale uma wallet Sui, desbloqueie a conta e selecione devnet.");
  }

  if (selected.kind === "wallet-standard") {
    return connectWalletStandard(selected);
  }

  if (selected.kind === "legacy") {
    await selected.wallet.requestPermissions();
    const accounts = await selected.wallet.getAccounts();
    const address = accounts?.[0] || "";
    if (!address) throw new Error("Wallet Sui encontrada, mas nenhuma conta foi retornada.");
    return {
      kind: "legacy",
      wallet: selected.wallet,
      walletName: selected.name,
      walletIcon: selected.icon,
      address,
      chain: SUI_DEVNET_CHAIN,
      supportsDevnet: true,
      canSign: selected.canSign
    };
  }

  throw new Error("Tipo de wallet Sui nao suportado.");
}

export async function supportOnDevnet({ walletSession, project, tier }) {
  if (!walletSession?.address) {
    throw new Error("Conecte a wallet antes de apoiar.");
  }

  if (!walletSession.supportsDevnet) {
    throw new Error("A wallet conectada nao esta em Sui devnet. Troque a rede na wallet e conecte novamente.");
  }

  if (!walletSession.canSign) {
    throw new Error("A wallet conectada nao expoe assinatura Sui compativel.");
  }

  const readiness = getDevnetReadiness(project);
  if (!readiness.ready) {
    throw new Error(readiness.message);
  }

  const adapter = await loadSuiTransactionAdapter();
  if (!adapter?.supportProject) {
    throw new Error("Adapter Sui nao encontrado. Vendorize o SDK oficial em apps/web/vendor/leafora-sui-sdk.js antes de assinar transacoes no browser.");
  }

  const result = await adapter.supportProject({
    config: leaforaConfig,
    walletSession,
    project,
    tier: {
      ...tier,
      amountMist: suiToMist(tier.amount)
    }
  });

  if (!result?.digest) {
    throw new Error("A wallet retornou sucesso sem digest de transacao. Verifique o adapter Sui vendorizado.");
  }

  return {
    digest: result.digest,
    explorerUrl: explorerTransaction(result.digest)
  };
}

export function getDevnetReadiness(project) {
  if (!leaforaConfig.packageId) {
    return {
      ready: false,
      message: "Contrato devnet ainda nao publicado. Publique o pacote Move e preencha packageId em apps/web/assets/js/config.js."
    };
  }

  if (!project?.chain?.projectId || !project?.chain?.vaultId) {
    return {
      ready: false,
      message: "Projeto ainda sem object IDs devnet. Crie o projeto on-chain e preencha projectId/vaultId em apps/web/assets/js/projects.js."
    };
  }

  return {
    ready: true,
    message: "Pronto para assinatura na Sui devnet. Confira a rede na wallet antes de confirmar."
  };
}

export function explorerAddress(address) {
  return `${leaforaConfig.explorerBaseUrl}/address/${address}?network=${leaforaConfig.network}`;
}

export function explorerTransaction(digest) {
  return `${leaforaConfig.explorerBaseUrl}/txblock/${digest}?network=${leaforaConfig.network}`;
}

async function loadSuiTransactionAdapter() {
  if (window.LeaforaSuiTx?.supportProject) return window.LeaforaSuiTx;

  try {
    return await import("/vendor/leafora-sui-sdk.js");
  } catch (_error) {
    return null;
  }
}

async function connectWalletStandard(provider) {
  const wallet = provider.wallet;

  const connectFeature = wallet.features?.["standard:connect"];
  const result = await connectFeature.connect({ silent: false });
  const account = (result.accounts || wallet.accounts || []).find((item) => item.chains?.includes(SUI_DEVNET_CHAIN)) || result.accounts?.[0] || wallet.accounts?.[0];

  if (!account?.address) {
    throw new Error("Wallet conectada, mas nenhuma conta Sui foi retornada.");
  }

  return {
    kind: "wallet-standard",
    wallet,
    walletName: provider.name,
    walletIcon: provider.icon,
    account,
    address: account.address,
    chain: account.chains?.includes(SUI_DEVNET_CHAIN) ? SUI_DEVNET_CHAIN : account.chains?.[0] || "",
    supportsDevnet: Boolean(account.chains?.includes(SUI_DEVNET_CHAIN)),
    canSign: hasSuiSigningFeature(wallet)
  };
}

function supportsAnySuiChain(wallet) {
  const hasConnect = Boolean(wallet.features?.["standard:connect"]?.connect);
  const hasSuiFeature = Object.keys(wallet.features || {}).some((feature) => feature.startsWith("sui:"));
  const accountHasSui = (wallet.accounts || []).some((account) => (account.chains || []).some((chain) => chain.startsWith("sui:")));
  const declaresSui = (wallet.chains || []).some((chain) => chain.startsWith("sui:"));
  const nameLooksSui = /sui|slush/i.test(wallet.name || "");
  return hasConnect && (hasSuiFeature || accountHasSui || declaresSui || nameLooksSui);
}

function walletSupportsChain(wallet, chainId) {
  const accountHasChain = (wallet.accounts || []).some((account) => account.chains?.includes(chainId));
  const declaresChain = (wallet.chains || []).includes(chainId);
  return accountHasChain || declaresChain;
}

function hasSuiSigningFeature(wallet) {
  return SUI_SIGN_FEATURES.some((featureName) => {
    const feature = wallet.features?.[featureName];
    return Boolean(feature?.signAndExecuteTransaction || feature?.signAndExecuteTransactionBlock || feature);
  });
}

function getLegacySuiProviders() {
  const candidates = [
    ["slush", window.slush],
    ["suiWallet", window.suiWallet],
    ["sui", window.sui]
  ];

  return candidates
    .filter(([, wallet]) => wallet?.requestPermissions && wallet?.getAccounts)
    .map(([name, wallet]) => ({ name, wallet }));
}

function dedupeProviders(providers) {
  const seen = new Set();
  return providers.filter((provider) => {
    const key = provider.wallet || provider.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function discoverWalletStandard(timeoutMs = 800) {
  return new Promise((resolve) => {
    const wallets = [];
    const register = (...registeredWallets) => {
      registeredWallets.flat().forEach((wallet) => {
        if (wallet && !wallets.includes(wallet)) wallets.push(wallet);
      });
    };
    const api = Object.freeze({ register });

    const onRegister = (event) => {
      try {
        if (typeof event.detail === "function") {
          event.detail(api);
        } else if (event.detail?.wallet) {
          register(event.detail.wallet);
        } else if (Array.isArray(event.detail?.wallets)) {
          event.detail.wallets.forEach(register);
        }
      } catch (_error) {
        // Ignore non-standard wallet providers and keep legacy fallback available.
      }
    };

    window.addEventListener("wallet-standard:register-wallet", onRegister);
    window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: api }));

    window.setTimeout(() => {
      window.removeEventListener("wallet-standard:register-wallet", onRegister);
      resolve(wallets);
    }, timeoutMs);
  });
}

function suiToMist(value) {
  const [whole, fraction = ""] = String(value).split(".");
  const decimals = `${fraction}000000000`.slice(0, 9);
  return `${BigInt(whole || "0") * 1_000_000_000n + BigInt(decimals)}`;
}
