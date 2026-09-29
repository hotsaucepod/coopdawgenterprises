import * as THREE from 'three';
import type { Pt } from '../systems/pathfinding';
import { Character, CharacterOpts } from '../render/Character';

// Shared walking for customers and staff. Positions are in tiles (x = col + 0.5, z = row + 0.5).
export class Person {
  character: Character;
  path: Pt[] = [];
  speed = 2.4; // tiles per second
  private onArrive: (() => void) | null = null;

  constructor(scene: THREE.Scene, look: CharacterOpts, col: number, row: number) {
    this.character = new Character(look);
    this.character.group.position.set(col + 0.5, 0, row + 0.5);
    scene.add(this.character.group);
  }

  get x(): number { return this.character.group.position.x; }
  get z(): number { return this.character.group.position.z; }
  get pos(): THREE.Vector3 { return this.character.group.position; }

  get tile(): Pt {
    return { col: Math.floor(this.x), row: Math.floor(this.z) };
  }

  setPath(path: Pt[], onArrive: () => void): void {
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
    const g = this.character.group;
    if (this.path.length) {
      const next = this.path[0];
      const tx = next.col + 0.5;
      const tz = next.row + 0.5;
      const dx = tx - g.position.x;
      const dz = tz - g.position.z;
      const dist = Math.hypot(dx, dz);
      const step = this.speed * dt;
      this.character.face(dx, dz);
      if (dist <= step) {
        g.position.x = tx;
        g.position.z = tz;
        this.path.shift();
        if (!this.path.length && this.onArrive) {
          const cb = this.onArrive;
          this.onArrive = null;
          cb();
        }
      } else {
        g.position.x += (dx / dist) * step;
        g.position.z += (dz / dist) * step;
      }
      this.character.setWalking(true);
    } else {
      this.character.setWalking(false);
    }
    this.character.animate(dt);
  }

  destroy(): void {
    this.character.group.removeFromParent();
  }
}
