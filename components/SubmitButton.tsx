"use client";
import { useFormStatus } from "react-dom";

/** A form's submit button that shows "Saving…" and can't be tapped twice while the form is sending. */
export default function SubmitButton({
  children,
  pending = "Saving…",
  className = "btn",
  name,
  value,
  style,
}: {
  children: React.ReactNode;
  pending?: string;
  className?: string;
  name?: string;
  value?: string;
  style?: React.CSSProperties;
}) {
  const { pending: busy } = useFormStatus();
  return (
    <button className={className} name={name} value={value} disabled={busy} aria-disabled={busy} style={style}>
      {busy ? pending : children}
    </button>
  );
}
