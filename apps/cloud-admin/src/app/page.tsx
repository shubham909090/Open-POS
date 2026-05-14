"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type Section = "setup" | "reports" | "staff" | "sync" | "advanced";
type StaffRole = "owner" | "admin" | "reporting";
type InviteRole = "admin" | "reporting";

const commandTypes = [
  "menu_item.upsert",
  "menu_item.disabled",
  "production_unit.upsert",
  "receipt_printer.updated",
  "device.updated",
  "device.revoked"
] as const;
type CommandType = (typeof commandTypes)[number];

function commandPayloadTemplate(type: CommandType) {
  const templates: Record<CommandType, object> = {
    "menu_item.upsert": {
      id: "item-example",
      name: "Example dish",
      pricePaise: 10000,
      productionUnitId: null,
      active: true
    },
    "menu_item.disabled": { id: "item-example" },
    "production_unit.upsert": {
      id: "unit-example",
      name: "Kitchen",
      printerMode: "network",
      printerHost: "192.168.1.50",
      printerPort: 9100,
      kdsEnabled: true,
      active: true
    },
    "receipt_printer.updated": {
      printerMode: "system",
      printerName: "Cash Counter Printer",
      printerHost: "",
      printerPort: 9100
    },
    "device.updated": { hubDeviceId: "paste-hub-device-id", name: "Captain phone", role: "captain", status: "active" },
    "device.revoked": { hubDeviceId: "paste-hub-device-id" }
  };
  return JSON.stringify(templates[type], null, 2);
}

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(paise / 100);
}

export default function CloudAdminHome() {
  const { user, signOut } = useAuth();

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <span className="product-mark">Gaurav POS</span>
          <h1>Owner Portal</h1>
          <p>Connect the restaurant hub, invite cloud users, and read closed-day reports.</p>
        </div>
        {user ? (
          <div className="topbar-actions">
            <span className="user-pill">{user.email ?? user.firstName ?? "Signed in"}</span>
            <button type="button" className="ghost-button" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        ) : (
          <Link href="/sign-in" className="button-link">
            Sign in with Google
          </Link>
        )}
      </header>

      <AuthLoading>
        <section className="admin-panel loading-panel">Checking Google session...</section>
      </AuthLoading>

      <Unauthenticated>
        <section className="auth-panel">
          <div>
            <span className="eyebrow">Authentication</span>
            <h2>Google sign-in required</h2>
            <p>Use the Google account that owns or manages this restaurant.</p>
          </div>
          <Link href="/sign-in" className="button-link">
            Continue with Google
          </Link>
        </section>
      </Unauthenticated>

      <Authenticated>
        <CloudDashboard userLabel={user?.firstName ?? user?.email ?? "Owner"} />
      </Authenticated>
    </main>
  );
}

function CloudDashboard({ userLabel }: { userLabel: string }) {
  const restaurants = useQuery(api.admin.listRestaurants);
  const createRestaurant = useMutation(api.admin.createRestaurant);
  const createHubConnection = useMutation(api.admin.createHubConnection);
  const inviteStaff = useMutation(api.admin.inviteStaff);
  const updateMemberRole = useMutation(api.admin.updateMemberRole);
  const removeMember = useMutation(api.admin.removeMember);
  const revokeInvitation = useMutation(api.admin.revokeInvitation);
  const acceptInvitation = useMutation(api.admin.acceptInvitation);
  const enqueueHubCommand = useMutation(api.admin.enqueueHubCommand);

  const [section, setSection] = useState<Section>("reports");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [hubConnection, setHubConnection] = useState<{ installationId: string; syncSecret: string; envBlock: string } | null>(null);
  const [staffEmail, setStaffEmail] = useState("");
  const [staffRole, setStaffRole] = useState<InviteRole>("admin");
  const [commandType, setCommandType] = useState<CommandType>("menu_item.upsert");
  const [payloadJson, setPayloadJson] = useState(() => commandPayloadTemplate("menu_item.upsert"));
  const [status, setStatus] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const restaurantId = useMemo(() => {
    const fallback = restaurants?.[0]?._id ?? "";
    return (selectedRestaurantId || fallback) as Id<"restaurants"> | "";
  }, [restaurants, selectedRestaurantId]);
  const selectedRestaurant = (restaurants ?? []).find((restaurant) => restaurant._id === restaurantId) ?? restaurants?.[0] ?? null;
  const canManage = selectedRestaurant?.membershipRole === "owner" || selectedRestaurant?.membershipRole === "admin";
  const isOwner = selectedRestaurant?.membershipRole === "owner";

  const installations = useQuery(api.admin.listInstallations, restaurantId && canManage ? { restaurantId } : "skip");
  const staff = useQuery(api.admin.listStaff, restaurantId && canManage ? { restaurantId } : "skip");
  const invitations = useQuery(api.admin.listMyPendingInvitations);
  const commands = useQuery(api.admin.listHubCommands, restaurantId && canManage ? { restaurantId } : "skip");
  const events = useQuery(api.admin.listRecentEvents, restaurantId ? { restaurantId } : "skip");
  const reports = useQuery(api.admin.listDailyReports, restaurantId ? { restaurantId } : "skip");
  const [selectedReportDate, setSelectedReportDate] = useState("");

  useEffect(() => {
    if (!reports?.length) return;
    const firstReport = reports[0];
    if (firstReport) setSelectedReportDate((current) => current || firstReport.businessDate);
  }, [reports]);

  const reportDetail = useQuery(
    api.admin.getDailyReport,
    restaurantId && selectedReportDate ? { restaurantId, businessDate: selectedReportDate } : "skip"
  );
  const activeHubCount = (installations ?? []).filter((row) => row.status === "active" && row.lastSeenAt).length;
  const latestReport = reports?.[0];
  const pendingInvitation = invitations?.[0];

  async function onCreateRestaurant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const result = await createRestaurant({ name: restaurantName, timezone });
      setSelectedRestaurantId(result.restaurantId);
      setRestaurantName("");
      setStatus({ tone: "good", text: "Restaurant created. Next, connect the hub PC." });
    } catch (error) {
      setStatus({ tone: "bad", text: messageOf(error) });
    }
  }

  async function onCreateHubConnection() {
    if (!restaurantId) return;
    try {
      const result = await createHubConnection({ restaurantId, label: selectedRestaurant?.name ?? "main-hub" });
      setHubConnection(result);
      setStatus({ tone: "good", text: "Hub connection created. Paste the setup block into the hub PC env file." });
    } catch (error) {
      setStatus({ tone: "bad", text: messageOf(error) });
    }
  }

  async function onInviteStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!restaurantId) return;
    try {
      await inviteStaff({ restaurantId, email: staffEmail, role: staffRole });
      setStaffEmail("");
      setStatus({ tone: "good", text: "Staff invitation saved." });
    } catch (error) {
      setStatus({ tone: "bad", text: messageOf(error) });
    }
  }

  async function onQueueCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!restaurantId) return;
    try {
      JSON.parse(payloadJson);
      await enqueueHubCommand({ restaurantId, type: commandType, payloadJson });
      setStatus({ tone: "good", text: "Support command queued for the hub." });
    } catch (error) {
      setStatus({ tone: "bad", text: messageOf(error) });
    }
  }

  return (
    <section className="dashboard-layout">
      <aside className="admin-rail">
        <div className="identity-card">
          <span className="eyebrow">Signed in</span>
          <strong>{userLabel}</strong>
          <p>Reports are available here after the hub closes and syncs a POS day.</p>
        </div>

        <label className="field-label">
          Restaurant
          <select value={restaurantId} onChange={(event) => setSelectedRestaurantId(event.target.value)}>
            {!restaurants?.length ? <option value="">Create restaurant first</option> : null}
            {(restaurants ?? []).map((restaurant) => (
              <option key={restaurant._id} value={restaurant._id}>
                {restaurant.name}
              </option>
            ))}
          </select>
        </label>

        <nav className="rail-nav" aria-label="Owner portal sections">
          <RailButton section="reports" active={section} setSection={setSection} label="Reports" />
          <RailButton section="setup" active={section} setSection={setSection} label="Hub Setup" />
          <RailButton section="staff" active={section} setSection={setSection} label="Staff" />
          <RailButton section="sync" active={section} setSection={setSection} label="Sync Health" />
          <RailButton section="advanced" active={section} setSection={setSection} label="Advanced" />
        </nav>
      </aside>

      <div className="admin-workspace">
        {status ? <div className={`notice ${status.tone}`}>{status.text}</div> : null}
        {pendingInvitation ? (
          <section className="invite-banner">
            <div>
              <strong>Pending staff invitation</strong>
              <p>{pendingInvitation.restaurantName} invited this Google account as {pendingInvitation.role}.</p>
            </div>
            <button type="button" onClick={() => void acceptInvitation({ invitationId: pendingInvitation._id })}>
              Accept
            </button>
          </section>
        ) : null}

        <section className="summary-strip" aria-label="Restaurant summary">
          <Metric label="Restaurant" value={selectedRestaurant?.name ?? "Not created"} />
          <Metric label="Your role" value={selectedRestaurant?.membershipRole ?? "none"} />
          <Metric label="Connected hubs" value={String(activeHubCount)} />
          <Metric label="Latest report" value={latestReport ? latestReport.businessDate : "Waiting"} />
        </section>

        {section === "reports" ? (
          <ReportsSection
            reports={reports ?? []}
            selectedDate={selectedReportDate}
            onSelectDate={setSelectedReportDate}
            detail={reportDetail ?? null}
          />
        ) : null}

        {section === "setup" ? (
          <SetupSection
            canManage={Boolean(canManage)}
            restaurantReady={Boolean(restaurants?.length)}
            activeHubCount={activeHubCount}
            restaurantName={restaurantName}
            timezone={timezone}
            hubConnection={hubConnection}
            onRestaurantNameChange={setRestaurantName}
            onTimezoneChange={setTimezone}
            onCreateRestaurant={(event) => void onCreateRestaurant(event)}
            onCreateHubConnection={() => void onCreateHubConnection()}
          />
        ) : null}

        {section === "staff" ? (
          <StaffSection
            canManage={Boolean(canManage)}
            isOwner={Boolean(isOwner)}
            members={staff?.members ?? []}
            invitations={staff?.invitations ?? []}
            email={staffEmail}
            role={staffRole}
            onEmailChange={setStaffEmail}
            onRoleChange={setStaffRole}
            onInvite={(event) => void onInviteStaff(event)}
            onRoleUpdate={(membershipId, role) =>
              void updateMemberRole({ restaurantId: restaurantId as Id<"restaurants">, membershipId, role }).catch((error) =>
                setStatus({ tone: "bad", text: messageOf(error) })
              )
            }
            onRemove={(membershipId) =>
              void removeMember({ restaurantId: restaurantId as Id<"restaurants">, membershipId }).catch((error) =>
                setStatus({ tone: "bad", text: messageOf(error) })
              )
            }
            onRevoke={(invitationId) =>
              void revokeInvitation({ restaurantId: restaurantId as Id<"restaurants">, invitationId }).catch((error) =>
                setStatus({ tone: "bad", text: messageOf(error) })
              )
            }
          />
        ) : null}

        {section === "sync" ? <SyncSection events={events ?? []} installations={installations ?? []} /> : null}

        {section === "advanced" ? (
          <AdvancedSection
            canManage={Boolean(canManage)}
            commandType={commandType}
            payloadJson={payloadJson}
            commands={commands ?? []}
            onCommandTypeChange={(value) => {
              setCommandType(value);
              setPayloadJson(commandPayloadTemplate(value));
            }}
            onPayloadChange={setPayloadJson}
            onQueue={onQueueCommand}
          />
        ) : null}
      </div>
    </section>
  );
}

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
    cashVariancePaise: number;
    finalizedAt: string;
  }>;
  selectedDate: string;
  onSelectDate: (value: string) => void;
  detail:
    | {
        report: {
          businessDate: string;
          openingCashPaise: number;
          closingCashPaise: number;
          expectedClosingCashPaise: number;
          cashVariancePaise: number;
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
        <h2>No closed-day reports yet</h2>
        <p>Close a POS day in the hub. When the hub syncs, the full day report will appear here.</p>
      </section>
    );
  }

  const report = detail?.report;
  return (
    <div className="cloud-report-layout">
      <section className="admin-panel">
        <span className="eyebrow">Reports</span>
        <h2>Closed days</h2>
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
              <Metric label="Expected cash" value={money(report.expectedClosingCashPaise)} />
              <Metric label="Actual cash" value={money(report.closingCashPaise)} />
              <Metric label="Cash variance" value={money(report.cashVariancePaise)} />
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
          <EmptyState title="Report loading" text="Choose a closed day to see sales, payments, bills, and item totals." />
        )}
      </section>
    </div>
  );
}

function SetupSection({
  canManage,
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
          <button type="button" disabled={!canManage || !restaurantReady} onClick={onCreateHubConnection}>
            Create hub connection
          </button>
        )}
      </section>

      <section className="admin-panel step-panel">
        <span className="step-number">3</span>
        <h2>Confirm sync</h2>
        <p>{activeHubCount > 0 ? "The hub has checked in. Reports will arrive after day close." : "Start the hub app. This portal will show the hub as connected after it syncs."}</p>
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

function RailButton({ section, active, setSection, label }: { section: Section; active: Section; setSection: (section: Section) => void; label: string }) {
  return (
    <button type="button" className={active === section ? "rail-button active" : "rail-button"} onClick={() => setSection(section)}>
      {label}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function humanPayments(paymentsJson: string) {
  try {
    const payments = JSON.parse(paymentsJson) as Array<{ method: string; amountPaise: number }>;
    return payments.map((payment) => `${payment.method.toUpperCase()} ${money(payment.amountPaise)}`).join(", ");
  } catch {
    return "Payment details unavailable";
  }
}

function friendlyEvent(type: string) {
  if (type === "daily_report.finalized") return "Daily report received";
  if (type === "bill.settled") return "Bill paid";
  if (type === "order.submitted") return "Order sent";
  return type.replaceAll("_", " ").replaceAll(".", " ");
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
