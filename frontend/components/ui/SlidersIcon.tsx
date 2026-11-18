// The design's two-slider glyph (Chat.html: the "2 tool calls" header; Main.html: the nav's Settings,
// also in the command palette): the top knob on the right, the bottom one on the left. Lucide's
// Settings2 draws it mirrored and SlidersHorizontal has three bars, so the design's path is drawn
// here, at the design's 1.7 stroke. Decorative.
export function SlidersIcon({ size = 14, className }: { size?: number; className?: string }) {
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
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </svg>
  );
}
