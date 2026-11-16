import { loginAs } from "../actions";
import { CLUB_NAME } from "@/lib/club";

export default function LoginPage() {
  return (
    <div className="app" style={{ paddingBottom: 0 }}>
      <div className="bar">
        <h1>RangeDay</h1>
        <p>{CLUB_NAME}</p>
      </div>
      <div className="login">
        <p>Book a station, see what&apos;s on and reserve gear for pickup, any time of day.</p>
        <h2>Choose a demo account</h2>
        <form action={loginAs}>
          <button className="who" name="role" value="member">
            <span className="avatar" aria-hidden>SW</span>
            <span>
              <strong>Sam Whitaker</strong>
              <br />
              <span className="muted">Member #1042 · books, RSVPs and reserves</span>
            </span>
          </button>
          <button className="who" name="role" value="staff">
            <span className="avatar staff" aria-hidden>JE</span>
            <span>
              <strong>Jordan Ellis</strong>
              <br />
              <span className="muted">Front desk lead · staff console</span>
            </span>
          </button>
        </form>
        <p className="note">
          Demo only: no passwords and no payments. Cedar Ridge Sporting Club and everyone in this app are fictional.
        </p>
      </div>
    </div>
  );
}
