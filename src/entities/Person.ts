import Phaser from 'phaser';
import { TILE } from '../data/floors';
import type { Pt } from '../systems/pathfinding';

// Shared walking + animation for customers and staff (not the player; the player uses physics).
export class Person {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  path: Pt[] = [];
  speed = 110;
  private animT = 0;
  private frame = 0;
  private onArrive: (() => void) | null = null;

  constructor(public scene: Phaser.Scene, public texKey: string, x: number, y: number) {
    this.shadow = scene.add.image(x, y + 26, 'shadow').setDepth(1);
    this.sprite = scene.add.image(x, y, `${texKey}_0`).setOrigin(0.5, 0.86);
  }

  get x(): number { return this.sprite.x; }
  get y(): number { return this.sprite.y; }

  get tile(): Pt {
    return { col: Math.floor(this.sprite.x / TILE), row: Math.floor(this.sprite.y / TILE) };
  }

  setPath(path: Pt[], onArrive: () => void): void {
    // drop the first node if we're already standing on it
    if (path.length && path[0].col === this.tile.col && path[0].row === this.tile.row) path = path.slice(1);
    this.path = path;
    this.onArrive = onArrive;
    if (!path.length) {
      const cb = this.onArrive;
      this.onArrive = null;
      cb();
    }
  }

  get moving(): boolean {
    return this.path.length > 0;
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    if (this.path.length) {
      const next = this.path[0];
      const tx = next.col * TILE + TILE / 2;
      const ty = next.row * TILE + TILE / 2;
      const dx = tx - this.sprite.x;
      const dy = ty - this.sprite.y;
      const dist = Math.hypot(dx, dy);
      const step = this.speed * dt;
      if (dist <= step) {
        this.sprite.setPosition(tx, ty);
        this.path.shift();
        if (!this.path.length && this.onArrive) {
          const cb = this.onArrive;
          this.onArrive = null;
          cb();
        }
      } else {
        this.sprite.x += (dx / dist) * step;
        this.sprite.y += (dy / dist) * step;
        if (dx !== 0) this.sprite.setFlipX(dx < 0);
      }
      this.animT += dtMs;
      if (this.animT > 140) {
        this.animT = 0;
        this.frame = 1 - this.frame;
        this.sprite.setTexture(`${this.texKey}_${this.frame}`);
      }
    } else if (this.frame !== 0) {
      this.frame = 0;
      this.sprite.setTexture(`${this.texKey}_0`);
    }
    this.shadow.setPosition(this.sprite.x, this.sprite.y + 4);
    this.sprite.setDepth(10 + this.sprite.y / 10);
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
