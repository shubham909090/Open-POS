"use client";

import { useMemo, useState } from "react";
import { Clipboard, KeyRound, ShieldOff, Smartphone } from "lucide-react";
import { useMutation, useQuery, usePaginatedQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { messageOf } from "../lib/cloud-format";

type Restaurant = {
  _id: Id<"restaurants">;
  name: string;
  timezone: string;
  createdAt: string;
  membershipRole: "owner" | "admin" | "reporting";
};

type PairingCode = { pairingCodeId: Id<"attendancePairingCodes">; code: string; expiresAt: string };
type DeviceCredential = {
  credentialId: Id<"attendanceDeviceCredentials">;
  tokenPrefix: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function AttendanceDevices() {
  const restaurants = useQuery(api.admin.listRestaurants) as Restaurant[] | undefined;
  const createPairingCode = useMutation(api.attendancePairing.createPairingCode);
  const revokeDevice = useMutation(api.attendancePairing.revokeDevice);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<Id<"restaurants"> | "">("");
  const [pairingCode, setPairingCode] = useState<PairingCode | null>(null);
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<Id<"attendanceDeviceCredentials"> | null>(null);

  const selectedRestaurant = useMemo(
    () => restaurants?.find((restaurant) => restaurant._id === selectedRestaurantId) ?? restaurants?.[0] ?? null,
    [restaurants, selectedRestaurantId]
  );
  const canManage = selectedRestaurant?.membershipRole === "owner" || selectedRestaurant?.membershipRole === "admin";
  const { results: devices, status: deviceStatus, loadMore } = usePaginatedQuery(
    api.attendancePairing.listDevices,
    selectedRestaurant && canManage ? { restaurantId: selectedRestaurant._id } : "skip",
    { initialNumItems: 25 }
  );

  async function onCreatePairingCode() {
    if (!selectedRestaurant || !canManage) return;
    setIsCreating(true);
    setNotice(null);
    try {
      const result = await createPairingCode({ restaurantId: selectedRestaurant._id });
      setPairingCode(result);
      setNotice({ tone: "good", text: "One-use pairing code created. It expires in 10 minutes." });
    } catch (error) {
      setNotice({ tone: "bad", text: messageOf(error) });
    } finally {
      setIsCreating(false);
    }
  }

  async function copyCode() {
    if (!pairingCode) return;
    try {
      await navigator.clipboard.writeText(pairingCode.code);
      setNotice({ tone: "good", text: "Full pairing code copied." });
    } catch {
      setNotice({ tone: "bad", text: "Could not copy the code. Select and copy it manually." });
    }
  }

  async function onRevoke(credential: DeviceCredential) {
    if (!selectedRestaurant || !canManage) return;
    if (!window.confirm(`Revoke ${credential.tokenPrefix}…? The Android app will need a new pairing code to reconnect.`)) return;
    setRevokingId(credential.credentialId);
    setNotice(null);
    try {
      await revokeDevice({ restaurantId: selectedRestaurant._id, credentialId: credential.credentialId });
      setNotice({ tone: "good", text: "Device credential revoked." });
    } catch (error) {
      setNotice({ tone: "bad", text: messageOf(error) });
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <section className="loading-panel grid gap-4">
      <section className="admin-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Restaurant access</span>
            <h2>Attendance device pairing</h2>
          </div>
          <Smartphone size={20} />
        </div>
        <label className="field-label max-w-md">
          Restaurant
          <select
            value={selectedRestaurant?._id ?? ""}
            onChange={(event) => {
              setSelectedRestaurantId(event.target.value as Id<"restaurants">);
              setPairingCode(null);
              setNotice(null);
            }}
            disabled={!restaurants?.length || isCreating || revokingId !== null}
          >
            {!restaurants?.length ? <option value="">No restaurants available</option> : null}
            {(restaurants ?? []).map((restaurant) => (
              <option key={restaurant._id} value={restaurant._id}>
                {restaurant.name} · {restaurant.membershipRole}
              </option>
            ))}
          </select>
        </label>
      </section>

      {notice ? <div className={`notice ${notice.tone}`}>{notice.text}</div> : null}

      {restaurants === undefined ? <section className="admin-panel loading-panel">Loading your restaurants…</section> : null}

      {selectedRestaurant && !canManage ? (
        <section className="auth-panel">
          <div>
            <span className="eyebrow">Reporting access</span>
            <h2>Device management is unavailable</h2>
            <p>Your reporting role can view attendance reports, but only restaurant owners and admins can pair or revoke attendance devices.</p>
          </div>
        </section>
      ) : null}

      {selectedRestaurant && canManage ? (
        <>
          <section className="admin-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Step 1</span>
                <h2>Generate a one-use code</h2>
              </div>
              <KeyRound size={20} />
            </div>
            <p>Generate a code, then paste the full code into the new Sky Attendance Android app. The code can be used once and expires 10 minutes after creation.</p>
            <div className="row-actions mt-4 justify-start">
              <button type="button" onClick={() => void onCreatePairingCode()} disabled={isCreating}>
                <KeyRound size={16} />
                {isCreating ? "Generating…" : "Generate pairing code"}
              </button>
            </div>
            {pairingCode ? (
              <div className="mt-4 grid gap-3">
                <code className="setup-block" aria-label="Sky Attendance pairing code">{pairingCode.code}</code>
                <div className="split-row">
                  <p className="muted-copy">Expires {formatDate(pairingCode.expiresAt)}. Keep this code private until it is entered.</p>
                  <button type="button" className="ghost-button" onClick={() => void copyCode()}>
                    <Clipboard size={16} />
                    Copy full code
                  </button>
                </div>
              </div>
            ) : null}
            {deviceStatus === "CanLoadMore" || deviceStatus === "LoadingMore" ? (
              <button type="button" className="ghost-button mt-4" disabled={deviceStatus === "LoadingMore"} onClick={() => loadMore(25)}>
                {deviceStatus === "LoadingMore" ? "Loading…" : "Load older devices"}
              </button>
            ) : null}
          </section>

          <section className="admin-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Step 2</span>
                <h2>Paired devices</h2>
              </div>
              <ShieldOff size={20} />
            </div>
            <p>Revoke a credential when a phone is replaced, lost, or should no longer submit attendance.</p>
            {deviceStatus === "LoadingFirstPage" ? <p className="mt-4">Loading device credentials…</p> : null}
            {deviceStatus !== "LoadingFirstPage" && devices.length === 0 ? <p className="mt-4">No attendance devices are paired for this restaurant.</p> : null}
            {devices?.length ? (
              <div className="record-list mt-4">
                {devices.map((device) => {
                  const revoked = Boolean(device.revokedAt);
                  const expired = Date.parse(device.expiresAt) <= Date.now();
                  return (
                    <article key={device.credentialId} className="record-row">
                      <div>
                        <strong>{device.tokenPrefix}…</strong>
                        <span>Paired {formatDate(device.createdAt)} · expires {formatDate(device.expiresAt)}</span>
                      </div>
                      <div className="row-actions shrink-0">
                        <span className={`state-pill ${revoked ? "revoked" : "active"}`}>
                          {revoked ? "revoked" : expired ? "expired" : "active"}
                        </span>
                        {!revoked ? (
                          <button
                            type="button"
                            className="danger-button"
                            disabled={revokingId === device.credentialId}
                            onClick={() => void onRevoke(device)}
                          >
                            {revokingId === device.credentialId ? "Revoking…" : "Revoke"}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
            {deviceStatus === "CanLoadMore" || deviceStatus === "LoadingMore" ? (
              <button type="button" className="ghost-button mt-4" disabled={deviceStatus === "LoadingMore"} onClick={() => loadMore(25)}>
                {deviceStatus === "LoadingMore" ? "Loading…" : "Load older devices"}
              </button>
            ) : null}
          </section>
        </>
      ) : null}
    </section>
  );
}
