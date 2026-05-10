"use client";

import { FormEvent, useMemo, useState } from "react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

const commandTypes = [
  "menu_item.upsert",
  "menu_item.disabled",
  "production_unit.upsert",
  "receipt_printer.updated",
  "device.updated",
  "device.revoked"
] as const;

type CommandType = (typeof commandTypes)[number];
type DashboardSection = "setup" | "staff" | "sync" | "advanced";
type StaffRole = "owner" | "admin" | "reporting";
type InviteRole = "admin" | "reporting";
type CommandFieldKey =
  | "id"
  | "name"
  | "pricePaise"
  | "productionUnitId"
  | "active"
  | "printerMode"
  | "printerName"
  | "kdsEnabled"
  | "hubDeviceId"
  | "role"
  | "reason";

type CommandFields = Record<CommandFieldKey, string>;

const commandCatalog: Record<CommandType, { label: string; help: string; payload: string }> = {
  "menu_item.upsert": {
    label: "Add or update dish",
    help: "Push a dish name, price, active flag, and kitchen/bar routing to the hub.",
    payload: JSON.stringify(
      {
        id: "item_masala_dosa",
        name: "Masala Dosa",
        pricePaise: 12000,
        productionUnitId: "unit_kitchen",
        active: true
      },
      null,
      2
    )
  },
  "menu_item.disabled": {
    label: "Disable dish",
    help: "Hide one item from waiter devices without deleting historic bills.",
    payload: JSON.stringify({ id: "item_masala_dosa" }, null, 2)
  },
  "production_unit.upsert": {
    label: "Kitchen or bar station",
    help: "Create a kitchen or counter and bind it to a system printer on the Windows hub.",
    payload: JSON.stringify(
      { id: "unit_bar", name: "Bar", printerMode: "system", printerName: "Bar Printer", kdsEnabled: true },
      null,
      2
    )
  },
  "receipt_printer.updated": {
    label: "Cash counter printer",
    help: "Set the printer used for final bills and receipts.",
    payload: JSON.stringify({ printerMode: "system", printerName: "Cash Counter Printer" }, null, 2)
  },
  "device.updated": {
    label: "Rename device or role",
    help: "Change a paired device name or role after it syncs back from the hub.",
    payload: JSON.stringify({ hubDeviceId: "device_x", name: "Waiter 2", role: "waiter" }, null, 2)
  },
  "device.revoked": {
    label: "Revoke device",
    help: "Stop a lost or retired Android device from using the local hub.",
    payload: JSON.stringify({ hubDeviceId: "device_x", reason: "Lost phone" }, null, 2)
  }
};

const commandDefaults: Record<CommandType, CommandFields> = {
  "menu_item.upsert": {
    id: "item_masala_dosa",
    name: "Masala Dosa",
    pricePaise: "12000",
    productionUnitId: "unit_kitchen",
    active: "true",
    printerMode: "system",
    printerName: "",
    kdsEnabled: "true",
    hubDeviceId: "",
    role: "waiter",
    reason: ""
  },
  "menu_item.disabled": {
    id: "item_masala_dosa",
    name: "",
    pricePaise: "",
    productionUnitId: "",
    active: "false",
    printerMode: "system",
    printerName: "",
    kdsEnabled: "true",
    hubDeviceId: "",
    role: "waiter",
    reason: ""
  },
  "production_unit.upsert": {
    id: "unit_bar",
    name: "Bar",
    pricePaise: "",
    productionUnitId: "",
    active: "true",
    printerMode: "system",
    printerName: "Bar Printer",
    kdsEnabled: "true",
    hubDeviceId: "",
    role: "waiter",
    reason: ""
  },
  "receipt_printer.updated": {
    id: "",
    name: "",
    pricePaise: "",
    productionUnitId: "",
    active: "true",
    printerMode: "system",
    printerName: "Cash Counter Printer",
    kdsEnabled: "true",
    hubDeviceId: "",
    role: "waiter",
    reason: ""
  },
  "device.updated": {
    id: "",
    name: "Waiter 2",
    pricePaise: "",
    productionUnitId: "",
    active: "true",
    printerMode: "system",
    printerName: "",
    kdsEnabled: "true",
    hubDeviceId: "device_x",
    role: "waiter",
    reason: ""
  },
  "device.revoked": {
    id: "",
    name: "",
    pricePaise: "",
    productionUnitId: "",
    active: "true",
    printerMode: "system",
    printerName: "",
    kdsEnabled: "true",
    hubDeviceId: "device_x",
    role: "waiter",
    reason: "Lost phone"
  }
};

function buildCommandPayload(type: CommandType, fields: CommandFields) {
  switch (type) {
    case "menu_item.upsert":
      return JSON.stringify(
        {
          id: fields.id,
          name: fields.name,
          pricePaise: Number(fields.pricePaise || 0),
          productionUnitId: fields.productionUnitId,
          active: fields.active === "true"
        },
        null,
        2
      );
    case "menu_item.disabled":
      return JSON.stringify({ id: fields.id }, null, 2);
    case "production_unit.upsert":
      return JSON.stringify(
        {
          id: fields.id,
          name: fields.name,
          printerMode: fields.printerMode,
          printerName: fields.printerName,
          kdsEnabled: fields.kdsEnabled === "true"
        },
        null,
        2
      );
    case "receipt_printer.updated":
      return JSON.stringify({ printerMode: fields.printerMode, printerName: fields.printerName }, null, 2);
    case "device.updated":
      return JSON.stringify({ hubDeviceId: fields.hubDeviceId, name: fields.name, role: fields.role }, null, 2);
    case "device.revoked":
      return JSON.stringify({ hubDeviceId: fields.hubDeviceId, reason: fields.reason }, null, 2);
  }
}

export default function CloudAdminHome() {
  const { user, signOut } = useAuth();

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <span className="product-mark">Gaurav POS</span>
          <h1>Owner Portal</h1>
          <p>Create the restaurant account, connect the hub PC, invite staff, and check sync health.</p>
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
            <p>Sign in with the Google account that will own or manage this restaurant.</p>
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
  const registerInstallation = useMutation(api.admin.registerInstallation);
  const enqueueHubCommand = useMutation(api.admin.enqueueHubCommand);
  const acceptInvitation = useMutation(api.admin.acceptInvitation);
  const inviteStaff = useMutation(api.admin.inviteStaff);
  const updateMemberRole = useMutation(api.admin.updateMemberRole);
  const removeMember = useMutation(api.admin.removeMember);
  const revokeInvitation = useMutation(api.admin.revokeInvitation);

  const [section, setSection] = useState<DashboardSection>("setup");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [installationId, setInstallationId] = useState("");
  const [syncSecret, setSyncSecret] = useState("");
  const [hubConnection, setHubConnection] = useState<{ installationId: string; syncSecret: string; envBlock: string } | null>(null);
  const [staffEmail, setStaffEmail] = useState("");
  const [staffRole, setStaffRole] = useState<InviteRole>("admin");
  const [commandType, setCommandType] = useState<CommandType>("menu_item.upsert");
  const [commandFields, setCommandFields] = useState<CommandFields>(commandDefaults["menu_item.upsert"]);
  const [payloadJson, setPayloadJson] = useState(buildCommandPayload("menu_item.upsert", commandDefaults["menu_item.upsert"]));
  const [status, setStatus] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const restaurantId = useMemo(() => {
    const fallback = restaurants?.[0]?._id ?? "";
    return (selectedRestaurantId || fallback) as Id<"restaurants"> | "";
  }, [restaurants, selectedRestaurantId]);

  const selectedRestaurant = useMemo(
    () => (restaurants ?? []).find((restaurant) => restaurant._id === restaurantId) ?? restaurants?.[0] ?? null,
    [restaurantId, restaurants]
  );

  const installations = useQuery(api.admin.listInstallations, restaurantId ? { restaurantId } : "skip");
  const staff = useQuery(api.admin.listStaff, restaurantId ? { restaurantId } : "skip");
  const pendingInvitations = useQuery(api.admin.listMyPendingInvitations);
  const commands = useQuery(api.admin.listHubCommands, restaurantId ? { restaurantId } : "skip");
  const events = useQuery(api.admin.listRecentEvents, restaurantId ? { restaurantId } : "skip");

  const registeredInstallations = (installations ?? []).filter((installation) => installation.status === "active").length;
  const activeInstallations = (installations ?? []).filter((installation) => installation.status === "active" && installation.lastSeenAt).length;
  const lastSeen = installations?.find((installation) => installation.lastSeenAt)?.lastSeenAt;
  const latestCommand = commands?.[0];
  const latestEvent = events?.[0];
  const pendingInvitation = pendingInvitations?.[0];

  async function onCreateRestaurant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    try {
      const result = await createRestaurant({ name: restaurantName, timezone });
      setSelectedRestaurantId(result.restaurantId);
      setRestaurantName("");
      setStatus({ tone: "good", text: "Restaurant created. Next, connect the hub PC." });
    } catch (error) {
      setStatus({ tone: "bad", text: error instanceof Error ? error.message : "Could not create restaurant." });
    }
  }

  async function onCreateHubConnection() {
    if (!restaurantId) return;
    setStatus(null);
    try {
      const result = await createHubConnection({ restaurantId, label: selectedRestaurant?.name ?? "main-hub" });
      setHubConnection(result);
      setStatus({ tone: "good", text: "Hub connection created. Paste the setup block into the hub PC env file." });
    } catch (error) {
      setStatus({ tone: "bad", text: error instanceof Error ? error.message : "Could not create hub connection." });
    }
  }

  async function onRegisterInstallation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!restaurantId) return;
    setStatus(null);
    try {
      await registerInstallation({ restaurantId, installationId, syncSecret });
      setStatus({ tone: "good", text: "Hub connection saved. Use the same values in the hub PC env file." });
    } catch (error) {
      setStatus({ tone: "bad", text: error instanceof Error ? error.message : "Could not register installation." });
    }
  }

  async function onQueueCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!restaurantId) return;
    setStatus(null);
    try {
      JSON.parse(payloadJson);
      const result = await enqueueHubCommand({ restaurantId, type: commandType, payloadJson });
      setStatus({ tone: "good", text: `Command queued: ${result.commandId}` });
    } catch (error) {
      setStatus({ tone: "bad", text: error instanceof Error ? error.message : "Could not queue command." });
    }
  }

  async function onAcceptInvitation(invitationId: Id<"memberInvitations">) {
    setStatus(null);
    try {
      const result = await acceptInvitation({ invitationId });
      setSelectedRestaurantId(result.restaurantId);
      setStatus({ tone: "good", text: "Invitation accepted." });
    } catch (error) {
      setStatus({ tone: "bad", text: error instanceof Error ? error.message : "Could not accept invitation." });
    }
  }

  async function onInviteStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!restaurantId) return;
    setStatus(null);
    try {
      await inviteStaff({ restaurantId, email: staffEmail, role: staffRole });
      setStaffEmail("");
      setStatus({ tone: "good", text: "Staff invitation saved. They can accept after Google sign-in." });
    } catch (error) {
      setStatus({ tone: "bad", text: error instanceof Error ? error.message : "Could not invite staff." });
    }
  }

  async function onUpdateMemberRole(membershipId: Id<"memberships">, role: InviteRole) {
    if (!restaurantId) return;
    setStatus(null);
    try {
      await updateMemberRole({ restaurantId, membershipId, role });
      setStatus({ tone: "good", text: "Member role updated." });
    } catch (error) {
      setStatus({ tone: "bad", text: error instanceof Error ? error.message : "Could not update member." });
    }
  }

  async function onRemoveMember(membershipId: Id<"memberships">) {
    if (!restaurantId) return;
    setStatus(null);
    try {
      await removeMember({ restaurantId, membershipId });
      setStatus({ tone: "good", text: "Member removed." });
    } catch (error) {
      setStatus({ tone: "bad", text: error instanceof Error ? error.message : "Could not remove member." });
    }
  }

  async function onRevokeInvitation(invitationId: Id<"memberInvitations">) {
    if (!restaurantId) return;
    setStatus(null);
    try {
      await revokeInvitation({ restaurantId, invitationId });
      setStatus({ tone: "good", text: "Invitation revoked." });
    } catch (error) {
      setStatus({ tone: "bad", text: error instanceof Error ? error.message : "Could not revoke invitation." });
    }
  }

  function chooseCommand(next: CommandType) {
    const nextFields = commandDefaults[next];
    setCommandType(next);
    setCommandFields(nextFields);
    setPayloadJson(buildCommandPayload(next, nextFields));
  }

  function updateCommandField(key: CommandFieldKey, value: string) {
    const nextFields = { ...commandFields, [key]: value };
    setCommandFields(nextFields);
    setPayloadJson(buildCommandPayload(commandType, nextFields));
  }

  return (
    <section className="dashboard-layout">
      <aside className="admin-rail">
        <div className="identity-card">
          <span className="eyebrow">Signed in</span>
          <strong>{userLabel}</strong>
          <p>Use this portal for owner setup. Daily restaurant work happens in the hub app.</p>
        </div>

        <label className="field-label">
          Restaurant
          <select value={restaurantId} onChange={(event) => setSelectedRestaurantId(event.target.value)}>
            {!restaurants?.length ? <option value="">Create first restaurant</option> : null}
            {(restaurants ?? []).map((restaurant) => (
              <option key={restaurant._id} value={restaurant._id}>
                {restaurant.name}
              </option>
            ))}
          </select>
        </label>

        <nav className="rail-nav" aria-label="Admin sections">
          <button type="button" className={section === "setup" ? "rail-button active" : "rail-button"} onClick={() => setSection("setup")}>
            Setup
          </button>
          <button type="button" className={section === "staff" ? "rail-button active" : "rail-button"} onClick={() => setSection("staff")}>
            Staff
          </button>
          <button
            type="button"
            className={section === "advanced" ? "rail-button active" : "rail-button"}
            onClick={() => setSection("advanced")}
          >
            Advanced
          </button>
          <button type="button" className={section === "sync" ? "rail-button active" : "rail-button"} onClick={() => setSection("sync")}>
            Sync Health
          </button>
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
            <button type="button" onClick={() => void onAcceptInvitation(pendingInvitation._id)}>
              Accept
            </button>
          </section>
        ) : null}

        <section className="summary-strip" aria-label="Restaurant summary">
          <Metric label="Restaurant" value={selectedRestaurant?.name ?? "Not created"} />
          <Metric label="Active hubs" value={String(activeInstallations)} />
          <Metric label="Last seen" value={lastSeen ? new Date(lastSeen).toLocaleString() : "No hub ping"} />
          <Metric label="Last event" value={latestEvent?.type ?? "Waiting"} />
        </section>

        {section === "setup" ? (
          <SetupSection
            restaurantsReady={Boolean(restaurants?.length)}
            hubReady={registeredInstallations > 0}
            hubConnected={activeInstallations > 0}
            restaurantName={restaurantName}
            timezone={timezone}
            installationId={installationId}
            syncSecret={syncSecret}
            hubConnection={hubConnection}
            canRegister={Boolean(restaurantId)}
            onRestaurantNameChange={setRestaurantName}
            onTimezoneChange={setTimezone}
            onInstallationIdChange={setInstallationId}
            onSyncSecretChange={setSyncSecret}
            onCreateRestaurant={(event) => void onCreateRestaurant(event)}
            onCreateHubConnection={() => void onCreateHubConnection()}
            onRegisterInstallation={(event) => void onRegisterInstallation(event)}
          />
        ) : null}

        {section === "staff" ? (
          <StaffSection
            members={staff?.members ?? []}
            invitations={staff?.invitations ?? []}
            staffEmail={staffEmail}
            staffRole={staffRole}
            canInvite={Boolean(restaurantId)}
            onStaffEmailChange={setStaffEmail}
            onStaffRoleChange={setStaffRole}
            onInviteStaff={(event) => void onInviteStaff(event)}
            onUpdateMemberRole={(membershipId, role) => void onUpdateMemberRole(membershipId, role)}
            onRemoveMember={(membershipId) => void onRemoveMember(membershipId)}
            onRevokeInvitation={(invitationId) => void onRevokeInvitation(invitationId)}
          />
        ) : null}

        {section === "advanced" ? (
          <CommandsSection
            commandType={commandType}
            commandFields={commandFields}
            payloadJson={payloadJson}
            commands={commands ?? []}
            canQueue={Boolean(restaurantId)}
            onChooseCommand={chooseCommand}
            onCommandFieldChange={updateCommandField}
            onPayloadChange={setPayloadJson}
            onQueueCommand={(event) => void onQueueCommand(event)}
          />
        ) : null}

        {section === "sync" ? (
          <SyncSection installations={installations ?? []} events={events ?? []} latestCommand={latestCommand} />
        ) : null}
      </div>
    </section>
  );
}

function SetupSection({
  restaurantsReady,
  hubReady,
  hubConnected,
  restaurantName,
  timezone,
  installationId,
  syncSecret,
  hubConnection,
  canRegister,
  onRestaurantNameChange,
  onTimezoneChange,
  onInstallationIdChange,
  onSyncSecretChange,
  onCreateRestaurant,
  onCreateHubConnection,
  onRegisterInstallation
}: {
  restaurantsReady: boolean;
  hubReady: boolean;
  hubConnected: boolean;
  restaurantName: string;
  timezone: string;
  installationId: string;
  syncSecret: string;
  hubConnection: { installationId: string; syncSecret: string; envBlock: string } | null;
  canRegister: boolean;
  onRestaurantNameChange: (value: string) => void;
  onTimezoneChange: (value: string) => void;
  onInstallationIdChange: (value: string) => void;
  onSyncSecretChange: (value: string) => void;
  onCreateRestaurant: (event: FormEvent<HTMLFormElement>) => void;
  onCreateHubConnection: () => void;
  onRegisterInstallation: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [showExistingSecret, setShowExistingSecret] = useState(false);
  const copyHubBlock = () => {
    if (!hubConnection) return;
    void navigator.clipboard?.writeText(hubConnection.envBlock);
  };

  return (
    <div className="setup-flow">
      <section className={restaurantsReady ? "admin-panel step-panel complete" : "admin-panel step-panel active"}>
        <span className="step-number">1</span>
        <div>
          <span className="eyebrow">{restaurantsReady ? "Done" : "Step 1"}</span>
          <h2>Create your restaurant</h2>
          <p>Name the restaurant account. Daily billing and orders still happen in the hub app.</p>
        </div>
        {restaurantsReady ? (
          <p className="soft-note">Restaurant account is ready.</p>
        ) : (
          <form className="admin-form" onSubmit={onCreateRestaurant}>
            <label className="field-label">
              Restaurant name
              <input value={restaurantName} onChange={(event) => onRestaurantNameChange(event.target.value)} placeholder="Example: Gaurav Restaurant" />
            </label>
            <details className="advanced-json">
              <summary>Advanced settings</summary>
              <label className="field-label">
                Timezone
                <input value={timezone} onChange={(event) => onTimezoneChange(event.target.value)} placeholder="Asia/Kolkata" />
              </label>
            </details>
            <button type="submit">Create restaurant</button>
          </form>
        )}
      </section>

      <section className={hubReady || hubConnection ? "admin-panel step-panel complete" : restaurantsReady ? "admin-panel step-panel active" : "admin-panel step-panel locked"}>
        <span className="step-number">2</span>
        <div>
          <span className="eyebrow">{hubReady || hubConnection ? "Done" : "Step 2"}</span>
          <h2>Connect the hub PC</h2>
          <p>Create a secure connection for the restaurant computer that runs the local POS.</p>
        </div>
        {hubConnection ? (
          <div className="connection-box">
            <p>Paste this block into the hub PC env file, then start the hub app.</p>
            <pre>{hubConnection.envBlock}</pre>
            <button type="button" onClick={copyHubBlock}>Copy setup block</button>
            <details className="advanced-json">
              <summary>Advanced details</summary>
              <code>{hubConnection.installationId}</code>
            </details>
          </div>
        ) : hubReady ? (
          <p className="soft-note">Hub connection is ready. Start the hub app on the restaurant PC next.</p>
        ) : (
          <button type="button" disabled={!canRegister} onClick={onCreateHubConnection}>
            Create hub connection
          </button>
        )}
        <details className="advanced-json">
          <summary>Advanced: enter existing connection details</summary>
          <form className="admin-form" onSubmit={onRegisterInstallation}>
            <label className="field-label">
              Custom hub ID
              <input value={installationId} onChange={(event) => onInstallationIdChange(event.target.value)} placeholder="Only for support or imports" />
            </label>
            <label className="field-label">
              Connection secret
              <span className="secret-input">
                <input
                  value={syncSecret}
                  onChange={(event) => onSyncSecretChange(event.target.value)}
                  placeholder="Long random secret"
                  type={showExistingSecret ? "text" : "password"}
                />
                <button type="button" className="ghost-button" onClick={() => setShowExistingSecret((value) => !value)}>
                  {showExistingSecret ? "Hide" : "Show"}
                </button>
              </span>
            </label>
            <button type="submit" disabled={!canRegister}>
              Save advanced connection
            </button>
          </form>
        </details>
        {!restaurantsReady ? <p className="soft-note">Create a restaurant first, then this step unlocks.</p> : null}
      </section>

      <section className={hubConnected ? "admin-panel step-panel complete" : hubReady || hubConnection ? "admin-panel step-panel active" : "admin-panel step-panel locked"}>
        <span className="step-number">3</span>
        <div>
          <span className="eyebrow">Step 3</span>
          <h2>Start the hub app</h2>
          <p>Open the hub on the restaurant PC. That is where you add printers, tables, dishes, and take orders.</p>
        </div>
      </section>

      <section className={hubConnected ? "admin-panel step-panel complete" : hubReady || hubConnection ? "admin-panel step-panel active" : "admin-panel step-panel locked"}>
        <span className="step-number">4</span>
        <div>
          <span className="eyebrow">Step 4</span>
          <h2>Confirm sync is working</h2>
          <p>
            Once the hub is running, this portal will show the hub as active. Use Sync Health only when you want to check the connection.
          </p>
        </div>
        <p className="soft-note">{hubConnected ? "The hub has checked in." : "Waiting for the hub PC to check in."}</p>
      </section>

      <section className={hubConnected ? "admin-panel step-panel active" : "admin-panel step-panel locked"}>
        <span className="step-number">5</span>
        <div>
          <span className="eyebrow">Step 5</span>
          <h2>Invite staff</h2>
          <p>
            After the hub is connected, invite managers or reporting users from the Staff tab. Android waiter devices are paired from the hub app.
          </p>
        </div>
      </section>
    </div>
  );
}

function StaffSection({
  members,
  invitations,
  staffEmail,
  staffRole,
  canInvite,
  onStaffEmailChange,
  onStaffRoleChange,
  onInviteStaff,
  onUpdateMemberRole,
  onRemoveMember,
  onRevokeInvitation
}: {
  members: Array<{
    _id: Id<"memberships">;
    email?: string;
    name?: string;
    role: StaffRole;
    createdAt: string;
    isCurrentUser: boolean;
  }>;
  invitations: Array<{
    _id: Id<"memberInvitations">;
    email: string;
    role: InviteRole;
    status: "pending" | "accepted" | "revoked";
    createdAt: string;
    acceptedAt?: string;
    revokedAt?: string;
  }>;
  staffEmail: string;
  staffRole: InviteRole;
  canInvite: boolean;
  onStaffEmailChange: (value: string) => void;
  onStaffRoleChange: (value: InviteRole) => void;
  onInviteStaff: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateMemberRole: (membershipId: Id<"memberships">, role: InviteRole) => void;
  onRemoveMember: (membershipId: Id<"memberships">) => void;
  onRevokeInvitation: (invitationId: Id<"memberInvitations">) => void;
}) {
  return (
    <div className="staff-layout">
      <section className="admin-panel">
        <span className="eyebrow">Invite</span>
        <h2>Add staff access</h2>
        <p>Invite by Google account email. The user accepts the invite after signing in with the same email.</p>
        <form className="admin-form" onSubmit={onInviteStaff}>
          <label className="field-label">
            Email
            <input value={staffEmail} onChange={(event) => onStaffEmailChange(event.target.value)} placeholder="staff@example.com" type="email" />
          </label>
          <label className="field-label">
            Cloud role
            <select value={staffRole} onChange={(event) => onStaffRoleChange(event.target.value as InviteRole)}>
              <option value="admin">Admin</option>
              <option value="reporting">Reporting</option>
            </select>
          </label>
          <button type="submit" disabled={!canInvite}>
            Save invitation
          </button>
        </form>
      </section>

      <section className="admin-panel">
        <span className="eyebrow">Members</span>
        <h2>Current cloud users</h2>
        <div className="stack-list">
          {members.length ? (
            members.map((member) => (
              <article key={member._id} className="staff-row">
                <div>
                  <strong>{member.name || member.email || "Member"}</strong>
                  <span>{member.email || "Email not captured"} · joined {new Date(member.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="row-actions">
                  {member.role === "owner" ? (
                    <span className="state-pill active">owner</span>
                  ) : (
                    <select value={member.role} onChange={(event) => onUpdateMemberRole(member._id, event.target.value as InviteRole)}>
                      <option value="admin">admin</option>
                      <option value="reporting">reporting</option>
                    </select>
                  )}
                  <button type="button" className="ghost-button" disabled={member.isCurrentUser || member.role === "owner"} onClick={() => onRemoveMember(member._id)}>
                    Remove
                  </button>
                </div>
              </article>
            ))
          ) : (
            <EmptyState title="No members yet" text="Create the restaurant first, then invite admins or reporting users." />
          )}
        </div>
      </section>

      <section className="admin-panel wide-panel">
        <span className="eyebrow">Invitations</span>
        <h2>Pending and recent invites</h2>
        <div className="stack-list compact-list">
          {invitations.length ? (
            invitations.map((invitation) => (
              <article key={invitation._id} className="staff-row">
                <div>
                  <strong>{invitation.email}</strong>
                  <span>
                    {invitation.role} · {invitation.status} · {new Date(invitation.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="row-actions">
                  <span className={invitation.status === "pending" ? "state-pill active" : "state-pill"}>{invitation.status}</span>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={invitation.status !== "pending"}
                    onClick={() => onRevokeInvitation(invitation._id)}
                  >
                    Revoke
                  </button>
                </div>
              </article>
            ))
          ) : (
            <EmptyState title="No invitations" text="Saved staff invitations will appear here." />
          )}
        </div>
      </section>
    </div>
  );
}

function CommandsSection({
  commandType,
  commandFields,
  payloadJson,
  commands,
  canQueue,
  onChooseCommand,
  onCommandFieldChange,
  onPayloadChange,
  onQueueCommand
}: {
  commandType: CommandType;
  commandFields: CommandFields;
  payloadJson: string;
  commands: Array<{ commandId: string; type: CommandType; payloadJson: string; createdAt: string }>;
  canQueue: boolean;
  onChooseCommand: (type: CommandType) => void;
  onCommandFieldChange: (key: CommandFieldKey, value: string) => void;
  onPayloadChange: (value: string) => void;
  onQueueCommand: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="command-layout">
      <section className="admin-panel command-builder">
        <div>
          <span className="eyebrow">Advanced</span>
          <h2>Send a support command</h2>
          <p>Use this only for support, imports, or recovery. Normal restaurant setup belongs in the hub app.</p>
        </div>
        <div className="preset-grid">
          {commandTypes.map((type) => (
            <button key={type} type="button" className={type === commandType ? "preset-card active" : "preset-card"} onClick={() => onChooseCommand(type)}>
              <strong>{commandCatalog[type].label}</strong>
              <span>{commandCatalog[type].help}</span>
            </button>
          ))}
        </div>
        <form className="command-form" onSubmit={onQueueCommand}>
          <label className="field-label">
            Command type
            <select value={commandType} onChange={(event) => onChooseCommand(event.target.value as CommandType)}>
              {commandTypes.map((type) => (
                <option key={type} value={type}>
                  {commandCatalog[type].label}
                </option>
              ))}
            </select>
          </label>
          <CommandFieldsPanel type={commandType} fields={commandFields} onChange={onCommandFieldChange} />
          <details className="advanced-json">
            <summary>Raw command preview</summary>
            <label className="field-label">
              Raw support payload
              <textarea value={payloadJson} onChange={(event) => onPayloadChange(event.target.value)} spellCheck={false} />
            </label>
          </details>
          <button type="submit" disabled={!canQueue}>
            Queue for hub
          </button>
        </form>
      </section>

      <section className="admin-panel">
        <span className="eyebrow">History</span>
        <h2>Recent support commands</h2>
        <div className="stack-list">
          {commands.length ? (
            commands.map((command) => (
              <article key={command.commandId} className="list-row">
                <div>
                  <strong>{commandCatalog[command.type].label}</strong>
                  <span>{new Date(command.createdAt).toLocaleString()}</span>
                </div>
                <code>{command.commandId}</code>
              </article>
            ))
          ) : (
            <EmptyState title="No support commands sent" text="Most restaurants never need this section." />
          )}
        </div>
      </section>
    </div>
  );
}

function CommandFieldsPanel({
  type,
  fields,
  onChange
}: {
  type: CommandType;
  fields: CommandFields;
  onChange: (key: CommandFieldKey, value: string) => void;
}) {
  if (type === "menu_item.upsert") {
    return (
      <div className="field-grid">
        <TextField label="Custom dish ID" value={fields.id} onChange={(value) => onChange("id", value)} />
        <TextField label="Dish name" value={fields.name} onChange={(value) => onChange("name", value)} />
        <TextField label="Price paise" value={fields.pricePaise} onChange={(value) => onChange("pricePaise", value)} inputMode="numeric" />
        <TextField label="Kitchen / counter ID" value={fields.productionUnitId} onChange={(value) => onChange("productionUnitId", value)} />
        <SelectField label="Active" value={fields.active} onChange={(value) => onChange("active", value)} options={["true", "false"]} />
      </div>
    );
  }

  if (type === "menu_item.disabled") {
    return (
      <div className="field-grid compact">
        <TextField label="Custom dish ID" value={fields.id} onChange={(value) => onChange("id", value)} />
      </div>
    );
  }

  if (type === "production_unit.upsert") {
    return (
      <div className="field-grid">
        <TextField label="Custom kitchen ID" value={fields.id} onChange={(value) => onChange("id", value)} />
        <TextField label="Kitchen / counter name" value={fields.name} onChange={(value) => onChange("name", value)} />
        <SelectField label="Printer mode" value={fields.printerMode} onChange={(value) => onChange("printerMode", value)} options={["system", "lan"]} />
        <TextField label="Printer name" value={fields.printerName} onChange={(value) => onChange("printerName", value)} />
        <SelectField label="Kitchen screen enabled" value={fields.kdsEnabled} onChange={(value) => onChange("kdsEnabled", value)} options={["true", "false"]} />
      </div>
    );
  }

  if (type === "receipt_printer.updated") {
    return (
      <div className="field-grid compact">
        <SelectField label="Printer mode" value={fields.printerMode} onChange={(value) => onChange("printerMode", value)} options={["system", "lan"]} />
        <TextField label="Printer name" value={fields.printerName} onChange={(value) => onChange("printerName", value)} />
      </div>
    );
  }

  if (type === "device.updated") {
    return (
      <div className="field-grid">
        <TextField label="Hub device ID" value={fields.hubDeviceId} onChange={(value) => onChange("hubDeviceId", value)} />
        <TextField label="Device name" value={fields.name} onChange={(value) => onChange("name", value)} />
        <SelectField label="Role" value={fields.role} onChange={(value) => onChange("role", value)} options={["admin", "cashier", "waiter", "kitchen"]} />
      </div>
    );
  }

  return (
    <div className="field-grid compact">
      <TextField label="Hub device ID" value={fields.hubDeviceId} onChange={(value) => onChange("hubDeviceId", value)} />
      <TextField label="Reason" value={fields.reason} onChange={(value) => onChange("reason", value)} />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  inputMode
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: "numeric";
}) {
  return (
    <label className="field-label">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} inputMode={inputMode} />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="field-label">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function SyncSection({
  installations,
  events,
  latestCommand
}: {
  installations: Array<{ installationId: string; status: "active" | "revoked"; createdAt: string; lastSeenAt?: string }>;
  events: Array<{ eventId: string; type: string; aggregateType: string; aggregateId: string; createdAt: string; receivedAt: string }>;
  latestCommand?: { commandId: string; type: CommandType; payloadJson: string; createdAt: string };
}) {
  return (
    <div className="sync-grid">
      <section className="admin-panel">
        <span className="eyebrow">Hub PCs</span>
        <h2>Connected hubs</h2>
        <div className="stack-list">
          {installations.length ? (
            installations.map((row, index) => (
              <article key={row.installationId} className="list-row split-row">
                <div>
                  <strong>Hub PC {index + 1}</strong>
                  <span>{row.lastSeenAt ? `Last seen ${new Date(row.lastSeenAt).toLocaleString()}` : "Not seen yet"}</span>
                  <details className="advanced-json">
                    <summary>Advanced details</summary>
                    <code>{row.installationId}</code>
                  </details>
                </div>
                <span className={row.status === "active" ? "state-pill active" : "state-pill revoked"}>{row.status}</span>
              </article>
            ))
          ) : (
            <EmptyState title="No hub connected" text="Create a hub connection from Setup, then start the hub app on the restaurant PC." />
          )}
        </div>
      </section>

      <section className="admin-panel">
        <span className="eyebrow">Recent sync</span>
        <h2>Events from hub</h2>
        <div className="timeline-list">
          {events.length ? (
            events.map((event) => (
              <article key={event.eventId} className="timeline-row">
                <span />
                <div>
                  <strong>{event.type}</strong>
                  <details className="advanced-json">
                    <summary>Advanced details</summary>
                    <code>{event.aggregateType} / {event.aggregateId}</code>
                  </details>
                  <small>{new Date(event.receivedAt).toLocaleString()}</small>
                </div>
              </article>
            ))
          ) : (
            <EmptyState title="No synced events yet" text="Local sales and setup events appear here after the hub sync worker runs." />
          )}
        </div>
      </section>

      <section className="admin-panel wide-panel">
        <span className="eyebrow">Next command</span>
        <h2>What the hub will pull</h2>
        {latestCommand ? (
          <div className="command-preview">
            <div>
              <strong>{commandCatalog[latestCommand.type].label}</strong>
              <details className="advanced-json">
                <summary>Advanced details</summary>
                <code>{latestCommand.commandId}</code>
              </details>
            </div>
            <details className="advanced-json">
              <summary>Raw support command</summary>
              <pre>{latestCommand.payloadJson}</pre>
            </details>
          </div>
        ) : (
          <EmptyState title="No cloud updates waiting" text="Most setup happens directly in the hub app. Support commands appear here only when used." />
        )}
      </section>
    </div>
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
