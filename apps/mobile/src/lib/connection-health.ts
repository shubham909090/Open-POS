import type { ConnectionState } from "./mobile-types";

export const MOBILE_REFRESH_INTERVAL_MS = 12_000;
export const MOBILE_REALTIME_REFRESH_DEBOUNCE_MS = 500;

export function nextConnectionAfterRefresh(input: {
  success: boolean;
  previous: ConnectionState;
  failures: number;
  hasBootstrap: boolean;
  showSpinner: boolean;
}): { connection: ConnectionState; failures: number; shouldShowOfflineMessage: boolean } {
  if (input.success) return { connection: "online", failures: 0, shouldShowOfflineMessage: false };

  const failures = input.failures + 1;
  const shouldKeepLastKnownOnline = input.hasBootstrap && failures < 2 && !input.showSpinner;
  if (shouldKeepLastKnownOnline) {
    return { connection: input.previous === "checking" ? "online" : input.previous, failures, shouldShowOfflineMessage: false };
  }

  return { connection: "offline", failures, shouldShowOfflineMessage: true };
}

export function nextConnectionAfterDevicePairing(): { connection: ConnectionState; failures: number } {
  return { connection: "checking", failures: 0 };
}

export function shouldShowMobileOnboarding(input: {
  setupOpen: boolean;
  deviceToken: string;
  connection: ConnectionState;
}): boolean {
  return input.setupOpen || !input.deviceToken || input.connection === "offline";
}
