"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_PROFILE,
  LS_KEY_PROFILE,
  normalizeHandle,
  type PostBuilderProfile,
} from "@/lib/post-templates";

interface Props {
  profile: PostBuilderProfile;
  onChange: (next: PostBuilderProfile) => void;
}

export default function ProfileEditor({ profile, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY_PROFILE);
      if (raw) onChange({ ...DEFAULT_PROFILE, ...JSON.parse(raw) });
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(patch: Partial<PostBuilderProfile>) {
    const next = { ...profile, ...patch };
    onChange(next);
    try {
      localStorage.setItem(LS_KEY_PROFILE, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  async function onFile(file: File) {
    setLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        update({ avatarDataUrl: reader.result });
      }
      setLoading(false);
    };
    reader.onerror = () => setLoading(false);
    reader.readAsDataURL(file);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 text-sm font-semibold text-gray-700">Profile</div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative h-16 w-16 overflow-hidden rounded-full border-2 border-gray-200 bg-gradient-to-br from-amber-300 to-yellow-600"
          title="Upload avatar"
        >
          {profile.avatarDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarDataUrl}
              alt="Avatar"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xl font-bold text-white">
              {profile.displayName.charAt(0).toUpperCase() || "?"}
            </span>
          )}
          {loading && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-[10px] text-white">
              …
            </span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <div className="flex-1 space-y-2">
          <input
            type="text"
            value={profile.displayName}
            onChange={(e) => update({ displayName: e.target.value })}
            placeholder="Display name"
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <input
            type="text"
            value={profile.handle}
            onChange={(e) => update({ handle: normalizeHandle(e.target.value) })}
            placeholder="@handle"
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={profile.verified}
              onChange={(e) => update({ verified: e.target.checked })}
            />
            Show verified check
          </label>
        </div>
      </div>
    </div>
  );
}
