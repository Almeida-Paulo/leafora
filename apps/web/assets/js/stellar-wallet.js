const SRI = {
  "freighter.js": "sha384-PBwq0JVfqy16Z6jvKJPx93jpStXbwF2oWvsRTODkvE/3hOX5zmLvAuMiKgAaxe2b",
  "walletconnect.js": "sha384-bDeJAnEnmi9DHtwGefEaYR9IZ1ixRRx2yaV9hrKjyDuu9TmVSM2YkWDkzdG8h/hP"
};
const scripts = new Map();
let client, activeSession;
export async function api(path, options = {}) {
  const response = await fetch(`/api/funding${path}`, { ...options, cache: "no-store",
    headers: { "Content-Type": "application/json", ...options.headers }, signal: options.signal || AbortSignal.timeout(60000) });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Request failed");
  return data;
}
function script(name) {
  if (!scripts.has(name)) scripts.set(name, new Promise((resolve, reject) => {
    const element = document.createElement("script");
    element.src = "/vendor/stellar/" + name;
    element.integrity = SRI[name];
    element.crossOrigin = "anonymous";
    element.onload = resolve;
    element.onerror = () => { scripts.delete(name); element.remove(); reject(new Error("Wallet component unavailable")); };
    document.head.append(element);
  }));
  return scripts.get(name);
}
export async function walletOptions() {
  const config = await api("/config");
  if (!config.ready) throw new Error("Stellar funding is not configured.");
  await script("freighter.js");
  const installed = await Promise.race([window.freighterApi.isConnected(), new Promise(resolve => setTimeout(() => resolve({ isConnected: false }), 1800))]);
  const options = [];
  if (installed.isConnected) options.push({ name: "Freighter", kind: "extension", config });
  if (config.walletconnect_project_id) options.push({ name: "WalletConnect", kind: "mobile", config });
  return options;
}
export async function disconnectWallet() {
  const session = activeSession;
  activeSession = null;
  try {
    if (session?.topic && client) await client.disconnect({ topic: session.topic, reason: { code: 6000, message: "User disconnected" } });
  } finally { window.dispatchEvent(new Event("leafora:wallet-disconnected")); }
}
function checkedAddress(address) {
  if (!/^G[A-Z2-7]{55}$/.test(address || "")) throw new Error("Invalid Stellar account");
  return address;
}
export async function connectWallet(provider) {
  const config = provider.config;
  if (provider.kind === "extension") {
    const result = await window.freighterApi.requestAccess();
    if (result.error) throw new Error(result.error.message || "Wallet permission denied");
    const network = await window.freighterApi.getNetwork();
    if (network.networkPassphrase !== config.passphrase) throw new Error(`Select Stellar ${config.network} in Freighter.`);
    activeSession = { address: checkedAddress(result.address), walletName: "Freighter", config, kind: "extension" };
  } else {
    await script("walletconnect.js");
    const { WalletConnectModal } = await import("/vendor/stellar/walletconnect-modal.js");
    const chainId = `stellar:${config.network === "public" ? "pubnet" : "testnet"}`;
    if (!client) {
      const SignClient = window["@walletconnect/sign-client"].SignClient;
      client = await SignClient.init({ projectId: config.walletconnect_project_id,
        metadata: { name: "Leafora", description: "Ecological project funding", url: location.origin,
          icons: [new URL("/assets/img/favicon.svg", location.origin).href] } });
      for (const name of ["session_delete", "session_expire", "session_update", "session_event"]) {
        client.on(name, () => { activeSession = null; window.dispatchEvent(new Event("leafora:wallet-disconnected")); });
      }
    }
    const modal = new WalletConnectModal({ projectId: config.walletconnect_project_id, chains: [chainId], themeMode: "light" });
    const { uri, approval } = await client.connect({ requiredNamespaces: {
      stellar: { methods: ["stellar_signXDR"], chains: [chainId], events: [] }
    } });
    let canceled = false, unsubscribe;
    try {
      if (uri) await modal.openModal({ uri });
      const cancelled = new Promise((_, reject) => {
        unsubscribe = modal.subscribeModal(state => {
          if (!state.open) { canceled = true; reject(new Error("Connection canceled")); }
        });
      });
      const approved = approval().then(async session => {
        if (canceled) { await client.disconnect({ topic: session.topic, reason: { code: 6000, message: "Canceled" } }); throw new Error("Connection canceled"); }
        return session;
      });
      const session = await Promise.race([approved, cancelled]);
      const namespace = session.namespaces.stellar;
      const account = namespace?.accounts?.find(value => value.startsWith(chainId + ":"));
      if (!account || !namespace.methods.includes("stellar_signXDR")) throw new Error("Wallet does not support the selected Stellar network");
      activeSession = { address: checkedAddress(account.split(":")[2]), walletName: session.peer.metadata.name,
        kind: "mobile", topic: session.topic, chainId, config };
    } finally { unsubscribe?.(); modal.closeModal(); }
  }
  return activeSession;
}
export async function signIntent(session, intent) {
  if (!session || session !== activeSession || intent.network !== session.config.passphrase) throw new Error("Reconnect your wallet");
  if (session.kind === "extension") {
    const [account, network] = await Promise.all([window.freighterApi.getAddress(), window.freighterApi.getNetwork()]);
    if (account.address !== session.address || network.networkPassphrase !== intent.network) {
      await disconnectWallet(); throw new Error("Wallet account or network changed. Reconnect before signing.");
    }
    const result = await window.freighterApi.signTransaction(intent.xdr, { networkPassphrase: intent.network, address: session.address });
    if (result.error || !result.signedTxXdr) throw new Error(result.error?.message || "Signature declined");
    return result.signedTxXdr;
  }
  const result = await client.request({ topic: session.topic, chainId: session.chainId,
    request: { method: "stellar_signXDR", params: { xdr: intent.xdr } } });
  if (!result.signedXDR) throw new Error("Wallet did not return a signed transaction");
  return result.signedXDR;
}
export function walletLaunchUrl(session) {
  if (session?.kind !== "mobile") return "";
  try {
    const chosen = JSON.parse(localStorage.getItem("WALLETCONNECT_DEEPLINK_CHOICE") || "null");
    const href = chosen?.href || "";
    if (/^(freighter|lobstr|xbull|hana|hot):\/\//i.test(href)) return href;
    const url = new URL(href);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}
export function explorer(config, type, value) {
  const network = config.network === "public" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${network}/${type}/${encodeURIComponent(value)}`;
}
