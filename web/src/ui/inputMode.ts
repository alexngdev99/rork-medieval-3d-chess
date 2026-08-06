import { useSyncExternalStore } from "react";

/**
 * A coarse pointer with no hover — a phone or tablet held in the hand. Not a
 * user-agent guess: a laptop with a touchscreen still reports `hover: hover`
 * because it also has a trackpad, and so keeps its key caps.
 */
const TOUCH_ONLY = "(pointer: coarse) and (hover: none)";

let query: MediaQueryList | null = null;
/** Set once a real key arrives: proof a keyboard is attached, whatever the media query says. */
let keyboardSeen = false;
const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

function onKeyDown(event: KeyboardEvent): void {
  // An on-screen keyboard only appears over a text field, so keys typed into
  // one prove nothing about hardware. Modifier-only presses are ignored too.
  if (keyboardSeen || !event.isTrusted) return;
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable === true) return;
  keyboardSeen = true;
  window.removeEventListener("keydown", onKeyDown, true);
  announce();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0 && typeof window !== "undefined") {
    if (typeof window.matchMedia === "function") {
      query = window.matchMedia(TOUCH_ONLY);
      query.addEventListener("change", announce);
    }
    if (!keyboardSeen) window.addEventListener("keydown", onKeyDown, true);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      query?.removeEventListener("change", announce);
      query = null;
      window.removeEventListener("keydown", onKeyDown, true);
    }
  };
}

function readSnapshot(): boolean {
  if (keyboardSeen) return true;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return !window.matchMedia(TOUCH_ONLY).matches;
}

/** Server render: assume a keyboard, so the markup matches the desktop case. */
function readServerSnapshot(): boolean {
  return true;
}

/**
 * Whether this device plausibly has keys to press.
 *
 * A shortcut hint is only ever a hint — printing `F` on a phone that has no `F`
 * is noise in the one place there is least room for it. One subscription is
 * shared by every caller, and the answer flips to `true` the moment a real
 * keydown arrives (a tablet with a case keyboard earns its key caps back).
 */
export function useHasKeyboard(): boolean {
  return useSyncExternalStore(subscribe, readSnapshot, readServerSnapshot);
}
