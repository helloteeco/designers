/**
 * Inline-SVG diagrams for the Install Guide static pages.
 * Clean minimal line art in the brand palette (charcoal strokes, taupe
 * fills) — print-safe, no external assets.
 */

const INK = "#2B2B2B";
const TAUPE = "#A8987F";
const TAUPE_FILL = "#E9E2D6";
const TAUPE_MID = "#D8CDBA";
const RED = "#E53935";

// ── Curtains: DO vs DON'T ──

export function CurtainDiagram({ variant }: { variant: "do" | "dont" }) {
  const isDo = variant === "do";
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 220 240" className="h-[1.95in] w-auto">
        {/* Floor */}
        <line x1="12" y1="228" x2="208" y2="228" stroke={INK} strokeWidth="2" />
        {/* Window */}
        <rect
          x="72"
          y="68"
          width="76"
          height="112"
          fill="#FFFFFF"
          stroke={INK}
          strokeWidth="2"
        />
        <line x1="110" y1="68" x2="110" y2="180" stroke={INK} strokeWidth="1" />
        <line x1="72" y1="124" x2="148" y2="124" stroke={INK} strokeWidth="1" />

        {isDo ? (
          <>
            {/* Rod mounted high + wide */}
            <line x1="26" y1="44" x2="194" y2="44" stroke={INK} strokeWidth="3" />
            <circle cx="22" cy="44" r="3.5" fill={INK} />
            <circle cx="198" cy="44" r="3.5" fill={INK} />
            {/* Panels kiss the floor */}
            <rect x="30" y="47" width="30" height="181" fill={TAUPE_FILL} stroke={INK} strokeWidth="1.5" />
            <line x1="40" y1="47" x2="40" y2="228" stroke={TAUPE} strokeWidth="1" />
            <line x1="50" y1="47" x2="50" y2="228" stroke={TAUPE} strokeWidth="1" />
            <rect x="160" y="47" width="30" height="181" fill={TAUPE_FILL} stroke={INK} strokeWidth="1.5" />
            <line x1="170" y1="47" x2="170" y2="228" stroke={TAUPE} strokeWidth="1" />
            <line x1="180" y1="47" x2="180" y2="228" stroke={TAUPE} strokeWidth="1" />
            {/* 6–10" above frame */}
            <line x1="206" y1="44" x2="206" y2="68" stroke={TAUPE} strokeWidth="1" />
            <line x1="203" y1="44" x2="209" y2="44" stroke={TAUPE} strokeWidth="1" />
            <line x1="203" y1="68" x2="209" y2="68" stroke={TAUPE} strokeWidth="1" />
            <text x="211" y="59" fontSize="9" fill={TAUPE}>{'6–10"'}</text>
            {/* 6–10" past each side */}
            <line x1="148" y1="34" x2="194" y2="34" stroke={TAUPE} strokeWidth="1" />
            <line x1="148" y1="31" x2="148" y2="37" stroke={TAUPE} strokeWidth="1" />
            <line x1="194" y1="31" x2="194" y2="37" stroke={TAUPE} strokeWidth="1" />
            <text x="146" y="26" fontSize="9" fill={TAUPE}>{'6–10"'}</text>
          </>
        ) : (
          <>
            {/* Rod cramped at the frame */}
            <line x1="68" y1="64" x2="152" y2="64" stroke={INK} strokeWidth="3" />
            {/* Short panels stop mid-wall */}
            <rect x="70" y="66" width="22" height="106" fill={TAUPE_FILL} stroke={INK} strokeWidth="1.5" />
            <rect x="128" y="66" width="22" height="106" fill={TAUPE_FILL} stroke={INK} strokeWidth="1.5" />
            {/* Cross-out */}
            <line x1="36" y1="42" x2="184" y2="212" stroke={RED} strokeWidth="4" opacity="0.75" />
            <line x1="184" y1="42" x2="36" y2="212" stroke={RED} strokeWidth="4" opacity="0.75" />
          </>
        )}
      </svg>
    </div>
  );
}

// ── Art hanging ──

export function ArtDiagram({ variant }: { variant: "over-sofa" | "wall-group" }) {
  if (variant === "over-sofa") {
    return (
      <svg viewBox="0 0 260 210" className="h-[1.95in] w-auto">
        {/* Floor */}
        <line x1="14" y1="200" x2="246" y2="200" stroke={INK} strokeWidth="2" />
        {/* Art with mat */}
        <rect x="92" y="42" width="76" height="54" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
        <rect x="100" y="50" width="60" height="38" fill="none" stroke={TAUPE} strokeWidth="1" />
        <path d="M104 82 L122 62 L134 74 L144 60 L156 82" fill="none" stroke={TAUPE} strokeWidth="1.5" />
        {/* Sofa */}
        <rect x="55" y="118" width="150" height="32" rx="6" fill={TAUPE_FILL} stroke={INK} strokeWidth="2" />
        <rect x="50" y="146" width="160" height="26" rx="6" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
        <rect x="42" y="128" width="16" height="44" rx="6" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
        <rect x="202" y="128" width="16" height="44" rx="6" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
        <line x1="60" y1="172" x2="60" y2="200" stroke={INK} strokeWidth="2" />
        <line x1="200" y1="172" x2="200" y2="200" stroke={INK} strokeWidth="2" />
        {/* 6–8" gap art-to-sofa */}
        <line x1="78" y1="96" x2="78" y2="118" stroke={TAUPE} strokeWidth="1" />
        <line x1="75" y1="96" x2="81" y2="96" stroke={TAUPE} strokeWidth="1" />
        <line x1="75" y1="118" x2="81" y2="118" stroke={TAUPE} strokeWidth="1" />
        <text x="48" y="110" fontSize="9" fill={TAUPE}>{'6–8"'}</text>
        {/* 60" center line */}
        <line x1="168" y1="69" x2="234" y2="69" stroke={TAUPE} strokeWidth="1" strokeDasharray="3,3" />
        <line x1="234" y1="69" x2="234" y2="200" stroke={TAUPE} strokeWidth="1" strokeDasharray="3,3" />
        <text x="222" y="140" fontSize="9" fill={TAUPE} transform="rotate(-90 222 140)">{'60" to center'}</text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 260 210" className="h-[1.95in] w-auto">
      {/* Floor */}
      <line x1="14" y1="200" x2="246" y2="200" stroke={INK} strokeWidth="2" />
      {/* Grouped pair */}
      <rect x="70" y="50" width="52" height="72" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
      <rect x="78" y="58" width="36" height="56" fill="none" stroke={TAUPE} strokeWidth="1" />
      <rect x="138" y="50" width="52" height="72" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
      <rect x="146" y="58" width="36" height="56" fill="none" stroke={TAUPE} strokeWidth="1" />
      {/* 3–4" spacing */}
      <line x1="122" y1="40" x2="138" y2="40" stroke={TAUPE} strokeWidth="1" />
      <line x1="122" y1="37" x2="122" y2="43" stroke={TAUPE} strokeWidth="1" />
      <line x1="138" y1="37" x2="138" y2="43" stroke={TAUPE} strokeWidth="1" />
      <text x="116" y="31" fontSize="9" fill={TAUPE}>{'3–4"'}</text>
      {/* 60" eye-level center line */}
      <line x1="30" y1="86" x2="230" y2="86" stroke={TAUPE} strokeWidth="1" strokeDasharray="3,3" />
      <line x1="40" y1="86" x2="40" y2="200" stroke={TAUPE} strokeWidth="1" strokeDasharray="3,3" />
      <text x="46" y="180" fontSize="9" fill={TAUPE}>{'60" eye level'}</text>
    </svg>
  );
}

// ── Rug placement (top-down) ──

export function RugSofaDiagram() {
  return (
    <svg viewBox="0 0 260 180" className="h-[1.65in] w-auto">
      {/* Rug */}
      <rect x="30" y="50" width="200" height="116" fill={TAUPE_FILL} stroke={INK} strokeWidth="2" />
      <rect x="38" y="58" width="184" height="100" fill="none" stroke={TAUPE} strokeWidth="1" />
      {/* Sofa — front third overlapping the rug */}
      <rect x="72" y="18" width="116" height="48" rx="4" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
      <line x1="72" y1="30" x2="188" y2="30" stroke={INK} strokeWidth="1" />
      <line x1="130" y1="30" x2="130" y2="66" stroke={INK} strokeWidth="1" />
      {/* Front legs on rug, back legs off */}
      <circle cx="80" cy="60" r="2.5" fill={INK} />
      <circle cx="180" cy="60" r="2.5" fill={INK} />
      <circle cx="80" cy="24" r="2.5" fill={INK} opacity="0.35" />
      <circle cx="180" cy="24" r="2.5" fill={INK} opacity="0.35" />
      {/* Coffee table */}
      <rect x="103" y="92" width="54" height="30" rx="3" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
      {/* Accent chairs */}
      <rect x="42" y="112" width="38" height="38" rx="4" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
      <line x1="42" y1="122" x2="80" y2="122" stroke={INK} strokeWidth="1" />
      <rect x="180" y="112" width="38" height="38" rx="4" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
      <line x1="180" y1="122" x2="218" y2="122" stroke={INK} strokeWidth="1" />
    </svg>
  );
}

export function RugBedDiagram() {
  return (
    <svg viewBox="0 0 260 180" className="h-[1.65in] w-auto">
      {/* Rug under lower two-thirds of the bed */}
      <rect x="58" y="58" width="144" height="104" fill={TAUPE_FILL} stroke={INK} strokeWidth="2" />
      <rect x="66" y="66" width="128" height="88" fill="none" stroke={TAUPE} strokeWidth="1" />
      {/* Nightstands */}
      <rect x="62" y="20" width="24" height="24" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
      <rect x="174" y="20" width="24" height="24" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
      {/* Bed */}
      <rect x="92" y="14" width="76" height="8" fill={INK} />
      <rect x="92" y="22" width="76" height="98" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
      <rect x="98" y="28" width="30" height="16" rx="2" fill="none" stroke={INK} strokeWidth="1" />
      <rect x="132" y="28" width="30" height="16" rx="2" fill="none" stroke={INK} strokeWidth="1" />
      <line x1="92" y1="52" x2="168" y2="52" stroke={INK} strokeWidth="1" />
      {/* 18–24" callouts on three sides */}
      <line x1="58" y1="140" x2="92" y2="140" stroke={TAUPE} strokeWidth="1" />
      <line x1="58" y1="137" x2="58" y2="143" stroke={TAUPE} strokeWidth="1" />
      <line x1="92" y1="137" x2="92" y2="143" stroke={TAUPE} strokeWidth="1" />
      <text x="14" y="135" fontSize="8" fill={TAUPE}>{'18–24"'}</text>
      <line x1="168" y1="140" x2="202" y2="140" stroke={TAUPE} strokeWidth="1" />
      <line x1="168" y1="137" x2="168" y2="143" stroke={TAUPE} strokeWidth="1" />
      <line x1="202" y1="137" x2="202" y2="143" stroke={TAUPE} strokeWidth="1" />
      <text x="206" y="135" fontSize="8" fill={TAUPE}>{'18–24"'}</text>
      <line x1="216" y1="120" x2="216" y2="162" stroke={TAUPE} strokeWidth="1" />
      <line x1="213" y1="120" x2="219" y2="120" stroke={TAUPE} strokeWidth="1" />
      <line x1="213" y1="162" x2="219" y2="162" stroke={TAUPE} strokeWidth="1" />
      <text x="222" y="144" fontSize="8" fill={TAUPE}>{'18–24"'}</text>
    </svg>
  );
}

// ── Throw pillows (sofa elevation, large → small, odd count) ──

export function PillowDiagram() {
  return (
    <svg viewBox="0 0 260 160" className="h-[1.65in] w-auto">
      {/* Sofa back + arms */}
      <rect x="30" y="28" width="200" height="74" rx="8" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
      <rect x="18" y="48" width="22" height="72" rx="8" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
      <rect x="220" y="48" width="22" height="72" rx="8" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
      {/* Seat */}
      <rect x="30" y="100" width="200" height="22" rx="5" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
      <line x1="46" y1="122" x2="46" y2="136" stroke={INK} strokeWidth="2" />
      <line x1="214" y1="122" x2="214" y2="136" stroke={INK} strokeWidth="2" />
      {/* Large euro shams at the back corners */}
      <rect x="44" y="56" width="46" height="46" rx="5" fill={TAUPE_FILL} stroke={INK} strokeWidth="1.5" />
      <rect x="170" y="56" width="46" height="46" rx="5" fill={TAUPE_FILL} stroke={INK} strokeWidth="1.5" />
      {/* Medium pillows layered in front */}
      <rect x="76" y="66" width="38" height="36" rx="5" fill="#FFFFFF" stroke={INK} strokeWidth="1.5" />
      <rect x="146" y="66" width="38" height="36" rx="5" fill="#FFFFFF" stroke={INK} strokeWidth="1.5" />
      {/* Small lumbar centered — fifth pillow keeps the count odd */}
      <rect x="104" y="80" width="52" height="22" rx="5" fill={TAUPE_MID} stroke={INK} strokeWidth="1.5" />
    </svg>
  );
}

// ── Throw blanket draped over the sofa arm ──

export function BlanketDiagram() {
  return (
    <svg viewBox="0 0 260 160" className="h-[1.65in] w-auto">
      {/* Sofa */}
      <rect x="44" y="34" width="176" height="66" rx="8" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
      <rect x="30" y="52" width="24" height="68" rx="8" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
      <rect x="206" y="52" width="24" height="68" rx="8" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
      <rect x="44" y="98" width="176" height="22" rx="5" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
      <line x1="60" y1="120" x2="60" y2="136" stroke={INK} strokeWidth="2" />
      <line x1="200" y1="120" x2="200" y2="136" stroke={INK} strokeWidth="2" />
      {/* Throw draped over the left arm */}
      <path
        d="M26 50 Q42 44 58 50 L58 128 Q50 134 42 128 L42 70 Q34 76 26 70 Z"
        fill={TAUPE_FILL}
        stroke={INK}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <line x1="34" y1="52" x2="34" y2="68" stroke={TAUPE} strokeWidth="1" />
      <line x1="50" y1="52" x2="50" y2="124" stroke={TAUPE} strokeWidth="1" />
      {/* Fringe */}
      <line x1="44" y1="130" x2="44" y2="136" stroke={INK} strokeWidth="1" />
      <line x1="48" y1="131" x2="48" y2="137" stroke={INK} strokeWidth="1" />
      <line x1="52" y1="131" x2="52" y2="137" stroke={INK} strokeWidth="1" />
      <line x1="56" y1="130" x2="56" y2="136" stroke={INK} strokeWidth="1" />
    </svg>
  );
}
