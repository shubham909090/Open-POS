"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import Link from "next/link";

import { AttendanceDevices } from "../../components/attendance-devices";

export default function AttendancePairingPage() {
  const { user, signOut } = useAuth();

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <span className="product-mark">Gaurav POS</span>
          <h1>Sky Attendance</h1>
          <p>Pair and manage the Android devices used to record staff attendance.</p>
        </div>
        {user ? (
          <div className="topbar-actions">
            <span className="user-pill">{user.email ?? user.firstName ?? "Signed in"}</span>
            <button type="button" className="ghost-button" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        ) : null}
      </header>

      <p className="loading-panel mb-4 text-sm font-bold text-muted">
        <Link href="/" className="underline underline-offset-4">
          ← Back to dashboard
        </Link>
      </p>

      <AuthLoading>
        <section className="admin-panel loading-panel">Checking your session…</section>
      </AuthLoading>

      <Unauthenticated>
        <section className="auth-panel">
          <div>
            <span className="eyebrow">Authentication</span>
            <h2>Sign-in required</h2>
            <p>Sign in with the WorkOS account that has access to this restaurant.</p>
          </div>
          <Link href="/sign-in" className="button-link">
            Sign in
          </Link>
        </section>
      </Unauthenticated>

      <Authenticated>
        <AttendanceDevices />
      </Authenticated>
    </main>
  );
}
