"use client";

import { forwardRef } from "react";
import type { PostBuilderProfile, Slide } from "@/lib/post-templates";

/**
 * Renders one 1080x1080 carousel slide that matches the Dr. Jeff Chheuy
 * template. Uses inline styles (not Tailwind classes) for fixed pixel
 * measurements — this is important so html-to-image exports pixel-accurate
 * PNGs regardless of viewport.
 *
 * The slide is rendered at its natural 1080px size. Parent controls the
 * visual scale via CSS transform.
 */

export const SLIDE_SIZE = 1080;

interface CarouselSlideProps {
  slide: Slide;
  profile: PostBuilderProfile;
  // When true, applies subtle overflow warning border — UI hint only, not
  // shown in exports because export uses a dedicated ref.
  warnOverflow?: boolean;
}

// Render **bold** spans inline.
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <span key={i} style={{ fontWeight: 700 }}>
          {part.slice(2, -2)}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

const VerifiedCheck = ({ size = 36 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    style={{ flexShrink: 0 }}
    aria-hidden
  >
    <path
      fill="#1D9BF0"
      d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z"
    />
    <path
      fill="#FFFFFF"
      d="M9.71 17.18 5.6 13.06l1.41-1.42 2.71 2.71 6.6-6.6 1.41 1.41z"
    />
  </svg>
);

const ProfileRow = ({ profile }: { profile: PostBuilderProfile }) => {
  const avatarSize = 120;
  const fallbackInitial =
    profile.displayName.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 28,
        marginBottom: 72,
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: avatarSize,
          height: avatarSize,
          borderRadius: "50%",
          overflow: "hidden",
          background:
            "linear-gradient(145deg, #F5B935 0%, #E8A420 50%, #D99013 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: 52,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {profile.avatarDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatarDataUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            crossOrigin="anonymous"
          />
        ) : (
          fallbackInitial
        )}
      </div>

      {/* Name + handle */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 44,
            fontWeight: 700,
            color: "#0F1419",
            lineHeight: 1.1,
          }}
        >
          <span>{profile.displayName || "Your Name"}</span>
          {profile.verified && <VerifiedCheck size={40} />}
        </div>
        <div
          style={{
            fontSize: 38,
            color: "#6B7280",
            lineHeight: 1.1,
          }}
        >
          {profile.handle || "@handle"}
        </div>
      </div>
    </div>
  );
};

// Individual slide type renderers

const HookOpenerBody = ({
  headline,
  items,
  footer,
}: {
  headline: string;
  items?: string[];
  footer?: string[];
}) => (
  <>
    <div style={{ fontSize: 56, lineHeight: 1.25, color: "#0F1419" }}>
      {headline}
    </div>
    {items && items.length > 0 && (
      <div style={{ marginTop: 44, fontSize: 54, lineHeight: 1.35 }}>
        {items.map((item, i) => (
          <div key={i}>
            {i + 1}. {item}
          </div>
        ))}
      </div>
    )}
    {footer && footer.length > 0 && (
      <div style={{ marginTop: 44, fontSize: 52, lineHeight: 1.35 }}>
        {footer.map((line, i) => (
          <div key={i} style={{ marginTop: i === 0 ? 0 : 36 }}>
            {renderInline(line)}
          </div>
        ))}
      </div>
    )}
  </>
);

const PersonalStoryBody = ({ paragraphs }: { paragraphs: string[] }) => (
  <div style={{ fontSize: 54, lineHeight: 1.35, color: "#0F1419" }}>
    {paragraphs.map((p, i) => (
      <div key={i} style={{ marginTop: i === 0 ? 0 : 40 }}>
        {renderInline(p)}
      </div>
    ))}
  </div>
);

const CriteriaBulletsBody = ({
  heading,
  bullets,
  footer,
}: {
  heading: string;
  bullets: string[];
  footer?: string;
}) => (
  <>
    <div style={{ fontSize: 54, lineHeight: 1.3, color: "#0F1419" }}>
      {heading}
    </div>
    <ul
      style={{
        marginTop: 40,
        paddingLeft: 60,
        fontSize: 52,
        lineHeight: 1.35,
        color: "#0F1419",
        listStyleType: "disc",
      }}
    >
      {bullets.map((b, i) => (
        <li key={i} style={{ marginBottom: 20 }}>
          {renderInline(b)}
        </li>
      ))}
    </ul>
    {footer && (
      <div style={{ marginTop: 40, fontSize: 54, lineHeight: 1.3 }}>
        {renderInline(footer)}
      </div>
    )}
  </>
);

const MarketDetailBody = ({
  rank,
  title,
  subtitle,
  bullets,
  stats,
}: {
  rank: number;
  title: string;
  subtitle?: string;
  bullets: string[];
  stats?: { label: string; value: string }[];
}) => (
  <>
    <div
      style={{
        fontSize: 64,
        fontWeight: 700,
        lineHeight: 1.15,
        color: "#0F1419",
      }}
    >
      #{rank} {title}
    </div>
    {subtitle && (
      <div
        style={{
          fontSize: 50,
          lineHeight: 1.2,
          color: "#0F1419",
          marginTop: 8,
        }}
      >
        {subtitle}
      </div>
    )}
    <ul
      style={{
        marginTop: 40,
        paddingLeft: 60,
        fontSize: 48,
        lineHeight: 1.3,
        color: "#0F1419",
        listStyleType: "disc",
      }}
    >
      {bullets.map((b, i) => (
        <li key={i} style={{ marginBottom: 18 }}>
          {renderInline(b)}
        </li>
      ))}
    </ul>
    {stats && stats.length > 0 && (
      <div style={{ marginTop: 48, fontSize: 48, lineHeight: 1.35 }}>
        {stats.map((s, i) => (
          <div key={i}>
            {s.label}: {s.value}
          </div>
        ))}
      </div>
    )}
  </>
);

const NumberedListBody = ({
  heading,
  items,
}: {
  heading: string;
  items: string[];
}) => (
  <>
    <div style={{ fontSize: 54, lineHeight: 1.25, color: "#0F1419" }}>
      {heading}
    </div>
    <div style={{ marginTop: 36, fontSize: 52, lineHeight: 1.4 }}>
      {items.map((item, i) => (
        <div key={i}>
          {i + 1}. {item}
        </div>
      ))}
    </div>
  </>
);

const PlainTextBody = ({ paragraphs }: { paragraphs: string[] }) => (
  <div style={{ fontSize: 54, lineHeight: 1.35, color: "#0F1419" }}>
    {paragraphs.map((p, i) => (
      <div key={i} style={{ marginTop: i === 0 ? 0 : 40 }}>
        {renderInline(p)}
      </div>
    ))}
  </div>
);

const CtaBody = ({ paragraphs }: { paragraphs: string[] }) => (
  <div style={{ fontSize: 54, lineHeight: 1.35, color: "#0F1419" }}>
    {paragraphs.map((p, i) => (
      <div key={i} style={{ marginTop: i === 0 ? 0 : 40 }}>
        {renderInline(p)}
      </div>
    ))}
  </div>
);

function SlideBody({ slide }: { slide: Slide }) {
  switch (slide.type) {
    case "hook-opener":
      return (
        <HookOpenerBody
          headline={slide.headline}
          items={slide.items}
          footer={slide.footer}
        />
      );
    case "personal-story":
      return <PersonalStoryBody paragraphs={slide.paragraphs} />;
    case "criteria-bullets":
      return (
        <CriteriaBulletsBody
          heading={slide.heading}
          bullets={slide.bullets}
          footer={slide.footer}
        />
      );
    case "market-detail":
      return (
        <MarketDetailBody
          rank={slide.rank}
          title={slide.title}
          subtitle={slide.subtitle}
          bullets={slide.bullets}
          stats={slide.stats}
        />
      );
    case "numbered-list":
      return (
        <NumberedListBody heading={slide.heading} items={slide.items} />
      );
    case "plain-text":
      return <PlainTextBody paragraphs={slide.paragraphs} />;
    case "cta":
      return <CtaBody paragraphs={slide.paragraphs} />;
  }
}

export const CarouselSlide = forwardRef<HTMLDivElement, CarouselSlideProps>(
  function CarouselSlide({ slide, profile, warnOverflow }, ref) {
    return (
      <div
        ref={ref}
        style={{
          width: SLIDE_SIZE,
          height: SLIDE_SIZE,
          background: "#FFFFFF",
          padding: "80px 80px",
          boxSizing: "border-box",
          fontFamily:
            "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          color: "#0F1419",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          outline: warnOverflow ? "4px solid #F59E0B" : "none",
          outlineOffset: -4,
        }}
      >
        <ProfileRow profile={profile} />
        <div style={{ flex: 1 }}>
          <SlideBody slide={slide} />
        </div>
      </div>
    );
  },
);
