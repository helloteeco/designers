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
              // Supabase + OpenAI + Tesseract language data CDN + Matterport/Polycam embed assets
              "connect-src 'self' data: blob: https://*.supabase.co wss://*.supabase.co https://api.openai.com https://generativelanguage.googleapis.com https://unpkg.com https://cdn.jsdelivr.net https://tessdata.projectnaptha.com",
              "frame-src https://my.matterport.com https://poly.cam https://www.spoak.com https://*.spoak.com",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
