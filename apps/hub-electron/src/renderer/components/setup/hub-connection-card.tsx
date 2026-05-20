import { useMutation } from "@tanstack/react-query";
import { Settings } from "lucide-react";
import { useEffect, useState } from "react";

import { hubApi, type Bootstrap } from "../../hub-api.js";
import type { ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import { messageOf, type NoticeSetter } from "../../lib/format.js";
import { SetupCard } from "./setup-card.js";

export function HubConnectionCard({
  bootstrap,
  setNotice,
  requestManagerApproval,
  onSaved,
}: {
  bootstrap: Bootstrap;
  setNotice: NoticeSetter;
  requestManagerApproval: ManagerApprovalRequest;
  onSaved: () => Promise<unknown> | unknown;
}) {
  const [cloudUrl, setCloudUrl] = useState(bootstrap.setup?.hubConnection?.cloudUrl ?? "");
  const [installationId, setInstallationId] = useState(bootstrap.setup?.hubConnection?.installationId ?? "");
  const [syncSecret, setSyncSecret] = useState(bootstrap.setup?.hubConnection?.syncSecret ?? "");
  const [hubPublicUrl, setHubPublicUrl] = useState(bootstrap.setup?.hubConnection?.hubPublicUrl ?? "");
  const [connectionEditing, setConnectionEditing] = useState(!bootstrap.setup?.hubConnection?.configured);
  const connectionConfigured = Boolean(bootstrap.setup?.hubConnection?.configured);

  useEffect(() => {
    const connection = bootstrap.setup?.hubConnection;
    if (!connection) return;
    setCloudUrl(connection.cloudUrl);
    setInstallationId(connection.installationId);
    setSyncSecret(connection.syncSecret);
    setHubPublicUrl(connection.hubPublicUrl);
  }, [bootstrap.setup?.hubConnection]);

  const revealHubConnection = useMutation({
    mutationFn: (pin: string) => hubApi.hubConnection(pin),
    onSuccess: (result) => {
      setCloudUrl(result.cloudUrl);
      setInstallationId(result.installationId);
      setSyncSecret(result.syncSecret);
      setHubPublicUrl(result.hubPublicUrl);
      setConnectionEditing(true);
      setNotice({ tone: "good", text: "Cloud connection details shown." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });

  const saveHubConnection = useMutation({
    mutationFn: (pin: string) => hubApi.updateHubConnection({ cloudUrl, installationId, syncSecret, hubPublicUrl }, pin),
    onSuccess: async () => {
      await onSaved();
      setConnectionEditing(false);
      setNotice({ tone: "good", text: "Cloud connection saved." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });

  const testHubConnection = useMutation({
    mutationFn: (pin: string) => hubApi.testHubConnection(pin),
    onSuccess: (result) => setNotice({ tone: result.status === "connected" ? "good" : "bad", text: result.message }),
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });

  const approveConnectionAction = async (title: string, defaultReason: string) =>
    requestManagerApproval({ title, defaultReason, confirmLabel: "Continue" }).catch(() => null);

  return (
    <SetupCard
      title="Hub Connection And Security"
      done={connectionConfigured}
      icon={<Settings size={20} />}
      summary={connectionConfigured ? "Cloud connection saved" : "Add cloud connection"}
    >
      {connectionConfigured && !connectionEditing ? (
        <div className="saved-settings-card">
          <div>
            <strong>{bootstrap.setup?.hubConnection?.cloudUrl || "Cloud connection saved"}</strong>
            <span>
              ID {bootstrap.setup?.hubConnection?.installationId || "saved"} · Secret hidden · Public URL {bootstrap.setup?.hubConnection?.hubPublicUrl || "not set"}
            </span>
          </div>
          <div className="row-actions">
            <button type="button" className="secondary-button" onClick={() => setConnectionEditing(true)}>
              Edit
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={async () => {
                const approval = await approveConnectionAction("Show cloud connection secrets", "Reveal saved hub cloud connection");
                if (approval) revealHubConnection.mutate(approval.pin);
              }}
              disabled={revealHubConnection.isPending}
            >
              Show saved details
            </button>
            <button
              type="button"
              onClick={async () => {
                const approval = await approveConnectionAction("Test cloud connection", "Test hub cloud connection");
                if (approval) testHubConnection.mutate(approval.pin);
              }}
              disabled={testHubConnection.isPending}
            >
              Test cloud connection
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">Paste the hub connection values from the cloud portal here. These fields are saved on this hub and hidden unless the Manager PIN is entered.</p>
          <form className="template-form" onSubmit={(event) => event.preventDefault()}>
            <input className="sr-only" name="username" tabIndex={-1} autoComplete="username" value="hub-sync" readOnly aria-hidden="true" />
            <label>
              Cloud URL
              <input value={cloudUrl} onChange={(event) => setCloudUrl(event.target.value)} placeholder="https://your-deployment.convex.site" autoComplete="off" />
            </label>
            <label>
              Hub connection ID
              <input value={installationId} onChange={(event) => setInstallationId(event.target.value)} autoComplete="off" />
            </label>
            <label>
              Sync secret
              <input value={syncSecret} onChange={(event) => setSyncSecret(event.target.value)} type="password" autoComplete="current-password" />
            </label>
            <label>
              Hub public URL
              <input value={hubPublicUrl} onChange={(event) => setHubPublicUrl(event.target.value)} placeholder="http://192.168.1.20:3737" autoComplete="off" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saveHubConnection.isPending}
                onClick={async () => {
                  const approval = await approveConnectionAction("Save cloud connection", "Save hub cloud connection");
                  if (approval) saveHubConnection.mutate(approval.pin);
                }}
              >
                Save connection
              </button>
              {connectionConfigured ? (
                <button type="button" className="secondary-button" onClick={() => setConnectionEditing(false)}>
                  Cancel
                </button>
              ) : null}
              <button
                type="button"
                className="secondary-button"
                onClick={async () => {
                  const approval = await approveConnectionAction("Test cloud connection", "Test hub cloud connection");
                  if (approval) testHubConnection.mutate(approval.pin);
                }}
                disabled={testHubConnection.isPending}
              >
                Test cloud connection
              </button>
            </div>
          </form>
        </>
      )}
    </SetupCard>
  );
}
