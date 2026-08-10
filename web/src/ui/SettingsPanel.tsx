import { X } from "lucide-react";

import type { ArmySkinId } from "../assets/generated";
import type { Faction } from "../core/types";
import type { ArenaTheme } from "../scene/arena";
import type { QualityPreset } from "../scene/quality";
import { useHasKeyboard } from "./inputMode";
import { MusterLocked, MusterSection } from "./Muster";

export interface GameSettings {
  quality: QualityPreset;
  /** Which map the board is staged in. */
  arena: ArenaTheme;
  /** Which army each side musters. */
  skins: Record<Faction, ArmySkinId>;
  captureCinematics: boolean;
  rotateBoard: boolean;
  /** Queue a move while the machine is still on the clock. */
  premoves: boolean;
  /** How many moves may be stacked in the queue at once. */
  premoveDepth: number;
  /** Floor on how long the computer's reply takes, in ms. */
  thinkFloorMs: number;
  /** Floating rank crests over every figure. */
  rankBadges: boolean;
  muted: boolean;
  /**
   * Safe rendering: no composer, no reflection probe, no shadow maps. The way
   * out for drivers (mostly Linux/Mesa software rasterisers) that draw the hall
   * completely black.
   */
  safeMode: boolean;
  /** Exposure multiplier, 0.6–1.8. */
  brightness: number;
}

interface SettingsPanelProps {
  settings: GameSettings;
  autoDetected: QualityPreset;
  /** Driver line, e.g. `llvmpipe · WebGL2 · software`. */
  gpu: string;
  fps: number;
  /**
   * True while a duel is on the board. Armies and battleground are then shown
   * locked: re-mustering would swap out every figure mid-fight and re-stage the
   * hall under pieces that are already moving.
   */
  matchInProgress: boolean;
  onChange: (settings: GameSettings) => void;
  onClose: () => void;
}

/**
 * Reply floors offered to the player, in ms.
 *
 * Not a difficulty dial — it changes how long the machine *waits*, never how
 * hard it thinks. Long floors exist because they are the only way to rehearse a
 * queued move on easy, where the search is over in 7ms.
 */
const THINK_FLOORS: { ms: number; label: string }[] = [
  { ms: 0, label: "Instant" },
  { ms: 420, label: "0.4s" },
  { ms: 1500, label: "1.5s" },
  { ms: 3000, label: "3s" },
  { ms: 6000, label: "6s" },
];

/**
 * Queue depths offered to the player.
 *
 * Measured rather than picked: the head of a chain survives the machine's reply
 * about six times in ten, and although every link after it survives *more*
 * often, the odds on the whole chain still fall away — 30% at three deep, 20%
 * at five. Three is the default; one is the old behaviour, five is for bullet.
 */
const PREMOVE_DEPTHS: { count: number; label: string; note: string }[] = [
  { count: 1, label: "1 move", note: "one at a time" },
  { count: 3, label: "3 moves", note: "3 in 10 chains run in full" },
  { count: 5, label: "5 moves", note: "for bullet — 2 in 10 run in full" },
];

const PRESETS: { key: QualityPreset; label: string; note: string }[] = [
  { key: "low", label: "Low", note: "No post-processing, no shadows — runs anywhere" },
  { key: "medium", label: "Medium", note: "Bloom, shadows, light shafts, some dust" },
  { key: "high", label: "High", note: "Adds depth of field, grade, 2K shadows" },
  { key: "ultra", label: "Ultra", note: "Ambient occlusion, 4K shadows, dense particles" },
];

export function SettingsPanel({
  settings,
  autoDetected,
  gpu,
  fps,
  matchInProgress,
  onChange,
  onClose,
}: SettingsPanelProps) {
  /** A phone has no `F` to press, so the note names the button instead. */
  const hasKeyboard = useHasKeyboard();
  return (
    <div className="mc-modal-pad pointer-events-auto absolute inset-0 z-20 flex flex-col items-center justify-center overflow-hidden bg-black/60 backdrop-blur-sm">
      <div className="mc-slate mc-goldleaf mc-rise flex max-h-full w-full min-h-0 max-w-lg flex-col p-5 sm:p-6">
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h2 className="mc-display text-lg text-[#f2e2bd]">Settings</h2>
          <button type="button" className="mc-btn mc-icon-btn" onClick={onClose} aria-label="Close settings">
            <X size={16} />
          </button>
        </div>

        <div className="mc-scroll mc-scroll-shade -mr-2 min-h-0 flex-auto overflow-y-auto pb-1 pr-2">
        {matchInProgress ? (
          <MusterLocked choice={{ skins: settings.skins, arena: settings.arena }} />
        ) : (
          <MusterSection
            choice={{ skins: settings.skins, arena: settings.arena }}
            onChange={(choice) => onChange({ ...settings, skins: choice.skins, arena: choice.arena })}
          />
        )}

        <div className="mc-rule my-5" />

        <p className="mc-display mb-2 text-[0.6rem] tracking-[0.3em] text-[#a89268]">Graphics</p>
        <div className="grid grid-cols-4 gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className="mc-chip py-2.5"
              data-active={settings.quality === preset.key}
              onClick={() => onChange({ ...settings, quality: preset.key })}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs italic text-[#9c8b6c]">
          {PRESETS.find((preset) => preset.key === settings.quality)?.note}
        </p>
        <p className="mt-1 text-[0.68rem] text-[#7d6f57]">
          Auto-detected on this device: <span className="text-[#c8ab74]">{autoDetected}</span>
          {fps > 0 ? ` · currently ${fps} FPS` : ""}
        </p>
        {gpu ? <p className="mt-0.5 text-[0.68rem] text-[#6d6149]">Renderer: {gpu}</p> : null}

        <div className="mc-rule my-5" />

        <p className="mc-display mb-2 text-[0.6rem] tracking-[0.3em] text-[#a89268]">Picture</p>
        <div className="flex items-center gap-3 py-1">
          <span className="mc-display w-24 shrink-0 text-[0.72rem] text-[#efe0c0]">Brightness</span>
          <input
            type="range"
            className="mc-slider flex-auto"
            min={0.6}
            max={1.8}
            step={0.05}
            value={settings.brightness}
            onChange={(event) => onChange({ ...settings, brightness: Number(event.target.value) })}
            aria-label="Brightness"
          />
          <span className="w-10 shrink-0 text-right text-xs text-[#c8ab74]">
            {Math.round(settings.brightness * 100)}%
          </span>
        </div>
        <Toggle
          label="Safe rendering"
          note="For a black or unlit hall — drops effects, reflections and shadows"
          value={settings.safeMode}
          onChange={(value) => onChange({ ...settings, safeMode: value })}
        />

        <div className="mc-rule my-5" />

        <Toggle
          label="Battle capture cinematics"
          note="Camera punch, strike, sparks and crumble — under 1.5s"
          value={settings.captureCinematics}
          onChange={(value) => onChange({ ...settings, captureCinematics: value })}
        />
        <Toggle
          label="Swing camera between turns"
          note={`Two-player hotseat only — off by default; a half turn every ply is a lot of motion. Flip by hand any time ${
            hasKeyboard ? "with F" : "from the camera menu"
          }`}
          value={settings.rotateBoard}
          onChange={(value) => onChange({ ...settings, rotateBoard: value })}
        />
        <Toggle
          label="Queue a move while the machine thinks"
          note={`Against the computer — aim a figure during the wait and it plays the instant the turn returns. Tap the X over the last square to take one back${
            hasKeyboard ? ", or press Esc to drop the lot" : ""
          }`}
          value={settings.premoves}
          onChange={(value) => onChange({ ...settings, premoves: value })}
        />
        {settings.premoves ? (
          <div className="py-3">
            <p className="mc-display text-[0.78rem] text-[#efe0c0]">Moves you can stack</p>
            <p className="mb-2 text-xs italic text-[#9c8b6c]">
              Each one is aimed at the board the one before it leaves behind. If the head of the chain dies to the
              machine&rsquo;s reply, the rest goes with it — it was planned for a position that never happened.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {PREMOVE_DEPTHS.map((depth) => (
                <button
                  key={depth.count}
                  type="button"
                  className="mc-chip flex flex-col gap-0.5 py-2"
                  data-active={settings.premoveDepth === depth.count}
                  onClick={() => onChange({ ...settings, premoveDepth: depth.count })}
                >
                  <span>{depth.label}</span>
                  <span className="text-[0.6rem] normal-case italic opacity-70">{depth.note}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="py-3">
          <p className="mc-display text-[0.78rem] text-[#efe0c0]">Computer&rsquo;s thinking time</p>
          <p className="mb-2 text-xs italic text-[#9c8b6c]">
            A floor, never a cap — the search already takes about 0.6s as Knight and 3.1s as Warlord. Raise it to widen
            the window a move can be queued in; Squire answers in 7ms, so there the floor <em>is</em> the wait.
          </p>
          <div className="grid grid-cols-5 gap-2">
            {THINK_FLOORS.map((floor) => (
              <button
                key={floor.ms}
                type="button"
                className="mc-chip py-2"
                data-active={settings.thinkFloorMs === floor.ms}
                onClick={() => onChange({ ...settings, thinkFloorMs: floor.ms })}
              >
                {floor.label}
              </button>
            ))}
          </div>
        </div>
        <Toggle
          label="Rank crests above pieces"
          note="Floating shield and sun-disc badges naming every figure"
          value={settings.rankBadges}
          onChange={(value) => onChange({ ...settings, rankBadges: value })}
        />
        <Toggle
          label="Sound"
          note="Score, ambience and effects"
          value={!settings.muted}
          onChange={(value) => onChange({ ...settings, muted: !value })}
        />
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  note,
  value,
  onChange,
}: {
  label: string;
  note: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-4 border-b border-[#8a652222] py-3 text-left last:border-b-0"
      onClick={() => onChange(!value)}
    >
      <span>
        <span className="mc-display block text-[0.78rem] text-[#efe0c0]">{label}</span>
        <span className="text-xs italic text-[#9c8b6c]">{note}</span>
      </span>
      <span
        className="relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200"
        style={{
          background: value ? "linear-gradient(180deg,#d8b163,#8a6522)" : "rgba(20,18,15,0.8)",
          borderColor: value ? "rgba(246,223,165,0.8)" : "rgba(216,177,99,0.3)",
        }}
      >
        <span
          className="absolute top-0.5 h-4.5 w-4.5 rounded-full bg-[#1a1710] transition-all duration-200"
          style={{ left: value ? "1.55rem" : "0.15rem", width: "1.1rem", height: "1.1rem" }}
        />
      </span>
    </button>
  );
}
