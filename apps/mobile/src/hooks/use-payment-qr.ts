import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { feedbackTiming, PAYMENT_QR_MAX_IMAGE_BYTES, type PaymentQr } from "@gaurav-pos/shared";

import type { HubClient } from "../lib/hub-client";

export type PaymentQrChange = ({ kind: "upload"; imageDataUrl: string } | { kind: "remove" }) & { expectedUpdatedAt: string | null };

/** Opens the photo library and returns a PNG/JPEG data URL, or null when the user cancels. */
export async function pickImageDataUrl(maxBytes: number, label: string): Promise<string | null> {
  const selected = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    allowsMultipleSelection: false,
    base64: true,
    quality: 1
  });
  if (selected.canceled) return null;
  const image = selected.assets[0];
  if (!image) throw new Error(`Choose a PNG or JPEG ${label} image.`);
  const file = new File(image.uri);
  const mimeType = image.mimeType ?? file.type;
  if (mimeType !== "image/png" && mimeType !== "image/jpeg") throw new Error(`Choose a PNG or JPEG image of the ${label}.`);
  const sizeLabel = `${Math.round(maxBytes / 1024 / 1024)} MB`;
  if ((image.fileSize ?? file.size) > maxBytes) throw new Error(`Choose a ${label} image smaller than ${sizeLabel}.`);
  const base64 = image.base64 ?? await file.base64();
  if (base64.length > Math.ceil(maxBytes / 3) * 4) throw new Error(`Choose a ${label} image smaller than ${sizeLabel}.`);
  return `data:${mimeType};base64,${base64}`;
}

export function usePaymentQr({ client, online, deviceName }: {
  client: HubClient;
  online: boolean;
  deviceName: string;
}) {
  const [qr, setQr] = useState<PaymentQr | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [change, setChange] = useState<PaymentQrChange | null>(null);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const actionBusy = useRef(false);
  const exportRetry = useRef<boolean | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice((current) => current === notice ? "" : current), feedbackTiming.successNoticeMs);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current += 1;
      request.current?.abort();
    };
  }, []);

  const refresh = useCallback(async (clear = false) => {
    request.current?.abort();
    const version = ++sequence.current;
    if (!online || AppState.currentState === "background") {
      setQr(null);
      setLoading(false);
      setLoadError("Connect to the hub to load the current payment QR.");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10_000);
    if (clear) {
      setQr(null);
      setLoading(true);
      setLoadError("");
    }
    try {
      const result = await client.paymentQr(controller.signal);
      if (!mounted.current || version !== sequence.current) return;
      setQr(result.qr);
      setLoadError("");
    } catch (failure) {
      if (!mounted.current || version !== sequence.current) return;
      setQr(null);
      setLoadError(controller.signal.aborted ? "The hub took too long to respond. Try again." : failure instanceof Error ? failure.message : "Could not load the payment QR.");
    } finally {
      clearTimeout(timeout);
      if (mounted.current && version === sequence.current) setLoading(false);
    }
  }, [client, online]);

  useEffect(() => {
    void refresh(true);
    const poll = setInterval(() => {
      if (!actionBusy.current && AppState.currentState === "active") void refresh();
    }, 10_000);
    const unsubscribe = client.subscribeRealtime((event) => {
      if (event.type === "payment_qr.updated") void refresh(true);
    });
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh(true);
      else {
        sequence.current += 1;
        request.current?.abort();
        setQr(null);
      }
    });
    return () => {
      clearInterval(poll);
      unsubscribe();
      appState.remove();
      sequence.current += 1;
      request.current?.abort();
    };
  }, [client, refresh]);

  async function pickImage() {
    if (actionBusy.current) return;
    setError("");
    setNotice("");
    exportRetry.current = null;
    try {
      const imageDataUrl = await pickImageDataUrl(PAYMENT_QR_MAX_IMAGE_BYTES, "payment QR");
      if (!mounted.current || !imageDataUrl) return;
      setChange({ kind: "upload", imageDataUrl, expectedUpdatedAt: qr?.updatedAt ?? null });
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : "Could not open the photo picker.");
    }
  }

  async function saveChange(pin: string) {
    if (!change || actionBusy.current) return;
    if (!online) {
      setError("Connect to the hub before changing the payment QR.");
      return;
    }
    actionBusy.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    exportRetry.current = null;
    request.current?.abort();
    sequence.current += 1;
    setLoading(false);
    const approval = { masterApproval: {
      pin,
      reason: change.kind === "remove" ? "Remove shared payment QR" : "Update shared payment QR",
      approvedBy: deviceName || "Master PIN holder"
    } };
    try {
      const result = change.kind === "remove"
        ? await client.removePaymentQr(approval, change.expectedUpdatedAt)
        : await client.updatePaymentQr(change.imageDataUrl, approval, undefined, change.expectedUpdatedAt);
      if (!mounted.current) return;
      sequence.current += 1;
      request.current?.abort();
      setQr(result.qr);
      setLoading(false);
      setLoadError("");
      setChange(null);
      setNotice(result.qr ? "Payment QR updated." : "Payment QR removed.");
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : "Could not update the payment QR.");
    } finally {
      actionBusy.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function exportImage(download = false) {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    exportRetry.current = null;
    let destinationVerified = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      // Recheck the destination before exporting, just as when opening this screen.
      const latest = await client.paymentQr(controller.signal);
      clearTimeout(timeout);
      if (!mounted.current) return;
      setQr(latest.qr);
      setLoadError("");
      if (!latest.qr) throw new Error("The payment QR has been removed. Ask the owner to upload one.");
      destinationVerified = true;
      const fileName = `payment-qr-${Date.parse(latest.qr.updatedAt)}.png`;
      const imageBase64 = latest.qr.imageDataUrl.replace(/^data:image\/png;base64,/, "");
      if (download) {
        const directory = await Directory.pickDirectoryAsync();
        const file = directory.createFile(fileName, "image/png");
        file.write(imageBase64, { encoding: "base64" });
        if (mounted.current) setNotice("QR saved.");
        return;
      }
      if (!await Sharing.isAvailableAsync()) throw new Error("Saving and sharing images is unavailable on this device.");
      const file = new File(Paths.cache, fileName);
      file.write(imageBase64, { encoding: "base64" });
      await Sharing.shareAsync(file.uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: "Save or share payment QR" });
    } catch (failure) {
      if (mounted.current) {
        const message = failure instanceof Error ? failure.message : "Could not save the payment QR.";
        if (!/cancel/i.test(message)) {
          if (destinationVerified) {
            exportRetry.current = download;
            setError(download ? "Couldn't save the QR. Try again." : "Couldn't share the QR. Try again.");
          } else {
            setQr(null);
            setLoadError(message);
          }
        }
      }
    } finally {
      clearTimeout(timeout);
      actionBusy.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const editChange = (next: PaymentQrChange | null) => { exportRetry.current = null; setError(""); setChange(next); };
  const retry = () => exportRetry.current === null ? refresh(true) : exportImage(exportRetry.current);
  return { qr, loading, busy, error: error || loadError, notice, change, setChange: editChange, refresh, retry, pickImage, saveChange, exportImage };
}
