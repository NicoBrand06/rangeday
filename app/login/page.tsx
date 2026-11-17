import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import ClubBar from "@/components/ClubBar";
import SubmitButton from "@/components/SubmitButton";
import { currentUser } from "@/lib/auth";
import { getCtx } from "@/lib/context";
import { demoMode } from "@/lib/db";
import { demoLogin, loginAction } from "../actions";

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect(user.role === "staff" ? "/staff" : "/");
  const { cfg } = await getCtx();
  const demo = demoMode();
  return (
    <div className="app" style={{ paddingBottom: 0 }}>
      <ClubBar cfg={cfg} title="RangeDay" />
      <div className="login">
        <p>Book a field or a lesson, see what&apos;s on and reserve gear for pickup, any time of day.</p>
        <h2>Log in</h2>
        <AuthForm mode="login" action={loginAction} />

        {demo && (
          <>
            <h2>Or try the demo</h2>
            <form action={demoLogin}>
              <SubmitButton className="who" name="role" value="member" pending="Opening…">
                <span className="avatar" aria-hidden>SW</span>
                <span>
                  <strong>Sam Whitaker</strong>
                  <br />
                  <span className="muted">Demo member · book, RSVP and reserve</span>
                </span>
              </SubmitButton>
              <SubmitButton className="who" name="role" value="staff" pending="Opening…">
                <span className="avatar staff" aria-hidden>JE</span>
                <span>
                  <strong>Jordan Ellis</strong>
                  <br />
                  <span className="muted">Demo staff · front desk console</span>
                </span>
              </SubmitButton>
            </form>
            <p className="note">
              Public demo: {cfg.clubName} and everyone in it are fictional, demo data resets weekly, and there are no payments.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
