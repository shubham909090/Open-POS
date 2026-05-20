import { networkInterfaces } from "node:os";

export function resolvePairingHubUrl(input: {
  savedPublicUrl?: string;
  configuredPublicUrl?: string;
  requestProtocol?: string;
  requestHost?: string;
  fallbackLanAddress?: string;
}): string {
  const savedPublicUrl = normalizeHubUrlCandidate(input.savedPublicUrl);
  if (savedPublicUrl) return savedPublicUrl;
  const configuredPublicUrl = normalizeHubUrlCandidate(input.configuredPublicUrl);
  if (configuredPublicUrl) return configuredPublicUrl;

  const protocol = input.requestProtocol || "http";
  const requestHost = (input.requestHost || "localhost:3737").trim();
  if (!isLocalHost(requestHost)) return `${protocol}://${requestHost}`;

  const fallbackLanAddress = input.fallbackLanAddress?.trim();
  if (fallbackLanAddress) {
    const port = getPortFromHost(requestHost);
    return `${protocol}://${fallbackLanAddress}${port ? `:${port}` : ""}`;
  }

  return `${protocol}://${requestHost}`;
}

function normalizeHubUrlCandidate(value?: string): string | null {
  const trimmed = value?.trim().replace(/\/+$/, "") ?? "";
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function isLocalHost(host: string): boolean {
  const hostname = getHostname(host).toLowerCase();
  return hostname === "localhost" || hostname === "0.0.0.0" || hostname === "::1" || hostname.startsWith("127.");
}

function getHostname(host: string): string {
  if (host.startsWith("[")) return host.slice(1, host.indexOf("]"));
  return host.split(":")[0] ?? host;
}

function getPortFromHost(host: string): string | null {
  if (host.startsWith("[")) {
    const match = host.match(/\]:(\d+)$/);
    return match?.[1] ?? null;
  }
  const parts = host.split(":");
  return parts.length > 1 ? (parts.at(-1) ?? null) : null;
}

export function detectLanIpv4Address(): string | undefined {
  return selectPairingLanAddress(networkInterfaces());
}

export function selectPairingLanAddress(
  interfaces: Record<string, Array<{ address: string; family: string | number; internal: boolean }> | undefined>
): string | undefined {
  const candidates: Array<{ address: string; score: number; index: number }> = [];
  let index = 0;
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const address of addresses ?? []) {
      if ((address.family === "IPv4" || address.family === 4) && !address.internal) {
        candidates.push({ address: address.address, score: scoreLanAddressCandidate(name, address.address), index });
        index += 1;
      }
    }
  }
  candidates.sort((left, right) => right.score - left.score || left.index - right.index);
  return candidates[0]?.address;
}

function scoreLanAddressCandidate(interfaceName: string, address: string): number {
  const name = interfaceName.toLowerCase();
  let score = isPrivateIpv4Address(address) ? 100 : 10;
  if (address.startsWith("192.168.")) score += 30;
  else if (address.startsWith("10.")) score += 25;
  else if (isPrivate172Address(address)) score += 20;
  if (/\b(wi-?fi|wlan|wireless|ethernet|local area connection|en\d+|eth\d+)\b/i.test(interfaceName)) score += 50;
  if (/virtual|vmware|vbox|docker|wsl|hyper-v|vethernet|tailscale|zerotier|hamachi|vpn|wireguard|tun|tap|loopback|bridge/.test(name)) score -= 100;
  return score;
}

function isPrivateIpv4Address(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  const [a, b] = parts;
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return a === 10 || isPrivate172Address(address) || (a === 192 && b === 168);
}

function isPrivate172Address(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  const [a, b] = parts;
  return parts.length === 4 && a === 172 && b !== undefined && b >= 16 && b <= 31;
}
