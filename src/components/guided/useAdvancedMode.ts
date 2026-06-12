"use client";

import { useSyncExternalStore } from "react";
import { ADVANCED_MODE_EVENT, isAdvancedMode } from "@/lib/studio-settings";

/**
 * Reactive Advanced Mode flag.
 *
 * Subscribes to the global toggle (navbar pill / settings) via
 * ADVANCED_MODE_EVENT plus the cross-tab `storage` event, so every gated
 * control re-renders the moment the designer flips the switch.
 *
 * Default OFF = the calm guided experience.
 */
export function useAdvancedMode(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(ADVANCED_MODE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(ADVANCED_MODE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): boolean {
  return isAdvancedMode();
}

function getServerSnapshot(): boolean {
  return false;
}
