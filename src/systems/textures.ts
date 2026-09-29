import Phaser from 'phaser';
import { TILE, FloorDef } from '../data/floors';

// All art is drawn with code so the game needs no image files.
// Style: chunky 3/4 top-down, like Minecraft Dungeons seen from above.

type G = Phaser.GameObjects.Graphics;

function shade(color: number, amount: number): number {
  const c = Phaser.Display.Color.ValueToColor(color);
  const r = Phaser.Math.Clamp(Math.round(c.red * amount), 0, 255);
  const g = Phaser.Math.Clamp(Math.round(c.green * amount), 0, 255);
  const b = Phaser.Math.Clamp(Math.round(c.blue * amount), 0, 255);
  return Phaser.Display.Color.GetColor(r, g, b);
}

function gfx(scene: Phaser.Scene): G {
  return scene.make.graphics({ x: 0, y: 0 }, false);
}

function done(g: G, key: string, w: number, h: number): void {
  g.generateTexture(key, w, h);
  g.destroy();
}

// A block with a lit top face and a darker front face.
function block(g: G, x: number, y: number, w: number, h: number, frontH: number, color: number): void {
  g.fillStyle(shade(color, 0.7), 1);
  g.fillRect(x, y + h - frontH, w, frontH);
  g.fillStyle(color, 1);
  g.fillRect(x, y, w, h - frontH);
  g.fillStyle(shade(color, 1.15), 1);
  g.fillRect(x, y, w, 3);
}

export function makeFloorTextures(scene: Phaser.Scene, floor: FloorDef): void {
  const t = scene.textures;
  const id = floor.id;

  if (!t.exists(`floor_a_${id}`)) {
    for (const [suffix, col] of [['a', floor.floorColor], ['b', floor.floorAlt]] as const) {
      const g = gfx(scene);
      g.fillStyle(col, 1);
      g.fillRect(0, 0, TILE, TILE);
      g.lineStyle(1, shade(col, 0.92), 1);
      g.strokeRect(0.5, 0.5, TILE - 1, TILE - 1);
      done(g, `floor_${suffix}_${id}`, TILE, TILE);
    }
  }
  if (!t.exists(`storage_${id}`)) {
    const g = gfx(scene);
    g.fillStyle(floor.storageColor, 1);
    g.fillRect(0, 0, TILE, TILE);
    g.lineStyle(1, shade(floor.storageColor, 0.85), 1);
    g.strokeRect(0.5, 0.5, TILE - 1, TILE - 1);
    g.fillStyle(shade(floor.storageColor, 0.9), 1);
    g.fillRect(6, 6, 4, 4);
    g.fillRect(30, 26, 4, 4);
    done(g, `storage_${id}`, TILE, TILE);
  }
  if (!t.exists(`wall_${id}`)) {
    const g = gfx(scene);
    g.fillStyle(floor.wallColor, 1);
    g.fillRect(0, 0, TILE, TILE);
    g.fillStyle(shade(floor.wallColor, 1.12), 1);
    g.fillRect(0, 0, TILE, 2);
    g.fillRect(0, 0, 2, TILE);
    g.fillStyle(shade(floor.wallColor, 0.8), 1);
    g.fillRect(0, TILE - 2, TILE, 2);
    g.fillRect(TILE - 2, 0, 2, TILE);
    done(g, `wall_${id}`, TILE, TILE);
  }
  if (!t.exists(`cashier_mat_${id}`)) {
    const g = gfx(scene);
    g.fillStyle(floor.uniformColor, 0.35);
    g.fillRoundedRect(4, 6, TILE - 8, TILE - 12, 6);
    g.lineStyle(2, floor.uniformColor, 0.8);
    g.strokeRoundedRect(4, 6, TILE - 8, TILE - 12, 6);
    done(g, `cashier_mat_${id}`, TILE, TILE);
  }
  // people in this floor's uniform
  makeCharacter(scene, `staff_${id}`, { skin: 0xf1c27d, shirt: 0xffffff, apron: floor.uniformColor, hair: 0x4a2c17 });
  for (const p of floor.products) {
    const key = `item_${id}_${p.id}`;
    if (t.exists(key)) continue;
    const g = gfx(scene);
    g.fillStyle(shade(p.color, 0.65), 1);
    g.fillRoundedRect(1, 3, 14, 13, 3);
    g.fillStyle(p.color, 1);
    g.fillRoundedRect(1, 1, 14, 12, 3);
    g.fillStyle(p.accent, 1);
    g.fillRect(3, 6, 10, 3);
    done(g, key, 16, 16);
  }
}

export function makeSharedTextures(scene: Phaser.Scene): void {
  const t = scene.textures;
  if (t.exists('shelf_rack')) return;

  // shelf variants: rack (metal), fridge (glass front), stand (wood)
  {
    const g = gfx(scene);
    block(g, 0, 0, TILE * 2, TILE, 16, 0x9aa3ad);
    g.fillStyle(0x6d7681, 1);
    g.fillRect(0, TILE - 16, TILE * 2, 3);
    g.fillRect(0, TILE - 8, TILE * 2, 2);
    done(g, 'shelf_rack', TILE * 2, TILE);
  }
  {
    const g = gfx(scene);
    block(g, 0, 0, TILE * 2, TILE, 18, 0xd8e6f0);
    g.fillStyle(0x7fb7e6, 0.8);
    g.fillRect(4, TILE - 15, TILE * 2 - 8, 11);
    g.fillStyle(0xffffff, 0.5);
    g.fillRect(6, TILE - 13, 24, 3);
    done(g, 'shelf_fridge', TILE * 2, TILE);
  }
  {
    const g = gfx(scene);
    block(g, 0, 0, TILE * 2, TILE, 16, 0xb5804e);
    g.fillStyle(0x8a5a30, 1);
    g.fillRect(0, TILE - 10, TILE * 2, 2);
    g.fillRect(24, TILE - 16, 2, 16);
    g.fillRect(70, TILE - 16, 2, 16);
    done(g, 'shelf_stand', TILE * 2, TILE);
  }
  // counter with a register
  {
    const g = gfx(scene);
    block(g, 0, 0, TILE * 3, TILE, 18, 0x6b8fb3);
    g.fillStyle(0x2f3e4e, 1);
    g.fillRoundedRect(TILE + 8, 6, 30, 20, 4);
    g.fillStyle(0x9be7a0, 1);
    g.fillRect(TILE + 12, 9, 22, 8);
    g.fillStyle(0xffffff, 0.4);
    g.fillRect(4, 3, TILE * 3 - 8, 2);
    done(g, 'counter', TILE * 3, TILE);
  }
  // storage crate
  {
    const g = gfx(scene);
    block(g, 3, 3, TILE - 6, TILE - 6, 14, 0xc79a5b);
    g.lineStyle(2, 0x8a5a30, 1);
    g.strokeRect(4, 4, TILE - 8, TILE - 8 - 14);
    g.lineBetween(4, 4, TILE - 4, TILE - 18);
    g.lineBetween(TILE - 4, 4, 4, TILE - 18);
    done(g, 'crate', TILE, TILE);
  }
  // buy pads (dashed outline areas)
  for (const [key, w] of [['pad2', TILE * 2], ['pad3', TILE * 3]] as const) {
    const g = gfx(scene);
    g.fillStyle(0xffffff, 0.35);
    g.fillRoundedRect(2, 2, w - 4, TILE - 4, 6);
    g.lineStyle(3, 0x2d6a4f, 0.9);
    g.strokeRoundedRect(2, 2, w - 4, TILE - 4, 6);
    done(g, key, w, TILE);
  }
  // elevator (1 wide, 2 tall)
  {
    const g = gfx(scene);
    block(g, 0, 0, TILE, TILE * 2, 14, 0xb8c0c8);
    g.fillStyle(0x5c6670, 1);
    g.fillRect(6, 8, TILE - 12, TILE * 2 - 30);
    g.fillStyle(0xdde3e8, 1);
    g.fillRect(TILE / 2 - 1, 8, 2, TILE * 2 - 30);
    g.fillStyle(0xffd166, 1);
    g.fillTriangle(TILE / 2, 12, TILE / 2 - 6, 22, TILE / 2 + 6, 22);
    done(g, 'elevator', TILE, TILE * 2);
  }
  // entrance mat
  {
    const g = gfx(scene);
    g.fillStyle(0x7a3b3b, 1);
    g.fillRect(0, 0, TILE * 2, TILE);
    g.fillStyle(0xa85a5a, 1);
    g.fillRect(6, 6, TILE * 2 - 12, TILE - 12);
    done(g, 'mat', TILE * 2, TILE);
  }
  // shadow, joystick
  {
    const g = gfx(scene);
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(16, 6, 32, 12);
    done(g, 'shadow', 32, 12);
  }
  {
    const g = gfx(scene);
    g.fillStyle(0xffffff, 0.18);
    g.fillCircle(60, 60, 60);
    g.lineStyle(3, 0xffffff, 0.5);
    g.strokeCircle(60, 60, 58);
    done(g, 'joy_base', 120, 120);
  }
  {
    const g = gfx(scene);
    g.fillStyle(0xffffff, 0.7);
    g.fillCircle(26, 26, 26);
    done(g, 'joy_knob', 52, 52);
  }
  {
    const g = gfx(scene);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(0, 0, 34, 26, 8);
    g.fillTriangle(12, 24, 20, 24, 16, 32);
    done(g, 'bubble', 34, 32);
  }

  const shirts = [0xe63946, 0x457b9d, 0xf4a261, 0x2a9d8f, 0x8338ec, 0xffb703, 0x6d6875, 0x06d6a0];
  const skins = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
  const hairs = [0x2b1d0e, 0x6b3e1a, 0xd9a441, 0x1a1a1a, 0xb54d2c];
  for (let i = 0; i < 8; i++) {
    makeCharacter(scene, `cust_${i}`, {
      skin: skins[i % skins.length],
      shirt: shirts[i],
      hair: hairs[i % hairs.length],
    });
  }
}

export interface CharacterOpts {
  skin: number;
  shirt: number;
  hair: number;
  apron?: number;
}

// Stick-figure-ish person: round head, boxy body, thick legs. Two walk frames.
export function makeCharacter(scene: Phaser.Scene, key: string, o: CharacterOpts): void {
  if (scene.textures.exists(`${key}_0`)) return;
  const W = 40;
  const H = 58;
  for (let frame = 0; frame < 2; frame++) {
    const g = gfx(scene);
    const legShift = frame === 0 ? 0 : 4;
    // legs (thick, rounded)
    g.fillStyle(0x2f3542, 1);
    g.fillRoundedRect(10, 38 + legShift, 9, 16 - legShift, 3);
    g.fillRoundedRect(21, 38 + (4 - legShift), 9, 12 + legShift, 3);
    // shoes
    g.fillStyle(0x111111, 1);
    g.fillRoundedRect(9, 50 + legShift, 11, 5, 2);
    g.fillRoundedRect(20, 54 - legShift, 11, 5, 2);
    // body
    g.fillStyle(o.shirt, 1);
    g.fillRoundedRect(8, 22, 24, 20, 5);
    // arms
    g.fillStyle(o.skin, 1);
    g.fillRoundedRect(3, 25, 6, 13, 3);
    g.fillRoundedRect(31, 25, 6, 13, 3);
    // apron / uniform
    if (o.apron !== undefined) {
      g.fillStyle(o.apron, 1);
      g.fillRoundedRect(12, 26, 16, 16, 3);
      g.fillStyle(0xffffff, 0.85);
      g.fillRect(14, 32, 12, 2);
      // name tag
      g.fillStyle(0xffffff, 1);
      g.fillRect(9, 24, 6, 4);
    }
    // head
    g.fillStyle(o.skin, 1);
    g.fillCircle(20, 12, 11);
    // hair
    g.fillStyle(o.hair, 1);
    g.fillEllipse(20, 5, 20, 9);
    // eyes
    g.fillStyle(0x111111, 1);
    g.fillCircle(16, 13, 1.6);
    g.fillCircle(24, 13, 1.6);
    // smile
    g.lineStyle(1.5, 0x7a4a2a, 1);
    g.beginPath();
    g.arc(20, 15, 4, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(160), false);
    g.strokePath();
    done(g, `${key}_${frame}`, W, H);
  }
}
