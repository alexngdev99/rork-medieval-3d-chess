import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { useHasKeyboard } from "./inputMode";

export type TooltipSide = "bottom" | "top" | "left";

interface TooltipProps {
  /** Short name of the control — the first line, always shown. */
  label: string;
  /** Optional second line explaining what the control does. */
  hint?: string;
  /**
   * Optional keyboard shortcut, shown as a key cap (e.g. "F", "Space") — and
   * only on a device that has keys. Callers pass it unconditionally; the cap is
   * dropped here so no control has to know what it is being read on.
   */
  keys?: string;
  /** Where the bubble hangs relative to the control. */
  side?: TooltipSide;
  children: ReactNode;
}

/** Milliseconds of hover before the bubble appears. */
const OPEN_DELAY = 110;

/**
 * How long after closing a bubble the next one opens instantly, so sweeping
 * along a row of icons does not stutter through the delay every time.
 */
const CHAIN_WINDOW = 500;

let lastClosedAt = 0;

/**
 * Themed tooltip for icon-only controls. The bubble is rendered inside the
 * anchor (not a body portal) so it survives fullscreen, and it is aligned to
 * whichever edge keeps it on screen.
 */
export function Tooltip({ label, hint, keys, side = "bottom", children }: TooltipProps) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const hasKeyboard = useHasKeyboard();
  const [align, setAlign] = useState<"start" | "end">("end");
  const [open, setOpen] = useState(false);

  const clearTimer = useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reveal = useCallback((): void => {
    const node = anchorRef.current;
    if (node) {
      const rect = node.getBoundingClientRect();
      setAlign(rect.left + rect.width / 2 > window.innerWidth / 2 ? "end" : "start");
    }
    setOpen(true);
  }, []);

  const show = useCallback(
    (immediate: boolean): void => {
      clearTimer();
      if (immediate || Date.now() - lastClosedAt < CHAIN_WINDOW) {
        reveal();
        return;
      }
      timerRef.current = window.setTimeout(reveal, OPEN_DELAY);
    },
    [clearTimer, reveal],
  );

  const hide = useCallback((): void => {
    clearTimer();
    setOpen((wasOpen) => {
      if (wasOpen) lastClosedAt = Date.now();
      return false;
    });
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  // A tooltip must never outlive its trigger: closing on Escape, on scroll and
  // on any tap elsewhere keeps it from hanging over the board.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, [open, hide]);

  const style: CSSProperties | undefined =
    side === "left" ? undefined : align === "end" ? { right: 0 } : { left: 0 };

  return (
    <span
      ref={anchorRef}
      className="mc-tip-anchor"
      onPointerEnter={(event) => {
        if (event.pointerType === "touch") return;
        show(false);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        hide();
      }}
      onPointerDown={(event) => {
        // Touch has no hover: flash the label on press so the icon still
        // explains itself on a phone or tablet.
        if (event.pointerType !== "touch") return;
        show(true);
        clearTimer();
        timerRef.current = window.setTimeout(hide, 1800);
      }}
      onFocus={() => show(true)}
      onBlur={hide}
    >
      {children}
      {open ? (
        <span className="mc-tip" role="tooltip" data-side={side} data-align={align} style={style}>
          <span className="mc-tip-label">{label}</span>
          {keys && hasKeyboard ? <span className="mc-tip-key">{keys}</span> : null}
          {hint ? <span className="mc-tip-hint">{hint}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
