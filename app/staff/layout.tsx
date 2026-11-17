import { requireStaff } from "@/lib/auth";
import { getCtx } from "@/lib/context";
import StaffNav from "@/components/StaffNav";
import { logout } from "../actions";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const { cfg } = await getCtx();
  return (
    <div className="desk">
      <div className="top">
        <div className="row" style={{ flexWrap: "nowrap" }}>
          {cfg.logo && <img src={cfg.logo} alt="" width={32} height={32} style={{ borderRadius: 6, background: "#fff", objectFit: "contain" }} />}
          <h1>{cfg.clubName} · Desk</h1>
        </div>
        <StaffNav signOut={logout} name={user.name} />
      </div>
      <main>{children}</main>
    </div>
  );
}
