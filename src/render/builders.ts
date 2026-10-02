import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLS, ROWS, FloorDef, ProductDef, ELEVATOR, ENTRANCE } from '../data/floors';
import { MALL_MAP } from '../data/mallMap';
import { makeTextSprite } from './text';

// Every object in the world is built from simple blocks so it reads as chunky 3D.

export const WALL_H = 2.4;

// Glossy toy plastic: smooth shading, a little clearcoat, reflections from the environment map.
const matCache = new Map<string, THREE.MeshPhysicalMaterial>();
export function mat(color: number, opts: { roughness?: number; metalness?: number; flat?: boolean; transparent?: boolean; opacity?: number; emissive?: number; clearcoat?: number } = {}): THREE.MeshPhysicalMaterial {
  const key = JSON.stringify([color, opts]);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({
      color,
      roughness: opts.roughness ?? 0.42,
      metalness: opts.metalness ?? 0.0,
      clearcoat: opts.clearcoat ?? 0.35,
      clearcoatRoughness: 0.35,
      flatShading: false,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissive ? 0.9 : 1,
      envMapIntensity: 0.7,
    });
    matCache.set(key, m);
  }
  return m;
}

// Rounded block, the basic building unit of everything in the mall.
export function roundedBox(w: number, h: number, d: number, radius?: number): THREE.BufferGeometry {
  const r = radius ?? Math.min(0.12, Math.min(w, h, d) * 0.3);
  return new RoundedBoxGeometry(w, h, d, 3, r);
}

export function box(w: number, h: number, d: number, color: number, opts?: Parameters<typeof mat>[1]): THREE.Mesh {
  const m = new THREE.Mesh(roundedBox(w, h, d), mat(color, opts));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// A floor tile texture: soft rounded tile with a light grout line, so floors read as real tiles.
const floorTexCache = new Map<string, THREE.CanvasTexture>();
export function floorTexture(color: number, grout: number): THREE.CanvasTexture {
  const key = color + ':' + grout;
  let t = floorTexCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#' + grout.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.beginPath();
  ctx.roundRect(3, 3, 122, 122, 10);
  ctx.fill();
  const g = ctx.createLinearGradient(0, 0, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.10)');
  g.addColorStop(1, 'rgba(0,0,0,0.06)');
  ctx.fillStyle = g;
  ctx.fill();
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  floorTexCache.set(key, t);
  return t;
}

export function tileX(col: number): number { return col + 0.5; }
export function tileZ(row: number): number { return row + 0.5; }

export function tileAt(col: number, row: number): string {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return '#';
  return MALL_MAP[row][col];
}

export function isSolidTile(ch: string): boolean {
  return ch === '#' || ch === 'E' || ch === 'F' || ch === 'B' || ch === 'P' || ch === 'K';
}

function shade(color: number, k: number): number {
  const c = new THREE.Color(color);
  c.multiplyScalar(k);
  return c.getHex();
}

// ---------------------------------------------------------------- static world
export interface FadeWall { mesh: THREE.Mesh; col: number; row: number; }

export interface World { group: THREE.Group; fadeWalls: FadeWall[]; }

export function buildWorld(floor: FloorDef): World {
  const g = new THREE.Group();
  const fadeWalls: FadeWall[] = [];

  // the ground the whole mall sits on, and a tall backdrop so the camera never sees the void
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat(0x9fd3a6, { roughness: 0.9, clearcoat: 0 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(COLS / 2, -0.05, ROWS / 2);
  ground.receiveShadow = true;
  g.add(ground);
  const backdrop = box(COLS + 40, WALL_H * 2.2, 6, shade(floor.wallColor, 0.85));
  backdrop.position.set(COLS / 2, WALL_H * 1.1, -3);
  g.add(backdrop);
  for (const x of [-6, COLS + 6]) {
    const side = box(6, WALL_H * 2.2, ROWS + 40, shade(floor.wallColor, 0.85));
    side.position.set(x, WALL_H * 1.1, ROWS / 2);
    g.add(side);
  }

  // floors: merge planes per colour
  const buckets = new Map<number, THREE.BufferGeometry[]>();
  const addTile = (col: number, row: number, color: number) => {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(tileX(col), 0, tileZ(row));
    if (!buckets.has(color)) buckets.set(color, []);
    buckets.get(color)!.push(geo);
  };
  const wallGeos: THREE.BufferGeometry[] = [];
  const roofGeos: THREE.BufferGeometry[] = [];
  const concourseA = 0xecdcc6;
  const concourseB = 0xdfcdb4;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = tileAt(c, r);
      if (ch === '#' || ch === 'L') {
        const roof = new THREE.PlaneGeometry(1, 1);
        roof.rotateX(-Math.PI / 2);
        roof.translate(tileX(c), WALL_H, tileZ(r));
        roofGeos.push(roof);
        // only draw wall blocks that touch something you can see
        const neighbours = [tileAt(c + 1, r), tileAt(c - 1, r), tileAt(c, r + 1), tileAt(c, r - 1)];
        if (neighbours.every((n) => n === '#' || n === 'L')) continue;
        const south = tileAt(c, r + 1);
        if (south !== '#' && south !== 'L' && r < ROWS - 1) {
          // this wall can stand between the camera and the player: give it its own mesh so it can fade
          const m = new THREE.Mesh(roundedBox(1, WALL_H, 1, 0.1), mat(floor.wallColor, { roughness: 0.5 }).clone());
          m.material.transparent = true;
          m.position.set(tileX(c), WALL_H / 2, tileZ(r));
          m.castShadow = true;
          m.receiveShadow = true;
          g.add(m);
          fadeWalls.push({ mesh: m, col: c, row: r });
          continue;
        }
        const geo = roundedBox(1, WALL_H, 1, 0.1);
        geo.translate(tileX(c), WALL_H / 2, tileZ(r));
        wallGeos.push(geo);
        continue;
      }
      if (ch === 's' || ch === 'e') addTile(c, r, (c + r) % 2 === 0 ? floor.floorColor : floor.floorAlt);
      else if (ch === 'S' || ch === 'd') addTile(c, r, floor.storageColor);
      else addTile(c, r, (c + r) % 2 === 0 ? concourseA : concourseB);
      // things that stand on tiles
      if (ch === 'F') continue; // fountain is one object, added below
      if (ch === 'B') g.add(makeBench().translateX(tileX(c)).translateZ(tileZ(r)));
      if (ch === 'P') g.add(makePlanter().translateX(tileX(c)).translateZ(tileZ(r)));
      if (ch === 'K') g.add(makeKiosk().translateX(tileX(c)).translateZ(tileZ(r)));
      if (ch === 'X') {
        const matMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(0x7a3b3b, { flat: false }));
        matMesh.rotation.x = -Math.PI / 2;
        matMesh.position.set(tileX(c), 0.01, tileZ(r));
        matMesh.receiveShadow = true;
        g.add(matMesh);
      }
    }
  }
  for (const [color, geos] of buckets) {
    const merged = mergeGeometries(geos, false)!;
    const m = new THREE.MeshPhysicalMaterial({ map: floorTexture(color, shade(color, 0.78)), roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4, envMapIntensity: 0.35 });
    const mesh = new THREE.Mesh(merged, m);
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  if (wallGeos.length) {
    const walls = new THREE.Mesh(mergeGeometries(wallGeos, false)!, mat(floor.wallColor, { roughness: 0.5 }));
    walls.castShadow = true;
    walls.receiveShadow = true;
    g.add(walls);
  }
  // rooftop vents and skylights on the big blocks
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let r = 2; r < ROWS - 2; r++) for (let c = 2; c < COLS - 2; c++) {
    const deep = [tileAt(c, r), tileAt(c + 1, r), tileAt(c - 1, r), tileAt(c, r + 1), tileAt(c, r - 1), tileAt(c + 1, r + 1), tileAt(c - 1, r - 1)].every((t) => t === '#');
    if (!deep || rnd() > 0.08) continue;
    const kind = rnd();
    if (kind < 0.5) {
      const vent = box(0.9, 0.5, 0.9, 0xd9dde3, { roughness: 0.5 });
      vent.position.set(tileX(c), WALL_H + 0.25, tileZ(r));
      g.add(vent);
      const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 16), mat(0x5c6670));
      fan.position.set(tileX(c), WALL_H + 0.55, tileZ(r));
      g.add(fan);
    } else {
      const sky = box(1.6, 0.25, 1.2, 0x9fd8ff, { transparent: true, opacity: 0.75, roughness: 0.05, clearcoat: 1 });
      sky.position.set(tileX(c) + 0.5, WALL_H + 0.12, tileZ(r));
      g.add(sky);
    }
  }
  if (roofGeos.length) {
    const roofs = new THREE.Mesh(mergeGeometries(roofGeos, false)!, mat(shade(floor.wallColor, 0.62), { roughness: 0.85, clearcoat: 0 }));
    roofs.receiveShadow = true;
    g.add(roofs);
  }

  // fountain (4x4 block of F): find its bounds
  let fMin: [number, number] | null = null;
  let fMax: [number, number] | null = null;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (tileAt(c, r) === 'F') {
    if (!fMin) fMin = [c, r];
    fMax = [c, r];
  }
  if (fMin && fMax) {
    const cx = (fMin[0] + fMax[0] + 1) / 2;
    const cz = (fMin[1] + fMax[1] + 1) / 2;
    const size = fMax[0] - fMin[0] + 1;
    g.add(makeFountain(size).translateX(cx).translateZ(cz));
  }

  // elevator
  g.add(makeElevator().translateX(ELEVATOR.col + ELEVATOR.width / 2).translateZ(tileZ(ELEVATOR.row)));

  // shopfront windows and awnings on the empty storefronts that face the concourse
  for (let r = 1; r < ROWS - 1; r++) {
    let c = 0;
    while (c < COLS) {
      const facade = (x: number) => (tileAt(x, r) === '#' || tileAt(x, r) === 'L') && tileAt(x, r + 1) === '.' && tileAt(x, r - 1) === '#';
      if (!facade(c)) { c++; continue; }
      let end = c;
      while (end + 1 < COLS && facade(end + 1)) end++;
      const len = end - c + 1;
      if (len >= 6) {
        // split a long facade into separate shops, each with its own awning colour
        const awningColors = [0xff6b6b, 0x2ec4b6, 0xffbf47, 0x8f7bff];
        const shops = Math.max(1, Math.round(len / 10));
        const shopLen = len / shops;
        for (let i = 0; i < shops; i++) {
          const x0 = c + i * shopLen;
          const cx = x0 + shopLen / 2;
          const glass = new THREE.Mesh(roundedBox(shopLen - 1.4, 1.45, 0.08, 0.03), mat(0xa8dcff, { transparent: true, opacity: 0.6, roughness: 0.05, metalness: 0.1, clearcoat: 1 }));
          glass.position.set(cx, 0.95, r + 1.04);
          g.add(glass);
          const frame = box(shopLen - 1.2, 0.14, 0.14, 0xffffff);
          frame.position.set(cx, 1.75, r + 1.06);
          g.add(frame);
          const color = awningColors[i % awningColors.length];
          const awning = box(shopLen - 0.8, 0.1, 0.55, color);
          awning.position.set(cx, WALL_H - 0.25, r + 1.22);
          awning.rotation.x = 0.3;
          g.add(awning);
          const stripes = Math.max(2, Math.round(shopLen / 2));
          for (let k = 0; k < stripes; k++) {
            const stripe = box(0.35, 0.04, 0.5, 0xffffff, { clearcoat: 0 });
            stripe.position.set(cx - (shopLen - 0.8) / 2 + (shopLen - 0.8) * (k + 0.5) / stripes, WALL_H - 0.19, r + 1.22);
            stripe.rotation.x = 0.3;
            g.add(stripe);
          }
          // a pillar between shops
          if (i > 0) {
            const pillar = box(0.5, WALL_H, 0.5, shade(floor.wallColor, 0.8));
            pillar.position.set(x0, WALL_H / 2, r + 0.75);
            g.add(pillar);
          }
        }
      }
      c = end + 1;
    }
  }

  // store sign above the doorway, and "for lease" signs
  const sign = makeTextSprite(floor.name.toUpperCase(), { size: 46, color: '#ffffff', bg: '#' + floor.uniformColor.toString(16).padStart(6, '0'), height: 0.5 });
  sign.position.set(ENTRANCE.col + 1, WALL_H + 0.45, tileZ(ENTRANCE.row) + 0.2);
  g.add(sign);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (tileAt(c, r) === 'L') {
    const s = makeTextSprite('FOR LEASE', { size: 36, color: '#3b3b3b', bg: '#f1ede4', height: 0.45 });
    s.position.set(tileX(c), 1.1, tileZ(r) + 0.75);
    g.add(s);
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (tileAt(c, r) === 'X' && tileAt(c - 1, r) !== 'X') {
    const s = makeTextSprite('MALL EXIT', { size: 32, color: '#ffffff', bg: '#7a3b3b', height: 0.42 });
    s.position.set(tileX(c) + 0.5, 1.9, tileZ(r) - 0.4);
    g.add(s);
  }
  const storageSign = makeTextSprite('STORAGE', { size: 30, color: '#ffffff', bg: '#4a4a4a', height: 0.38 });
  storageSign.position.set(tileX(7), 2.0, tileZ(4) + 0.1);
  g.add(storageSign);
  return { group: g, fadeWalls };
}

function makeBench(): THREE.Group {
  const g = new THREE.Group();
  const seat = box(0.9, 0.08, 0.45, 0x8b5a2b);
  seat.position.y = 0.45;
  const back = box(0.9, 0.4, 0.07, 0x8b5a2b);
  back.position.set(0, 0.7, -0.2);
  g.add(seat, back);
  for (const x of [-0.38, 0.38]) {
    const leg = box(0.08, 0.45, 0.4, 0x3b3b3b, { metalness: 0.4, roughness: 0.5 });
    leg.position.set(x, 0.22, 0);
    g.add(leg);
  }
  return g;
}

function makePlanter(): THREE.Group {
  const g = new THREE.Group();
  const pot = box(0.7, 0.5, 0.7, 0xb5573a);
  pot.position.y = 0.25;
  const soil = box(0.6, 0.06, 0.6, 0x3f2a1a);
  soil.position.y = 0.52;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.6, 6), mat(0x6b4423));
  trunk.position.y = 0.8;
  trunk.castShadow = true;
  const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 3), mat(0x3f9d4a));
  leaves.position.y = 1.3;
  leaves.castShadow = true;
  const leaves2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 3), mat(0x4fb85a));
  leaves2.position.set(0.2, 1.55, 0.1);
  leaves2.castShadow = true;
  g.add(pot, soil, trunk, leaves, leaves2);
  return g;
}

function makeKiosk(): THREE.Group {
  const g = new THREE.Group();
  const cart = box(1.3, 0.8, 0.8, 0xffffff);
  cart.position.y = 0.55;
  const skirt = box(1.32, 0.3, 0.82, 0xff6b6b);
  skirt.position.y = 0.3;
  for (const x of [-0.45, 0.45]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 16), mat(0x222222));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.16, 0.42);
    g.add(wheel);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8), mat(0xdddddd, { metalness: 0.5, roughness: 0.3 }));
  pole.position.y = 1.5;
  const umbrella = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.45, 10), mat(0xffd166));
  umbrella.position.y = 2.3;
  umbrella.castShadow = true;
  const treats = makeTextSprite('🥨 SNACKS', { size: 30, color: '#1b1f2a', bg: '#ffffff', height: 0.34 });
  treats.position.set(0, 1.25, 0.45);
  g.add(cart, skirt, pole, umbrella, treats);
  return g;
}

function makeFountain(size: number): THREE.Group {
  const g = new THREE.Group();
  const r = size / 2 - 0.1;
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.55, 48), mat(0xb9b4a8, { roughness: 0.7 }));
  basin.position.y = 0.275;
  basin.castShadow = true;
  basin.receiveShadow = true;
  const water = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.2, r - 0.2, 0.42, 48), mat(0x4aa8e0, { flat: false, transparent: true, opacity: 0.8, roughness: 0.2, metalness: 0.1 }));
  water.position.y = 0.36;
  water.name = 'water';
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 1.4, 10), mat(0xb9b4a8));
  pillar.position.y = 1.0;
  pillar.castShadow = true;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.6, 0.2, 16), mat(0xb9b4a8));
  bowl.position.y = 1.7;
  bowl.castShadow = true;
  const bowlWater = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.1, 16), mat(0x4aa8e0, { flat: false, transparent: true, opacity: 0.85, roughness: 0.2 }));
  bowlWater.position.y = 1.82;
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.6, 8), mat(0x8fd0ff, { flat: false, transparent: true, opacity: 0.8 }));
  spout.position.y = 2.15;
  g.add(basin, water, pillar, bowl, bowlWater, spout);
  return g;
}

function makeElevator(): THREE.Group {
  const g = new THREE.Group();
  const frame = box(2, WALL_H, 0.4, 0x8f98a3, { metalness: 0.6, roughness: 0.35 });
  frame.position.set(0, WALL_H / 2, -0.2);
  const left = box(0.86, WALL_H - 0.3, 0.1, 0xb8c2cc, { metalness: 0.7, roughness: 0.25 });
  left.position.set(-0.48, (WALL_H - 0.3) / 2, 0.05);
  const right = left.clone();
  right.position.x = 0.48;
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.1), mat(0xffd166, { emissive: 0xffb703, flat: false }));
  lamp.position.set(0, WALL_H - 0.2, 0.08);
  const label = makeTextSprite('ELEVATOR ▲', { size: 32, color: '#1b1f2a', bg: '#ffd166', height: 0.42 });
  label.position.set(0, WALL_H + 0.35, 0.3);
  const matMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), mat(0x6c7a89, { flat: false }));
  matMesh.rotation.x = -Math.PI / 2;
  matMesh.position.set(0, 0.012, 1);
  matMesh.receiveShadow = true;
  g.add(frame, left, right, lamp, label, matMesh);
  return g;
}

// ---------------------------------------------------------------- fixtures
export type ShelfStyle = 'rack' | 'fridge' | 'stand';

export function shelfStyleFor(fixtureId: string): ShelfStyle {
  if (/fridge|freezer|cooler|case|booth/.test(fixtureId)) return 'fridge';
  if (/stand|table|bin|bar|grill|oven|display|wall/.test(fixtureId)) return 'stand';
  return 'rack';
}

// Returns a 2-tile-wide shelf centred on origin, plus the local positions where up to `capacity` items sit.
export function makeShelf(style: ShelfStyle, accent: number, capacity: number): { group: THREE.Group; slots: THREE.Vector3[] } {
  const g = new THREE.Group();
  const slots: THREE.Vector3[] = [];
  const perRow = 6;
  const rows = Math.ceil(capacity / perRow);
  if (style === 'rack') {
    const frameColor = 0x8d97a1;
    const back = box(1.96, 1.3, 0.06, frameColor, { metalness: 0.3, roughness: 0.6 });
    back.position.set(0, 0.65, -0.44);
    g.add(back);
    for (const x of [-0.97, 0.97]) {
      const side = box(0.06, 1.3, 0.9, frameColor, { metalness: 0.3, roughness: 0.6 });
      side.position.set(x, 0.65, 0);
      g.add(side);
    }
    const levels = [0.4, 0.9];
    for (let i = 0; i < rows; i++) {
      const y = levels[i] ?? 1.2;
      const board = box(1.9, 0.05, 0.86, shade(frameColor, 0.85), { metalness: 0.2 });
      board.position.set(0, y, 0);
      g.add(board);
      for (let k = 0; k < perRow; k++) slots.push(new THREE.Vector3(-0.78 + k * 0.31, y + 0.03, 0.05));
    }
    const kick = box(1.96, 0.12, 0.9, shade(frameColor, 0.7));
    kick.position.set(0, 0.06, 0);
    g.add(kick);
  } else if (style === 'fridge') {
    const body = box(2, 1.6, 0.9, 0xe4ebf1, { roughness: 0.5, metalness: 0.1 });
    body.position.set(0, 0.8, -0.03);
    g.add(body);
    const inner = box(1.84, 1.3, 0.76, 0xcfe4f5, { flat: false });
    inner.position.set(0, 0.8, 0.03);
    g.add(inner);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.84, 1.3, 0.04), mat(0x9fd3ff, { flat: false, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.2 }));
    glass.position.set(0, 0.8, 0.44);
    g.add(glass);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.1), mat(accent, { emissive: accent, flat: false }));
    strip.position.set(0, 1.52, 0.44);
    g.add(strip);
    const levels = [0.4, 0.95];
    for (let i = 0; i < rows; i++) {
      const y = levels[i] ?? 1.3;
      const board = box(1.8, 0.04, 0.7, 0xb9c8d4, { metalness: 0.3 });
      board.position.set(0, y, 0);
      g.add(board);
      for (let k = 0; k < perRow; k++) slots.push(new THREE.Vector3(-0.75 + k * 0.3, y + 0.02, 0.05));
    }
  } else {
    const wood = 0xb5804e;
    const top = box(2, 0.1, 0.92, wood);
    top.position.set(0, 0.72, 0);
    g.add(top);
    const rim = box(2.04, 0.16, 0.96, shade(wood, 0.8));
    rim.position.set(0, 0.62, 0);
    g.add(rim);
    for (const x of [-0.85, 0.85]) for (const z of [-0.35, 0.35]) {
      const leg = box(0.12, 0.62, 0.12, shade(wood, 0.7));
      leg.position.set(x, 0.31, z);
      g.add(leg);
    }
    const banner = box(2, 0.28, 0.05, accent, { flat: false });
    banner.position.set(0, 1.35, -0.42);
    g.add(banner);
    const post1 = box(0.06, 1.3, 0.06, shade(wood, 0.7));
    post1.position.set(-0.95, 0.65, -0.42);
    const post2 = post1.clone();
    post2.position.x = 0.95;
    g.add(post1, post2);
    for (let i = 0; i < rows; i++) {
      for (let k = 0; k < perRow; k++) slots.push(new THREE.Vector3(-0.78 + k * 0.31, 0.77, -0.22 + i * 0.4));
    }
  }
  return { group: g, slots: slots.slice(0, capacity) };
}

export function makeCounter(): THREE.Group {
  const g = new THREE.Group();
  const body = box(3, 0.9, 0.9, 0x5f83a8, { roughness: 0.6 });
  body.position.set(0, 0.45, 0);
  const top = box(3.06, 0.08, 0.96, 0xdfe6ee, { roughness: 0.3, metalness: 0.1 });
  top.position.set(0, 0.92, 0);
  const trim = box(3.02, 0.12, 0.92, 0x3d5872);
  trim.position.set(0, 0.06, 0);
  const register = box(0.42, 0.28, 0.36, 0x2f3e4e, { roughness: 0.4 });
  register.position.set(0.7, 1.1, -0.1);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.03), mat(0x9be7a0, { emissive: 0x3ddc84, flat: false }));
  screen.position.set(0.7, 1.15, 0.08);
  screen.rotation.x = -0.35;
  g.add(body, top, trim, register, screen);
  return g;
}

export function makeCrate(): THREE.Group {
  const g = new THREE.Group();
  const wood = 0xc79a5b;
  const body = box(0.9, 0.6, 0.9, wood);
  body.position.y = 0.3;
  g.add(body);
  const dark = shade(wood, 0.72);
  for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) {
    const post = box(0.08, 0.64, 0.08, dark);
    post.position.set(x, 0.32, z);
    g.add(post);
  }
  const lip = box(0.94, 0.06, 0.94, dark);
  lip.position.y = 0.6;
  g.add(lip);
  return g;
}

export function makePad(widthTiles: number, ok: boolean): THREE.Mesh {
  const plane = new THREE.Mesh(
    roundedBox(widthTiles - 0.12, 0.06, 0.88, 0.03),
    mat(ok ? 0x4ff0a0 : 0xb8c0c8, { transparent: true, opacity: ok ? 0.8 : 0.5, emissive: ok ? 0x1f7a4a : 0x333333 }),
  );
  plane.position.y = 0.03;
  plane.receiveShadow = true;
  return plane;
}

export function makeCashierMat(width: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(roundedBox(width - 0.2, 0.04, 0.8, 0.02), mat(color, { transparent: true, opacity: 0.45 }));
  m.position.y = 0.02;
  return m;
}

// ---------------------------------------------------------------- items
const itemGeoCache = new Map<string, THREE.BufferGeometry>();
export function makeItem(p: ProductDef): THREE.Group {
  const g = new THREE.Group();
  let geo = itemGeoCache.get('item');
  if (!geo) {
    geo = roundedBox(0.26, 0.24, 0.24, 0.05);
    itemGeoCache.set('item', geo);
  }
  const body = new THREE.Mesh(geo, mat(p.color, { roughness: 0.6 }));
  body.position.y = 0.12;
  body.castShadow = true;
  const stripe = new THREE.Mesh(roundedBox(0.27, 0.07, 0.25, 0.02), mat(p.accent, { roughness: 0.6 }));
  stripe.position.y = 0.12;
  g.add(body, stripe);
  return g;
}

// Give every mesh in a group its own transparent material so the whole thing can fade out.
export function makeFadeable(group: THREE.Object3D): THREE.Material[] {
  const mats: THREE.Material[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (o as THREE.Sprite).isSprite) return;
    const own = (m.material as THREE.Material).clone();
    own.transparent = true;
    m.material = own;
    mats.push(own);
  });
  return mats;
}

export function disposeGroup(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !itemGeoCache.has('item')) m.geometry.dispose();
    if ((o as THREE.Sprite).isSprite) {
      const sm = (o as THREE.Sprite).material as THREE.SpriteMaterial;
      sm.map?.dispose();
      sm.dispose();
    }
  });
  obj.removeFromParent();
}
