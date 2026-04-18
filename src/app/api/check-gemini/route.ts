import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

/**
 * Health check: verifies the GEMINI_API_KEY is set on the server and that
 * a live call succeeds. Returns a plain-english status so the UI can show
 * the designer exactly what's wrong without making them crack open DevTools.
 */
export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      code: "NO_KEY",
      message:
        "GEMINI_API_KEY is not set on the server. Add it in Vercel → Project → Settings → Environment Variables, then redeploy.",
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: "Reply with the single word OK." }] }],
    });
    const text = response.text?.trim() ?? "";
    return NextResponse.json({
      ok: true,
      code: "READY",
      keyPrefix: apiKey.slice(0, 8) + "…",
      modelReply: text.slice(0, 40),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    return NextResponse.json({
      ok: false,
      code: "CALL_FAILED",
      keyPrefix: apiKey.slice(0, 8) + "…",
      message: `Key is set but the Gemini call failed: ${msg}. Common causes: key is invalid, key lacks Generative Language API access, or the Gemini 2.5 models aren't enabled in your Google Cloud project.`,
    });
  }
}
