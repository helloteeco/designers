/**
 * Teeco brand mark — simple house outline (pentagon roofline) above the
 * lowercase "teeco" wordmark. Inline SVG so it prints crisply with no
 * external assets or font packages.
 */
export default function TeecoLogo({
  className = "h-12 w-auto",
  color = "#2B2B2B",
}: {
  className?: string;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 82"
      className={className}
      role="img"
      aria-label="teeco"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* House outline — pentagon roofline */}
      <path
        d="M40 44 V25 L60 9 L80 25 V44 Z"
        stroke={color}
        strokeWidth="3.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      {/* Door */}
      <path
        d="M54 44 V33 H66 V44"
        stroke={color}
        strokeWidth="2.5"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Wordmark */}
      <text
        x="60"
        y="72"
        textAnchor="middle"
        fill={color}
        fontSize="24"
        fontWeight="600"
        letterSpacing="3"
        fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
      >
        teeco
      </text>
    </svg>
  );
}
