export function buildRealtimeUrl(hubUrl: string, token: string): string {
  const parsed = new URL(hubUrl);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  parsed.pathname = "/realtime";
  parsed.search = `?token=${encodeURIComponent(token)}`;
  return parsed.toString();
}

export class HubHttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "HubHttpError";
  }
}

export function isHubHttpError(error: unknown): error is HubHttpError {
  return error instanceof HubHttpError;
}

export function createIdempotencyKey(prefix: string): string {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomId}`;
}

export function getLocalOnlyHubUrlMessage(hubUrl: string): string | null {
  try {
    const parsed = new URL(hubUrl);
    const hostname = parsed.hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
    const isLocalOnly = hostname === "localhost" || hostname === "0.0.0.0" || hostname === "::1" || hostname.startsWith("127.");
    if (!isLocalOnly) return null;
    return `This QR points to ${hubUrl}. On Android, that address means this phone, not the hub. In the hub app, set Hub public URL to the hub PC LAN address, for example http://192.168.1.20:3737, then create a fresh QR.`;
  } catch {
    return null;
  }
}

export function getPairingFailureAlert(hubUrl: string, error: unknown): { title: string; message: string } {
  const reason = error instanceof Error ? error.message : "Try a fresh code from the hub.";
  if (isHubHttpError(error)) {
    return {
      title: "Pairing failed",
      message: reason
    };
  }
  return {
    title: "Hub not reachable",
    message: `Could not connect to ${hubUrl}.\n\n${reason}\n\nKeep this phone and hub on the same Wi-Fi, and confirm the hub firewall allows port 3737.`
  };
}
