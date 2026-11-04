import { useContext, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, LockKeyhole, QrCode, Upload } from "lucide-react";
import { PAYMENT_QR_MAX_IMAGE_BYTES } from "@gaurav-pos/shared";
import { hubApi } from "../../hub-api.js";
import type {
  ManagerApproval,
  ManagerApprovalRequest,
} from "../../hooks/use-manager-approval.js";
import { messageOf, type NoticeSetter } from "../../lib/format.js";
import { SettingsPageActiveContext } from "./setup-card.js";
import { readImageFile } from "../../lib/image-file.js";

export function PaymentQrPanel({
  masterPinConfigured,
  requestManagerApproval,
  setNotice,
}: {
  masterPinConfigured: boolean;
  requestManagerApproval: ManagerApprovalRequest;
  setNotice: NoticeSetter;
}) {
  const queryClient = useQueryClient();
  const active = useContext(SettingsPageActiveContext);
  const current = useQuery({
    queryKey: ["payment-qr"],
    queryFn: hubApi.paymentQr,
    enabled: active,
    refetchInterval: active ? 30_000 : false,
  });
  const qr = current.isError ? null : current.data?.qr;
  const [image, setImage] = useState("");
  const [reading, setReading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const originalVersion = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (originalVersion.current !== qr?.updatedAt) {
      originalVersion.current = qr?.updatedAt;
      setImage("");
    }
  }, [qr]);
  // Printed size belongs to each bill printer; this panel only shows it.
  const billPrinters = useQuery({ queryKey: ["bill-printers"], queryFn: hubApi.billPrinters, enabled: active });

  const save = useMutation({
    mutationFn: ({
      imageDataUrl,
      size,
      approval,
      version,
    }: {
      imageDataUrl: string;
      size: number;
      approval: ManagerApproval;
      version: string | null;
    }) => hubApi.updatePaymentQr(imageDataUrl, size, approval, version),
    onSuccess: (result) => {
      queryClient.setQueryData(["payment-qr"], result);
      setImage("");
      setNotice({
        tone: "good",
        text: "Payment QR saved for both bill printers and staff phones.",
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const remove = useMutation({
    mutationFn: ({
      approval,
      version,
    }: {
      approval: ManagerApproval;
      version: string | null;
    }) => hubApi.removePaymentQr(approval, version),
    onSuccess: (result) => {
      queryClient.setQueryData(["payment-qr"], result);
      setImage("");
      setNotice({
        tone: "good",
        text: "Payment QR removed from new bills and staff phones.",
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const busy = reading || save.isPending || remove.isPending;
  const changed = Boolean(image);
  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    if (
      !["image/png", "image/jpeg"].includes(file.type) ||
      file.size > PAYMENT_QR_MAX_IMAGE_BYTES
    ) {
      setNotice({
        tone: "bad",
        text: "Choose a PNG or JPG payment QR smaller than 2 MB.",
      });
      return;
    }
    setReading(true);
    try {
      const data = await readImageFile(file);
      setImage(data);
    } catch (error) {
      setNotice({ tone: "bad", text: messageOf(error) });
    } finally {
      setReading(false);
    }
  };
  const saveWithApproval = async () => {
    const imageDataUrl = image || qr?.imageDataUrl;
    if (!imageDataUrl) return;
    const approval = await requestManagerApproval({
      title: qr ? "Update payment QR" : "Add payment QR",
      message:
        "This changes the payment QR on all new bills and staff phones for this hub.",
      pinLabel: "Master PIN",
      defaultReason: "Update shared payment QR",
      requireReason: false,
      approvedBy: "master",
      confirmLabel: "Save payment QR",
    }).catch(() => null);
    if (approval)
      save.mutate({
        imageDataUrl,
        // Legacy shared size, kept only as the fallback for printers without their own size.
        size: qr?.sizeMm ?? 32,
        approval,
        version: qr?.updatedAt ?? null,
      });
  };
  const removeWithApproval = async () => {
    const approval = await requestManagerApproval({
      title: "Remove payment QR",
      pinLabel: "Master PIN",
      approvedBy: "master",
      message:
        "The QR will disappear from new bills and staff phones. Already printed bills still contain it.",
      defaultReason: "Remove shared payment QR",
      requireReason: false,
      confirmLabel: "Remove QR",
      danger: true,
    }).catch(() => null);
    if (approval) remove.mutate({ approval, version: qr?.updatedAt ?? null });
  };
  return (
    <section className="payment-qr-panel" aria-labelledby="payment-qr-title">
      <div className="payment-qr-heading">
        <div className="payment-qr-icon">
          <QrCode size={24} />
        </div>
        <div>
          <h3 id="payment-qr-title">Restaurant payment QR</h3>
          <p>
            Customer bills and staff phones share the same payment destination.
          </p>
        </div>
        <span className="payment-qr-lock">
          <LockKeyhole size={13} /> Master PIN to change
        </span>
      </div>
      {current.isPending ? (
        <p role="status">Loading payment QR…</p>
      ) : current.isError ? (
        <div role="alert">
          <p>{messageOf(current.error)}</p>
          <button type="button" onClick={() => void current.refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <div className="payment-qr-content">
          <div className="payment-qr-paper">
            {image || qr ? (
              <img
                src={image || qr?.imageDataUrl}
                alt={image ? "New payment QR preview" : "Current payment QR"}
              />
            ) : (
              <QrCode size={100} strokeWidth={1} aria-hidden="true" />
            )}
            <strong>
              {image
                ? "Ready to upload"
                : qr?.payeeName || (qr ? "Scan to pay" : "Add your payment QR")}
            </strong>
            <small>
              {image
                ? "Save with the Master PIN to apply"
                : qr?.upiId || "Use the QR from your UPI app"}
            </small>
          </div>
          <div className="payment-qr-options">
            <p>
              Upload a reusable UPI QR from Google Pay, PhonePe or your bank. We
              prepare a crisp, scannable copy and place it above the bill
              footer.
            </p>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg"
              aria-label="Upload payment QR image"
              className="sr-only"
              onChange={(event) => {
                void chooseFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <div className="payment-qr-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => fileInput.current?.click()}
                disabled={busy || !masterPinConfigured}
              >
                <Upload size={16} />
                {qr || image ? "Choose replacement" : "Choose QR image"}
              </button>
              {qr && (
                <a
                  className="secondary-button payment-qr-download"
                  href={qr.imageDataUrl}
                  download="payment-qr.png"
                >
                  <Download size={16} /> Download current QR
                </a>
              )}
            </div>
            <small>PNG or JPG · up to 2 MB · no fixed payment amount</small>
            <p className="payment-qr-hint">
              Printed size is set for each bill printer in Printers &amp; receipts
              {billPrinters.data
                ? `: ${billPrinters.data.default.label} ${billPrinters.data.default.paymentQrSizeMm} mm${billPrinters.data.alternate.configured ? `, ${billPrinters.data.alternate.label} ${billPrinters.data.alternate.paymentQrSizeMm} mm` : ""}.`
                : "."}{" "}
              Confirm each payment in your UPI app.
            </p>
            {!masterPinConfigured && (
              <p role="status">
                Set a Master PIN in Advanced settings to upload or change the
                payment QR.
              </p>
            )}
            <div className="payment-qr-actions">
              <button
                type="button"
                disabled={busy || !changed || !masterPinConfigured}
                onClick={() => void saveWithApproval()}
              >
                {save.isPending ? "Saving…" : "Save payment QR"}
              </button>
              {changed && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => {
                    setImage("");
                  }}
                >
                  Cancel changes
                </button>
              )}
              {qr && (
                <button
                  type="button"
                  className="payment-qr-remove"
                  disabled={busy || !masterPinConfigured}
                  onClick={() => void removeWithApproval()}
                >
                  Remove QR
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
