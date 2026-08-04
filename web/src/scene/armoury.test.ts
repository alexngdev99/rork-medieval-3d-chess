import * as THREE from "three";

import { fitArmSculpt, type ArmSculptSource } from "./armoury";

/**
 * The fitter is the one piece of the armoury that has to be right without anyone
 * looking at it: a generated weapon arrives in an arbitrary pose, and if the fit
 * is wrong the figure holds its musket by the bayonet. These fakes stand in for
 * the real sculpts — built from primitives at a known shape, then thrown into a
 * random orientation exactly as the generator hands the real ones back.
 */

/** Every vertex of a fitted prop, in the frame the fist sees. */
function vertices(object: THREE.Object3D): THREE.Vector3[] {
  object.updateMatrixWorld(true);
  const points: THREE.Vector3[] = [];
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute("position");
    for (let index = 0; index < position.count; index += 1) {
      points.push(new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld));
    }
  });
  return points;
}

/** Widest cross-section within `span` of one end of the weapon. */
function endSpan(points: THREE.Vector3[], from: "bottom" | "top", span: number): number {
  const heights = points.map((point) => point.y);
  const low = Math.min(...heights);
  const high = Math.max(...heights);
  const slice = points.filter((point) =>
    from === "bottom" ? point.y < low + span : point.y > high - span,
  );
  const box = new THREE.Box3().setFromPoints(slice);
  const size = new THREE.Vector3();
  box.getSize(size);
  return Math.max(size.x, size.z);
}

function fitted(scene: THREE.Object3D, source: ArmSculptSource): {
  points: THREE.Vector3[];
  grip: number;
  muzzle: number | null;
} {
  const sculpt = fitArmSculpt(scene, source);
  const holder = new THREE.Group();
  holder.add(sculpt.group);
  return { points: vertices(holder), grip: sculpt.grip, muzzle: sculpt.muzzle };
}

/** A sword: long tapering blade, wide guard, short grip — lying on a diagonal. */
function fakeSword(): THREE.Object3D {
  const group = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.03, 1.2, 4));
  blade.rotation.z = -Math.PI / 2;
  blade.position.set(0.62, 0, 0);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.24, 0.05));
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.05));
  grip.position.set(-0.1, 0, 0);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6));
  pommel.position.set(-0.2, 0, 0);
  group.add(blade, guard, grip, pommel);
  group.rotation.set(0.4, 0.8, 1.1);
  return group;
}

/**
 * A sabre: fat hilt, and a blade of segments swept toward +X so the belly of the
 * curve is on a known side — the shape `curvedBlade` authors. `spin` is an extra
 * half turn about its own length, which is the flip that decides which way the
 * narrow principal axis comes back out of the eigen solver.
 */
function fakeSabre(spin: boolean): THREE.Object3D {
  const blade = new THREE.Group();
  let x = 0;
  let y = 0.16;
  for (let index = 0; index < 6; index += 1) {
    const angle = 0.34 * (index / 6);
    const segment = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.014));
    segment.position.set(x, y + 0.08, 0);
    segment.rotation.z = -angle;
    blade.add(segment);
    x += Math.sin(angle) * 0.16;
    y += Math.cos(angle) * 0.16;
  }
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03));
  grip.position.set(0, 0.07, 0);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.04));
  guard.position.set(0, 0.155, 0);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6));
  blade.add(grip, guard, pommel);

  const group = new THREE.Group();
  group.add(blade);
  if (spin) blade.rotation.y = Math.PI;
  // Handed back lying on a diagonal, the way the generator does.
  group.rotation.set(0.5, -1.2, 0.9);
  return group;
}

/** How far the middle of a fitted blade stands off its own chord, along X. */
function bellySide(points: THREE.Vector3[], length: number): number {
  const band = (from: number, to: number): { x: number; y: number } => {
    const slice = points.filter((point) => point.y >= length * from && point.y < length * to);
    const count = Math.max(1, slice.length);
    return {
      x: slice.reduce((sum, point) => sum + point.x, 0) / count,
      y: slice.reduce((sum, point) => sum + point.y, 0) / count,
    };
  };
  const ricasso = band(0.3, 0.45);
  const middle = band(0.6, 0.75);
  const point = band(0.92, 1.01);
  const along = (middle.y - ricasso.y) / (point.y - ricasso.y);
  return middle.x - (ricasso.x + (point.x - ricasso.x) * along);
}

/** A long arm: thin barrel, deep stock and a trigger guard below the bore. */
function fakeMusket(): THREE.Object3D {
  const group = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 1, 8));
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(0.5, 0, 0);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.13, 0.05));
  stock.position.set(-0.12, -0.055, 0);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.03));
  guard.position.set(0.04, -0.09, 0);
  group.add(barrel, stock, guard);
  group.rotation.set(0.2, -0.6, 0.9);
  return group;
}

/**
 * The same long arm with a slack sling, which is what the real Versailles rifle
 * arrived as: a strap looping far clear of the underside — 0.34 of the weapon's
 * length on a piece only 0.09 thick laterally. All that loop is on the *guard*
 * side, so it drags the cloud's centroid past the bore and any roll test read
 * off the centroid picks the wrong side and fits the gun upside down.
 */
function fakeSlungMusket(): THREE.Object3D {
  const group = new THREE.Group();
  group.add(fakeMusket().children[0]);
  const musket = fakeMusket();
  for (const part of [...musket.children]) group.add(part);
  const sling = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.008, 6, 20, Math.PI * 1.3));
  sling.rotation.set(0, Math.PI / 2, 0.6);
  sling.position.set(0.1, -0.2, 0);
  group.add(sling);
  group.rotation.set(-0.7, 1.4, 0.35);
  return group;
}

describe("fitArmSculpt", () => {
  it("stands a diagonal sword on its butt with the point up", () => {
    const source: ArmSculptSource = { url: "", length: 0.72, grip: 0.11, family: "blade" };
    const { points, grip, muzzle } = fitted(fakeSword(), source);
    const heights = points.map((point) => point.y);

    expect(Math.min(...heights)).toBeCloseTo(0, 2);
    expect(Math.max(...heights)).toBeCloseTo(source.length, 2);
    // The hilt is the fat end and it has to be the one in the fist.
    expect(endSpan(points, "top", 0.07)).toBeLessThan(endSpan(points, "bottom", 0.07));
    expect(grip).toBeCloseTo(0.11 * 0.72, 4);
    expect(muzzle).toBeNull();
  });

  it("keeps a blade's flat across the swing", () => {
    const source: ArmSculptSource = { url: "", length: 0.72, grip: 0.11, family: "blade" };
    const { points } = fitted(fakeSword(), source);
    const blade = points.filter((point) => point.y > 0.3);
    const box = new THREE.Box3().setFromPoints(blade);
    const size = new THREE.Vector3();
    box.getSize(size);
    // Width lies on X, thickness on Z — the convention the procedural blades use,
    // so a sculpted sabre swings edge-first like a built one.
    expect(size.x).toBeGreaterThan(size.z);
  });

  it("puts a sabre's belly on +X whichever way it arrives", () => {
    const source: ArmSculptSource = { url: "", length: 0.54, grip: 0.11, family: "blade" };
    // The flat is across the swing either way round, so the eigen solver is free
    // to hand back either sign — and on a curved blade that sign is the whole
    // silhouette: bowed the wrong way the point curls back over its owner's head
    // instead of sweeping away from him. The fit has to settle it by measurement.
    for (const spin of [false, true]) {
      const { points } = fitted(fakeSabre(spin), source);
      expect(bellySide(points, source.length)).toBeGreaterThan(0.004 * source.length);
    }
  });

  it("levels a long arm barrel-up with the trigger guard forward", () => {
    const source: ArmSculptSource = {
      url: "",
      length: 0.86,
      grip: 0.19,
      muzzle: 0.8,
      family: "firearm",
    };
    const { points, grip, muzzle } = fitted(fakeMusket(), source);
    const heights = points.map((point) => point.y);

    expect(Math.min(...heights)).toBeCloseTo(0, 2);
    expect(Math.max(...heights)).toBeCloseTo(source.length, 2);
    expect(grip).toBeCloseTo(0.19 * 0.86, 4);
    expect(muzzle).toBeCloseTo(0.8 * 0.86, 4);

    // The barrel is the thin end, and it must come out on top: a gun fitted upside
    // down is a figure holding its musket by the muzzle.
    expect(endSpan(points, "top", 0.08)).toBeLessThan(endSpan(points, "bottom", 0.08));

    // And the roll: the stock and trigger guard hang off the bore, so the barrel
    // itself has to end up behind the prop's front (-Z). That is what puts the
    // guard toward the figure's front, which is what `gunOrientation` assumes.
    const barrel = points.filter((point) => point.y > source.length * 0.7);
    const barrelZ = barrel.reduce((sum, point) => sum + point.z, 0) / barrel.length;
    expect(barrelZ).toBeLessThan(0);
  });

  it("keeps a slung long arm the right way up", () => {
    const source: ArmSculptSource = {
      url: "",
      length: 0.85,
      grip: 0.3,
      muzzle: 0.985,
      family: "firearm",
    };
    const { points } = fitted(fakeSlungMusket(), source);

    // The bore stays above the stock however far the sling loops off the gun:
    // the roll is read from the step between the two, not from the centroid.
    const bore = points.filter((point) => point.y > source.length * 0.86);
    const stock = points.filter((point) => point.y < source.length * 0.2);
    const meanZ = (slice: THREE.Vector3[]): number =>
      slice.reduce((sum, point) => sum + point.z, 0) / Math.max(1, slice.length);
    expect(meanZ(bore)).toBeLessThan(meanZ(stock));
  });
});
