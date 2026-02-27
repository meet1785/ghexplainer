/**
 * ghexplainer logo — a stylized terminal/code-lens icon.
 * Represents "looking into code" with a magnifying lens
 * merging into angle brackets (< / >).
 */
export default function Logo({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="ghexplainer logo"
    >
      {/* Outer rounded square — like a terminal window */}
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="14"
        fill="#111318"
        stroke="url(#logo-border)"
        strokeWidth="2.5"
      />

      {/* Code bracket left < */}
      <path
        d="M23 22L12 32L23 42"
        stroke="#40c0a0"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />

      {/* Code bracket right > */}
      <path
        d="M41 22L52 32L41 42"
        stroke="#40c0a0"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />

      {/* Magnifying glass lens (circle) — centered, overlapping brackets */}
      <circle
        cx="32"
        cy="30"
        r="10"
        stroke="#f0a040"
        strokeWidth="2.5"
        fill="none"
      />

      {/* Magnifying glass handle */}
      <line
        x1="39"
        y1="37"
        x2="48"
        y2="46"
        stroke="#f0a040"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Small code lines inside the lens */}
      <line x1="27" y1="28" x2="33" y2="28" stroke="#e8e4d9" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <line x1="29" y1="32" x2="37" y2="32" stroke="#e8e4d9" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />

      {/* Gradient definitions */}
      <defs>
        <linearGradient id="logo-border" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0%" stopColor="#f0a040" stopOpacity="0.6" />
          <stop offset="50%" stopColor="#e06070" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#40c0a0" stopOpacity="0.6" />
        </linearGradient>
      </defs>
    </svg>
  );
}
