"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Role = "parent" | "kid";

export function AuthScreen() {
  const router = useRouter();
  const demoModeAllowed = process.env.NODE_ENV !== "production";
  const [role, setRole] = useState<Role>("parent");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [kidPin, setKidPin] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const helperText = useMemo(() => {
    if (role === "parent") {
      return "Parent sign in with email + password";
    }
    return "Kids unlock with household PIN";
  }, [role]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const body =
        role === "parent"
          ? {
              action: "parent-login",
              email,
              password,
            }
          : {
              action: "kid-pin",
              pin: kidPin,
            };

      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setErrorMessage(payload.error ?? "Unable to sign in.");
        setIsSubmitting(false);
        return;
      }

      router.replace(role === "parent" ? "/parent" : "/kids");
      router.refresh();
    } catch {
      setErrorMessage("Unable to sign in right now.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-shell min-h-screen">
      <div className="auth-card">
        <div className="auth-title">Chorebank</div>
        <div className="auth-subtitle">{helperText}</div>

        <div className="auth-role-tabs" role="group" aria-label="Choose role">
          <button
            type="button"
            className={`auth-role-btn ${role === "parent" ? "is-active" : ""}`}
            onClick={() => setRole("parent")}
            aria-pressed={role === "parent"}
          >
            Parent
          </button>
          <button
            type="button"
            className={`auth-role-btn ${role === "kid" ? "is-active" : ""}`}
            onClick={() => setRole("kid")}
            aria-pressed={role === "kid"}
          >
            Kid
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {role === "parent" ? (
            <>
              <label className="auth-label" htmlFor="parent-email">
                Parent email
              </label>
              <input
                id="parent-email"
                name="email"
                className="auth-input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />

              <label className="auth-label" htmlFor="parent-password">
                Password
              </label>
              <input
                id="parent-password"
                name="password"
                className="auth-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </>
          ) : (
            <>
              <label className="auth-label" htmlFor="kid-pin">
                PIN
              </label>
              <input
                id="kid-pin"
                name="pin"
                className="auth-input"
                inputMode="numeric"
                pattern="[0-9]*"
                type="password"
                autoComplete="current-password"
                value={kidPin}
                onChange={(event) => setKidPin(event.target.value)}
                required
              />
            </>
          )}

          {errorMessage ? <div className="auth-error" role="alert">{errorMessage}</div> : null}
          <div className="sr-only" role="status" aria-live="polite">{isSubmitting ? "Signing in." : ""}</div>

          <button type="submit" className="auth-submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : role === "parent" ? "Sign In as Parent" : "Enter as Kid"}
          </button>

          {demoModeAllowed ? (
            <button
              type="button"
              className="auth-demo-link"
              onClick={() => {
                router.push("/kids?mode=demo");
              }}
            >
              Open Demo Mode
            </button>
          ) : null}
        </form>
      </div>
    </div>
  );
}
