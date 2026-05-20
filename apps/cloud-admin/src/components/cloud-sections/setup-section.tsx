import type { FormEvent } from "react";

export function SetupSection({
  canManage,
  isOwner,
  restaurantReady,
  activeHubCount,
  restaurantName,
  timezone,
  hubConnection,
  onRestaurantNameChange,
  onTimezoneChange,
  onCreateRestaurant,
  onCreateHubConnection
}: {
  canManage: boolean;
  isOwner: boolean;
  restaurantReady: boolean;
  activeHubCount: number;
  restaurantName: string;
  timezone: string;
  hubConnection: { installationId: string; syncSecret: string; envBlock: string } | null;
  onRestaurantNameChange: (value: string) => void;
  onTimezoneChange: (value: string) => void;
  onCreateRestaurant: (event: FormEvent<HTMLFormElement>) => void;
  onCreateHubConnection: () => void;
}) {
  return (
    <div className="setup-flow">
      <section className="admin-panel step-panel">
        <span className="step-number">1</span>
        <h2>Create restaurant</h2>
        {restaurantReady ? (
          <p className="soft-note">Restaurant account is ready.</p>
        ) : (
          <form className="admin-form" onSubmit={onCreateRestaurant}>
            <label className="field-label">
              Restaurant name
              <input value={restaurantName} onChange={(event) => onRestaurantNameChange(event.target.value)} placeholder="Gaurav Restaurant" />
            </label>
            <label className="field-label">
              Timezone
              <input value={timezone} onChange={(event) => onTimezoneChange(event.target.value)} />
            </label>
            <button type="submit">Create restaurant</button>
          </form>
        )}
      </section>

      <section className="admin-panel step-panel">
        <span className="step-number">2</span>
        <h2>Connect the hub PC</h2>
        <p>The hub PC is the restaurant computer. Paste this setup block into that hub's local env file.</p>
        {hubConnection ? (
          <div className="connection-box">
            <pre>{hubConnection.envBlock}</pre>
            <button type="button" onClick={() => void navigator.clipboard.writeText(hubConnection.envBlock)}>
              Copy setup block
            </button>
            <details className="advanced-json">
              <summary>Advanced details</summary>
              <code>{hubConnection.installationId}</code>
            </details>
          </div>
        ) : (
          <>
            <button type="button" disabled={!isOwner || !restaurantReady} onClick={onCreateHubConnection}>
              Create hub connection
            </button>
            {restaurantReady && canManage && !isOwner ? (
              <p className="soft-note">Only the restaurant owner can create a new hub connection. Ask the owner to do this once, then admins can continue normal setup.</p>
            ) : null}
          </>
        )}
      </section>

      <section className="admin-panel step-panel">
        <span className="step-number">3</span>
        <h2>Confirm sync</h2>
        <p>{activeHubCount > 0 ? "The hub has checked in. Reports will arrive after each 6 AM business-day finalization." : "Start the hub app. This portal will show the hub as connected after it syncs."}</p>
      </section>
    </div>
  );
}
