"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { commandPayloadTemplate, messageOf, type CommandType } from "../lib/cloud-format";
import type { InviteRole, Section } from "../lib/cloud-types";
import { AdvancedSection, ReportsSection, SetupSection, StaffSection, SyncSection } from "./cloud-admin-sections";
import { Metric, RailButton } from "./cloud-admin-widgets";

export function CloudDashboard({ userLabel }: { userLabel: string }) {
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
          <p>Reports appear here after the hub finalizes a 6 AM business day and syncs.</p>
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
            isOwner={Boolean(isOwner)}
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
