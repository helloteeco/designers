/**
 * Teeco brand mark — matches the client-deliverable lockup: a circled house
 * glyph followed by the lowercase "teeco" wordmark on one line. Inline SVG so
 * it prints crisply with no external assets or font packages.
 */
export default function TeecoLogo({
  className = "h-8 w-auto",
  color = "#2B2B2B",
}: {
  className?: string;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 190 56"
      className={className}
      role="img"
      aria-label="teeco"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Circle enclosing the house glyph (open at the lower right, like the
          reference mark's pen-stroke circle) */}
      <path
        d="M48.5 35.5 A22 22 0 1 0 39 48.5"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      {/* House: roofline + walls */}
      <path
        d="M17 28 L28 17.5 L39 28 M20.5 25.5 V38.5 H35.5 V25.5"
        stroke={color}
        strokeWidth="2.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      {/* Door */}
      <path
        d="M25.5 38.5 V31 H30.5 V38.5"
        stroke={color}
        strokeWidth="2.2"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Wordmark */}
      <text
        x="58"
        y="39"
        fill={color}
        fontSize="32"
        fontWeight="500"
        letterSpacing="0.5"
        fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
      >
        teeco
      </text>
    </svg>
  );
}
