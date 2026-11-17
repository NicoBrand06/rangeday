"use client";
import { useState } from "react";

/** A +/− picker that sends its number with the form. Used for party size and item quantity. */
export default function Stepper({ kind, max, name, hint: hintText }: { kind: "party" | "qty"; max: number; name: string; hint?: string }) {
  const [n, setN] = useState(1);
  const title = kind === "party" ? (n === 1 ? "Just you" : `You + ${n - 1} ${n === 2 ? "other" : "others"}`) : `Quantity: ${n}`;
  const hint = hintText ?? (kind === "party" ? `Up to ${max} people` : `Up to ${max} per reservation`);
  const what = kind === "party" ? "shooter" : "item";
  return (
    <div className="card card-row">
      <div className="grow">
        <h3>{title}</h3>
        <p>{hint}</p>
      </div>
      <div className="stepper">
        <button type="button" onClick={() => setN(n - 1)} disabled={n <= 1} aria-label={`One fewer ${what}`}>−</button>
        <output aria-live="polite">{n}</output>
        <button type="button" onClick={() => setN(n + 1)} disabled={n >= max} aria-label={`One more ${what}`}>+</button>
      </div>
      <input type="hidden" name={name} value={n} />
    </div>
  );
}
