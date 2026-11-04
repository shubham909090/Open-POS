import { useCallback, useEffect, useRef, useState } from "react";
import { checkMobileUpdate, downloadMobileApk, installedMobileVersion, mobileUpdatesSupported, openMobileInstaller, openMobileInstallPermission } from "../lib/mobile-update-service";
import type { MobileUpdate } from "../lib/mobile-update-release";

export type MobileUpdateStatus = "idle" | "checking" | "up_to_date" | "available" | "downloading" | "verifying" | "ready" | "installing" | "installer_opened" | "error";

export function useMobileUpdate() {
  const [status, setStatus] = useState<MobileUpdateStatus>("idle");
  const [available, setAvailable] = useState<MobileUpdate | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const cached = useRef<string | null>(null);
  const cacheVerified = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; active.current?.abort(); };
  }, []);

  const cancel = useCallback(() => {
    active.current?.abort();
    if (mounted.current) { setStatus(available ? "available" : "idle"); setProgress(0); setError(""); }
  }, [available]);

  const check = useCallback(async () => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setStatus("checking");
    setError("");
    try {
      const result = await checkMobileUpdate(controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      if (result?.sha256 !== available?.sha256) { cached.current = null; cacheVerified.current = false; }
      setAvailable(result);
      setStatus(result ? "available" : "up_to_date");
    } catch (failure) {
      if (mounted.current && !controller.signal.aborted) {
        setError(failure instanceof Error ? failure.message : "Could not check for updates.");
        setStatus("error");
      }
    } finally { if (active.current === controller) active.current = null; }
  }, [available]);

  const downloadAndInstall = useCallback(async () => {
    if (!available || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setError("");
    let installerRequested = false;
    try {
      if (!cached.current) {
        setProgress(0);
        setStatus("downloading");
        cached.current = await downloadMobileApk(available, controller.signal,
          value => { if (mounted.current && !controller.signal.aborted) setProgress(value); },
          () => { if (mounted.current && !controller.signal.aborted) setStatus("verifying"); });
      }
      if (!mounted.current || controller.signal.aborted) return;
      setStatus("verifying");
      await openMobileInstaller(available, cached.current, controller.signal, () => {
        installerRequested = true;
        cacheVerified.current = true;
        if (mounted.current && !controller.signal.aborted) setStatus("installing");
      });
      if (mounted.current && !controller.signal.aborted) setStatus("installer_opened");
    } catch (failure) {
      if (mounted.current && !controller.signal.aborted) {
        setError(failure instanceof Error ? failure.message : "Could not open the Android installer.");
        setStatus("error");
        // A missing or damaged cached file must be downloaded again on retry.
        if (!installerRequested) { cached.current = null; cacheVerified.current = false; }
      }
    } finally { if (active.current === controller) active.current = null; }
  }, [available]);

  const openInstallPermission = useCallback(async () => {
    try { await openMobileInstallPermission(); }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "Could not open Android settings."); }
  }, []);

  return { status, available, availableVersion: available?.versionName ?? null, progress, error,
    currentVersion: installedMobileVersion.versionName, supported: mobileUpdatesSupported,
    hasVerifiedDownload: cached.current !== null && cacheVerified.current, check, downloadAndInstall, retryInstall: downloadAndInstall, cancel, openInstallPermission };
}
