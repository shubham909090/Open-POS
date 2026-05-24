"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { useQuery } from "convex/react";
import Link from "next/link";

import { api } from "../../../../convex/_generated/api";
import { CloudDashboard } from "../components/cloud-dashboard";

export default function CloudAdminHome() {
  const { user, signOut } = useAuth();

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <span className="product-mark">Gaurav POS</span>
          <h1>Admin Command Center</h1>
          <p>Issue licenses, reset hub activations, and watch cloud backup health.</p>
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
            <p>Use the allowlisted platform admin Google account.</p>
          </div>
          <Link href="/sign-in" className="button-link">
            Continue with Google
          </Link>
        </section>
      </Unauthenticated>

      <Authenticated>
        <AdminGate userLabel={user?.firstName ?? user?.email ?? "Owner"} />
      </Authenticated>
    </main>
  );
}

function AdminGate({ userLabel }: { userLabel: string }) {
  const status = useQuery(api.viewer.platformAdminStatus);

  if (status === undefined) {
    return <section className="admin-panel loading-panel">Checking platform admin access...</section>;
  }

  if (!status.allowed) {
    return (
      <section className="auth-panel">
        <div>
          <span className="eyebrow">Platform admin</span>
          <h2>Admin access required</h2>
          <p>
            {status.allowlistConfigured
              ? `${status.email ?? status.tokenIdentifier ?? "This Google account"} is signed in, but it is not allowlisted for the command center.`
              : "Set PLATFORM_ADMIN_EMAILS or PLATFORM_ADMIN_TOKEN_IDENTIFIERS in Convex before opening the command center."}
          </p>
        </div>
        <Link href="/sign-in" className="button-link">
          Switch account
        </Link>
      </section>
    );
  }

  return <CloudDashboard userLabel={userLabel} />;
}
