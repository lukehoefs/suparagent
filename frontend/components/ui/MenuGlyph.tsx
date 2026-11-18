// The design's three-line menu glyph (MobileChat.html, MobileToday.html: "Open menu"): lines at
// y 7, 12 and 17, at the design's 1.7 stroke. Lucide's Menu spreads them wider (5, 12, 19), which
// reads lighter. Decorative: the button around it carries the name.
export function MenuGlyph({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}
