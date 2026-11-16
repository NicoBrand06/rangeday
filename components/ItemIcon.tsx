// Simple line icons standing in for product photos.
const PATHS: Record<string, string> = {
  Ammunition: "M8 20V9l2-4 2 4v11zM14 20V9l2-4 2 4v11zM6 20h14",
  Apparel: "M8 4l4 2 4-2 4 4-3 3v9H7v-9L4 8z",
  Accessories: "M3 12a3 3 0 0 1 6 0 3 3 0 0 0 6 0 3 3 0 0 1 6 0M9 12h6",
};

export default function ItemIcon({ category }: { category: string }) {
  return (
    <span className="thumb" aria-hidden>
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
        <path d={PATHS[category] ?? PATHS.Accessories} />
      </svg>
    </span>
  );
}
