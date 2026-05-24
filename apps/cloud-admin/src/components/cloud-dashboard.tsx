"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Clipboard, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { messageOf } from "../lib/cloud-format";
import { Metric } from "./cloud-admin-widgets";

type ActivationStatus = "active" | "suspended" | "reset" | "revoked";

export function CloudDashboard({ userLabel }: { userLabel: string }) {
  const restaurants = useQuery(api.license.listCommandCenter);
  const createRestaurantLicense = useMutation(api.license.createRestaurantLicense);
  const createSetupKey = useMutation(api.license.createSetupKey);
  const renewLicense = useMutation(api.license.renewLicense);
  const setActivationStatus = useMutation(api.license.setActivationStatus);

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [months, setMonths] = useState(12);
  const [label, setLabel] = useState("Main hub");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [renewMonths, setRenewMonths] = useState(1);
  const [status, setStatus] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [revealedKey, setRevealedKey] = useState<{ setupKey: string; validUntil: string } | null>(null);

  const selectedRestaurant = useMemo(
    () => (restaurants ?? []).find((restaurant) => restaurant.restaurantId === selectedRestaurantId) ?? restaurants?.[0] ?? null,
    [restaurants, selectedRestaurantId]
  );
  const selectedId = selectedRestaurant?.restaurantId ?? "";
  const activeCount = (restaurants ?? []).filter((restaurant) => restaurant.activationStatus === "active").length;
  const expiringCount = (restaurants ?? []).filter((restaurant) => {
    if (!restaurant.licenseValidUntil) return false;
    const days = (new Date(restaurant.licenseValidUntil).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    return days <= 30;
  }).length;

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const result = await createRestaurantLicense({ name, timezone, months, label });
      setRevealedKey({ setupKey: result.setupKey, validUntil: result.validUntil });
      setSelectedRestaurantId(result.restaurantId);
      setName("");
      setStatus({ tone: "good", text: "Restaurant and setup key created." });
    } catch (error) {
      setStatus({ tone: "bad", text: messageOf(error) });
    }
  }

  async function onReplacementKey() {
    if (!selectedId) return;
    try {
      const result = await createSetupKey({ restaurantId: selectedId as Id<"restaurants">, months, label });
      setRevealedKey({ setupKey: result.setupKey, validUntil: result.validUntil });
      setStatus({ tone: "good", text: "Replacement setup key created." });
    } catch (error) {
      setStatus({ tone: "bad", text: messageOf(error) });
    }
  }

  async function onRenew(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    try {
      const result = await renewLicense({ restaurantId: selectedId as Id<"restaurants">, months: renewMonths });
      setStatus({ tone: "good", text: `License renewed until ${result.validUntil.slice(0, 10)}.` });
    } catch (error) {
      setStatus({ tone: "bad", text: messageOf(error) });
    }
  }

  async function updateActivation(activationId: Id<"licenseActivations"> | undefined, activationStatus: ActivationStatus) {
    if (!activationId) return;
    try {
      await setActivationStatus({ activationId, status: activationStatus });
      setStatus({ tone: "good", text: `Activation ${activationStatus}.` });
    } catch (error) {
      setStatus({ tone: "bad", text: messageOf(error) });
    }
  }

  return (
    <section className="dashboard-layout">
      <aside className="admin-rail">
        <div className="identity-card">
          <span className="eyebrow">Platform admin</span>
          <strong>{userLabel}</strong>
          <p>License authority and backup health only. Sales and order data stay off this dashboard.</p>
        </div>

        <label className="field-label">
          Restaurant
          <select value={selectedId} onChange={(event) => setSelectedRestaurantId(event.target.value)}>
            {!restaurants?.length ? <option value="">No restaurants yet</option> : null}
            {(restaurants ?? []).map((restaurant) => (
              <option key={restaurant.restaurantId} value={restaurant.restaurantId}>
                {restaurant.name}
              </option>
            ))}
          </select>
        </label>
      </aside>

      <div className="admin-workspace">
        {status ? <div className={`notice ${status.tone}`}>{status.text}</div> : null}

        <section className="summary-strip" aria-label="Platform summary">
          <Metric label="Restaurants" value={String(restaurants?.length ?? 0)} />
          <Metric label="Active hubs" value={String(activeCount)} />
          <Metric label="Expiring soon" value={String(expiringCount)} />
          <Metric label="Selected" value={selectedRestaurant?.name ?? "None"} />
        </section>

        {revealedKey ? (
          <section className="admin-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Setup key</span>
                <h2>Reveal once</h2>
              </div>
              <button type="button" className="ghost-button" onClick={() => void navigator.clipboard.writeText(revealedKey.setupKey)}>
                <Clipboard size={16} />
                Copy
              </button>
            </div>
            <code className="setup-block">{revealedKey.setupKey}</code>
            <p className="muted-copy">Valid until {revealedKey.validUntil.slice(0, 10)}. Store this now; only the suffix is kept after this screen.</p>
          </section>
        ) : null}

        <section className="admin-grid">
          <form className="admin-panel form-panel" onSubmit={(event) => void onCreate(event)}>
            <div className="section-heading">
              <div>
                <span className="eyebrow">New restaurant</span>
                <h2>Create license</h2>
              </div>
              <ShieldCheck size={20} />
            </div>
            <label>
              Restaurant name
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label>
              Timezone
              <input value={timezone} onChange={(event) => setTimezone(event.target.value)} required />
            </label>
            <label>
              Months
              <input type="number" min={1} max={6000} value={months} onChange={(event) => setMonths(Number(event.target.value))} required />
            </label>
            <label>
              Hub label
              <input value={label} onChange={(event) => setLabel(event.target.value)} />
            </label>
            <button type="submit">
              <KeyRound size={16} />
              Create setup key
            </button>
          </form>

          <section className="admin-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Selected restaurant</span>
                <h2>{selectedRestaurant?.name ?? "Choose restaurant"}</h2>
              </div>
              <RefreshCw size={20} />
            </div>
            <div className="record-list">
              <article className="record-row">
                <div>
                  <strong>License</strong>
                  <span>{selectedRestaurant?.licenseValidUntil ? `Until ${selectedRestaurant.licenseValidUntil.slice(0, 10)}` : "No key"}</span>
                </div>
                <span className="status-pill">{selectedRestaurant?.licenseStatus ?? "missing"}</span>
              </article>
              <article className="record-row">
                <div>
                  <strong>Activation</strong>
                  <span>{selectedRestaurant?.installationId ?? "No hub activated"}</span>
                </div>
                <span className="status-pill">{selectedRestaurant?.activationStatus ?? "not activated"}</span>
              </article>
              <article className="record-row">
                <div>
                  <strong>Backup health</strong>
                  <span>{selectedRestaurant?.lastBackupAt ? `Last backup ${selectedRestaurant.lastBackupAt.slice(0, 16)}` : "Waiting for hub"}</span>
                </div>
                <span className="status-pill">{selectedRestaurant?.backupDomains ?? 0} domains</span>
              </article>
            </div>

            <form className="inline-form" onSubmit={(event) => void onRenew(event)}>
              <label>
                Renew months
                <input type="number" min={1} max={6000} value={renewMonths} onChange={(event) => setRenewMonths(Number(event.target.value))} />
              </label>
              <button type="submit" disabled={!selectedId}>
                Renew
              </button>
            </form>

            <div className="row-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={!selectedRestaurant?.activationId}
                onClick={() => void updateActivation(selectedRestaurant?.activationId, "suspended")}
              >
                Suspend
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!selectedRestaurant?.activationId}
                onClick={() => void updateActivation(selectedRestaurant?.activationId, "active")}
              >
                Unsuspend
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={!selectedRestaurant?.activationId}
                onClick={() => void updateActivation(selectedRestaurant?.activationId, "reset")}
              >
                Reset hub
              </button>
              <button type="button" className="secondary-button" disabled={!selectedId || Boolean(selectedRestaurant?.activationId)} onClick={() => void onReplacementKey()}>
                Replacement key
              </button>
            </div>
          </section>
        </section>

        <section className="admin-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Restaurants</span>
              <h2>Command center</h2>
            </div>
          </div>
          <div className="record-list">
            {(restaurants ?? []).map((restaurant) => (
              <button key={restaurant.restaurantId} type="button" className="record-row" onClick={() => setSelectedRestaurantId(restaurant.restaurantId)}>
                <div>
                  <strong>{restaurant.name}</strong>
                  <span>
                    {restaurant.activationStatus ?? "not activated"} · key {restaurant.setupKeySuffix ? `...${restaurant.setupKeySuffix}` : "missing"}
                  </span>
                </div>
                <span>{restaurant.lastLicenseCheckAt ? restaurant.lastLicenseCheckAt.slice(0, 10) : "never checked"}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
