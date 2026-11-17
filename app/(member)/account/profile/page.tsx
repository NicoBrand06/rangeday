import Link from "next/link";
import { requireUser } from "@/lib/auth";
import SubmitButton from "@/components/SubmitButton";
import { changePasswordAction, deleteAccountAction, updateNameAction } from "../actions";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const demo = Boolean(Number(user.is_demo));
  return (
    <>
      <div className="bar">
        <Link href="/account" className="back">‹ Account</Link>
        <h1>Profile</h1>
        <p>{user.email ?? "Shared demo account"}</p>
      </div>
      <div className="pad">
        {sp.saved === "name" && <p className="note ok" role="status">Name updated.</p>}
        {sp.saved === "password" && <p className="note ok" role="status">Password changed.</p>}
        {sp.error && <p className="note error" role="alert">{sp.error}</p>}

        <div className="lbl">Your name</div>
        <form action={updateNameAction}>
          <label className="field">
            <span>Name shown to the club</span>
            <input className="input" name="name" defaultValue={user.name} autoComplete="name" required />
          </label>
          <SubmitButton className="btn sec">Save name</SubmitButton>
        </form>

        {demo ? (
          <p className="note">This is the shared demo account, so it has no password and can&apos;t be deleted. <Link href="/signup" style={{ textDecoration: "underline" }}>Create your own account</Link> to try these.</p>
        ) : (
          <>
            <div className="lbl">Change password</div>
            <form action={changePasswordAction}>
              <label className="field"><span>Current password</span><input className="input" type="password" name="current" autoComplete="current-password" required /></label>
              <label className="field"><span>New password (at least 8 characters)</span><input className="input" type="password" name="next" autoComplete="new-password" minLength={8} required /></label>
              <label className="field"><span>Confirm new password</span><input className="input" type="password" name="confirm" autoComplete="new-password" required /></label>
              <SubmitButton className="btn sec">Change password</SubmitButton>
            </form>

            <div className="lbl">Delete account</div>
            <form action={deleteAccountAction}>
              <p className="muted">
                This cancels your upcoming bookings, lessons, RSVPs and pickups, and removes your name and email. The club keeps
                anonymous history (for example, that a field was booked). This can&apos;t be undone.
              </p>
              <label className="field"><span>Enter your password to confirm</span><input className="input" type="password" name="password" autoComplete="current-password" required /></label>
              <SubmitButton className="btn danger" pending="Deleting…">Delete my account</SubmitButton>
            </form>
          </>
        )}
      </div>
    </>
  );
}
