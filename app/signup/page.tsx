import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import ClubBar from "@/components/ClubBar";
import { currentUser } from "@/lib/auth";
import { getCtx } from "@/lib/context";
import { demoMode } from "@/lib/db";
import { signupAction } from "../actions";

export default async function SignupPage() {
  if (await currentUser()) redirect("/");
  const { cfg } = await getCtx();
  return (
    <div className="app" style={{ paddingBottom: 0 }}>
      <ClubBar cfg={cfg} title="Create your account" />
      <div className="login">
        {demoMode() && (
          <p className="note warn">
            This is a public demo. Don&apos;t use a real password you use elsewhere. Accounts are deleted when the demo resets each week.
          </p>
        )}
        <AuthForm mode="signup" action={signupAction} />
      </div>
    </div>
  );
}
