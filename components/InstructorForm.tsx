import type { Activity } from "@/lib/config";
import type { Instructor } from "@/lib/lessons";
import SubmitButton from "./SubmitButton";

export default function InstructorForm({ action, areas, i }: { action: (f: FormData) => Promise<void>; areas: Activity[]; i?: Instructor }) {
  return (
    <form action={action}>
      {i && <input type="hidden" name="id" value={i.id} />}
      <label className="field"><span>Name</span><input className="input" name="name" defaultValue={i?.name} required /></label>
      <label className="field"><span>Specialty (shown to members)</span><input className="input" name="specialty" defaultValue={i?.specialty} placeholder="e.g. Beginners and youth shooters" required /></label>
      <fieldset className="field" style={{ border: 0 }}>
        <span style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--navy2)", marginBottom: 4 }}>Teaches</span>
        <div className="chips">
          {areas.filter((a) => a.active).map((a) => (
            <label key={a.key} className="chip" style={{ cursor: "pointer" }}>
              <input type="checkbox" name="disciplines" value={a.key} defaultChecked={i?.disciplines.includes(a.key)} style={{ marginRight: 6 }} />
              {a.label}
            </label>
          ))}
        </div>
      </fieldset>
      <SubmitButton>{i ? "Save details" : "Add instructor"}</SubmitButton>
    </form>
  );
}
