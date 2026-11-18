import { redirect } from "next/navigation";
import TabBar from "@/components/TabBar";
import TopRibbon from "@/components/TopRibbon";
import { requireUser } from "@/lib/auth";
import { getCtx } from "@/lib/context";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.role === "staff") redirect("/staff");
  const { cfg } = await getCtx();
  return (
    <div className="app">
      <TopRibbon clubName={cfg.clubName} />
      {children}
      <TabBar />
    </div>
  );
}
