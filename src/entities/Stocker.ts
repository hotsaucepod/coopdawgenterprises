import { Person } from './Person';
import type { Game } from '../game/Game';
import { STORAGE_DOOR_COLS, STORAGE_WALL_ROW } from '../data/floors';
import type { Pt } from '../systems/pathfinding';
import type { CharacterOpts } from '../render/Character';

type S = 'idle' | 'toCrate' | 'picking' | 'toShelf' | 'placing';

// A hired helper that carries stock from the storage room to shelves.
export class Stocker {
  person: Person;
  state: S = 'idle';
  carrying: { productId: string; count: number } | null = null;
  targetFixture: string | null = null;
  timer = 0;
  readonly capacity = 4;

  constructor(public game: Game, look: CharacterOpts) {
    const home = this.home();
    this.person = new Person(game.r3d.scene, look, home.col, home.row);
    this.person.speed = 2.8;
  }

  home(): Pt {
    return { col: STORAGE_DOOR_COLS[1], row: STORAGE_WALL_ROW + 1 };
  }

  private syncCarried(): void {
    this.game.attachCarried(this.person.character, this.carrying?.count ?? 0, this.carrying?.productId ?? null);
  }

  update(dtMs: number): void {
    this.person.update(dtMs);

    if (this.state === 'idle') {
      this.timer -= dtMs;
      if (this.timer > 0) return;
      this.timer = 800;
      const jobs = this.game.stockingJobs();
      const job = jobs.length ? jobs[0] : null;
      if (!job) return;
      this.targetFixture = job.fixtureId;
      const crateTile = this.game.crateAccessTile(job.productId);
      if (!crateTile) return;
      this.state = 'toCrate';
      this.person.setPath(this.game.staffPath(this.person.tile, crateTile), () => {
        this.state = 'picking';
        this.timer = 0;
        this.person.character.face(0, -1);
      });
    } else if (this.state === 'picking') {
      this.timer -= dtMs;
      if (this.timer > 0) return;
      this.timer = 180;
      const productId = this.game.shelfProduct(this.targetFixture!);
      const have = this.carrying?.count ?? 0;
      if (have >= this.capacity || this.game.crateStock(productId) <= 0) {
        if (have === 0) {
          this.state = 'idle';
          return;
        }
        const shelfTile = this.game.shelfAccessTile(this.targetFixture!);
        if (!shelfTile) { this.state = 'idle'; return; }
        this.state = 'toShelf';
        this.person.setPath(this.game.staffPath(this.person.tile, shelfTile), () => {
          this.state = 'placing';
          this.timer = 0;
          const c = this.game.shelfCenter(this.targetFixture!);
          if (c) this.person.character.face(c.x - this.person.x, c.z - this.person.z);
        });
        return;
      }
      if (this.game.takeFromCrate(productId)) {
        this.carrying = { productId, count: have + 1 };
        this.syncCarried();
      }
    } else if (this.state === 'placing') {
      this.timer -= dtMs;
      if (this.timer > 0) return;
      this.timer = 180;
      if (!this.carrying || this.carrying.count <= 0 || this.game.shelfIsFull(this.targetFixture!)) {
        if (this.carrying && this.carrying.count > 0) this.game.returnToCrate(this.carrying.productId, this.carrying.count);
        this.carrying = null;
        this.syncCarried();
        this.state = 'idle';
        this.timer = 300;
        return;
      }
      if (this.game.putOnShelf(this.targetFixture!, this.carrying.productId)) {
        this.carrying.count -= 1;
        if (this.carrying.count === 0) this.carrying = null;
        this.syncCarried();
      }
    }
  }

  destroy(): void {
    this.person.destroy();
  }
}
