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
