"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

export function SetupScreen({ householdSlug, configurationError }: { householdSlug: string; configurationError?: string }) {
  const [error, setError] = useState<string | null>(configurationError ?? null);
  const [complete, setComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const timeZoneInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (timeZoneInputRef.current) {
      timeZoneInputRef.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setupToken: form.get("setupToken"),
        householdName: form.get("householdName"),
        householdSlug,
        timeZone: form.get("timeZone"),
        parentEmail: form.get("parentEmail"),
        parentPassword: form.get("parentPassword"),
        kidPin: form.get("kidPin"),
        childName: form.get("childName"),
        addStarterData: form.get("addStarterData") === "on",
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    setSubmitting(false);

    if (!response.ok) {
      setError(payload.error ?? "Setup failed. Check the values and try again.");
      return;
    }

    setComplete(true);
  }

  if (complete) {
    return (
      <main className="auth-shell min-h-screen">
        <section className="auth-card setup-card">
          <div className="setup-kicker">Ready to go</div>
          <h1 className="auth-title">Your household is set up</h1>
          <p className="setup-copy">Setup is now disabled. Sign in with the parent email and password you just created.</p>
          <a className="auth-submit setup-link" href="/auth">Sign in</a>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell setup-shell min-h-screen">
      <section className="auth-card setup-card">
        <div className="setup-kicker">First run</div>
        <h1 className="auth-title">Set up Chorebank</h1>
        <p className="setup-copy">Create the first parent and child. Passwords and PINs are stored as secure hashes in PostgreSQL, never as deployment variables.</p>

        <form className="auth-form setup-form" onSubmit={submit}>
          <label className="auth-label" htmlFor="setup-token">Setup token</label>
          <input className="auth-input" id="setup-token" name="setupToken" type="password" autoComplete="off" aria-describedby="setup-token-help" required />
          <p id="setup-token-help" className="setup-help">Find this in your .env file or your hosting service&apos;s app variables.</p>

          <div className="setup-grid">
            <label className="setup-field">
              <span className="auth-label">Household name</span>
              <input className="auth-input" name="householdName" autoComplete="organization" minLength={2} maxLength={80} required />
            </label>
            <label className="setup-field">
              <span className="auth-label">Household slug</span>
              <input className="auth-input" name="householdSlug" value={householdSlug} readOnly aria-describedby="slug-help" />
            </label>
          </div>
          <p id="slug-help" className="setup-help">This matches DEFAULT_HOUSEHOLD_ID and cannot be changed here.</p>

          <label className="auth-label" htmlFor="time-zone">Timezone</label>
          <input ref={timeZoneInputRef} className="auth-input" id="time-zone" name="timeZone" autoComplete="off" defaultValue="UTC" placeholder="America/Vancouver" required />

          <label className="auth-label" htmlFor="parent-email">Parent email</label>
          <input className="auth-input" id="parent-email" name="parentEmail" type="email" autoComplete="email" required />

          <label className="auth-label" htmlFor="parent-password">Parent password</label>
          <input className="auth-input" id="parent-password" name="parentPassword" type="password" autoComplete="new-password" minLength={12} required />
          <p className="setup-help">Use at least 12 characters.</p>

          <div className="setup-grid">
            <label className="setup-field">
              <span className="auth-label">First child&apos;s name</span>
              <input className="auth-input" name="childName" autoComplete="given-name" maxLength={80} required />
            </label>
            <label className="setup-field">
              <span className="auth-label">Kid PIN</span>
              <input className="auth-input" name="kidPin" type="password" inputMode="numeric" pattern="[0-9]{4,12}" autoComplete="new-password" required />
            </label>
          </div>

          <label className="setup-check">
            <input name="addStarterData" type="checkbox" defaultChecked />
            Add starter chores and rewards
          </label>

          {error ? <div className="auth-error" role="alert">{error}</div> : null}
          <div className="sr-only" role="status" aria-live="polite">{submitting ? "Creating household." : ""}</div>
          <button className="auth-submit" type="submit" disabled={submitting || Boolean(configurationError)}>
            {submitting ? "Creating household…" : "Create household"}
          </button>
        </form>
      </section>
    </main>
  );
}
