"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import Link from "next/link";

import { CloudDashboard } from "../components/cloud-dashboard";

export default function CloudAdminHome() {
  const { user, signOut } = useAuth();

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <span className="product-mark">Gaurav POS</span>
          <h1>Owner Portal</h1>
          <p>Connect the restaurant hub, invite cloud users, and read finalized business-day reports.</p>
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
