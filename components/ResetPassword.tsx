"use client";
import { useActionState } from "react";
import type { ResetState } from "@/app/staff/people/actions";
import SubmitButton from "./SubmitButton";

export default function ResetPassword({ id, action }: { id: number; action: (s: ResetState, f: FormData) => Promise<ResetState> }) {
  const [state, formAction] = useActionState(action, undefined);
  if (state?.temporary)
    return (
      <p className="note ok" role="status" style={{ marginTop: 0 }}>
        Temporary password for {state.name}: <strong style={{ fontFamily: "monospace", fontSize: "1rem" }}>{state.temporary}</strong>
        <br />Give it to them in person or by phone. It&apos;s shown only once. They should change it after logging in.
      </p>
    );
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton className="btn small sec" pending="…">Reset password</SubmitButton>
      {state?.error && <span className="muted" role="alert" style={{ marginLeft: 6, color: "var(--red)" }}>{state.error}</span>}
    </form>
  );
}
