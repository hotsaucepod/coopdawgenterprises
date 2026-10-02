import { RATING_PER_ANGRY, MALL_EXITS } from '../data/floors';
import { Person } from './Person';
import { Bubble } from './Bubble';
import { CUSTOMER_LOOKS } from '../render/Character';
import type { Game } from '../game/Game';
import type { Pt } from '../systems/pathfinding';

export type CustomerState = 'entering' | 'toShelf' | 'shopping' | 'waiting' | 'toQueue' | 'inQueue' | 'checkout' | 'leaving' | 'done';

export interface Want { fixtureId: string; count: number; }

export class Customer {
  person: Person;
  state: CustomerState = 'entering';
  wants: Want[];
  basket: { productId: string; count: number }[] = [];
  bubble: Bubble;
  patience = 0;
  patienceMax = 1;
  shopTimer = 0;
  checkoutTimer = 0;
  checkoutTotal = 0;
  queueIndex = -1;
  queueTile: Pt | null = null;
  arrivedAtQueue = false;
  angry = false;
  private exit: Pt;

  constructor(public game: Game, variant: number, wants: Want[]) {
    this.wants = wants;
    this.exit = MALL_EXITS[Math.floor(Math.random() * MALL_EXITS.length)];
    this.person = new Person(game.r3d.scene, CUSTOMER_LOOKS[variant % CUSTOMER_LOOKS.length], this.exit.col, this.exit.row);
    this.person.speed = 2.3 + Math.random() * 0.7;
    this.bubble = new Bubble(game.r3d.scene);
    this.goToNextShelf();
  }

  private goToNextShelf(): void {
    const want = this.wants.find((w) => w.count > 0);
    if (!want) {
      this.goToQueue();
      return;
    }
    const target = this.game.shelfAccessTile(want.fixtureId);
    if (!target) {
      want.count = 0;
      this.goToNextShelf();
      return;
    }
    this.state = 'toShelf';
    this.person.setPath(this.game.customerPath(this.person.tile, target), () => {
      this.state = 'shopping';
      this.shopTimer = 300;
      this.faceShelf(want.fixtureId);
    });
  }

  private faceShelf(fixtureId: string): void {
    const c = this.game.shelfCenter(fixtureId);
    if (c) this.person.character.face(c.x - this.person.x, c.z - this.person.z);
  }

  private goToQueue(): void {
    if (this.basket.length === 0) {
      this.leave(false);
      return;
    }
    this.state = 'toQueue';
    this.game.enqueue(this);
    this.moveToQueueTile();
  }

  moveToQueueTile(): void {
    const tile = this.game.queueTileFor(this.queueIndex);
    if (this.queueTile && tile.col === this.queueTile.col && tile.row === this.queueTile.row) return;
    this.queueTile = tile;
    this.arrivedAtQueue = false;
    this.person.setPath(this.game.customerPath(this.person.tile, tile), () => {
      this.arrivedAtQueue = true;
      this.person.character.face(0, -1); // face the counter
      if (this.state === 'toQueue') this.state = 'inQueue';
    });
    if (this.state === 'toQueue' && !this.person.moving) this.state = 'inQueue';
  }

  startCheckout(): void {
    this.state = 'checkout';
    const items = this.basket.reduce((a, b) => a + b.count, 0);
    this.checkoutTotal = 1200 + items * 350;
    this.checkoutTimer = this.checkoutTotal;
    this.bubble.showText('💳');
  }

  basketValue(): number {
    let v = 0;
    for (const b of this.basket) v += this.game.productPrice(b.productId) * b.count;
    return v;
  }

  leave(angry: boolean): void {
    this.angry = angry;
    this.game.dequeue(this);
    this.state = 'leaving';
    this.bubble.showText(angry ? '😡' : '😊');
    this.bubble.setBar(null);
    this.person.setPath(this.game.customerPath(this.person.tile, this.exit), () => {
      this.state = 'done';
    });
    if (angry) this.game.customerAngry(RATING_PER_ANGRY, this.person.pos);
  }

  update(dtMs: number): void {
    this.person.update(dtMs);
    this.bubble.follow(this.person.pos, dtMs / 1000);

    if (this.state === 'shopping' || this.state === 'waiting') {
      const want = this.wants.find((w) => w.count > 0);
      if (!want) {
        this.bubble.hide();
        this.goToNextShelf();
        return;
      }
      const stock = this.game.shelfStock(want.fixtureId);
      if (stock > 0) {
        if (this.state === 'waiting') {
          this.state = 'shopping';
          this.bubble.hide();
        }
        this.shopTimer -= dtMs;
        if (this.shopTimer <= 0) {
          this.shopTimer = 400;
          const productId = this.game.takeFromShelf(want.fixtureId);
          if (productId) {
            want.count -= 1;
            const b = this.basket.find((x) => x.productId === productId);
            if (b) b.count += 1;
            else this.basket.push({ productId, count: 1 });
            this.game.attachCarried(this.person.character, this.basket.reduce((a, x) => a + x.count, 0), productId);
          }
        }
      } else {
        if (this.state === 'shopping') {
          this.state = 'waiting';
          this.patienceMax = this.game.patienceMs();
          this.patience = this.patienceMax;
          this.bubble.showItem(this.game.product(this.game.shelfProduct(want.fixtureId)));
        }
        this.patience -= dtMs;
        const frac = Math.max(0, this.patience / this.patienceMax);
        this.bubble.setBar(frac, frac > 0.4 ? 0x3ddc84 : 0xff6b6b);
        if (this.patience <= 0) {
          for (const w of this.wants) w.count = 0;
          this.leave(true);
        }
      }
    } else if (this.state === 'checkout') {
      this.checkoutTimer -= dtMs;
      this.bubble.setBar(1 - this.checkoutTimer / this.checkoutTotal, 0xffd166);
      if (this.checkoutTimer <= 0) {
        this.game.completeSale(this);
        this.game.attachCarried(this.person.character, 0, null);
        this.leave(false);
      }
    }
  }

  destroy(): void {
    this.person.destroy();
    this.bubble.destroy();
  }
}
