import { Person } from './Person';
import type { GameScene } from '../scenes/GameScene';
import { STORAGE_DOOR_COLS, STORAGE_WALL_ROW, TILE } from '../data/floors';
import type { Pt } from '../systems/pathfinding';

type S = 'idle' | 'toCrate' | 'picking' | 'toShelf' | 'placing';

// A hired helper that carries stock from the storage room to shelves.
export class Stocker {
  person: Person;
  state: S = 'idle';
  carrying: { productId: string; count: number } | null = null;
  targetFixture: string | null = null;
  timer = 0;
  carried: Phaser.GameObjects.Image[] = [];
  readonly capacity = 4;

  constructor(public scene: GameScene, texKey: string) {
    const home = this.home();
    this.person = new Person(scene, texKey, home.col * TILE + TILE / 2, home.row * TILE + TILE / 2);
    this.person.speed = 120;
  }

  home(): Pt {
    return { col: STORAGE_DOOR_COLS[1], row: STORAGE_WALL_ROW + 1 };
  }

  private findJob(): { fixtureId: string; productId: string } | null {
    const jobs = this.scene.stockingJobs();
    return jobs.length ? jobs[0] : null;
  }

  update(dtMs: number): void {
    this.person.update(dtMs);
    for (let i = 0; i < this.carried.length; i++) {
      this.carried[i].setPosition(this.person.x, this.person.y - 46 - i * 6).setDepth(this.person.sprite.depth + 0.1);
    }

    if (this.state === 'idle') {
      this.timer -= dtMs;
      if (this.timer > 0) return;
      this.timer = 800;
      const job = this.findJob();
      if (!job) return;
      this.targetFixture = job.fixtureId;
      const crateTile = this.scene.crateAccessTile(job.productId);
      if (!crateTile) return;
      this.state = 'toCrate';
      this.person.setPath(this.scene.staffPath(this.person.tile, crateTile), () => {
        this.state = 'picking';
        this.timer = 0;
      });
    } else if (this.state === 'picking') {
      this.timer -= dtMs;
      if (this.timer > 0) return;
      this.timer = 180;
      const productId = this.scene.shelfProduct(this.targetFixture!);
      const have = this.carrying?.count ?? 0;
      if (have >= this.capacity || this.scene.crateStock(productId) <= 0) {
        if (have === 0) {
          this.state = 'idle';
          return;
        }
        const shelfTile = this.scene.shelfAccessTile(this.targetFixture!);
        if (!shelfTile) { this.state = 'idle'; return; }
        this.state = 'toShelf';
        this.person.setPath(this.scene.staffPath(this.person.tile, shelfTile), () => {
          this.state = 'placing';
          this.timer = 0;
        });
        return;
      }
      if (this.scene.takeFromCrate(productId)) {
        this.carrying = { productId, count: have + 1 };
        this.carried.push(this.scene.add.image(this.person.x, this.person.y, this.scene.itemKey(productId)));
      }
    } else if (this.state === 'placing') {
      this.timer -= dtMs;
      if (this.timer > 0) return;
      this.timer = 180;
      if (!this.carrying || this.carrying.count <= 0 || this.scene.shelfIsFull(this.targetFixture!)) {
        // shelf full or nothing left: put leftovers back in the crate (simplest, no waste)
        if (this.carrying && this.carrying.count > 0) {
          this.scene.returnToCrate(this.carrying.productId, this.carrying.count);
        }
        this.clearCarried();
        this.state = 'idle';
        this.timer = 300;
        return;
      }
      if (this.scene.putOnShelf(this.targetFixture!, this.carrying.productId)) {
        this.carrying.count -= 1;
        const img = this.carried.pop();
        img?.destroy();
        if (this.carrying.count === 0) this.carrying = null;
      }
    }
  }

  private clearCarried(): void {
    for (const c of this.carried) c.destroy();
    this.carried = [];
    this.carrying = null;
  }

  destroy(): void {
    this.clearCarried();
    this.person.destroy();
  }
}
