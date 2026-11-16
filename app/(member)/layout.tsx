import { redirect } from "next/navigation";
import TabBar from "@/components/TabBar";
import { requireUser } from "@/lib/auth";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.role === "staff") redirect("/staff");
  return (
    <div className="app">
      {children}
      <TabBar />
    </div>
  );
}
