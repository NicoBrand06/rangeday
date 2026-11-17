import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { getCtx } from "@/lib/context";
import { activityLabel } from "@/lib/config";
import { listInstructors } from "@/lib/lessons";
import InstructorForm from "@/components/InstructorForm";
import { saveInstructorAction } from "./actions";

export default async function Instructors({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  await requireStaff();
  const { db, cfg } = await getCtx();
  const list = await listInstructors(db);
  return (
    <>
      <Link href="/staff/lessons" className="link-btn">‹ Lessons</Link>
      <div className="desk-grid" style={{ marginTop: 8 }}>
        <section className="panel">
          <h2>Instructors</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Specialty</th><th>Teaches</th><th>Status</th></tr></thead>
              <tbody>
                {list.map((i) => (
                  <tr key={i.id}>
                    <td><Link href={`/staff/instructors/${i.id}`} style={{ textDecoration: "underline" }}>{i.name}</Link></td>
                    <td>{i.specialty}</td>
                    <td>{i.disciplines.map((d) => activityLabel(cfg, d)).join(", ")}</td>
                    <td>{i.active ? <span className="pill green">Taking lessons</span> : <span className="pill">Inactive</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <h2>+ Add instructor</h2>
          {sp.error && <p className="note error" role="alert">{sp.error}</p>}
          <InstructorForm action={saveInstructorAction} areas={cfg.activities} />
        </section>
      </div>
    </>
  );
}
