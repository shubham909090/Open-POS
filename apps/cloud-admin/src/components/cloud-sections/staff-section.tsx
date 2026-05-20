import type { FormEvent } from "react";

import type { Id } from "../../../../../convex/_generated/dataModel";
import type { InviteRole, StaffRole } from "../../lib/cloud-types";
import { EmptyState } from "../cloud-admin-widgets";

export function StaffSection({
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
