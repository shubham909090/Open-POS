"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import Link from "next/link";

const syncRows = [
  { label: "Pending events", value: "local-first", detail: "Hub outbox uploads when internet returns" },
  { label: "Device enrollment", value: "QR/manual", detail: "Android devices pair to a restaurant hub" },
  { label: "Reports", value: "daily", detail: "Sales summaries land in Convex after sync" }
];

export default function CloudAdminHome() {
  const { user, signOut } = useAuth();

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <h1>Gaurav POS Admin</h1>
          <p>Restaurant cloud control plane</p>
        </div>
        {user ? (
          <button onClick={() => void signOut()}>Sign out</button>
        ) : (
          <Link href="/sign-in" className="button-link">
            Sign in with Google
          </Link>
        )}
      </header>

      <AuthLoading>
        <section className="admin-panel">Checking session...</section>
      </AuthLoading>

      <Unauthenticated>
        <section className="admin-panel auth-panel">
          <h2>Google sign-in required</h2>
          <p>WorkOS AuthKit will issue identity tokens to Convex after the env values are added.</p>
          <Link href="/sign-in" className="button-link">
            Continue
          </Link>
        </section>
      </Unauthenticated>

      <Authenticated>
        <section className="dashboard-grid">
          <div className="admin-panel restaurant-panel">
            <span className="eyebrow">Current restaurant</span>
            <h2>Main Outlet</h2>
            <p>Cloud sync is intentionally secondary; the Windows hub remains the source of truth during service.</p>
          </div>

          <div className="admin-panel">
            <span className="eyebrow">Identity</span>
            <h2>{user?.firstName ?? user?.email ?? "Signed in"}</h2>
            <p>Roles will map WorkOS users to restaurant memberships and local hub permissions.</p>
          </div>

          <section className="admin-panel wide-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Operations</span>
                <h2>Sync and fleet overview</h2>
              </div>
            </div>
            <div className="metric-grid">
              {syncRows.map((row) => (
                <article className="metric" key={row.label}>
                  <strong>{row.label}</strong>
                  <span>{row.value}</span>
                  <p>{row.detail}</p>
                </article>
              ))}
            </div>
          </section>
        </section>
      </Authenticated>
    </main>
  );
}
