import type { ClubConfig } from "@/lib/config";

/** The club's logo (if uploaded) and name, for the top of the sign-in screens. */
export default function ClubBar({ cfg, title }: { cfg: Pick<ClubConfig, "clubName" | "tagline" | "logo">; title?: string }) {
  return (
    <div className="bar row" style={{ flexWrap: "nowrap" }}>
      {cfg.logo && <img src={cfg.logo} alt="" width={44} height={44} style={{ borderRadius: 8, background: "#fff", objectFit: "contain" }} />}
      <div>
        <h1>{title ?? cfg.clubName}</h1>
        <p>{title ? cfg.clubName : cfg.tagline}</p>
      </div>
    </div>
  );
}
