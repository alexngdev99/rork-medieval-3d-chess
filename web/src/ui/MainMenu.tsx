import { useState } from "react";
import { Clapperboard, Crown, Swords, Settings as SettingsIcon, Users } from "lucide-react";

import type { DemoOptions, Difficulty, Faction } from "../core/types";
import { Crest } from "./Heraldry";
import { useHasKeyboard } from "./inputMode";
import { MusterSection, type MusterChoice } from "./Muster";

export interface MatchConfig {
  mode: "ai" | "hotseat" | "demo";
  difficulty: Difficulty;
  playerColor: Faction;
  clockMinutes: number | null;
  demo?: DemoOptions;
}

interface MainMenuProps {
  onStart: (config: MatchConfig) => void;
  onOpenSettings: () => void;
  /** Armies and battleground — settled here, before the first move. */
  muster: MusterChoice;
  onMuster: (choice: MusterChoice) => void;
  attract: boolean;
  onInteract: () => void;
}

const DIFFICULTY_COPY: Record<Difficulty, string> = {
  easy: "Squire — plays fast and loose",
  medium: "Knight — thinks three moves deep",
  hard: "Warlord — full search, no mercy",
};

const DEMO_SPEEDS: { label: string; value: number }[] = [
  { label: "0.5×", value: 0.5 },
  { label: "1×", value: 1 },
  { label: "2×", value: 2 },
  { label: "4×", value: 4 },
];

const CLOCKS: { label: string; value: number | null }[] = [
  { label: "None", value: null },
  { label: "5 min", value: 5 },
  { label: "10 min", value: 10 },
  { label: "15 min", value: 15 },
];

export function MainMenu({ onStart, onOpenSettings, muster, onMuster, attract, onInteract }: MainMenuProps) {
  const hasKeyboard = useHasKeyboard();
  const [tab, setTab] = useState<"ai" | "hotseat" | "demo">("ai");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [playerColor, setPlayerColor] = useState<Faction>("w");
  const [clock, setClock] = useState<number | null>(null);
  const [demoWhite, setDemoWhite] = useState<Difficulty>("medium");
  const [demoBlack, setDemoBlack] = useState<Difficulty>("hard");
  const [demoSpeed, setDemoSpeed] = useState(1);
  const [demoLoop, setDemoLoop] = useState(true);

  const start = (): void =>
    onStart({
      mode: tab,
      difficulty,
      playerColor,
      clockMinutes: tab === "demo" ? null : clock,
      demo: tab === "demo" ? { white: demoWhite, black: demoBlack, speed: demoSpeed, autoRematch: demoLoop } : undefined,
    });

  return (
    <div
      className="mc-menu mc-modal-pad pointer-events-auto absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      onPointerDown={onInteract}
      onPointerMove={onInteract}
    >
      <div className="mc-unfurl mc-menu-hero mb-6 shrink-0 text-center">
        <p className="mc-display text-[0.68rem] tracking-[0.55em] text-[#c8ab74]">Anno Domini MCDXCII</p>
        <h1 className="mc-display mc-title-glow mt-2 text-5xl font-bold text-[#f4e3bd] sm:text-6xl">
          KING&apos;S GAMBIT
        </h1>
        <div className="mc-rule mx-auto mt-3 w-64" />
        <p className="mt-3 text-sm italic text-[#c5b28d]">
          {attract ? "An AI vs AI duel is under way — move to take the hall" : "Chess in the great hall of Aldermoor"}
        </p>
      </div>

      <div className="mc-slate mc-goldleaf mc-rise flex w-full min-h-0 max-w-md flex-col p-5 sm:p-6">
        <div className="mb-5 grid shrink-0 grid-cols-3 gap-2">
          <button
            type="button"
            className="mc-chip flex items-center justify-center gap-1.5 px-1 py-3"
            data-active={tab === "ai"}
            onClick={() => setTab("ai")}
          >
            <Swords size={14} /> Computer
          </button>
          <button
            type="button"
            className="mc-chip flex items-center justify-center gap-1.5 px-1 py-3"
            data-active={tab === "hotseat"}
            onClick={() => setTab("hotseat")}
          >
            <Users size={14} /> 2 Players
          </button>
          <button
            type="button"
            className="mc-chip flex items-center justify-center gap-1.5 px-1 py-3"
            data-active={tab === "demo"}
            onClick={() => setTab("demo")}
          >
            <Clapperboard size={14} /> AI vs AI
          </button>
        </div>

        <div className="mc-scroll -mr-2 min-h-0 flex-auto overflow-y-auto pr-2">
        {tab === "ai" ? (
          <div className="mc-fade space-y-5">
            <div>
              <p className="mc-display mb-2 text-[0.62rem] tracking-[0.3em] text-[#a89268]">Opponent</p>
              <div className="grid grid-cols-3 gap-2">
                {(["easy", "medium", "hard"] as Difficulty[]).map((level) => (
                  <button
                    key={level}
                    type="button"
                    className="mc-chip py-2.5"
                    data-active={difficulty === level}
                    onClick={() => setDifficulty(level)}
                  >
                    {level}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs italic text-[#9c8b6c]">{DIFFICULTY_COPY[difficulty]}</p>
            </div>

            <div>
              <p className="mc-display mb-2 text-[0.62rem] tracking-[0.3em] text-[#a89268]">Your banner</p>
              <div className="grid grid-cols-2 gap-2">
                {(["w", "b"] as Faction[]).map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="mc-chip flex items-center justify-center gap-2 py-2.5"
                    data-active={playerColor === color}
                    onClick={() => setPlayerColor(color)}
                  >
                    <Crest faction={color} size={18} active={playerColor === color} />
                    {color === "w" ? "Ivory" : "Obsidian"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : tab === "hotseat" ? (
          <p className="mc-fade text-sm italic leading-relaxed text-[#b7a88a]">
            Two commanders, one board. The view holds its angle between turns —{" "}
            {hasKeyboard ? (
              <>
                flip it whenever you like with <span className="mc-display text-[#e2c98f]">F</span>, or
              </>
            ) : (
              <>flip it whenever you like from the camera menu, or</>
            )}{" "}
            switch on the automatic swing in settings.
          </p>
        ) : (
          <div className="mc-fade space-y-5">
            <p className="text-sm italic leading-relaxed text-[#b7a88a]">
              Two AI commanders duel on their own while the camera drifts around the hall — made for watching and for
              capturing footage.{" "}
              {hasKeyboard ? (
                <>
                  Press <span className="mc-display text-[#e2c98f]">C</span> in the match to hide the whole interface.
                </>
              ) : (
                <>Tap the clean-capture sigil in the match to hide the whole interface.</>
              )}
            </p>

            <div>
              <p className="mc-display mb-2 text-[0.62rem] tracking-[0.3em] text-[#a89268]">Ivory engine</p>
              <div className="grid grid-cols-3 gap-2">
                {(["easy", "medium", "hard"] as Difficulty[]).map((level) => (
                  <button
                    key={level}
                    type="button"
                    className="mc-chip py-2.5"
                    data-active={demoWhite === level}
                    onClick={() => setDemoWhite(level)}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mc-display mb-2 text-[0.62rem] tracking-[0.3em] text-[#a89268]">Obsidian engine</p>
              <div className="grid grid-cols-3 gap-2">
                {(["easy", "medium", "hard"] as Difficulty[]).map((level) => (
                  <button
                    key={level}
                    type="button"
                    className="mc-chip py-2.5"
                    data-active={demoBlack === level}
                    onClick={() => setDemoBlack(level)}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mc-display mb-2 text-[0.62rem] tracking-[0.3em] text-[#a89268]">Pace</p>
              <div className="grid grid-cols-4 gap-2">
                {DEMO_SPEEDS.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    className="mc-chip py-2.5"
                    data-active={demoSpeed === option.value}
                    onClick={() => setDemoSpeed(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="mc-chip flex w-full items-center justify-between px-3 py-2.5"
              data-active={demoLoop}
              onClick={() => setDemoLoop((loop) => !loop)}
              aria-pressed={demoLoop}
            >
              <span>Loop new duels</span>
              <span className="mc-display text-[0.62rem] tracking-[0.24em]">{demoLoop ? "ON" : "OFF"}</span>
            </button>
          </div>
        )}

        {tab === "demo" ? null : (
          <div className="mt-5">
            <p className="mc-display mb-2 text-[0.62rem] tracking-[0.3em] text-[#a89268]">Hourglass</p>
            <div className="grid grid-cols-4 gap-2">
              {CLOCKS.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  className="mc-chip py-2.5"
                  data-active={clock === option.value}
                  onClick={() => setClock(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mc-rule my-5" />

        <MusterSection choice={muster} onChange={onMuster} />
        </div>

        <div className="mc-panel-foot shrink-0">
        <button
          type="button"
          className="mc-btn mc-btn-primary mt-5 flex w-full items-center justify-center gap-2 py-3.5 text-sm"
          onClick={start}
        >
          {tab === "demo" ? (
            <>
              <Clapperboard size={16} /> Start AI vs AI
            </>
          ) : (
            <>
              <Crown size={16} /> Take the field
            </>
          )}
        </button>

        <button
          type="button"
          className="mc-btn mt-2 flex w-full items-center justify-center gap-2"
          onClick={onOpenSettings}
        >
          <SettingsIcon size={15} /> Settings
        </button>
        </div>
      </div>

      {/* The hall is driven differently by a finger than by a mouse, so the
          standing instruction names only the gestures this device actually has. */}
      <p className="mc-menu-hint mt-5 shrink-0 text-[0.68rem] tracking-[0.2em] text-[#7d6f57]">
        {hasKeyboard
          ? "DRAG TO ORBIT · SCROLL TO ZOOM · CLICK A FIGURE TO COMMAND IT"
          : "DRAG TO ORBIT · PINCH TO ZOOM · TAP A FIGURE TO COMMAND IT"}
      </p>
    </div>
  );
}
