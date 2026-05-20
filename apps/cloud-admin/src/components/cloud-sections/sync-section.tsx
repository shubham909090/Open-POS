import { friendlyEvent } from "../../lib/cloud-format";
import { EmptyState } from "../cloud-admin-widgets";

export function SyncSection({
  events,
  installations
}: {
  events: Array<{ eventId: string; type: string; aggregateType: string; aggregateId: string; receivedAt: string }>;
  installations: Array<{ installationId: string; status: "active" | "revoked"; lastSeenAt?: string }>;
}) {
  return (
    <div className="sync-grid">
      <section className="admin-panel">
        <span className="eyebrow">Hub PCs</span>
        <h2>Connected hubs</h2>
        <div className="stack-list">
          {installations.map((installation, index) => (
            <article key={installation.installationId} className="list-row split-row">
              <div>
                <strong>Hub PC {index + 1}</strong>
                <span>{installation.lastSeenAt ? `Last seen ${new Date(installation.lastSeenAt).toLocaleString()}` : "Not seen yet"}</span>
              </div>
              <span className={installation.status === "active" ? "state-pill active" : "state-pill revoked"}>{installation.status}</span>
            </article>
          ))}
          {!installations.length ? <EmptyState title="No hub connected" text="Create a hub connection in Setup." /> : null}
        </div>
      </section>
      <section className="admin-panel">
        <span className="eyebrow">Recent activity</span>
        <h2>Synced from hub</h2>
        <div className="timeline-list">
          {events.map((event) => (
            <article key={event.eventId} className="timeline-row">
              <span />
              <div>
                <strong>{friendlyEvent(event.type)}</strong>
                <small>{new Date(event.receivedAt).toLocaleString()}</small>
                <details className="advanced-json">
                  <summary>Advanced details</summary>
                  <code>{event.aggregateType} / {event.aggregateId}</code>
                </details>
              </div>
            </article>
          ))}
          {!events.length ? <EmptyState title="No synced events yet" text="Events arrive when the hub has internet." /> : null}
        </div>
      </section>
    </div>
  );
}
