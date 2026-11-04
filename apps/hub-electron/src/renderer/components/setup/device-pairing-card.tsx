import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { QrCode } from "lucide-react";
import { formatPosDateTime } from "@gaurav-pos/shared";
import { type NoticeSetter, messageOf } from "../../lib/format.js";
import type { ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import {
  hubApi,
  type LocalDevice,
  type PairingCodeResult,
  type Role,
} from "../../hub-api.js";
import { SetupCard } from "./setup-card.js";
import { EmptyState } from "../ui/empty-state.js";
import { ConfirmationDialog } from "../ui/confirmation-dialog.js";

const roleOptions: Array<{
  role: Role;
  title: string;
  description: string;
  permissions: string;
}> = [
  {
    role: "captain",
    title: "Captain",
    description: "Senior service phone",
    permissions: "Orders, billing, transfers and payment QR",
  },
  {
    role: "waiter",
    title: "Waiter",
    description: "Order-taking phone",
    permissions: "Tables, menu, KOT and payment QR display",
  },
  {
    role: "kitchen",
    title: "Kitchen",
    description: "Kitchen display screen",
    permissions: "Kitchen tickets and payment QR display",
  },
];

export function DevicePairingCard({
  devices,
  loading,
  setNotice,
  requestManagerApproval,
  onChanged,
}: {
  devices: LocalDevice[];
  loading: boolean;
  setNotice: NoticeSetter;
  requestManagerApproval: ManagerApprovalRequest;
  onChanged: () => Promise<void>;
}) {
  const [deviceName, setDeviceName] = useState("");
  const [role, setRole] = useState<Role>("waiter");
  const [pairing, setPairing] = useState<PairingCodeResult | null>(null);
  const [pairingRole, setPairingRole] = useState<Role>("waiter");
  const [deviceSearch, setDeviceSearch] = useState("");
  const [revoking, setRevoking] = useState<LocalDevice | null>(null);
  const createButton = useRef<HTMLButtonElement>(null);
  const restoreCreateFocus = useRef(false);

  const activeDevices = devices.filter(
    (device) =>
      device.id !== "device-local-admin" && device.status !== "revoked",
  );
  const visibleDevices = activeDevices.filter((device) => {
    const needle = deviceSearch.trim().toLowerCase();
    if (!needle) return true;
    return [device.name, device.role, device.status].some((part) =>
      part.toLowerCase().includes(needle),
    );
  });

  const createPairing = useMutation({
    mutationFn: async () => {
      const managerApproval = await requestManagerApproval({
        title: "Approve Device Pairing",
        message:
          role === "captain"
            ? "Captain phones can bill, settle payments, and shift running tables. Only create this QR when the phone is in front of you."
            : "This creates a one-time QR code that lets a phone join this hub.",
        defaultReason: `Pair ${deviceName.trim() || `${role} device`}`,
        confirmLabel: "Create QR",
      }).catch(() => null);
      if (!managerApproval) {
        restoreCreateFocus.current = true;
        return null;
      }
      return hubApi.createPairingCode({
        deviceName: deviceName.trim() || `${role} device`,
        role,
        expiresInMinutes: 10,
        managerApproval,
      });
    },
    onSuccess: async (result) => {
      if (!result) return;
      setPairing(result);
      setPairingRole(role);
      setNotice({
        tone: "good",
        text: "QR code created. Scan it from the phone app within 10 minutes.",
      });
      await onChanged();
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });

  useEffect(() => {
    if (createPairing.isPending || !restoreCreateFocus.current) return;
    restoreCreateFocus.current = false;
    createButton.current?.focus();
  }, [createPairing.isPending]);

  const revoke = useMutation({
    mutationFn: hubApi.revokeDevice,
    onSuccess: async () => {
      setRevoking(null);
      setNotice({ tone: "good", text: "Device revoked." });
      await onChanged();
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });

  return (
    <SetupCard
      title="Pair phones and devices"
      done={activeDevices.length > 0}
      icon={<QrCode size={20} />}
      summary={`${activeDevices.length} paired devices`}
    >
      <section className="pairing-create" aria-labelledby="pairing-create-title">
        <h3 id="pairing-create-title">Pair a new phone</h3>
        <div
          className="role-card-grid"
          role="group"
          aria-label="Staff device role"
        >
          {roleOptions.map((option) => (
            <button
              key={option.role}
              type="button"
              className={`role-card ${role === option.role ? "active" : ""}`}
              aria-pressed={role === option.role}
              onClick={() => setRole(option.role)}
            >
              <strong>{option.title}</strong>
              <span>{option.description}</span>
              <small>{option.permissions}</small>
            </button>
          ))}
        </div>
        <form
          className="pairing-form pairing-create-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!createPairing.isPending) createPairing.mutate();
          }}
        >
          <label>
            Device name
            <input
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              placeholder={`${roleOptions.find((option) => option.role === role)?.title} phone 1`}
            />
          </label>
          <button ref={createButton} type="submit" disabled={createPairing.isPending}>
            {createPairing.isPending ? "Creating..." : "Create QR code"}
          </button>
        </form>
      </section>
      {pairing ? (
        <section className="pairing-card">
          <div className="pairing-qr-panel">
            <img src={pairing.qrDataUrl} alt="Device pairing QR code" />
            <div className="pairing-code">
              <strong>Code {pairing.code}</strong>
              <span>Expires {formatPosDateTime(pairing.expiresAt)}</span>
            </div>
          </div>
          <div className="pairing-side">
          <ol className="pairing-steps">
            <li>On the phone open <strong>Settings → Pair phone</strong>.</li>
            <li>Tap <strong>Scan pairing QR</strong>, or type code <strong>{pairing.code}</strong>.</li>
            <li>The phone opens as <strong>{roleOptions.find((option) => option.role === pairingRole)?.title ?? pairingRole}</strong> once paired.</li>
          </ol>
          <details className="pairing-payload-panel">
            <summary>Pair without scanning</summary>
            <span>Use this payload only if QR scanning is unavailable.</span>
            <textarea aria-label="Manual pairing payload" readOnly value={pairing.pairingPayloadText} />
          </details>
          </div>
        </section>
      ) : null}
      <div className="record-list">
        <div className="record-list-header">
          <h3>Paired devices <span>{activeDevices.length}</span></h3>
          {activeDevices.length > 12 ? (
            <input
              value={deviceSearch}
              aria-label="Search paired devices"
              onChange={(event) => setDeviceSearch(event.target.value)}
              placeholder="Search paired devices"
            />
          ) : null}
        </div>
        {loading ? (
          <p className="text-sm text-muted">Loading paired devices...</p>
        ) : null}
        {!loading && activeDevices.length === 0 ? (
          <EmptyState
            title="No phones paired yet"
            description="Create a QR code above, then scan it from the Android app."
          />
        ) : null}
        {visibleDevices.length ? (
          <div className="record-rows device-rows">
            {visibleDevices.map((device) => (
              <article key={device.id} className="record-row device-row">
                <div className="record-row-main">
                  <strong>{device.name}</strong>
                  <span className={`role-pill role-${device.role}`}>{device.role}</span>
                  {device.status !== "active" ? <span>{device.status}</span> : null}
                </div>
                <span className="device-seen">
                  {device.last_seen_at ? `Seen ${formatPosDateTime(device.last_seen_at)}` : "Never seen"}
                </span>
                <button
                  type="button"
                  className="record-action danger pairing-revoke-button"
                  onClick={() => setRevoking(device)}
                  disabled={revoke.isPending}
                  aria-label={`Revoke ${device.name}`}
                >
                  Revoke
                </button>
              </article>
            ))}
          </div>
        ) : null}
      </div>
      <ConfirmationDialog
        open={Boolean(revoking)}
        title={`Revoke ${revoking?.name ?? "device"}?`}
        message="This phone will lose access to the hub. To use it again, create a new pairing code."
        confirmLabel={revoke.isPending ? "Revoking…" : "Revoke device"}
        danger
        busy={revoke.isPending}
        onCancel={() => {
          if (!revoke.isPending) setRevoking(null);
        }}
        onConfirm={() => {
          if (revoking && !revoke.isPending) revoke.mutate(revoking.id);
        }}
      />
    </SetupCard>
  );
}
