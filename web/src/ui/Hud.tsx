import { useEffect, useRef, useState } from "react";
import {
  Box,
  Camera,
  ChevronRight,
  Clapperboard,
  Crosshair,
  EyeOff,
  Flag,
  LayoutGrid,
  Maximize,
  Orbit,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  ScrollText,
  Settings as SettingsIcon,
  Skull,
  Swords,
  Timer,
  Video,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import type { ElapsedState, Faction, GameSnapshot, LedgerMove, PieceKind } from "../core/types";
import type { CameraPreset, ShowcaseCamera } from "../scene/sceneEngine";
import { Crest, Hourglass, pieceGlyph } from "./Heraldry";
import { useHasKeyboard } from "./inputMode";
import { MoveLedger } from "./MoveLedger";
import { Tooltip, type TooltipSide } from "./Tooltip";

interface HudProps {
  snapshot: GameSnapshot;
  muted: boolean;
  fps: number;
  onNewGame: () => void;
  onUndo: () => void;
  onResign: () => void;
  onToggleSound: () => void;
  onFullscreen: () => void;
  onSettings: () => void;
  onCamera: (preset: CameraPreset) => void;
  onFlipCamera: () => void;
  cameraFlipped: boolean;
  tactical: boolean;
  onToggleTactical: () => void;
  onPreviewMove: (move: LedgerMove | null) => void;
  onTogglePause: () => void;
  onDemoSpeed: (speed: number) => void;
  onDemoLoop: (loop: boolean) => void;
  onDemoRestart: () => void;
  showcaseCamera: ShowcaseCamera;
  onShowcaseCamera: (mode: ShowcaseCamera) => void;
  onToggleCinema: () => void;
  /** Live per-side elapsed time, read on the tally's own tick. */
  getElapsed: () => ElapsedState;
}

const DEMO_SPEEDS: { label: string; value: number }[] = [
  { label: "0.5×", value: 0.5 },
  { label: "1×", value: 1 },
  { label: "2×", value: 2 },
  { label: "4×", value: 4 },
];

/** AI vs AI camera behaviours, in the order they appear on the transport. */
const SHOWCASE_CAMERAS: { key: ShowcaseCamera; label: string; hint: string; icon: typeof Camera }[] = [
  { key: "still", label: "still", hint: "Hold one angle — the camera never moves on its own", icon: Camera },
  { key: "follow", label: "follow", hint: "Track the figure on the move and close in on the fight", icon: Crosshair },
  { key: "orbit", label: "orbit", hint: "Drift slowly around the board", icon: Orbit },
];

const DIFFICULTY_SHORT: Record<string, string> = {
  easy: "Squire",
  medium: "Knight",
  hard: "Warlord",
};

const CAMERA_BUTTONS: { key: CameraPreset; label: string }[] = [
  { key: "white", label: "Ivory" },
  { key: "black", label: "Obsidian" },
  { key: "top", label: "Overhead" },
  { key: "cinematic", label: "Cinematic" },
];

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Elapsed time reads the other way round from the countdown: it floors, so the
 * meter shows 0:00 for the first second instead of jumping straight to 0:01, and
 * it grows an hours field only once a battle actually runs that long.
 */
/**
 * Whether there is room for the record to live beside the board.
 *
 * The ledger is mounted in exactly one place at a time — docked in the side rail
 * on a wide screen, folded into the bottom-left panel on a narrow one. Rendering
 * both and hiding one with CSS would keep two live ledgers fighting over the
 * board preview and the scroll pin, so the choice is made in JS.
 */
function useRoomForRail(): boolean {
  const [wide, setWide] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia("(min-width: 1024px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const onChange = (event: MediaQueryListEvent): void => setWide(event.matches);
    setWide(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return wide;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const mm = hours > 0 ? minutes.toString().padStart(2, "0") : minutes.toString();
  return `${hours > 0 ? `${hours}:` : ""}${mm}:${seconds.toString().padStart(2, "0")}`;
}

export function Hud({
  snapshot,
  muted,
  fps,
  onNewGame,
  onUndo,
  onResign,
  onToggleSound,
  onFullscreen,
  onSettings,
  onCamera,
  onFlipCamera,
  cameraFlipped,
  tactical,
  onToggleTactical,
  onPreviewMove,
  onTogglePause,
  onDemoSpeed,
  onDemoLoop,
  onDemoRestart,
  showcaseCamera,
  onShowcaseCamera,
  onToggleCinema,
  getElapsed,
}: HudProps) {
  const railRoom = useRoomForRail();
  /** Key hints are printed only where there are keys to press. */
  const hasKeyboard = useHasKeyboard();
  // Beside the board the record costs the player nothing, so it stands open from
  // the first move; on a phone it would cover ranks, so there it stays folded.
  const [chronicleOpen, setChronicleOpen] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia("(min-width: 1024px)").matches,
  );
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false);
  const [transportOpen, setTransportOpen] = useState(true);
  const [activePreset, setActivePreset] = useState<CameraPreset>(() =>
    snapshot.mode === "ai" && snapshot.playerColor === "b" ? "black" : "white",
  );
  const cameraMenuRef = useRef<HTMLDivElement | null>(null);
  const chronicleRef = useRef<HTMLDivElement | null>(null);

  // Dismiss the camera menu on outside taps / Escape without laying an
  // invisible backdrop over the board (that would eat the next board click).
  useEffect(() => {
    if (!cameraMenuOpen) return;
    const onPointerDown = (event: PointerEvent): void => {
      const node = cameraMenuRef.current;
      if (node && !node.contains(event.target as Node)) setCameraMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setCameraMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [cameraMenuOpen]);

  // The chronicle is a corner button by default so the board keeps the whole
  // screen. Escape closes it anywhere; on narrow screens the open panel covers
  // a good part of the board, so a tap outside folds it back down as well.
  useEffect(() => {
    if (!chronicleOpen) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setChronicleOpen(false);
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (window.innerWidth >= 1024) return;
      const node = chronicleRef.current;
      if (node && !node.contains(event.target as Node)) setChronicleOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [chronicleOpen]);

  // "H" toggles the record without reaching for the corner.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "h" && event.key !== "H") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const typing = target ? /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable : false;
      if (typing) return;
      setChronicleOpen((open) => !open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pickCamera = (preset: CameraPreset): void => {
    setActivePreset(preset);
    setCameraMenuOpen(false);
    onCamera(preset);
  };

  const demo = snapshot.demo;
  const whiteTaken = snapshot.captured.filter((piece) => piece.color === "b");
  const blackTaken = snapshot.captured.filter((piece) => piece.color === "w");
  const diff = snapshot.materialDiff;

  const ledger = (
    <MoveLedger
      moves={snapshot.moves}
      pgn={snapshot.pgn}
      result={snapshot.result}
      turn={snapshot.turn}
      thinking={snapshot.thinking}
      playing={snapshot.status === "playing"}
      onPreview={onPreviewMove}
    />
  );

  const spoils = (
    <div className="mc-slate mc-goldleaf px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="mc-display text-[0.6rem] tracking-[0.34em] text-[#a89268]">Spoils</p>
        <span className="mc-display text-[0.72rem] text-[#e2c98f]">
          {diff === 0 ? "even" : diff > 0 ? `ivory +${diff}` : `obsidian +${-diff}`}
        </span>
      </div>
      <div className="mt-2 space-y-1.5">
        <CapturedRow label="w" pieces={whiteTaken.map((piece) => piece.kind)} />
        <CapturedRow label="b" pieces={blackTaken.map((piece) => piece.kind)} />
      </div>
    </div>
  );

  return (
    <>
      {/* Top bar */}
      {/* Padding (including the notch/home-bar insets) lives in `.mc-hud-top`. */}
      <div className="mc-hud-top pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <div className="mc-hud-status mc-slate mc-goldleaf pointer-events-auto flex items-center gap-3 px-3 py-2.5">
            <Crest faction={snapshot.turn} size={26} active />
            <div>
              <p className="mc-display text-[0.58rem] tracking-[0.3em] text-[#a89268]">
                {demo
                  ? `AI vs AI · duel ${snapshot.demoRound}`
                  : snapshot.status === "over"
                    ? "Battle ended"
                    : snapshot.thinking
                      ? "Council of war"
                      : "To move"}
              </p>
              <p className="mc-display text-sm text-[#f2e2bd]">
                {snapshot.status === "over"
                  ? "—"
                  : snapshot.thinking
                    ? "Thinking…"
                    : snapshot.turn === "w"
                      ? "Ivory"
                      : "Obsidian"}
              </p>
            </div>
            {snapshot.inCheck && snapshot.status === "playing" ? (
              <span className="mc-danger-flash mc-display rounded-sm border border-[#a8342a] px-2 py-1 text-[0.6rem] tracking-[0.24em] text-[#ff9a8a]">
                CHECK
              </span>
            ) : null}
            {snapshot.thinking ? (
              <span className="mc-pulse ml-1 h-2 w-2 rounded-full bg-[#d8b163]" aria-hidden="true" />
            ) : null}
          </div>

          <FieldTally snapshot={snapshot} getElapsed={getElapsed} />
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5">
          {snapshot.clock.enabled ? (
            <div className="mc-slate flex items-center gap-3 px-3 py-1.5">
              <ClockFace
                ms={snapshot.clock.whiteMs}
                initial={snapshot.clock.initialMs}
                active={snapshot.turn === "w" && snapshot.status === "playing"}
                faction="w"
              />
              <div className="h-6 w-px bg-[#8a652244]" />
              <ClockFace
                ms={snapshot.clock.blackMs}
                initial={snapshot.clock.initialMs}
                active={snapshot.turn === "b" && snapshot.status === "playing"}
                faction="b"
              />
            </div>
          ) : null}

          {demo ? (
            <IconButton
              label="Clean capture"
              hint="Hide the whole interface for recording — the board only."
              keys="C"
              onClick={onToggleCinema}
            >
              <EyeOff size={16} />
            </IconButton>
          ) : (
            <>
              <IconButton
                label="Take back"
                hint={
                  snapshot.canUndo
                    ? "Undo your last move and the reply to it."
                    : "Nothing to take back yet."
                }
                onClick={onUndo}
                disabled={!snapshot.canUndo}
              >
                <RotateCcw size={16} />
              </IconButton>
              <IconButton
                label="Resign"
                hint={
                  snapshot.status === "playing"
                    ? "Concede the battle — your opponent wins at once."
                    : "The battle is already over."
                }
                onClick={onResign}
                disabled={snapshot.status !== "playing"}
                danger
              >
                <Flag size={16} />
              </IconButton>
            </>
          )}
          <IconButton label="New duel" hint="Abandon this battle and set the board again." onClick={onNewGame}>
            <Swords size={16} />
          </IconButton>
          <IconButton
            label={muted ? "Sound off" : "Sound on"}
            hint={muted ? "Bring back the score, strikes and footsteps." : "Silence the score and all battle sounds."}
            onClick={onToggleSound}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </IconButton>
          <IconButton label="Fullscreen" hint="Fill the whole screen with the hall." onClick={onFullscreen} wideOnly>
            <Maximize size={16} />
          </IconButton>
          <IconButton
            label="Flip sides"
            hint="Swing the camera 180° to watch from the opposite end."
            keys="F"
            onClick={onFlipCamera}
            active={cameraFlipped}
            wideOnly
          >
            <Repeat size={16} />
          </IconButton>
          <IconButton
            label={tactical ? "Back to 3D" : "Tactical map"}
            hint={
              tactical
                ? "Return to the 3D hall with the figures."
                : "Flat overhead board — read every square at a glance."
            }
            keys="T"
            onClick={onToggleTactical}
            active={tactical}
          >
            {tactical ? <Box size={16} /> : <LayoutGrid size={16} />}
          </IconButton>

          {/* Camera views live in a dropdown so nothing floats over the board */}
          <div className="relative" ref={cameraMenuRef}>
            <IconButton
              label="Camera"
              hint="Choose the viewpoint on the battle."
              onClick={() => setCameraMenuOpen((open) => !open)}
              active={cameraMenuOpen}
            >
              <Video size={16} />
            </IconButton>
            {cameraMenuOpen ? (
              <div className="mc-cam-menu mc-slate absolute right-0 top-[calc(100%+0.4rem)] z-30 w-44 p-2">
                <p className="mc-display px-1 pb-1.5 text-[0.52rem] tracking-[0.3em] text-[#a89268]">Camera</p>
                <div className="flex flex-col gap-1">
                  {CAMERA_BUTTONS.map((button) => (
                    <button
                      key={button.key}
                      type="button"
                      className="mc-chip w-full text-left"
                      data-active={!tactical && activePreset === button.key}
                      onClick={() => pickCamera(button.key)}
                    >
                      {button.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="mc-chip flex w-full items-center gap-1.5 text-left"
                    data-active={tactical}
                    onClick={() => {
                      setCameraMenuOpen(false);
                      onToggleTactical();
                    }}
                    title={
                      hasKeyboard
                        ? "Flat overhead map — no figures in the way (T)"
                        : "Flat overhead map — no figures in the way"
                    }
                    aria-pressed={tactical}
                  >
                    <LayoutGrid size={13} />
                    Tactical 2D
                  </button>
                  <div className="mc-rule my-1 opacity-60" />
                  <button
                    type="button"
                    className="mc-chip mc-chip-flip flex w-full items-center gap-1.5"
                    data-active={cameraFlipped}
                    onClick={onFlipCamera}
                    title={
                      hasKeyboard
                        ? "Swing the camera to the opposite side (F)"
                        : "Swing the camera to the opposite side"
                    }
                    aria-pressed={cameraFlipped}
                  >
                    <Repeat
                      size={13}
                      className="mc-flip-icon"
                      style={{ transform: cameraFlipped ? "rotate(180deg)" : "none" }}
                    />
                    Flip 180°
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <IconButton
            label="Settings"
            hint="Graphics, sound, clocks and opponent strength."
            onClick={onSettings}
          >
            <SettingsIcon size={16} />
          </IconButton>
        </div>
      </div>

      {/* Side rail: the spoils sit under the top bar and the move record runs
          down the rest of the flank, beside the board, so the battle can be read
          back without a rank being covered. Desktop and tablet only. */}
      <div className="mc-side-rail mc-rise pointer-events-none absolute hidden w-56 flex-col gap-2 lg:flex xl:w-60">
        <div className="pointer-events-auto">{spoils}</div>
        {railRoom && chronicleOpen ? (
          <div className="mc-rail-ledger pointer-events-auto min-h-0 flex-1">{ledger}</div>
        ) : null}
      </div>

      {/* Chronicle: a small corner sigil that unfurls the record on demand. The
          wrapper stays click-through so the board keeps every tap that is not
          aimed at the button or the open panel. */}
      <div
        ref={chronicleRef}
        className="mc-hud-corner pointer-events-none absolute bottom-0 left-0 z-30 flex flex-col items-start gap-2"
      >
        {chronicleOpen && !railRoom ? (
          <div className="mc-chronicle-panel pointer-events-auto flex h-[min(56vh,460px)] w-[min(84vw,18.5rem)] flex-col gap-2">
            <div className="min-h-0 flex-1">{ledger}</div>
            <div>{spoils}</div>
          </div>
        ) : null}

        <Tooltip
          label={chronicleOpen ? "Hide the chronicle" : "Chronicle"}
          hint={
            chronicleOpen
              ? railRoom
                ? "Clear the record off the flank and give the hall the whole screen."
                : "Fold the record back into the corner."
              : railRoom
                ? "Show the move record beside the board."
                : "The full move record and the spoils taken."
          }
          keys="H"
          side="top"
        >
          <button
            type="button"
            className="mc-chronicle-fab pointer-events-auto"
            data-open={chronicleOpen || undefined}
            onClick={() => setChronicleOpen((open) => !open)}
            aria-label="Toggle the move chronicle"
            aria-expanded={chronicleOpen}
          >
            {chronicleOpen ? <X size={16} /> : <ScrollText size={16} />}
            {!chronicleOpen && snapshot.moves.length > 0 ? (
              <span key={snapshot.moves.length} className="mc-chronicle-badge">
                {snapshot.moves.length}
              </span>
            ) : null}
          </button>
        </Tooltip>
      </div>

      {/* AI vs AI transport — a slim rail tucked into the bottom-right corner,
          icon-only, and foldable down to a single sigil so the board is never
          covered. */}
      {demo ? (
        <div className="mc-demo-dock pointer-events-auto">
          {transportOpen ? (
            <div className="mc-demo-bar">
              <Tooltip
                label={snapshot.paused ? "Resume" : "Pause"}
                hint={snapshot.paused ? "Let the duel play on." : "Freeze the duel where it stands."}
                keys="Space"
                side="top"
              >
                <button
                  type="button"
                  className="mc-demo-play"
                  data-paused={snapshot.paused || undefined}
                  onClick={onTogglePause}
                  aria-label={snapshot.paused ? "Resume the AI vs AI duel" : "Pause the AI vs AI duel"}
                >
                  {snapshot.paused ? <Play size={13} /> : <Pause size={13} />}
                </button>
              </Tooltip>

              <div className="mc-demo-sep" />

              <div className="flex items-center gap-[0.15rem]">
                {DEMO_SPEEDS.map((option) => (
                  <Tooltip key={option.label} label={`Speed ${option.label}`} hint="How fast the duel plays." side="top">
                    <button
                      type="button"
                      className="mc-chip mc-demo-speed"
                      data-active={demo.speed === option.value}
                      onClick={() => onDemoSpeed(option.value)}
                    >
                      {option.label}
                    </button>
                  </Tooltip>
                ))}
              </div>

              <div className="mc-demo-sep" />

              {/* Camera behaviour: the duel is watched, so how it is shot matters
                  as much as how fast it is played. Icons only — the label lives
                  in the tooltip. */}
              <div className="flex items-center gap-[0.15rem]">
                {SHOWCASE_CAMERAS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <Tooltip key={option.key} label={`Camera: ${option.label}`} hint={option.hint} side="top">
                      <button
                        type="button"
                        className="mc-chip mc-demo-icon"
                        data-active={showcaseCamera === option.key}
                        onClick={() => onShowcaseCamera(option.key)}
                        aria-label={`Camera: ${option.label}`}
                        aria-pressed={showcaseCamera === option.key}
                      >
                        <Icon size={13} />
                      </button>
                    </Tooltip>
                  );
                })}
              </div>

              <div className="mc-demo-sep" />

              <Tooltip label="Loop" hint="Start a fresh duel automatically when this one ends." side="top">
                <button
                  type="button"
                  className="mc-chip mc-demo-icon"
                  data-active={demo.autoRematch}
                  onClick={() => onDemoLoop(!demo.autoRematch)}
                  aria-label="Loop duels"
                  aria-pressed={demo.autoRematch}
                >
                  <Repeat size={13} />
                </button>
              </Tooltip>
              <Tooltip
                label="New duel"
                hint={`Reset the board — ${DIFFICULTY_SHORT[demo.white] ?? demo.white} vs ${
                  DIFFICULTY_SHORT[demo.black] ?? demo.black
                }.`}
                side="top"
              >
                <button
                  type="button"
                  className="mc-chip mc-demo-icon"
                  onClick={onDemoRestart}
                  aria-label="Restart the duel"
                >
                  <RotateCw size={13} />
                </button>
              </Tooltip>

              <Tooltip label="Hide controls" hint="Fold the rail down to a single sigil." side="left">
                <button
                  type="button"
                  className="mc-demo-fold"
                  onClick={() => setTransportOpen(false)}
                  aria-label="Hide the AI vs AI controls"
                >
                  <ChevronRight size={13} />
                </button>
              </Tooltip>
            </div>
          ) : (
            <Tooltip
              label="AI vs AI controls"
              hint={`${DIFFICULTY_SHORT[demo.white] ?? demo.white} vs ${
                DIFFICULTY_SHORT[demo.black] ?? demo.black
              }${snapshot.paused ? " — paused" : ""}. Speed, camera and loop.`}
              side="top"
            >
              <button
                type="button"
                className="mc-demo-tab"
                data-paused={snapshot.paused || undefined}
                onClick={() => setTransportOpen(true)}
                aria-label="Show the AI vs AI controls"
              >
                <Clapperboard size={14} />
              </button>
            </Tooltip>
          )}

          {snapshot.paused ? <span className="mc-demo-flag mc-pulse">PAUSED</span> : null}
          {snapshot.status === "over" && demo.autoRematch ? (
            <span className="mc-demo-flag mc-pulse">NEXT DUEL…</span>
          ) : null}
        </div>
      ) : null}

      {fps > 0 ? (
        <span className="mc-fps pointer-events-none absolute hidden text-[0.62rem] tracking-widest text-[#5f5747] lg:block">
          {fps} FPS
        </span>
      ) : null}
    </>
  );
}

/**
 * Field tally: how many figures each army has buried, and how long each has
 * been on the board.
 *
 * It ticks on its own timer rather than off the snapshot: the controller only
 * publishes on real events (a move, a pause), so a second passing here must not
 * be allowed to re-render the whole interface once per second.
 */
function FieldTally({ snapshot, getElapsed }: { snapshot: GameSnapshot; getElapsed: () => ElapsedState }) {
  const running = snapshot.status === "playing" && !snapshot.paused;
  const [elapsed, setElapsed] = useState<ElapsedState>(() => getElapsed());

  // Half-second cadence so the seconds digit turns over without a visible lag,
  // and one immediate read whenever the turn or the run state changes.
  useEffect(() => {
    setElapsed(getElapsed());
    if (!running) return;
    const id = setInterval(() => setElapsed(getElapsed()), 500);
    return () => clearInterval(id);
  }, [getElapsed, running, snapshot.turn, snapshot.moves.length]);

  const losses: Record<Faction, number> = { w: 0, b: 0 };
  for (const piece of snapshot.captured) losses[piece.color] += 1;

  return (
    <div
      className="mc-tally mc-slate pointer-events-none"
      aria-label={`Field tally. Ivory: ${losses.w} lost, ${formatElapsed(elapsed.whiteMs)} on the field. Obsidian: ${
        losses.b
      } lost, ${formatElapsed(elapsed.blackMs)} on the field.`}
    >
      <div className="mc-tally-head">
        <span>Field tally</span>
        <span className="mc-tally-total">
          <Timer size={9} strokeWidth={2.4} />
          {formatElapsed(elapsed.totalMs)}
        </span>
      </div>
      <TallyRow
        faction="w"
        lost={losses.w}
        ms={elapsed.whiteMs}
        onMove={running && snapshot.turn === "w"}
      />
      <TallyRow
        faction="b"
        lost={losses.b}
        ms={elapsed.blackMs}
        onMove={running && snapshot.turn === "b"}
      />
    </div>
  );
}

function TallyRow({
  faction,
  lost,
  ms,
  onMove,
}: {
  faction: Faction;
  lost: number;
  ms: number;
  onMove: boolean;
}) {
  return (
    <div className="mc-tally-row" data-faction={faction} data-live={onMove || undefined}>
      <Crest faction={faction} size={12} active={onMove} />
      <span className="mc-tally-name">{faction === "w" ? "Ivory" : "Obsidian"}</span>
      {/* Keyed on the count so a fresh burial flashes the number. */}
      <span key={lost} className="mc-tally-lost">
        <Skull size={10} strokeWidth={2.2} />
        {lost}
      </span>
      <span className="mc-tally-time">{formatElapsed(ms)}</span>
    </div>
  );
}

function CapturedRow({ label, pieces }: { label: "w" | "b"; pieces: PieceKind[] }) {
  return (
    <div className="flex items-center gap-2">
      <Crest faction={label} size={14} />
      <div className="flex flex-wrap gap-0.5 text-lg leading-none" style={{ color: label === "w" ? "#f0e3c6" : "#b9838a" }}>
        {pieces.length === 0 ? <span className="text-xs italic text-[#7d6f57]">—</span> : null}
        {pieces.map((kind, index) => (
          <span key={`${kind}-${index}`}>{pieceGlyph(kind)}</span>
        ))}
      </div>
    </div>
  );
}

function ClockFace({
  ms,
  initial,
  active,
  faction,
}: {
  ms: number;
  initial: number;
  active: boolean;
  faction: "w" | "b";
}) {
  const urgent = ms < 30_000;
  return (
    <div className="flex items-center gap-1.5" style={{ opacity: active ? 1 : 0.55 }}>
      <Hourglass ratio={initial > 0 ? ms / initial : 0} urgent={urgent} />
      <div>
        <p className="mc-display text-[0.5rem] tracking-[0.2em] text-[#a89268]">{faction === "w" ? "IVORY" : "OBSIDIAN"}</p>
        <p className={`mc-display text-sm ${urgent ? "text-[#ff8f7d]" : "text-[#f2e2bd]"}`}>{formatClock(ms)}</p>
      </div>
    </div>
  );
}

function IconButton({
  children,
  label,
  hint,
  keys,
  side = "bottom",
  onClick,
  disabled,
  danger,
  active,
  wideOnly,
}: {
  children: React.ReactNode;
  /** Short name shown on the tooltip's first line and read by screen readers. */
  label: string;
  /** One sentence explaining what the control does. */
  hint?: string;
  /** Keyboard shortcut, rendered as a key cap. */
  keys?: string;
  side?: TooltipSide;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
  /**
   * Dropped on a phone, where the row has to stay one line: either the control
   * is duplicated in the camera menu (flip) or the platform ignores it anyway
   * (fullscreen on iOS).
   */
  wideOnly?: boolean;
}) {
  return (
    <Tooltip label={label} hint={hint} keys={keys} side={side}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        data-active={active ? "true" : undefined}
        data-wide-only={wideOnly ? "true" : undefined}
        className={`mc-btn mc-icon-btn ${danger ? "mc-btn-danger" : ""}`}
      >
        {children}
      </button>
    </Tooltip>
  );
}
