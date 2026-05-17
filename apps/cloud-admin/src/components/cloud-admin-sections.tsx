import type { FormEvent } from "react";

import type { Id } from "../../../../convex/_generated/dataModel";
import { commandTypes, humanPayments, friendlyEvent, money, type CommandType } from "../lib/cloud-format";
import type { InviteRole, StaffRole } from "../lib/cloud-types";
import { EmptyState, Metric } from "./cloud-admin-widgets";

function ReportsSection({
  reports,
  selectedDate,
  onSelectDate,
  detail
}: {
  reports: Array<{
    businessDate: string;
    billCount: number;
    grossSalesPaise: number;
    discountPaise: number;
    tipPaise: number;
    finalSalesPaise: number;
    totalPaymentsPaise: number;
    finalizedAt: string;
  }>;
  selectedDate: string;
  onSelectDate: (value: string) => void;
  detail:
    | {
        report: {
          businessDate: string;
          grossSalesPaise: number;
          discountPaise: number;
          tipPaise: number;
          finalSalesPaise: number;
          cashPaymentsPaise: number;
          upiPaymentsPaise: number;
          cardPaymentsPaise: number;
          onlinePaymentsPaise: number;
          totalPaymentsPaise: number;
          billCount: number;
          paidBills: number;
          cancelledOrders: number;
          finalizedAt: string;
        };
        bills: Array<{
          billId: string;
          tableName: string;
          finalTotalPaise: number;
          paidPaise: number;
          paymentsJson: string;
          status: string;
        }>;
        items: Array<{ menuItemId: string; name: string; saleGroupName?: string; quantity: number; grossSalesPaise: number; ncQuantity?: number; ncGrossSalesPaise?: number }>;
        groups: Array<{ saleGroupId: string; name: string; kind: string; quantity: number; grossSalesPaise: number; taxPaise: number; finalSalesPaise: number; ncQuantity: number; ncGrossSalesPaise: number }>;
      }
    | null
    | undefined;
}) {
  if (!reports.length) {
    return (
      <section className="admin-panel">
        <span className="eyebrow">Reports</span>
        <h2>No finalized reports yet</h2>
        <p>The hub finalizes each business day after the 6 AM IST boundary once old tables are settled or cancelled. Synced reports will appear here.</p>
      </section>
    );
  }

  const report = detail?.report;
  return (
    <div className="cloud-report-layout">
      <section className="admin-panel">
        <span className="eyebrow">Reports</span>
        <h2>Finalized business days</h2>
        <label className="field-label date-picker">
          Business date
          <select value={selectedDate} onChange={(event) => onSelectDate(event.target.value)}>
            {reports.map((row) => (
              <option key={row.businessDate} value={row.businessDate}>
                {row.businessDate}
              </option>
            ))}
          </select>
        </label>
        <div className="stack-list">
          {reports.map((row) => (
            <button key={row.businessDate} type="button" className={row.businessDate === selectedDate ? "report-select active" : "report-select"} onClick={() => onSelectDate(row.businessDate)}>
              <strong>{row.businessDate}</strong>
              <span>{row.billCount} bills · {money(row.finalSalesPaise)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="admin-panel wide-panel">
        {report ? (
          <>
            <span className="eyebrow">Day report</span>
            <h2>{report.businessDate}</h2>
            <div className="report-metric-grid">
              <Metric label="Final sales" value={money(report.finalSalesPaise)} />
              <Metric label="Gross sales" value={money(report.grossSalesPaise)} />
              <Metric label="Discounts" value={money(report.discountPaise)} />
              <Metric label="Tips" value={money(report.tipPaise)} />
              <Metric label="Cash" value={money(report.cashPaymentsPaise)} />
              <Metric label="UPI" value={money(report.upiPaymentsPaise)} />
              <Metric label="Card" value={money(report.cardPaymentsPaise)} />
              <Metric label="Online" value={money(report.onlinePaymentsPaise)} />
              <Metric label="Bills" value={String(report.billCount)} />
            </div>

            <div className="report-detail-grid">
              <section>
                <h3>Groups</h3>
                <div className="stack-list">
                  {(detail.groups ?? []).map((group) => (
                    <article key={group.saleGroupId} className="list-row split-row">
                      <div>
                        <strong>{group.name}</strong>
                        <span>{group.quantity} sold · tax {money(group.taxPaise)}{group.ncQuantity ? ` · NC ${group.ncQuantity}` : ""}</span>
                      </div>
                      <strong>{money(group.finalSalesPaise)}</strong>
                    </article>
                  ))}
                </div>
              </section>
              <section>
                <h3>Bills</h3>
                <div className="stack-list">
                  {detail.bills.map((bill) => (
                    <article key={bill.billId} className="list-row split-row">
                      <div>
                        <strong>{bill.tableName}</strong>
                        <span>{bill.status} · paid {money(bill.paidPaise)}</span>
                        <details className="advanced-json">
                          <summary>Payment details</summary>
                          <code>{humanPayments(bill.paymentsJson)}</code>
                        </details>
                      </div>
                      <strong>{money(bill.finalTotalPaise)}</strong>
                    </article>
                  ))}
                </div>
              </section>
              <section>
                <h3>Items</h3>
                <div className="stack-list">
                  {detail.items.map((item) => (
                    <article key={item.menuItemId} className="list-row split-row">
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.quantity} sold{item.saleGroupName ? ` · ${item.saleGroupName}` : ""}{item.ncQuantity ? ` · NC ${item.ncQuantity}` : ""}</span>
                      </div>
                      <strong>{money(item.grossSalesPaise)}</strong>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </>
        ) : (
          <EmptyState title="Report loading" text="Choose a finalized business day to see sales, payments, bills, and item totals." />
        )}
      </section>
    </div>
  );
}

function SetupSection({
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

function StaffSection({
  canManage,
  isOwner,
  members,
  invitations,
  email,
  role,
  onEmailChange,
  onRoleChange,
  onInvite,
  onRoleUpdate,
  onRemove,
  onRevoke
}: {
  canManage: boolean;
  isOwner: boolean;
  members: Array<{ _id: Id<"memberships">; email?: string; name?: string; role: StaffRole; createdAt: string; isCurrentUser: boolean }>;
  invitations: Array<{ _id: Id<"memberInvitations">; email: string; role: InviteRole; status: "pending" | "accepted" | "revoked"; createdAt: string }>;
  email: string;
  role: InviteRole;
  onEmailChange: (value: string) => void;
  onRoleChange: (value: InviteRole) => void;
  onInvite: (event: FormEvent<HTMLFormElement>) => void;
  onRoleUpdate: (membershipId: Id<"memberships">, role: InviteRole) => void;
  onRemove: (membershipId: Id<"memberships">) => void;
  onRevoke: (invitationId: Id<"memberInvitations">) => void;
}) {
  if (!canManage) return <EmptyState title="Reporting access" text="This Google account can view reports. Staff setup is available to owners and admins." />;
  return (
    <div className="staff-layout">
      <section className="admin-panel">
        <span className="eyebrow">Invite</span>
        <h2>Add staff access</h2>
        <form className="admin-form" onSubmit={onInvite}>
          <label className="field-label">
            Email
            <input value={email} onChange={(event) => onEmailChange(event.target.value)} type="email" />
          </label>
          <label className="field-label">
            Role
            <select value={role} onChange={(event) => onRoleChange(event.target.value as InviteRole)}>
              <option value="admin">Admin</option>
              <option value="reporting">Reporting</option>
            </select>
          </label>
          <button type="submit">Save invitation</button>
        </form>
      </section>
      <section className="admin-panel">
        <span className="eyebrow">Members</span>
        <h2>Cloud users</h2>
        <div className="stack-list">
          {members.map((member) => (
            <article key={member._id} className="staff-row">
              <div>
                <strong>{member.name || member.email || "Member"}</strong>
                <span>{member.role}</span>
              </div>
              <div className="row-actions">
                {member.role === "owner" ? <span className="state-pill active">owner</span> : (
                  <select disabled={!isOwner} value={member.role} onChange={(event) => onRoleUpdate(member._id, event.target.value as InviteRole)}>
                    <option value="admin">admin</option>
                    <option value="reporting">reporting</option>
                  </select>
                )}
                <button type="button" className="ghost-button" disabled={!isOwner || member.isCurrentUser || member.role === "owner"} onClick={() => onRemove(member._id)}>
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="admin-panel wide-panel">
        <span className="eyebrow">Invitations</span>
        <h2>Saved invites</h2>
        <div className="stack-list compact-list">
          {invitations.map((invitation) => (
            <article key={invitation._id} className="staff-row">
              <div>
                <strong>{invitation.email}</strong>
                <span>{invitation.role} · {invitation.status}</span>
              </div>
              <button type="button" className="ghost-button" disabled={invitation.status !== "pending"} onClick={() => onRevoke(invitation._id)}>
                Revoke
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function SyncSection({
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

function AdvancedSection({
  canManage,
  commandType,
  payloadJson,
  commands,
  onCommandTypeChange,
  onPayloadChange,
  onQueue
}: {
  canManage: boolean;
  commandType: CommandType;
  payloadJson: string;
  commands: Array<{ commandId: string; type: CommandType; payloadJson: string; createdAt: string }>;
  onCommandTypeChange: (value: CommandType) => void;
  onPayloadChange: (value: string) => void;
  onQueue: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="command-layout">
      <section className="admin-panel">
        <span className="eyebrow">Advanced</span>
        <h2>Support command</h2>
        <p>Normal restaurants should not need this. Use only for support or imports.</p>
        <form className="admin-form" onSubmit={onQueue}>
          <label className="field-label">
            Command
            <select value={commandType} onChange={(event) => onCommandTypeChange(event.target.value as CommandType)}>
              {commandTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label className="field-label">
            Raw support payload
            <textarea value={payloadJson} onChange={(event) => onPayloadChange(event.target.value)} spellCheck={false} />
          </label>
          <button type="submit" disabled={!canManage}>Queue for hub</button>
        </form>
      </section>
      <section className="admin-panel">
        <span className="eyebrow">History</span>
        <h2>Recent commands</h2>
        <div className="stack-list">
          {commands.map((command) => (
            <article key={command.commandId} className="list-row">
              <strong>{command.type}</strong>
              <span>{new Date(command.createdAt).toLocaleString()}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export { AdvancedSection, ReportsSection, SetupSection, StaffSection, SyncSection };
