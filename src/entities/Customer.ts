import Phaser from 'phaser';
import { TILE, ENTRANCE, RATING_PER_ANGRY } from '../data/floors';
import { Person } from './Person';
import type { GameScene } from '../scenes/GameScene';
import type { Pt } from '../systems/pathfinding';

export type CustomerState = 'entering' | 'toShelf' | 'shopping' | 'waiting' | 'toQueue' | 'inQueue' | 'checkout' | 'leaving' | 'done';

export interface Want { fixtureId: string; count: number; }

export class Customer {
  person: Person;
  state: CustomerState = 'entering';
  wants: Want[];
  basket: { productId: string; count: number }[] = [];
  bubble: Phaser.GameObjects.Container;
  bubbleText: Phaser.GameObjects.Text;
  bubbleIcon: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Graphics;
  patience = 0;
  patienceMax = 1;
  shopTimer = 0;
  checkoutTimer = 0;
  checkoutTotal = 0;
  queueIndex = -1;
  queueTile: Pt | null = null;
  arrivedAtQueue = false;
  angry = false;

  constructor(public scene: GameScene, variant: number, wants: Want[]) {
    this.wants = wants;
    const x = ENTRANCE.col * TILE + TILE / 2;
    const y = (ENTRANCE.row + 1) * TILE + TILE / 2;
    this.person = new Person(scene, `cust_${variant}`, x, y);
    this.person.speed = 100 + Math.random() * 30;

    this.bubbleIcon = scene.add.image(0, -1, '__DEFAULT').setVisible(false).setScale(1.1);
    this.bubbleText = scene.add.text(0, -2, '', { fontSize: '16px', color: '#111', fontStyle: 'bold' }).setOrigin(0.5);
    const bg = scene.add.image(0, 0, 'bubble').setOrigin(0.5, 0.65);
    this.bar = scene.add.graphics();
    this.bubble = scene.add.container(0, 0, [bg, this.bubbleIcon, this.bubbleText, this.bar]).setVisible(false);
    this.goToNextShelf();
  }

  private setBubble(kind: 'none' | 'item' | 'text', value?: string): void {
    if (kind === 'none') {
      this.bubble.setVisible(false);
      return;
    }
    this.bubble.setVisible(true);
    this.bar.clear();
    if (kind === 'item' && value) {
      this.bubbleIcon.setTexture(value).setVisible(true);
      this.bubbleText.setText('');
    } else {
      this.bubbleIcon.setVisible(false);
      this.bubbleText.setText(value ?? '');
    }
  }

  private goToNextShelf(): void {
    const want = this.wants.find((w) => w.count > 0);
    if (!want) {
      this.goToQueue();
      return;
    }
    const target = this.scene.shelfAccessTile(want.fixtureId);
    if (!target) {
      // shelf vanished (should not happen) — just skip it
      want.count = 0;
      this.goToNextShelf();
      return;
    }
    this.state = 'toShelf';
    const path = this.scene.customerPath(this.person.tile, target);
    this.person.setPath(path, () => {
      this.state = 'shopping';
      this.shopTimer = 300;
    });
  }

  private goToQueue(): void {
    if (this.basket.length === 0) {
      this.leave(false);
      return;
    }
    this.state = 'toQueue';
    this.scene.enqueue(this);
    this.moveToQueueTile();
  }

  moveToQueueTile(): void {
    const tile = this.scene.queueTileFor(this.queueIndex);
    if (this.queueTile && tile.col === this.queueTile.col && tile.row === this.queueTile.row) return;
    this.queueTile = tile;
    this.arrivedAtQueue = false;
    const path = this.scene.customerPath(this.person.tile, tile);
    this.person.setPath(path, () => {
      this.arrivedAtQueue = true;
      if (this.state === 'toQueue') this.state = 'inQueue';
    });
    if (this.state === 'toQueue' && !this.person.moving) this.state = 'inQueue';
  }

  startCheckout(): void {
    this.state = 'checkout';
    const items = this.basket.reduce((a, b) => a + b.count, 0);
    this.checkoutTotal = 1200 + items * 350;
    this.checkoutTimer = this.checkoutTotal;
    this.setBubble('text', '💳');
  }

  basketValue(): number {
    let v = 0;
    for (const b of this.basket) v += this.scene.productPrice(b.productId) * b.count;
    return v;
  }

  leave(angry: boolean): void {
    this.angry = angry;
    this.scene.dequeue(this);
    this.state = 'leaving';
    this.setBubble('text', angry ? '😡' : '😊');
    const exit = { col: ENTRANCE.col, row: ENTRANCE.row + 1 };
    const path = this.scene.customerPath(this.person.tile, exit);
    this.person.setPath(path, () => {
      this.state = 'done';
    });
    if (angry) this.scene.customerAngry(RATING_PER_ANGRY);
  }

  update(dtMs: number): void {
    this.person.update(dtMs);
    this.bubble.setPosition(this.person.x, this.person.y - 62).setDepth(this.person.sprite.depth + 0.5);

    if (this.state === 'shopping' || this.state === 'waiting') {
      const want = this.wants.find((w) => w.count > 0);
      if (!want) {
        this.setBubble('none');
        this.goToNextShelf();
        return;
      }
      const stock = this.scene.shelfStock(want.fixtureId);
      if (stock > 0) {
        if (this.state === 'waiting') {
          this.state = 'shopping';
          this.setBubble('none');
        }
        this.shopTimer -= dtMs;
        if (this.shopTimer <= 0) {
          this.shopTimer = 400;
          const productId = this.scene.takeFromShelf(want.fixtureId);
          if (productId) {
            want.count -= 1;
            const b = this.basket.find((x) => x.productId === productId);
            if (b) b.count += 1;
            else this.basket.push({ productId, count: 1 });
          }
        }
      } else {
        if (this.state === 'shopping') {
          this.state = 'waiting';
          this.patienceMax = this.scene.floor.patienceMs;
          this.patience = this.patienceMax;
          const productId = this.scene.shelfProduct(want.fixtureId);
          this.setBubble('item', this.scene.itemKey(productId));
        }
        this.patience -= dtMs;
        const frac = Math.max(0, this.patience / this.patienceMax);
        this.bar.clear();
        this.bar.fillStyle(0x333333, 1);
        this.bar.fillRect(-15, 12, 30, 4);
        this.bar.fillStyle(frac > 0.4 ? 0x3ddc84 : 0xff6b6b, 1);
        this.bar.fillRect(-15, 12, 30 * frac, 4);
        if (this.patience <= 0) {
          // give up on every remaining want; leave angry
          for (const w of this.wants) w.count = 0;
          this.leave(true);
        }
      }
    } else if (this.state === 'checkout') {
      this.checkoutTimer -= dtMs;
      const frac = 1 - this.checkoutTimer / this.checkoutTotal;
      this.bar.clear();
      this.bar.fillStyle(0x333333, 1);
      this.bar.fillRect(-15, 12, 30, 4);
      this.bar.fillStyle(0xffd166, 1);
      this.bar.fillRect(-15, 12, 30 * Math.max(0, Math.min(1, frac)), 4);
      if (this.checkoutTimer <= 0) {
        this.scene.completeSale(this);
        this.leave(false);
      }
    }
  }

  destroy(): void {
    this.person.destroy();
    this.bubble.destroy();
  }
}
