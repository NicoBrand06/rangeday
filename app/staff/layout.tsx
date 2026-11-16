import { requireStaff } from "@/lib/auth";
import StaffNav from "@/components/StaffNav";
import { logout } from "../actions";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  return (
    <div className="desk">
      <div className="top">
        <h1>RangeDay Desk</h1>
        <StaffNav signOut={logout} name={user.name} />
      </div>
      <main>{children}</main>
    </div>
  );
}
