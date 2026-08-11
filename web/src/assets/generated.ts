/**
 * URLs of the AI-generated assets used by the game.
 * Models are loaded straight from R2 by GLTFLoader; audio is decoded by the
 * Web Audio mixer. Swapping in higher-quality glTF characters is a one-line
 * change per entry (see README).
 */

import type { Faction, PieceKind } from "../core/types";
import type { ArenaTheme } from "../scene/arena";
import type { ArmSculptSource } from "../scene/armoury";
import type { ShotModelSource } from "../scene/gunfire";
import type { WeaponId } from "../scene/weapons";

const MODEL_BASE = "https://r2-pub.rork.com/generated-3d-models/g9111r67kl6tq85g540sd";

/**
 * One army's sculpts. Every skin is a whole civilisation with its own roster of
 * six figures; a missing entry falls back to the other side's sculpt and then to
 * a procedural figure, so the board always fills.
 */
type Roster<T> = Partial<Record<PieceKind, T>>;

/**
 * Which weapon family arms a skin's figures. The figures are always generated
 * unarmed (held props break auto-rigging), so the arms are separate objects
 * parented to the hand bones — built from primitives in `scene/weapons.ts` or,
 * for the Grande Armée, generated sculpts of the real thing (see
 * {@link ARM_SCULPTS}).
 */
export type ArsenalId = "kingdom" | "sun" | "empire";

/** Selectable army skins. Either side of the board can wear any of them. */
export type ArmySkinId = "ivory" | "sun" | "empire";

/** Static (unrigged) sculpt per kind — the fallback when a rig fails to load. */
const STILL_MODELS: Record<ArmySkinId, Roster<string>> = {
  ivory: {
    k: `${MODEL_BASE}/704a772c-4a50-4619-b5ad-6e2bbf9703b8.glb`,
    q: `${MODEL_BASE}/13928f19-23a3-46ba-9879-aacca58f2886.glb`,
    b: `${MODEL_BASE}/6c99342a-e9a5-4959-a59b-c207e15a5c72.glb`,
    n: `${MODEL_BASE}/43f08150-5463-4112-9949-2e1a9a9a6bd2.glb`,
    r: `${MODEL_BASE}/211b0ba5-2c7f-44ff-8143-b625bca41df1.glb`,
    p: `${MODEL_BASE}/36d8c7d4-2f42-4672-8908-e9298fce9b69.glb`,
  },
  // Sun Empire: emperor, high priestess, serpent priest, jaguar warrior,
  // temple guardian and eagle footsoldier.
  sun: {
    k: `${MODEL_BASE}/ad5cfb3c-4fbc-4952-a1f1-b1d4a684b2e7.glb`,
    q: `${MODEL_BASE}/d39273ce-17e5-41df-a7f5-634f944e3467.glb`,
    b: `${MODEL_BASE}/7066c2da-f466-438b-ab74-f2a45b2a0ddb.glb`,
    n: `${MODEL_BASE}/a5ff70a9-b2e7-40e0-b7bc-ea4fe0ba6d5c.glb`,
    r: `${MODEL_BASE}/c044d8e8-28fd-4aa9-af00-d58ca49fedee.glb`,
    p: `${MODEL_BASE}/2cd10f02-711f-4e51-8b32-1d6603e7cc3f.glb`,
  },
  // Grande Armée: Napoléon, an imperial commander with the Marengo sword,
  // cuirassier champions, artillery guards and line infantry.
  empire: {
    k: `${MODEL_BASE}/b533d4ac-cac7-47f2-887d-8b90ee8626a8.glb`,
    q: `${MODEL_BASE}/a152280e-7af7-4e3e-846e-b20e8f8c2952.glb`,
    b: `${MODEL_BASE}/779c54d4-67b3-4e69-948a-fdcc8c58ae5c.glb`,
    n: `${MODEL_BASE}/ebbe76e7-dbc7-4961-bf10-035acee68ee1.glb`,
    r: `${MODEL_BASE}/044ccbd8-c9d3-452e-8524-4a47034b8fe2.glb`,
    p: `${MODEL_BASE}/29b4a2e7-eba2-4ca7-a9f3-e22278c8df9e.glb`,
  },
};

/**
 * Rigged (skinned) sculpts plus their skeletal clips. The plain GLBs above have
 * no skeleton, so an animated piece must render the rigged variant and play the
 * clips on a mixer bound to it. Kinds missing here fall back to the static GLB
 * with procedural idle motion.
 */
export interface PieceAnimationSet {
  /** Rigged GLB — the visual for animated pieces. */
  rigged: string;
  /** Looping combat stance. */
  idle?: string;
  /** One-shot strike played when this figure captures. */
  attack?: string;
  /** One-shot death played when this figure is captured. */
  death?: string;
  /**
   * Looping in-place stride played while the figure marches to its square.
   * In-place variants only: the board move is driven by the container tween,
   * so a clip carrying root translation would double the travel.
   */
  walk?: string;
  /** Looping in-place run — the knight's charge through its leap. */
  run?: string;
  /**
   * One-shot drill played after a shot: powder, ball, ramrod. Only the
   * gunpowder army carries one — a swordsman has nothing to reload.
   */
  reload?: string;
  /**
   * Looping sight picture held before the shot: the arm comes up, the barrel is
   * levelled on the body and the head sights along it. Only the gunpowder army
   * carries one — it is what makes a kill at range read as aimed.
   */
  aim?: string;
  /**
   * One-shot change of stance between the knee and the feet: the clip starts on
   * one knee and ends standing at full height. Only a figure that fights from a
   * kneel needs it, and it is played in *both* directions — forwards to come up
   * off the knee once the shot is over, backwards to go down onto it in the
   * first place (see `PieceView.playKneel`). One download, two motions, and the
   * kneel he rises out of is by construction the kneel he dropped into.
   */
  rise?: string;
}

const ANIMATED_MODELS: Record<ArmySkinId, Roster<PieceAnimationSet>> = {
  ivory: {
  // The crown stands at full height and judges rather than brawls.
  k: {
    rigged: `${MODEL_BASE}/704a772c-4a50-4619-b5ad-6e2bbf9703b8-rigged.glb`,
    idle: `${MODEL_BASE}/704a772c-4a50-4619-b5ad-6e2bbf9703b8-anim-idle.glb`,
    attack: `${MODEL_BASE}/704a772c-4a50-4619-b5ad-6e2bbf9703b8-anim-sword-judgment.glb`,
    death: `${MODEL_BASE}/704a772c-4a50-4619-b5ad-6e2bbf9703b8-anim-dead.glb`,
    // A plain, upright stride: the catwalk strut read as a swagger on a king,
    // so the crown now walks normally and the slow cadence in GAITS supplies the
    // gravitas. Alternative on the same rig:
    // `...-anim-spear-walk-inplace.glb` (weapon-forward march).
    walk: `${MODEL_BASE}/704a772c-4a50-4619-b5ad-6e2bbf9703b8-anim-casual-walk-inplace.glb`,
  },
  q: {
    rigged: `${MODEL_BASE}/13928f19-23a3-46ba-9879-aacca58f2886-rigged.glb`,
    idle: `${MODEL_BASE}/13928f19-23a3-46ba-9879-aacca58f2886-anim-idle.glb`,
    attack: `${MODEL_BASE}/13928f19-23a3-46ba-9879-aacca58f2886-anim-charged-spell-cast.glb`,
    death: `${MODEL_BASE}/13928f19-23a3-46ba-9879-aacca58f2886-anim-dying-backwards.glb`,
    // Natural stride instead of the old red-carpet walk, whose crossed steps and
    // hip sway looked wrong under a battle gown.
    // Alternative: `...-anim-spear-walk-inplace.glb`.
    walk: `${MODEL_BASE}/13928f19-23a3-46ba-9879-aacca58f2886-anim-casual-walk-inplace.glb`,
  },
  b: {
    rigged: `${MODEL_BASE}/6c99342a-e9a5-4959-a59b-c207e15a5c72-rigged.glb`,
    idle: `${MODEL_BASE}/6c99342a-e9a5-4959-a59b-c207e15a5c72-anim-combat-stance.glb`,
    attack: `${MODEL_BASE}/6c99342a-e9a5-4959-a59b-c207e15a5c72-anim-sword-judgment.glb`,
    death: `${MODEL_BASE}/6c99342a-e9a5-4959-a59b-c207e15a5c72-anim-dead.glb`,
    walk: `${MODEL_BASE}/6c99342a-e9a5-4959-a59b-c207e15a5c72-anim-spear-walk-inplace.glb`,
  },
  n: {
    rigged: `${MODEL_BASE}/43f08150-5463-4112-9949-2e1a9a9a6bd2-rigged.glb`,
    idle: `${MODEL_BASE}/43f08150-5463-4112-9949-2e1a9a9a6bd2-anim-combat-stance.glb`,
    attack: `${MODEL_BASE}/43f08150-5463-4112-9949-2e1a9a9a6bd2-anim-charged-slash.glb`,
    death: `${MODEL_BASE}/43f08150-5463-4112-9949-2e1a9a9a6bd2-anim-dying-backwards.glb`,
    walk: `${MODEL_BASE}/43f08150-5463-4112-9949-2e1a9a9a6bd2-anim-confident-strut-inplace.glb`,
    // Carried through the leap, so the rider is charging rather than floating.
    run: `${MODEL_BASE}/43f08150-5463-4112-9949-2e1a9a9a6bd2-anim-standard-forward-charge-inplace.glb`,
  },
  r: {
    rigged: `${MODEL_BASE}/211b0ba5-2c7f-44ff-8143-b625bca41df1-rigged.glb`,
    idle: `${MODEL_BASE}/211b0ba5-2c7f-44ff-8143-b625bca41df1-anim-combat-stance.glb`,
    attack: `${MODEL_BASE}/211b0ba5-2c7f-44ff-8143-b625bca41df1-anim-heavy-hammer-swing.glb`,
    death: `${MODEL_BASE}/211b0ba5-2c7f-44ff-8143-b625bca41df1-anim-knock-down.glb`,
    // Full plate: an ordinary stride played at the guardian's slow cadence reads
    // as a heavy tread, where the hunched orc walk read as a monster.
    // Alternative: `...-anim-carry-heavy-object-walk-inplace.glb` (laden trudge).
    walk: `${MODEL_BASE}/211b0ba5-2c7f-44ff-8143-b625bca41df1-anim-casual-walk-inplace.glb`,
  },
  p: {
    rigged: `${MODEL_BASE}/36d8c7d4-2f42-4672-8908-e9298fce9b69-rigged.glb`,
    idle: `${MODEL_BASE}/36d8c7d4-2f42-4672-8908-e9298fce9b69-anim-combat-stance.glb`,
    attack: `${MODEL_BASE}/36d8c7d4-2f42-4672-8908-e9298fce9b69-anim-thrust-slash.glb`,
    death: `${MODEL_BASE}/36d8c7d4-2f42-4672-8908-e9298fce9b69-anim-knock-down.glb`,
    walk: `${MODEL_BASE}/36d8c7d4-2f42-4672-8908-e9298fce9b69-anim-spear-walk-inplace.glb`,
  },
  },
  sun: {
    k: {
      rigged: `${MODEL_BASE}/ad5cfb3c-4fbc-4952-a1f1-b1d4a684b2e7-rigged.glb`,
      idle: `${MODEL_BASE}/ad5cfb3c-4fbc-4952-a1f1-b1d4a684b2e7-anim-idle.glb`,
      attack: `${MODEL_BASE}/ad5cfb3c-4fbc-4952-a1f1-b1d4a684b2e7-anim-sword-judgment.glb`,
      death: `${MODEL_BASE}/ad5cfb3c-4fbc-4952-a1f1-b1d4a684b2e7-anim-dead.glb`,
      // As with the ivory king: upright natural stride, no catwalk sway.
      // Alternative: `...-anim-spear-walk-inplace.glb`.
      walk: `${MODEL_BASE}/ad5cfb3c-4fbc-4952-a1f1-b1d4a684b2e7-anim-casual-walk-inplace.glb`,
    },
    q: {
      rigged: `${MODEL_BASE}/d39273ce-17e5-41df-a7f5-634f944e3467-rigged.glb`,
      idle: `${MODEL_BASE}/d39273ce-17e5-41df-a7f5-634f944e3467-anim-idle.glb`,
      attack: `${MODEL_BASE}/d39273ce-17e5-41df-a7f5-634f944e3467-anim-charged-spell-cast.glb`,
      death: `${MODEL_BASE}/d39273ce-17e5-41df-a7f5-634f944e3467-anim-dying-backwards.glb`,
      // Alternative: `...-anim-spear-walk-inplace.glb`.
      walk: `${MODEL_BASE}/d39273ce-17e5-41df-a7f5-634f944e3467-anim-casual-walk-inplace.glb`,
    },
    b: {
      rigged: `${MODEL_BASE}/7066c2da-f466-438b-ab74-f2a45b2a0ddb-rigged.glb`,
      idle: `${MODEL_BASE}/7066c2da-f466-438b-ab74-f2a45b2a0ddb-anim-combat-stance.glb`,
      attack: `${MODEL_BASE}/7066c2da-f466-438b-ab74-f2a45b2a0ddb-anim-sword-judgment.glb`,
      death: `${MODEL_BASE}/7066c2da-f466-438b-ab74-f2a45b2a0ddb-anim-dead.glb`,
      walk: `${MODEL_BASE}/7066c2da-f466-438b-ab74-f2a45b2a0ddb-anim-spear-walk-inplace.glb`,
    },
    n: {
      rigged: `${MODEL_BASE}/a5ff70a9-b2e7-40e0-b7bc-ea4fe0ba6d5c-rigged.glb`,
      idle: `${MODEL_BASE}/a5ff70a9-b2e7-40e0-b7bc-ea4fe0ba6d5c-anim-combat-stance.glb`,
      attack: `${MODEL_BASE}/a5ff70a9-b2e7-40e0-b7bc-ea4fe0ba6d5c-anim-charged-slash.glb`,
      death: `${MODEL_BASE}/a5ff70a9-b2e7-40e0-b7bc-ea4fe0ba6d5c-anim-dying-backwards.glb`,
      // The jaguar warrior prowls where the ivory knight marches.
      walk: `${MODEL_BASE}/a5ff70a9-b2e7-40e0-b7bc-ea4fe0ba6d5c-anim-sneaky-walk-inplace.glb`,
      run: `${MODEL_BASE}/a5ff70a9-b2e7-40e0-b7bc-ea4fe0ba6d5c-anim-standard-forward-charge-inplace.glb`,
    },
    r: {
      rigged: `${MODEL_BASE}/c044d8e8-28fd-4aa9-af00-d58ca49fedee-rigged.glb`,
      idle: `${MODEL_BASE}/c044d8e8-28fd-4aa9-af00-d58ca49fedee-anim-combat-stance.glb`,
      attack: `${MODEL_BASE}/c044d8e8-28fd-4aa9-af00-d58ca49fedee-anim-heavy-hammer-swing.glb`,
      death: `${MODEL_BASE}/c044d8e8-28fd-4aa9-af00-d58ca49fedee-anim-knock-down.glb`,
      // Alternative: `...-anim-carry-heavy-object-walk-inplace.glb`.
      walk: `${MODEL_BASE}/c044d8e8-28fd-4aa9-af00-d58ca49fedee-anim-casual-walk-inplace.glb`,
    },
    p: {
      rigged: `${MODEL_BASE}/2cd10f02-711f-4e51-8b32-1d6603e7cc3f-rigged.glb`,
      idle: `${MODEL_BASE}/2cd10f02-711f-4e51-8b32-1d6603e7cc3f-anim-combat-stance.glb`,
      attack: `${MODEL_BASE}/2cd10f02-711f-4e51-8b32-1d6603e7cc3f-anim-thrust-slash.glb`,
      death: `${MODEL_BASE}/2cd10f02-711f-4e51-8b32-1d6603e7cc3f-anim-knock-down.glb`,
      walk: `${MODEL_BASE}/2cd10f02-711f-4e51-8b32-1d6603e7cc3f-anim-spear-walk-inplace.glb`,
    },
  },
  empire: {
    // The Emperor never brawls and never closes: the coat comes open, the
    // flintlock comes up and the matter is settled from where he stands.
    // Alternative on the same rig: `...-anim-sword-judgment.glb` (dress sabre).
    k: {
      rigged: `${MODEL_BASE}/b533d4ac-cac7-47f2-887d-8b90ee8626a8-rigged.glb`,
      idle: `${MODEL_BASE}/b533d4ac-cac7-47f2-887d-8b90ee8626a8-anim-idle.glb`,
      // The coat comes open and the pistol is levelled and held on the man
      // before the trigger is touched — the hold is what reads as taking aim.
      aim: `${MODEL_BASE}/b533d4ac-cac7-47f2-887d-8b90ee8626a8-anim-archery-aim-with-lateral-scan.glb`,
      attack: `${MODEL_BASE}/b533d4ac-cac7-47f2-887d-8b90ee8626a8-anim-cowboy-quick-draw-shooting.glb`,
      death: `${MODEL_BASE}/b533d4ac-cac7-47f2-887d-8b90ee8626a8-anim-dead.glb`,
      walk: `${MODEL_BASE}/b533d4ac-cac7-47f2-887d-8b90ee8626a8-anim-casual-walk-inplace.glb`,
      // No reloading drill: unlike every other barrel in the army, this rig has
      // no reload take on the server (`-anim-standing-reload.glb` and
      // `-anim-kneeling-reload.glb` both 404). Naming one anyway cost every
      // Emperor's shot a dead download before the beat could continue, so the
      // Emperor simply lowers the pistol — `playReload` returns 0 and the fight
      // skips the beat. Regenerate a reload on this rig to give him one.
    },
    // The commander fights at range, but with powder rather than sorcery: the
    // Marengo sword stays in her left hand and the flintlock does the work.
    //   * aim     — the pistol comes up and is held on the man across the board
    //   * strike  — drawn and fired from the shoulder, standing at full height
    //   * reload  — fresh powder and ball, still on her feet
    // Alternative on the same rig: `...-anim-charged-spell-cast.glb` (the old
    // sorceress cast, kept in case the court ever goes back to witchfire).
    q: {
      rigged: `${MODEL_BASE}/a152280e-7af7-4e3e-846e-b20e8f8c2952-rigged.glb`,
      idle: `${MODEL_BASE}/a152280e-7af7-4e3e-846e-b20e8f8c2952-anim-idle.glb`,
      aim: `${MODEL_BASE}/a152280e-7af7-4e3e-846e-b20e8f8c2952-anim-archery-aim-with-lateral-scan.glb`,
      attack: `${MODEL_BASE}/a152280e-7af7-4e3e-846e-b20e8f8c2952-anim-cowboy-quick-draw-shooting.glb`,
      death: `${MODEL_BASE}/a152280e-7af7-4e3e-846e-b20e8f8c2952-anim-dying-backwards.glb`,
      walk: `${MODEL_BASE}/a152280e-7af7-4e3e-846e-b20e8f8c2952-anim-casual-walk-inplace.glb`,
      reload: `${MODEL_BASE}/a152280e-7af7-4e3e-846e-b20e8f8c2952-anim-standing-reload.glb`,
    },
    // The Empire's marksman. He carries no staff and casts nothing: the rifle
    // comes up, he goes down on one knee, and the shot is taken from there.
    //   * stance  — stands at the ready between turns, rifle lowered, watching
    //     the board. He used to *wait out the whole game* on one knee, which
    //     read as a man permanently crouched behind cover; the kneel is worth
    //     something only if it is the thing he does when he takes a shot.
    //   * rise    — the knee going down and coming back up, played backwards
    //     and then forwards around the shot (see {@link PieceAnimationSet.rise})
    //   * aim     — held on the knee: rifle up, head over the sights, scanning
    //     the body across the board. This is the pose he *fires from*: the
    //     kneeling shot has no strike clip at all (see below).
    //   * stride  — rifle carried across the body at the advance
    //   * reload  — powder and ball, still on the knee he fired from; he only
    //     comes back up to his feet afterwards, once the body is cleared
    //
    // No `attack`. This rig's shooting take is `Female_Crouch_Pick_Gun_Point_
    // Forward`, and its name is a trap: measured on the hips it starts at 92
    // units (standing), dips to 68, and is back up at 93 by the 70% mark — the
    // authored ignition frame at 0.6 lands with the man on his *feet*. Played
    // between a kneeling aim (hips 48) and a kneeling reload (hips 42) it made
    // the marksman stand up to fire and drop back down twice per shot. So the
    // kneeling gunner keeps the kneel and fires out of the held aim instead;
    // the clip stays off this roster rather than being loaded and skipped.
    // Alternatives on the same rig: `...-anim-combat-stance.glb` (bare-fisted
    // guard), `...-anim-charged-spell-cast-1.glb` (the old staff cast).
    b: {
      rigged: `${MODEL_BASE}/779c54d4-67b3-4e69-948a-fdcc8c58ae5c-rigged.glb`,
      idle: `${MODEL_BASE}/779c54d4-67b3-4e69-948a-fdcc8c58ae5c-anim-lower-weapon-look-raise.glb`,
      aim: `${MODEL_BASE}/779c54d4-67b3-4e69-948a-fdcc8c58ae5c-anim-crouchlookaroundbow.glb`,
      rise: `${MODEL_BASE}/779c54d4-67b3-4e69-948a-fdcc8c58ae5c-anim-kneel-on-one-knee-and-stand.glb`,
      death: `${MODEL_BASE}/779c54d4-67b3-4e69-948a-fdcc8c58ae5c-anim-dead.glb`,
      walk: `${MODEL_BASE}/779c54d4-67b3-4e69-948a-fdcc8c58ae5c-anim-rifle-charge-inplace.glb`,
      reload: `${MODEL_BASE}/779c54d4-67b3-4e69-948a-fdcc8c58ae5c-anim-kneeling-reload.glb`,
    },
    n: {
      rigged: `${MODEL_BASE}/ebbe76e7-dbc7-4961-bf10-035acee68ee1-rigged.glb`,
      idle: `${MODEL_BASE}/ebbe76e7-dbc7-4961-bf10-035acee68ee1-anim-combat-stance.glb`,
      attack: `${MODEL_BASE}/ebbe76e7-dbc7-4961-bf10-035acee68ee1-anim-charged-slash.glb`,
      death: `${MODEL_BASE}/ebbe76e7-dbc7-4961-bf10-035acee68ee1-anim-dying-backwards.glb`,
      // A cavalryman on foot still swaggers.
      walk: `${MODEL_BASE}/ebbe76e7-dbc7-4961-bf10-035acee68ee1-anim-confident-strut-inplace.glb`,
      run: `${MODEL_BASE}/ebbe76e7-dbc7-4961-bf10-035acee68ee1-anim-standard-forward-charge-inplace.glb`,
    },
    // The battery: the crew lays the gun it hauls, then serves it. Its "strike"
    // is the step in to the trail and the shove on the lanyard. Its hands are
    // empty — the gun is towed, not carried — so both loops are chosen for a
    // crewman standing to his piece rather than one hugging a weapon:
    //   * stance — at ease beside the trail, arms down (not a brawler's guard)
    //   * stride — an ordinary march, played at the battery's slow cadence so
    //     it reads as a heavy tread. The old carry-the-cannon trudge hugged an
    //     invisible barrel with both arms and read as a broken walk.
    // Alternatives on the same rig: `...-anim-combat-stance.glb`,
    // `...-anim-carry-heavy-cannon-forward-inplace.glb`.
    r: {
      rigged: `${MODEL_BASE}/044ccbd8-c9d3-452e-8524-4a47034b8fe2-rigged.glb`,
      idle: `${MODEL_BASE}/044ccbd8-c9d3-452e-8524-4a47034b8fe2-anim-idle.glb`,
      attack: `${MODEL_BASE}/044ccbd8-c9d3-452e-8524-4a47034b8fe2-anim-step-forward-and-push.glb`,
      death: `${MODEL_BASE}/044ccbd8-c9d3-452e-8524-4a47034b8fe2-anim-knock-down.glb`,
      walk: `${MODEL_BASE}/044ccbd8-c9d3-452e-8524-4a47034b8fe2-anim-casual-walk-inplace.glb`,
      // Kneeling at the muzzle with powder and shot once the piece has spoken.
      reload: `${MODEL_BASE}/044ccbd8-c9d3-452e-8524-4a47034b8fe2-anim-kneeling-reload.glb`,
    },
    // Line infantry fires a volley rather than closing with the bayonet.
    // Alternative: `...-anim-thrust-slash.glb` (bayonet thrust).
    p: {
      rigged: `${MODEL_BASE}/29b4a2e7-eba2-4ca7-a9f3-e22278c8df9e-rigged.glb`,
      idle: `${MODEL_BASE}/29b4a2e7-eba2-4ca7-a9f3-e22278c8df9e-anim-combat-stance.glb`,
      // Musket into the shoulder, cheek down on the stock, barrel tracking the
      // man across the board: the volley is aimed before it is fired.
      aim: `${MODEL_BASE}/29b4a2e7-eba2-4ca7-a9f3-e22278c8df9e-anim-archery-aim-with-lateral-scan.glb`,
      attack: `${MODEL_BASE}/29b4a2e7-eba2-4ca7-a9f3-e22278c8df9e-anim-draw-and-shoot-from-back.glb`,
      death: `${MODEL_BASE}/29b4a2e7-eba2-4ca7-a9f3-e22278c8df9e-anim-knock-down.glb`,
      // Musket held across the body at the ready — the line advances, it does
      // not stroll. A full 1.13s gait cycle, so retimed to the footsoldier's
      // cadence it reads as a march. The rifle *charge* on the same rig
      // (`...-anim-rifle-charge-inplace.glb`) is a 0.53s sprint whose legs blur
      // and whose hips carry six units of side-to-side root motion — stretched
      // over a single square it read as a man juddering on the spot, so it is
      // kept only as the charge below.
      walk: `${MODEL_BASE}/29b4a2e7-eba2-4ca7-a9f3-e22278c8df9e-anim-spear-walk-inplace.glb`,
      reload: `${MODEL_BASE}/29b4a2e7-eba2-4ca7-a9f3-e22278c8df9e-anim-standing-reload.glb`,
    },
  },
};

/**
 * The magazine, sculpt by sculpt: every round the Grande Armée fires is a real
 * mesh, not a glowing dot, so a shot crossing the hall reads as a piece of metal
 * turning in the air.
 *
 * One sculpt per round in the barrel — the officer's cast lead pistol ball, the
 * line's battered .69 Charleville ball, the marksman's rifled Minié bullet and
 * the battery's pitted iron round shot. Every one of them comes back from the
 * generator as *directionless* (a body of revolution has no intrinsic front), so
 * the loader takes each sculpt's own measured long axis as the nose rather than
 * inventing a yaw correction — see `scene/gunfire.ts`. A sculpt that has not
 * arrived yet is forged procedurally in `scene/ammunition.ts`, so nobody ever
 * fires a blank while a download is in flight.
 */
export const SHOT_MODELS: ShotModelSource[] = [
  // Officer's flintlock: small, barely out of round, mould seam still on it.
  { ammo: "pistolBall", url: `${MODEL_BASE}/49825d82-a7a6-4658-98e0-0c86275128d5.glb` },
  // .69 soft lead, dented flat in places by the ramrod and stained with fouling.
  { ammo: "musketBall", url: `${MODEL_BASE}/737c408d-b677-4be0-a805-02354f7f3532.glb` },
  // The only conical round in the army: ogive nose, grease grooves, hollow base.
  { ammo: "minieBullet", url: `${MODEL_BASE}/76d56227-19ad-46cf-b9e8-b84f93bef133.glb` },
  // Six pounds of sand-cast iron, pockmarked and seamed round its middle.
  { ammo: "roundShot", url: `${MODEL_BASE}/dca2d8a4-736e-4e04-ace0-691ae325a730.glb` },
];

/**
 * The Napoleonic arms, sculpt by sculpt.
 *
 * A fantasy blade can be built from boxes and cylinders because nobody can check
 * it. The Grande Armée's arms cannot: a Charleville musket, an An XI cuirassier
 * sword and a flintlock pistol are documented objects, and a primitive
 * approximation of one reads as a toy in a hand that is otherwise a real sculpt.
 * Each entry is a generated mesh of the actual weapon, fitted into the prop frame
 * by `scene/armoury.ts` — which *measures* each model rather than trusting its
 * pose, because the generator hands these back lying along the diagonal of their
 * own bounding box.
 *
 * `grip` and `muzzle` are fractions of the weapon's length up from the butt — the
 * two things no measurement can find, since nothing in a mesh says "trigger".
 * Both were read off each sculpt's own cross-section profile (the bulge of the
 * lock on a firearm, the gap between pommel and guard on a blade) and land within
 * a couple of percent of the hand-built props they replace.
 *
 * A weapon with no entry here — every medieval and Sun Empire arm, and the
 * battery's towed field gun — is still built from primitives, and so is any of
 * these whose download fails: a plain musket beats an unarmed soldier.
 */
export const ARM_SCULPTS: Partial<Record<WeaponId, ArmSculptSource>> = {
  // Charleville Model 1777, bayonet fixed. Measured profile: butt plate at one
  // end, the lock's bulge at 0.22 of the length, bayonet socket at 0.80, point
  // at the far end — the longest silhouette on the board.
  musketBayonet: {
    url: `${MODEL_BASE}/bc6b8c09-5d21-440c-b145-eee190c2e0cf.glb`,
    length: 0.86,
    grip: 0.19,
    // The bore, not the bayonet point: the flash has to leave the barrel.
    muzzle: 0.8,
    family: "firearm",
  },
  // 1793 Versailles rifled carbine: cheek piece, leaf sight, no bayonet.
  marksmanRifle: {
    url: `${MODEL_BASE}/4fb92659-06c6-4bbe-b0d3-ed21f37c2c8b.glb`,
    length: 0.85,
    grip: 0.3,
    muzzle: 0.985,
    family: "firearm",
  },
  // An XI heavy cavalry sword: straight blade, four-branch brass bowl guard.
  cavalrySabre: {
    url: `${MODEL_BASE}/ebf0edf9-d446-4fa7-a0a7-d1db4e6123ed.glb`,
    length: 0.63,
    grip: 0.11,
    family: "blade",
  },
  // A general officer's dress sabre: gilt hilt, blued and gilt-etched blade.
  //
  // Length is the real object against the man carrying it, not a guess: an
  // officer's dress sabre runs about 95cm overall, and Napoléon stood 1.69m —
  // 1.75m to the crown of the bicorne this sculpt wears. That is 0.54, and it
  // puts the Emperor's blade *shorter* than the trooper's An XI (0.63) rather
  // than the longest steel on the board.
  imperialSabre: {
    url: `${MODEL_BASE}/47492c2e-f774-49e0-b2ef-113a02132a50.glb`,
    length: 0.54,
    grip: 0.11,
    family: "blade",
  },
  // The presentation sword: ivory grip, laurelled bow, eagle's head pommel.
  // This one arrives hilt-last; the fitter finds the point without being told.
  // A court sword is the longest, straightest blade worn at the imperial court
  // and still only about a metre overall — 0.58 of the figure wearing it.
  marengoSword: {
    url: `${MODEL_BASE}/307d49bd-b8c8-44b5-9837-bd55d8c849b6.glb`,
    length: 0.58,
    grip: 0.13,
    family: "blade",
  },
  // An XIII officer's flintlock pistol, gilt-mounted, muzzle-first in the file.
  officerPistol: {
    url: `${MODEL_BASE}/ff7079b3-d6d5-44a9-a43a-0bf4d3a2954d.glb`,
    length: 0.27,
    grip: 0.15,
    muzzle: 0.98,
    family: "firearm",
  },
};

/**
 * Orientation verdict reported by the generator for every sculpt:
 * hasIntrinsicFront = true, front = +Z, up = +Y.
 */
export const PIECE_MODEL_ORIENTATION = {
  localFrontAxis: "positiveZ",
  localUpAxis: "positiveY",
} as const;

const CRY_BASE = "https://r2-pub.rork.com/generated-audio/g9111r67kl6tq85g540sd";

/**
 * One death cry per figure per army. They are voiced in character — the ivory
 * kingdom dies like medieval Europeans, the Sun Empire like jaguar/eagle
 * warriors, the Grande Armée like men who have just been shot — so the ear can
 * tell what just fell, and which army it belonged to, without looking at the
 * board. The queens are the exception: breathy sighs and gasps, not shrieks.
 * Every clip is generated at a true one-second length, so the mixer plays them
 * back at their natural pitch instead of speeding a longer take up.
 * Loaded lazily after the mixer unlocks (they are only needed on a capture).
 */
const DEATH_CRIES: Record<ArmySkinId, Record<PieceKind, string>> = {
  ivory: {
    k: `${CRY_BASE}/c4d801f3-b8e7-42bb-b046-6b21e9ec40a5.mp3`,
    q: `${CRY_BASE}/e01a2d0f-2b13-426b-89b4-d40e67d4b16f.mp3`,
    b: `${CRY_BASE}/4ca6a216-52fc-4882-b51a-9a44d188edac.mp3`,
    n: `${CRY_BASE}/ebb33bba-cf2b-481f-aec6-4465a6a35253.mp3`,
    r: `${CRY_BASE}/f9d84835-112f-46de-951b-052f867814da.mp3`,
    p: `${CRY_BASE}/e4caca0d-8f61-4228-b349-025ae499cde5.mp3`,
  },
  sun: {
    k: `${CRY_BASE}/7efd7eb4-936a-4488-83ae-e0ebea314601.mp3`,
    // Young female voice — a plain drawn-out "ahhhh" scream cut by a gasp.
    q: `${CRY_BASE}/6fe2ac5d-b4e4-4655-9354-cfbb117bc7f5.mp3`,
    b: `${CRY_BASE}/6ae51ccd-12c2-4002-875d-ec4c1d907227.mp3`,
    n: `${CRY_BASE}/a66374c2-9253-4f07-8202-1001ccf6ba69.mp3`,
    r: `${CRY_BASE}/6107aca9-aa81-45ff-a3d5-eda9d457fc3b.mp3`,
    // Deep male voice — a rising shout cut short by the death gasp.
    p: `${CRY_BASE}/ffa27c35-53ff-4f3a-a71e-285aff8a2a4b.mp3`,
  },
  // The Grande Armée dies its own death. Where the ivory kingdom roars and the
  // Sun Empire shrieks, a powder army takes the ball and goes quiet fast: these
  // are all impact reactions — the air punched out first, the voice second.
  empire: {
    // Napoléon: a commanding grunt of shock bitten off through clenched teeth.
    // He does not scream; the coat closes on it.
    k: `${CRY_BASE}/dd0626e5-1b47-4d72-800b-503ae732f16d.mp3`,
    // Imperial Commander: sharp indrawn breath, then a low pained gasp fading —
    // held together rather than shrieked, unlike the two sorceress queens.
    q: `${CRY_BASE}/bbae4ca6-bb5c-46b5-be77-b2a4e6bfc890.mp3`,
    // Marshal-Tirailleur: hit on the knee he fires from — a clipped grunt and a
    // rasp low to the ground.
    b: `${CRY_BASE}/203b9d42-08e3-43e5-96e3-9c7653f419db.mp3`,
    // Cuirassier: a furious bellow boxed in by the steel helmet, ending wet.
    n: `${CRY_BASE}/f2391f92-4656-4dd2-bb62-8975ca2926a8.mp3`,
    // Artillery Guard: the heaviest man on the board — a deep winded groan
    // sagging in pitch as the weight goes down.
    r: `${CRY_BASE}/1dc52c19-e964-4089-a111-d0b1122b4198.mp3`,
    // Line Infantry: young, thin, panicked — a rising cry snapped short.
    p: `${CRY_BASE}/d32a7184-f41f-4ad9-a61b-a4dc386648e2.mp3`,
  },
};

/** One selectable civilisation: sculpts, clips, arms, names and voices. */
export interface ArmySkin {
  id: ArmySkinId;
  /** Army name, as shown in the settings panel. */
  label: string;
  /** One line of flavour under the name. */
  blurb: string;
  /** Rank names, longest to shortest silhouette — used by the crests. */
  ranks: Record<PieceKind, string>;
  /** Procedural weapon family the figures are armed from. */
  arsenal: ArsenalId;
  /**
   * The side this army was painted for. When both sides wear the same skin the
   * native one keeps its own textures and the other is re-tinted into livery,
   * so the two armies never become indistinguishable.
   */
  native: Faction;
  still: Roster<string>;
  animated: Roster<PieceAnimationSet>;
  cries: Record<PieceKind, string>;
}

export const ARMY_SKINS: Record<ArmySkinId, ArmySkin> = {
  ivory: {
    id: "ivory",
    label: "Ivory Kingdom",
    blurb: "Medieval Europe — plate, heater shields and witchfire.",
    ranks: { k: "King", q: "Queen", b: "Mage", n: "Knight", r: "Guardian", p: "Footman" },
    arsenal: "kingdom",
    native: "w",
    still: STILL_MODELS.ivory,
    animated: ANIMATED_MODELS.ivory,
    cries: DEATH_CRIES.ivory,
  },
  sun: {
    id: "sun",
    label: "Sun Empire",
    blurb: "Obsidian, jade and quetzal plumes under a stepped sun.",
    ranks: { k: "Emperor", q: "Priestess", b: "Serpent Priest", n: "Jaguar Warrior", r: "Temple Guardian", p: "Eagle Warrior" },
    arsenal: "sun",
    native: "b",
    still: STILL_MODELS.sun,
    animated: ANIMATED_MODELS.sun,
    cries: DEATH_CRIES.sun,
  },
  empire: {
    id: "empire",
    label: "Grande Armée",
    blurb: "Napoleonic France — navy and gold, rifles, muskets and cannon.",
    ranks: {
      k: "Napoléon",
      q: "Imperial Commander",
      b: "Marshal-Tirailleur",
      n: "Cuirassier",
      r: "Artillery Guard",
      p: "Line Infantry",
    },
    arsenal: "empire",
    native: "b",
    still: STILL_MODELS.empire,
    animated: ANIMATED_MODELS.empire,
    cries: DEATH_CRIES.empire,
  },
};

/** Presentation order of the skins in the settings panel. */
export const ARMY_SKIN_ORDER: ArmySkinId[] = ["ivory", "sun", "empire"];

/** Which army each side musters until the player says otherwise. */
export const DEFAULT_ARMY_SKINS: Record<Faction, ArmySkinId> = { w: "ivory", b: "sun" };

/**
 * Black powder, recorded rather than synthesised. Each barrel has its own take:
 * the synthesised voices in the mixer are still played underneath for the
 * sub-bass and the timing, but what the ear hears on top is a real report.
 * Streamed lazily after the mixer unlocks — only the Grande Armée needs them.
 *
 * These four barrels were re-recorded to start *on the transient*. The previous
 * set was generated as ordinary sound effects, which meant each one opened with
 * room tone before the shot: the Charleville had 54ms of silence in front of its
 * crack and the rifled barrel did not peak until 171ms in. Played from sample
 * zero on the frame the hammer fell, the report therefore arrived three to ten
 * frames *after* the muzzle flash — the shot was seen, then heard. The mixer now
 * also finds each take's true onset at decode time (see `analyseTake`), so a
 * regenerated clip that still carries a lead-in is trimmed rather than trusted.
 */
export const GUN_AUDIO_URLS = {
  /** The Emperor's flintlock: a dry, bright crack. */
  pistol: `${CRY_BASE}/a8cbcada-acce-4a51-8690-974d0e50a68a.mp3`,
  /** A Charleville musket in a stone hall: crack over a chest thump. */
  musket: `${CRY_BASE}/b042be28-3bb5-48e8-b0a5-ef7a1fbec2d5.mp3`,
  /** The marksman's rifled barrel: a tighter, thinner whip-crack. */
  rifle: `${CRY_BASE}/9ab8b947-9b2c-4cfc-8b26-653be55a6451.mp3`,
  /** The battery: a boom with the carriage running back over stone under it. */
  cannon: `${CRY_BASE}/65e94019-873c-478d-a688-e76d01bb73a3.mp3`,
  /** The ball arriving: ricochet whine cut short by a thud into a body. */
  impact: `${CRY_BASE}/a0f8c443-5140-41f8-b21c-770450ae9751.mp3`,
} as const;

/** Which recorded barrel each rank of the Grande Armée fires. */
export type GunVoice = "pistol" | "musket" | "rifle" | "cannon";

/**
 * One battleground's music, with the three things about a generated track that
 * cannot be trusted to be authored correctly.
 */
export interface ArenaScore {
  url: string;
  /**
   * Integrated loudness in LUFS, measured off the delivered MP3 (ffmpeg
   * `ebur128`). The mixer levels every score to the same loudness from this,
   * because the generator's own level has nothing to do with the design.
   */
  loudness: number;
  /** Seconds of silence at the head, skipped on every pass. */
  lead: number;
  /** Seconds of silence at the tail, cut off the loop window. */
  tail: number;
}

/**
 * A score per battleground. Measured, not trusted:
 *
 * - **Loudness** spread across the tracks is **20.1 LU** — from -13.3 LUFS
 *   (Winter Siege) to -33.4 LUFS (Dune Bastion). Under one shared bed gain, the
 *   map with the loudest generation would simply be the map with the loudest
 *   music, so each track is normalised to the -18.5 LUFS of the original dusk
 *   score the whole mix was balanced against.
 * - **Head and tail silence** are not there by agreement either: the tail runs
 *   from 0.00 s (Stormwatch, still playing at the last sample) to 2.20 s (Dawn
 *   Court). Looped naively, one map restarts with a two-second hole in it and
 *   another slams back to bar one at full level. The mixer loops inside
 *   `[lead, duration - tail]` and crossfades that window into itself.
 *
 * Silence bounds were found with 50 ms windows against a -50 dBFS floor.
 */
export const ARENA_SCORES: Record<ArenaTheme, ArenaScore> = {
  /** Bone flute and log drums under a wet canopy. */
  jungle: {
    url: "https://r2-pub.rork.com/generated-audio/g9111r67kl6tq85g540sd/a33c5628-c5a1-442d-a13f-6fc2b8c14c31.mp3",
    loudness: -13.5,
    lead: 0.05,
    tail: 1.5,
  },
  /** Vielle, harp and a recorder in the morning air. */
  dawn: {
    url: "https://r2-pub.rork.com/generated-audio/g9111r67kl6tq85g540sd/2ecff03e-6efb-4939-a03e-908b22c44ef4.mp3",
    loudness: -21,
    lead: 0,
    tail: 2.2,
  },
  /** Oud, ney and frame drum over hot stone. */
  sands: {
    url: "https://r2-pub.rork.com/generated-audio/g9111r67kl6tq85g540sd/f8a1c966-f6a4-4076-8890-b7a3de52176b.mp3",
    loudness: -33.4,
    lead: 0.05,
    tail: 0.25,
  },
  /** Nyckelharpa drone and glass bells over snow. */
  frost: {
    url: "https://r2-pub.rork.com/generated-audio/g9111r67kl6tq85g540sd/a396e898-7933-4eaa-b09e-c05443e9fa07.mp3",
    loudness: -13.3,
    lead: 0.1,
    tail: 0,
  },
  /** Tremolo cello and far-off thunder. */
  storm: {
    url: "https://r2-pub.rork.com/generated-audio/g9111r67kl6tq85g540sd/38f30f11-e58a-42ab-9259-2915cac984cd.mp3",
    loudness: -15.1,
    lead: 0,
    tail: 0,
  },
  /**
   * The original siege score. Every other track is levelled against this one,
   * because this is the one the whole mix — knocks, cries, bells, gunfire — was
   * balanced underneath.
   */
  dusk: {
    url: "https://r2-pub.rork.com/generated-audio/g9111r67kl6tq85g540sd/3fbe58de-9d38-4d91-a002-794d0e979eb0.mp3",
    loudness: -18.5,
    lead: 0.8,
    tail: 0.8,
  },
};

/**
 * The painted card for each battleground, shown in the muster picker.
 *
 * The picker used to be a row of CSS gradients, which is an honest summary of a
 * map's *palette* and says nothing about the place: two blues and a grey cannot
 * tell a snowfield from a rainstorm, and the flat swatch gave no reason to try a
 * map the player had not picked before. These are painted establishing shots of
 * the same grounds, in one series so the row reads as a set rather than a
 * handful of stock images.
 *
 * They are decoration, not information — the label under each card is what
 * actually names the map — so they are lazily loaded and simply absent until
 * they arrive, with the old gradient still painted underneath as the backdrop.
 */
export const ARENA_CARDS: Record<ArenaTheme, string> = {
  jungle: "https://r2-pub.rork.com/projects/g9111r67kl6tq85g540sd/assets/20992cc1-d88b-4ed9-8784-cea941f0405b.png",
  dawn: "https://r2-pub.rork.com/projects/g9111r67kl6tq85g540sd/assets/6a4b6904-4cd3-4e9e-b10f-21647237de73.png",
  sands: "https://r2-pub.rork.com/projects/g9111r67kl6tq85g540sd/assets/74ff339e-5349-485c-a6aa-3ea838b2a4b8.png",
  frost: "https://r2-pub.rork.com/projects/g9111r67kl6tq85g540sd/assets/74e91d9b-4371-4237-a718-d66d8a0b6656.png",
  storm: "https://r2-pub.rork.com/projects/g9111r67kl6tq85g540sd/assets/5effa91a-f969-422c-9c95-4be195282998.png",
  dusk: "https://r2-pub.rork.com/projects/g9111r67kl6tq85g540sd/assets/8b01e0a2-5ce2-4d31-aef3-7cb3521c467f.png",
};

/**
 * The painted banner for each army, shown above its name in the muster picker.
 *
 * Same argument as {@link ARENA_CARDS}, one level down: a livery gradient is an
 * honest summary of an army's *colours* and says nothing about who these people
 * are — navy-white-red reads as a flag, not as a rank of shakos behind powder
 * smoke. These are painted in the same series as the battleground cards so the
 * whole muster panel reads as one set.
 *
 * Decoration, not information: the gradient stays underneath as the swatch's
 * background, and the label under each card is what actually names the army, so
 * a card whose painting has not arrived yet still reads correctly.
 */
export const ARMY_CARDS: Record<ArmySkinId, string> = {
  ivory: "https://r2-pub.rork.com/projects/g9111r67kl6tq85g540sd/assets/dc88fa56-b565-4cf8-aa98-9997c8685e5d.png",
  sun: "https://r2-pub.rork.com/projects/g9111r67kl6tq85g540sd/assets/3315dcf5-50c4-455b-bf13-aec6ff2ca2fd.png",
  empire: "https://r2-pub.rork.com/projects/g9111r67kl6tq85g540sd/assets/ea0a3e42-30f9-4a74-be8c-e74ea4513d1a.png",
};

/**
 * A sculpted landmark for one map: where it stands, how big, and which way its
 * face is turned.
 */
export interface LandmarkSource {
  url: string;
  /** Height on the field, in metres. The GLB's own scale is ignored. */
  height: number;
  /** How many copies stand on the ring. */
  count: number;
  /** Where the first copy sits, in radians around the board. */
  bearing: number;
  /**
   * Yaw correction, in radians, applied after the copy is turned to face the
   * board — a generated model's "front" is whatever the generator made it, so
   * this is measured from the finished GLB rather than assumed.
   */
  yaw: number;
}

/**
 * The landmark each map is built around.
 *
 * The dressing gives a map its ground cover; this gives it a *place*. See
 * `scene/landmarks.ts` for why a scatter of instanced blobs was never going to
 * be enough on its own, and how far out these stand.
 */
export const ARENA_LANDMARKS: Partial<Record<ArenaTheme, LandmarkSource>> = {
  /** A moss-eaten feathered-serpent head, glyphs cut along the jaw. */
  jungle: {
    url: `${MODEL_BASE}/9dd00cff-205c-4271-8c3d-81f19a5e7312.glb`,
    height: 13,
    count: 2,
    bearing: 2.1,
    yaw: 0,
  },
  /** A round watchtower with half its battlements fallen away. */
  dawn: {
    url: `${MODEL_BASE}/2dc211ea-0f2c-4f11-a403-585899dcf963.glb`,
    height: 21,
    count: 2,
    bearing: 0.6,
    yaw: 0,
  },
  /** A crowned colossus buried to the shoulders in sand. */
  sands: {
    url: `${MODEL_BASE}/b6b12786-f7df-4b84-b396-180f9e927376.glb`,
    height: 17,
    count: 2,
    bearing: 3.5,
    yaw: 0,
  },
  /**
   * A longship wrecked in the drifts, dragon prow still up. The only sculpt of
   * the six whose front is not local +Z — the generator reports `negativeX` —
   * so it carries the quarter-turn that puts its prow toward the board.
   */
  frost: {
    url: `${MODEL_BASE}/62a4c668-34ba-4fd0-947c-8ad16a07b0d3.glb`,
    height: 11,
    count: 2,
    bearing: 1.2,
    yaw: Math.PI / 2,
  },
  /** A beacon tower, roof torn off, fire basket open to the rain. */
  storm: {
    url: `${MODEL_BASE}/9a03ed06-8aa0-4006-822e-75c3a176a6dd.glb`,
    height: 23,
    count: 2,
    bearing: 4.4,
    yaw: 0,
  },
  /** The gatehouse the siege went through: portcullis crooked, stone burnt. */
  dusk: {
    url: `${MODEL_BASE}/aacc3a14-3a74-4e3b-be87-319278f95d42.glb`,
    height: 16,
    count: 2,
    bearing: 5.2,
    yaw: 0,
  },
};

export const AUDIO_URLS = {
  ambience: "https://r2-pub.rork.com/generated-audio/g9111r67kl6tq85g540sd/e62d5bb9-8c84-4464-8696-dbcf975f938b.mp3",
  tension: "https://r2-pub.rork.com/generated-audio/g9111r67kl6tq85g540sd/00baae5a-fde3-478a-8190-b1ad14d2e96d.mp3",
  place: "https://r2-pub.rork.com/generated-audio/g9111r67kl6tq85g540sd/73f19d09-0275-4c4b-87cd-eeeed26a616b.mp3",
  capture: "https://r2-pub.rork.com/generated-audio/g9111r67kl6tq85g540sd/64ee8170-b796-413f-8249-f1deb7803393.mp3",
  check: "https://r2-pub.rork.com/generated-audio/g9111r67kl6tq85g540sd/20ebb41c-0b20-4b4b-8c75-5f78541722d3.mp3",
  fanfare: "https://r2-pub.rork.com/generated-audio/g9111r67kl6tq85g540sd/c89fa5ef-7904-4a5f-899e-e1973b13b30f.mp3",
} as const;
