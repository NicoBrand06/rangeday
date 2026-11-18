"use client";
import { useState } from "react";

/** A short required note with a live character count. The server checks the limit again. */
export default function NoteField({ name, max, label, placeholder }: { name: string; max: number; label: string; placeholder?: string }) {
  const [n, setN] = useState(0);
  const left = max - n;
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        name={name}
        className="input"
        rows={4}
        required
        maxLength={max}
        placeholder={placeholder}
        aria-describedby={`${name}-count`}
        onChange={(e) => setN(e.target.value.length)}
      />
      <small id={`${name}-count`} className={`muted${left <= 30 ? " count-low" : ""}`} aria-live={left <= 30 ? "polite" : "off"} style={{ display: "block", textAlign: "right", marginTop: 4 }}>
        {left} of {max} characters left
      </small>
    </label>
  );
}
