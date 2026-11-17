"use client";
import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/app/actions";
import SubmitButton from "./SubmitButton";

/** Email + password form for login and sign-up. Keeps what you typed if there's an error. */
export default function AuthForm({ mode, action }: { mode: "login" | "signup"; action: (s: FormState, f: FormData) => Promise<FormState> }) {
  const [state, formAction] = useActionState(action, undefined);
  const signup = mode === "signup";
  return (
    <form action={formAction} noValidate>
      {state?.error && <p className="note error" role="alert">{state.error}</p>}
      {signup && (
        <label className="field">
          <span>Your name</span>
          <input className="input" name="name" autoComplete="name" required defaultValue={state?.name} />
        </label>
      )}
      <label className="field">
        <span>Email</span>
        <input className="input" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state?.email} />
      </label>
      <label className="field">
        <span>Password{signup ? " (at least 8 characters)" : ""}</span>
        <input className="input" name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} required minLength={signup ? 8 : undefined} />
      </label>
      {signup && (
        <label className="field">
          <span>Confirm password</span>
          <input className="input" name="confirm" type="password" autoComplete="new-password" required />
        </label>
      )}
      <SubmitButton pending={signup ? "Creating account…" : "Signing in…"}>{signup ? "Create account" : "Log in"}</SubmitButton>
      <p className="muted" style={{ marginTop: 12, textAlign: "center" }}>
        {signup ? (
          <>Already a member? <Link href="/login" style={{ textDecoration: "underline" }}>Log in</Link></>
        ) : (
          <>New here? <Link href="/signup" style={{ textDecoration: "underline" }}>Create an account</Link></>
        )}
      </p>
      {!signup && <p className="muted" style={{ textAlign: "center" }}>Forgot your password? Ask the front desk to reset it.</p>}
    </form>
  );
}
