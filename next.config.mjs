/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Next 14.1 has a race between .next/types generation and TS checking.
    // Type safety is enforced via editor + pre-commit; skip during build.
    ignoreBuildErrors: true,
  },
  async redirects() {
    return [
      // Cellwise lead-magnet game (public/cellwise.html) — clean URL
      { source: "/cellwise", destination: "/cellwise.html", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // 'unsafe-eval' needed for Tesseract.js WASM compilation
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://unpkg.com https://cdn.jsdelivr.net",
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              // Supabase + Tesseract language data CDN + Matterport/Polycam embed assets
              // (all AI calls go server-side to Gemini — no client AI origins needed)
              "connect-src 'self' data: blob: https://*.supabase.co wss://*.supabase.co https://unpkg.com https://cdn.jsdelivr.net https://tessdata.projectnaptha.com",
              "frame-src https://my.matterport.com https://poly.cam https://www.spoak.com https://*.spoak.com",
            ].join("; "),
          },
        ],
      },
      {
        // Cellwise is a self-contained static game: it inlines all JS/CSS but
        // loads Inter/IBM Plex Mono from Google Fonts, and its email form may
        // POST to whichever form endpoint gets configured (Formspree etc.),
        // hence the looser connect-src. Scoped to this one file only; this
        // entry overrides the global CSP above for /cellwise.html.
        source: "/cellwise.html",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              "img-src 'self' data: blob:",
              "connect-src 'self' https:",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
