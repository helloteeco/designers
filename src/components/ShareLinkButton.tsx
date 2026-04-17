"use client";

import { useState } from "react";
import { getStudioSettings } from "@/lib/studio-settings";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  className?: string;
}

/**
 * Generates a base64-encoded shareable URL for this project.
 * Designer sends the link to the client — they see the full design package
 * without needing an account. Respects studio settings for pricing/vendor visibility.
 */
export default function ShareLinkButton({ project, className }: Props) {
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  function generateLink() {
    try {
      const settings = getStudioSettings();
      const payload = { project, settings };
      const encoded = encodeURIComponent(btoa(JSON.stringify(payload)));
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const url = `${base}/share?d=${encoded}`;

      // Warn if link is too long for email/SMS
      if (url.length > 8000) {
        if (!confirm(`Share link is ${url.length} characters (very large). Some email/SMS clients may truncate it. Continue?`)) {
          return;
        }
      }

      setShareUrl(url);
      setShowLink(true);
    } catch (e) {
      alert("Failed to generate share link: " + (e instanceof Error ? e.message : "unknown"));
    }
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function openPreview() {
    window.open(shareUrl, "_blank");
  }

  return (
    <>
      <button onClick={generateLink} className={className ?? "btn-accent btn-sm"}>
        🔗 Generate Client Link
      </button>

      {showLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-brand-900">Client Share Link</h2>
                <p className="text-xs text-brand-600 mt-1">
                  Send this link to your client via email or text. It opens a read-only
                  presentation of the full design package. No login required.
                </p>
              </div>
              <button
                onClick={() => setShowLink(false)}
                className="text-brand-600 hover:text-brand-900 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="rounded-lg bg-brand-900/5 p-3 mb-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600 mb-1.5">
                Shareable URL
              </div>
              <code className="block text-[11px] text-brand-700 break-all font-mono leading-relaxed max-h-28 overflow-y-auto">
                {shareUrl}
              </code>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <button onClick={copyToClipboard} className="btn-primary btn-sm flex-1">
                {copied ? "Copied to Clipboard!" : "Copy Link"}
              </button>
              <button onClick={openPreview} className="btn-secondary btn-sm">
                Preview as Client
              </button>
            </div>

            <div className="text-xs text-brand-600 space-y-1.5 border-t border-brand-900/5 pt-4">
              <div className="flex items-start gap-2">
                <span className="text-amber-dark">•</span>
                <span>
                  <strong>Privacy:</strong> The link contains an encoded snapshot of the project.
                  Anyone with the link can view. Regenerate to revoke.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-amber-dark">•</span>
                <span>
                  <strong>Pricing visibility:</strong> Controlled by your Settings → Pricing tab.
                  Turn &quot;Show pricing to client&quot; off to hide prices.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-amber-dark">•</span>
                <span>
                  <strong>Updates:</strong> Link is a snapshot at this moment. Changes to the project
                  require you to send a new link.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
