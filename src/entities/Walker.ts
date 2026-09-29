import { Person } from './Person';
import { CUSTOMER_LOOKS } from '../render/Character';
import type { Game } from '../game/Game';
import type { Pt } from '../systems/pathfinding';

// Window shoppers who wander the concourse for atmosphere. They never buy anything.
export class Walker {
  person: Person;
  private pause = 0;

  constructor(private game: Game, variant: number, start: Pt) {
    this.person = new Person(game.r3d.scene, CUSTOMER_LOOKS[variant % CUSTOMER_LOOKS.length], start.col, start.row);
    this.person.speed = 1.6 + Math.random() * 0.8;
    this.pause = Math.random() * 2000;
  }

  update(dtMs: number): void {
    this.person.update(dtMs);
    if (this.person.moving) return;
    this.pause -= dtMs;
    if (this.pause > 0) return;
    this.pause = 1000 + Math.random() * 4000;
    const target = this.game.randomConcourseTile();
    this.person.setPath(this.game.walkerPath(this.person.tile, target), () => {});
  }

  destroy(): void {
    this.person.destroy();
  }
}
