import Phaser from 'phaser';
import {
  TILE, COLS, ROWS, FLOORS, FloorDef, FixtureDef, floorById, productById,
  SHELF_SLOTS, STORAGE_ROWS, STORAGE_WALL_ROW, STORAGE_DOOR_COLS, COUNTER_1, COUNTER_2,
  QUEUE_TILES, ENTRANCE, ELEVATOR, UPGRADES, CARRY_BY_LEVEL, SPEED_BY_LEVEL,
  RATING_CLOSED_BELOW, RATING_PER_SALE,
} from '../data/floors';
import { SaveData, FloorSave, loadSave, writeSave, floorSave, clearSave } from '../systems/save';
import { findPath, Pt } from '../systems/pathfinding';
import { makeFloorTextures } from '../systems/textures';
import { ui, fmtMoney } from '../systems/ui';
import { Customer, Want } from '../entities/Customer';
import { Stocker } from '../entities/Stocker';

interface ShelfView {
  def: FixtureDef;
  x: number; y: number; w: number; h: number;   // pixels
  sprite: Phaser.GameObjects.Image;
  items: Phaser.GameObjects.Image[];
  label: Phaser.GameObjects.Text;
}

interface PadView {
  def: FixtureDef;
  x: number; y: number; w: number; h: number;
  sprite: Phaser.GameObjects.Image;
  text: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Graphics;
}

interface CrateView {
  productId: string;
  col: number;
  x: number; y: number; w: number; h: number;
  count: Phaser.GameObjects.Text;
  icon: Phaser.GameObjects.Image;
}

const key = (c: number, r: number) => c + ',' + r;

export class GameScene extends Phaser.Scene {
  save!: SaveData;
  floor!: FloorDef;
  fs!: FloorSave;

  player!: Phaser.Physics.Arcade.Sprite;
  playerShadow!: Phaser.GameObjects.Image;
  carried: Phaser.GameObjects.Image[] = [];
  carrying: { productId: string; count: number } | null = null;
  private pickTimer = 0;
  private animT = 0;
  private animFrame = 0;

  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private customerBlocked = new Set<string>();
  private staffBlocked = new Set<string>();

  shelves = new Map<string, ShelfView>();
  pads = new Map<string, PadView>();
  crates = new Map<string, CrateView>();
  private counterSprites: Phaser.GameObjects.Image[] = [];
  private cashierNpc: Phaser.GameObjects.Image | null = null;
  private stocker: Stocker | null = null;

  customers: Customer[] = [];
  private queue: Customer[] = [];
  private spawnTimer = 3000;
  private saveTimer = 0;
  private onElevator = false;
  private padUnderPlayer: PadView | null = null;
  private padDwell = 0;
  private closed = false;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private joyOrigin: Phaser.Math.Vector2 | null = null;
  private joyVec = new Phaser.Math.Vector2(0, 0);
  private joyBase!: Phaser.GameObjects.Image;
  private joyKnob!: Phaser.GameObjects.Image;
  private joyPointerId = -1;

  constructor() {
    super('Game');
  }

  init(data: { floorId?: string }): void {
    this.save = loadSave();
    const floorId = data.floorId ?? this.save.currentFloor;
    this.floor = floorById(floorId);
    this.save.currentFloor = floorId;
    this.fs = floorSave(this.save, floorId);
    // reset per-scene state (scene objects are recreated by Phaser on restart)
    this.customers = [];
    this.queue = [];
    this.shelves = new Map();
    this.pads = new Map();
    this.crates = new Map();
    this.counterSprites = [];
    this.cashierNpc = null;
    this.stocker = null;
    this.carried = [];
    this.carrying = null;
    this.customerBlocked = new Set();
    this.staffBlocked = new Set();
    this.spawnTimer = 3000;
    this.onElevator = false;
    this.padUnderPlayer = null;
    this.padDwell = 0;
    this.closed = false;
    this.joyOrigin = null;
    this.joyPointerId = -1;
  }

  // ---------------------------------------------------------------- create
  create(): void {
    makeFloorTextures(this, this.floor);
    this.solids = this.physics.add.staticGroup();
    this.buildMap();
    this.buildFixtures();
    this.buildCrates();
    this.buildPlayer();
    this.buildInput();
    this.buildHud();
    this.physics.world.setBounds(0, 0, COLS * TILE, ROWS * TILE);
    this.physics.add.collider(this.player, this.solids);
    this.refreshHud();
    writeSave(this.save);
    (window as unknown as { __mallTycoon?: GameScene }).__mallTycoon = this;

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      ui.closePanel();
      ui.setHint(null);
    });
  }

  private buildMap(): void {
    const id = this.floor.id;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * TILE;
        const y = r * TILE;
        const isWall =
          r === 0 || c === 0 || c === COLS - 1 ||
          (r === ROWS - 1 && !(c === ENTRANCE.col || c === ENTRANCE.col + 1)) ||
          (r === STORAGE_WALL_ROW && !STORAGE_DOOR_COLS.includes(c));
        if (isWall) {
          this.add.image(x, y, `wall_${id}`).setOrigin(0).setDepth(r === ROWS - 1 ? 1000 : 0.5);
          this.addSolid(x, y, TILE, TILE);
          this.customerBlocked.add(key(c, r));
          this.staffBlocked.add(key(c, r));
          continue;
        }
        if (r <= STORAGE_WALL_ROW) {
          this.add.image(x, y, `storage_${id}`).setOrigin(0).setDepth(0);
          this.customerBlocked.add(key(c, r));
          if (r === STORAGE_ROWS.top) this.staffBlocked.add(key(c, r));
        } else {
          this.add.image(x, y, (c + r) % 2 === 0 ? `floor_a_${id}` : `floor_b_${id}`).setOrigin(0).setDepth(0);
        }
      }
    }
    // storage sign
    this.add.text(TILE * 5.5, TILE * 3 + 6, 'STORAGE', { fontSize: '11px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5, 0).setDepth(0.6).setAlpha(0.9);
    // entrance mat + label
    this.add.image(ENTRANCE.col * TILE, ENTRANCE.row * TILE, 'mat').setOrigin(0).setDepth(0.1);
    this.add.text((ENTRANCE.col + 1) * TILE, ENTRANCE.row * TILE + TILE / 2, 'ENTRANCE', { fontSize: '11px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5).setDepth(0.2);
    // elevator
    this.add.image(ELEVATOR.col * TILE, ELEVATOR.row * TILE, 'elevator').setOrigin(0).setDepth(0.2);
    this.customerBlocked.add(key(ELEVATOR.col, ELEVATOR.row));
    this.customerBlocked.add(key(ELEVATOR.col, ELEVATOR.row + 1));
    this.staffBlocked.add(key(ELEVATOR.col, ELEVATOR.row));
    this.staffBlocked.add(key(ELEVATOR.col, ELEVATOR.row + 1));
    // customers never walk behind the counters
    for (const ctr of [COUNTER_1, COUNTER_2]) {
      for (let i = 0; i < ctr.width; i++) {
        this.customerBlocked.add(key(ctr.col + i, ctr.row - 1));
        this.staffBlocked.add(key(ctr.col + i, ctr.row - 1));
      }
    }
    // shelf slots are always blocked for walkers (either a shelf or a buy pad)
    for (const s of SHELF_SLOTS) {
      this.customerBlocked.add(key(s.col, s.row));
      this.customerBlocked.add(key(s.col + 1, s.row));
      this.staffBlocked.add(key(s.col, s.row));
      this.staffBlocked.add(key(s.col + 1, s.row));
    }
    for (const ctr of [COUNTER_1, COUNTER_2]) {
      for (let i = 0; i < ctr.width; i++) {
        this.customerBlocked.add(key(ctr.col + i, ctr.row));
        this.staffBlocked.add(key(ctr.col + i, ctr.row));
      }
    }
  }

  private addSolid(x: number, y: number, w: number, h: number): Phaser.GameObjects.Rectangle {
    const rect = this.add.rectangle(x + w / 2, y + h / 2, w, h).setVisible(false);
    this.solids.add(rect);
    return rect;
  }

  private buildFixtures(): void {
    for (const f of this.floor.fixtures) {
      if (this.fs.purchased.includes(f.id)) this.placeFixture(f, false);
      else this.placePad(f);
    }
  }

  private fixtureRect(f: FixtureDef): { x: number; y: number; w: number; h: number } | null {
    if (f.kind === 'shelf' && f.slot !== undefined) {
      const s = SHELF_SLOTS[f.slot];
      return { x: s.col * TILE, y: s.row * TILE, w: TILE * 2, h: TILE };
    }
    if (f.kind === 'counter') return { x: COUNTER_1.col * TILE, y: COUNTER_1.row * TILE, w: TILE * COUNTER_1.width, h: TILE };
    if (f.kind === 'register2') return { x: COUNTER_2.col * TILE, y: COUNTER_2.row * TILE, w: TILE * COUNTER_2.width, h: TILE };
    return null;
  }

  private shelfTexture(f: FixtureDef): string {
    const id = f.id;
    if (/fridge|freezer|cooler|case|booth/.test(id)) return 'shelf_fridge';
    if (/stand|table|bin|bar|grill|oven|display|wall/.test(id)) return 'shelf_stand';
    return 'shelf_rack';
  }

  private placePad(f: FixtureDef): void {
    const r = this.fixtureRect(f);
    if (!r) return; // hires have no pad
    const sprite = this.add.image(r.x, r.y, r.w === TILE * 3 ? 'pad3' : 'pad2').setOrigin(0).setDepth(0.3);
    const text = this.add.text(r.x + r.w / 2, r.y + r.h / 2 - 2, '', {
      fontSize: '12px', color: '#1b4332', fontStyle: 'bold', align: 'center',
    }).setOrigin(0.5).setDepth(0.4);
    const bar = this.add.graphics().setDepth(0.4);
    const pad: PadView = { def: f, ...r, sprite, text, bar };
    this.pads.set(f.id, pad);
    this.updatePadText(pad);
  }

  private updatePadText(pad: PadView): void {
    const affordable = this.save.money >= pad.def.cost;
    pad.text.setText(`${pad.def.name}\n${fmtMoney(pad.def.cost)}`);
    pad.text.setColor(affordable ? '#1b4332' : '#7d1d1d');
    pad.sprite.setAlpha(affordable ? 1 : 0.55);
    pad.sprite.setTint(affordable ? 0xffffff : 0xdddddd);
    pad.bar.clear();
  }

  private refreshPads(): void {
    for (const pad of this.pads.values()) this.updatePadText(pad);
  }

  private placeFixture(f: FixtureDef, animate: boolean): void {
    const pad = this.pads.get(f.id);
    if (pad) {
      pad.sprite.destroy();
      pad.text.destroy();
      pad.bar.destroy();
      this.pads.delete(f.id);
    }
    if (f.kind === 'shelf') {
      const r = this.fixtureRect(f)!;
      const sprite = this.add.image(r.x, r.y, this.shelfTexture(f)).setOrigin(0).setDepth(10 + (r.y + r.h) / 10);
      this.addSolid(r.x, r.y, r.w, r.h);
      const label = this.add.text(r.x + r.w / 2, r.y + r.h - 8, productById(this.floor, f.productId!).name, {
        fontSize: '10px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(sprite.depth + 0.2);
      const view: ShelfView = { def: f, ...r, sprite, items: [], label };
      const cap = f.capacity ?? 12;
      for (let i = 0; i < cap; i++) {
        const col = i % 6;
        const row = Math.floor(i / 6);
        const img = this.add.image(r.x + 10 + col * 15, r.y + 8 + row * 12, this.itemKey(f.productId!))
          .setDepth(sprite.depth + 0.1 + row * 0.01).setVisible(false);
        view.items.push(img);
      }
      this.shelves.set(f.id, view);
      this.refreshShelf(f.id);
      if (animate) this.pop(sprite);
    } else if (f.kind === 'counter' || f.kind === 'register2') {
      const r = this.fixtureRect(f)!;
      const sprite = this.add.image(r.x, r.y, 'counter').setOrigin(0).setDepth(10 + (r.y + r.h) / 10);
      this.addSolid(r.x, r.y, r.w, r.h);
      this.counterSprites.push(sprite);
      // cashier mat behind the counter
      for (let i = 0; i < r.w / TILE; i++) {
        this.add.image(r.x + i * TILE, r.y - TILE, `cashier_mat_${this.floor.id}`).setOrigin(0).setDepth(0.2);
      }
      if (animate) this.pop(sprite);
    } else if (f.kind === 'cashier') {
      const x = (COUNTER_1.col + 1) * TILE + TILE / 2;
      const y = (COUNTER_1.row - 1) * TILE + TILE / 2 + 8;
      this.add.image(x, y + 4, 'shadow').setDepth(1);
      this.cashierNpc = this.add.image(x, y, `staff_${this.floor.id}_0`).setOrigin(0.5, 0.86).setDepth(10 + y / 10);
      if (animate) this.pop(this.cashierNpc);
    } else if (f.kind === 'stocker') {
      this.stocker = new Stocker(this, `staff_${this.floor.id}`);
    }
    for (const c of this.customers) if (c.state === 'inQueue' || c.state === 'toQueue') c.moveToQueueTile();
  }

  private pop(obj: Phaser.GameObjects.Image): void {
    obj.setScale(0.6);
    this.tweens.add({ targets: obj, scale: 1, duration: 350, ease: 'Back.easeOut' });
  }

  private buildCrates(): void {
    this.floor.products.forEach((p, i) => {
      const col = 1 + i;
      const x = col * TILE;
      const y = STORAGE_ROWS.top * TILE;
      this.add.image(x, y, 'crate').setOrigin(0).setDepth(2);
      this.addSolid(x + 4, y + 4, TILE - 8, TILE - 8);
      const icon = this.add.image(x + TILE / 2, y + 14, this.itemKey(p.id)).setDepth(3);
      const count = this.add.text(x + TILE / 2, y + TILE - 14, '0', {
        fontSize: '12px', color: '#ffffff', fontStyle: 'bold', backgroundColor: '#00000088', padding: { x: 3, y: 1 },
      }).setOrigin(0.5).setDepth(3);
      const view: CrateView = { productId: p.id, col, x, y, w: TILE, h: TILE, count, icon };
      this.crates.set(p.id, view);
      this.refreshCrate(p.id);
    });
  }

  private buildPlayer(): void {
    const startX = STORAGE_DOOR_COLS[1] * TILE + TILE / 2;
    const startY = (STORAGE_WALL_ROW + 1) * TILE + TILE / 2 + 10;
    this.playerShadow = this.add.image(startX, startY + 4, 'shadow').setDepth(1);
    this.player = this.physics.add.sprite(startX, startY, `staff_${this.floor.id}_0`).setOrigin(0.5, 0.86);
    this.player.body!.setSize(24, 14).setOffset(8, 42);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10 + startY / 10);
  }

  private buildInput(): void {
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.joyBase = this.add.image(0, 0, 'joy_base').setDepth(5000).setVisible(false);
    this.joyKnob = this.add.image(0, 0, 'joy_knob').setDepth(5001).setVisible(false);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.joyPointerId !== -1) return;
      this.joyPointerId = p.id;
      this.joyOrigin = new Phaser.Math.Vector2(p.x, p.y);
      this.joyVec.set(0, 0);
      this.joyBase.setPosition(p.x, p.y).setVisible(true);
      this.joyKnob.setPosition(p.x, p.y).setVisible(true);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.joyPointerId || !this.joyOrigin) return;
      const v = new Phaser.Math.Vector2(p.x - this.joyOrigin.x, p.y - this.joyOrigin.y);
      if (v.length() > 50) v.setLength(50);
      this.joyVec.copy(v).scale(1 / 50);
      this.joyKnob.setPosition(this.joyOrigin.x + v.x, this.joyOrigin.y + v.y);
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.joyPointerId) return;
      this.joyPointerId = -1;
      this.joyOrigin = null;
      this.joyVec.set(0, 0);
      this.joyBase.setVisible(false);
      this.joyKnob.setVisible(false);
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  private buildHud(): void {
    ui.showHud(true);
    ui.onButton('order', () => this.openOrderPanel());
    ui.onButton('build', () => this.openBuildPanel());
    ui.onButton('elevator', () => this.openElevatorPanel());
  }

  // ---------------------------------------------------------------- helpers used by entities
  itemKey(productId: string): string {
    return `item_${this.floor.id}_${productId}`;
  }

  productPrice(productId: string): number {
    return productById(this.floor, productId).sellPrice;
  }

  shelfProduct(fixtureId: string): string {
    return this.shelves.get(fixtureId)?.def.productId ?? this.floor.products[0].id;
  }

  shelfStock(fixtureId: string): number {
    return this.fs.shelf[fixtureId] ?? 0;
  }

  shelfIsFull(fixtureId: string): boolean {
    const s = this.shelves.get(fixtureId);
    if (!s) return true;
    return this.shelfStock(fixtureId) >= (s.def.capacity ?? 12);
  }

  shelfAccessTile(fixtureId: string): Pt | null {
    const s = this.shelves.get(fixtureId);
    if (!s || s.def.slot === undefined) return null;
    const slot = SHELF_SLOTS[s.def.slot];
    return { col: slot.col + (Math.random() < 0.5 ? 0 : 1), row: slot.row + 1 };
  }

  crateAccessTile(productId: string): Pt | null {
    const c = this.crates.get(productId);
    if (!c) return null;
    return { col: c.col, row: STORAGE_ROWS.bottom };
  }

  crateStock(productId: string): number {
    return this.fs.crate[productId] ?? 0;
  }

  takeFromCrate(productId: string): boolean {
    if (this.crateStock(productId) <= 0) return false;
    this.fs.crate[productId] = this.crateStock(productId) - 1;
    this.refreshCrate(productId);
    return true;
  }

  returnToCrate(productId: string, n: number): void {
    this.fs.crate[productId] = this.crateStock(productId) + n;
    this.refreshCrate(productId);
  }

  putOnShelf(fixtureId: string, productId: string): boolean {
    const s = this.shelves.get(fixtureId);
    if (!s || s.def.productId !== productId || this.shelfIsFull(fixtureId)) return false;
    this.fs.shelf[fixtureId] = this.shelfStock(fixtureId) + 1;
    this.refreshShelf(fixtureId);
    return true;
  }

  takeFromShelf(fixtureId: string): string | null {
    const s = this.shelves.get(fixtureId);
    if (!s || this.shelfStock(fixtureId) <= 0) return null;
    this.fs.shelf[fixtureId] = this.shelfStock(fixtureId) - 1;
    this.refreshShelf(fixtureId);
    return s.def.productId!;
  }

  stockingJobs(): { fixtureId: string; productId: string }[] {
    const jobs: { fixtureId: string; productId: string; need: number }[] = [];
    for (const s of this.shelves.values()) {
      const cap = s.def.capacity ?? 12;
      const stock = this.shelfStock(s.def.id);
      const productId = s.def.productId!;
      if (stock < cap && this.crateStock(productId) > 0) {
        jobs.push({ fixtureId: s.def.id, productId, need: cap - stock });
      }
    }
    jobs.sort((a, b) => b.need - a.need);
    return jobs;
  }

  customerPath(from: Pt, to: Pt): Pt[] {
    return findPath(this.customerBlocked, from, to);
  }

  staffPath(from: Pt, to: Pt): Pt[] {
    return findPath(this.staffBlocked, from, to);
  }

  private registerCount(): number {
    return this.fs.purchased.includes('register2') ? 2 : 1;
  }

  queueTileFor(index: number): Pt {
    const two = this.registerCount() === 2;
    const tiles = two
      ? QUEUE_TILES
      : [QUEUE_TILES[0], QUEUE_TILES[2], QUEUE_TILES[4], QUEUE_TILES[6], { col: 1, row: 15 }, { col: 3, row: 15 }, QUEUE_TILES[3], QUEUE_TILES[7]];
    return tiles[Math.min(Math.max(index, 0), tiles.length - 1)];
  }

  enqueue(c: Customer): void {
    if (!this.queue.includes(c)) this.queue.push(c);
    c.queueIndex = this.queue.indexOf(c);
  }

  dequeue(c: Customer): void {
    const i = this.queue.indexOf(c);
    if (i === -1) return;
    this.queue.splice(i, 1);
    this.queue.forEach((q, idx) => {
      q.queueIndex = idx;
      q.moveToQueueTile();
    });
  }

  completeSale(c: Customer): void {
    const value = c.basketValue();
    this.addMoney(value, c.person.x, c.person.y - 40);
    this.save.rating = Math.min(100, this.save.rating + RATING_PER_SALE);
    this.refreshHud();
  }

  customerAngry(ratingLoss: number): void {
    this.save.rating = Math.max(0, this.save.rating - ratingLoss);
    this.cameras.main.shake(120, 0.004);
    this.floatText('-' + ratingLoss + ' ★', this.player.x, this.player.y - 70, '#ff6b6b');
    this.refreshHud();
    if (this.save.rating < RATING_CLOSED_BELOW && !this.closed) this.storeClosed();
  }

  // ---------------------------------------------------------------- economy
  private addMoney(n: number, x: number, y: number): void {
    this.save.money += n;
    this.save.lifetimeEarned += n;
    this.floatText('+' + fmtMoney(n), x, y, '#3ddc84');
    this.refreshHud();
  }

  private floatText(text: string, x: number, y: number, color: string): void {
    const t = this.add.text(x, y, text, { fontSize: '16px', color, fontStyle: 'bold', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5).setDepth(4000);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  private purchase(f: FixtureDef): void {
    if (this.fs.purchased.includes(f.id)) return;
    this.fs.purchased.push(f.id);
    this.placeFixture(f, true);
    this.floatText(f.name + '!', this.player.x, this.player.y - 70, '#ffd166');
    this.refreshHud();
    this.checkFloorComplete();
    writeSave(this.save);
  }

  private tryBuyInstant(f: FixtureDef): void {
    if (this.save.money < f.cost) return;
    this.save.money -= f.cost;
    this.purchase(f);
  }

  private buyCase(productId: string): void {
    const p = productById(this.floor, productId);
    if (this.save.money < p.caseCost) return;
    this.save.money -= p.caseCost;
    this.fs.crate[productId] = this.crateStock(productId) + p.caseSize;
    this.refreshCrate(productId);
    const c = this.crates.get(productId)!;
    this.floatText('+' + p.caseSize + ' ' + p.name, c.x + TILE / 2, c.y + TILE, '#ffffff');
    this.refreshHud();
    writeSave(this.save);
  }

  private buyUpgrade(id: 'speed' | 'carry'): void {
    const def = UPGRADES.find((u) => u.id === id)!;
    const level = this.save.upgrades[id];
    if (level >= def.maxLevel) return;
    const cost = def.costs[level];
    if (this.save.money < cost) return;
    this.save.money -= cost;
    this.save.upgrades[id] = level + 1;
    this.floatText(def.name + ' ' + (level + 1) + '!', this.player.x, this.player.y - 70, '#ffd166');
    this.refreshHud();
    writeSave(this.save);
  }

  private checkFloorComplete(): void {
    if (this.fs.completed) return;
    const all = this.floor.fixtures.every((f) => this.fs.purchased.includes(f.id));
    if (!all) return;
    this.fs.completed = true;
    const idx = FLOORS.findIndex((f) => f.id === this.floor.id);
    const next = FLOORS[idx + 1];
    if (next) {
      if (!this.save.unlockedFloors.includes(next.id)) this.save.unlockedFloors.push(next.id);
      writeSave(this.save);
      ui.showModal('🎉 Floor ' + this.floor.level + ' complete!', `${this.floor.name} is fully built out.\n\nFloor ${next.level}: ${next.name} is now open. Your money comes with you, and you can ride the elevator back down any time.`, [
        { label: 'Ride the elevator up', onClick: () => this.goToFloor(next.id) },
        { label: 'Keep selling here', style: 'secondary', onClick: () => {} },
      ]);
    } else if (!this.save.won) {
      this.save.won = true;
      writeSave(this.save);
      ui.showModal('🏆 You own the whole mall!', 'Every store on every floor is fully built. You are the Mall Tycoon.\n\nYou can keep playing and stacking money on any floor.', [
        { label: 'Keep playing', onClick: () => {} },
      ]);
    }
  }

  private storeClosed(): void {
    this.closed = true;
    for (const c of this.customers) c.destroy();
    this.customers = [];
    this.queue = [];
    writeSave(this.save);
    ui.closePanel();
    ui.showModal('🚫 CLOSED', `Too many unhappy customers. ${this.floor.name} was shut down.\n\nYour shelves and storage were emptied. You can reopen for half of your money, or start the whole mall over.`, [
      {
        label: 'Reopen (lose half your money)',
        onClick: () => {
          this.save.money = Math.floor(this.save.money / 2);
          this.save.rating = 50;
          this.fs.crate = {};
          this.fs.shelf = {};
          for (const s of this.shelves.keys()) this.refreshShelf(s);
          for (const c of this.crates.keys()) this.refreshCrate(c);
          this.closed = false;
          this.spawnTimer = 6000;
          this.refreshHud();
          writeSave(this.save);
        },
      },
      {
        label: 'Start the whole mall over',
        style: 'danger',
        onClick: () => {
          clearSave();
          this.scene.start('Boot');
        },
      },
    ]);
  }

  private goToFloor(id: string): void {
    writeSave(this.save);
    this.scene.restart({ floorId: id });
  }

  // ---------------------------------------------------------------- visuals refresh
  private refreshShelf(fixtureId: string): void {
    const s = this.shelves.get(fixtureId);
    if (!s) return;
    const stock = this.shelfStock(fixtureId);
    s.items.forEach((img, i) => img.setVisible(i < stock));
    s.label.setText(`${productById(this.floor, s.def.productId!).name} ${stock}/${s.def.capacity ?? 12}`);
    s.label.setColor(stock === 0 ? '#ff6b6b' : '#ffffff');
    if (ui.panelOpen()) this.refreshOpenPanel();
  }

  private refreshCrate(productId: string): void {
    const c = this.crates.get(productId);
    if (!c) return;
    const n = this.crateStock(productId);
    c.count.setText(String(n));
    c.icon.setAlpha(n > 0 ? 1 : 0.3);
    if (ui.panelOpen()) this.refreshOpenPanel();
  }

  private refreshHud(): void {
    ui.setMoney(this.save.money);
    this.refreshPads();
    ui.setRating(this.save.rating);
    const total = this.floor.fixtures.length;
    const done = this.floor.fixtures.filter((f) => this.fs.purchased.includes(f.id)).length;
    ui.setFloor(this.floor.name, `Floor ${this.floor.level} · ${done}/${total} unlocked${this.fs.completed ? ' ✓' : ''}`);
    const nextFixture = this.floor.fixtures.find((f) => !this.fs.purchased.includes(f.id) && (f.kind === 'cashier' || f.kind === 'stocker'));
    ui.setButtonAttention('build', !!nextFixture && this.save.money >= nextFixture.cost);
    const canOrder = this.floor.products.some((p) => this.shelves.size && this.hasShelfFor(p.id) && this.save.money >= p.caseCost && this.crateStock(p.id) === 0);
    ui.setButtonAttention('order', canOrder);
    ui.setButtonAttention('elevator', this.fs.completed && this.save.unlockedFloors.length > 1);
    if (ui.panelOpen()) this.refreshOpenPanel();
  }

  private hasShelfFor(productId: string): boolean {
    for (const s of this.shelves.values()) if (s.def.productId === productId) return true;
    return false;
  }

  // ---------------------------------------------------------------- panels
  private currentPanel: 'order' | 'build' | 'elevator' | null = null;

  private refreshOpenPanel(): void {
    if (this.currentPanel === 'order') ui.refreshPanel((b) => this.renderOrder(b));
    else if (this.currentPanel === 'build') ui.refreshPanel((b) => this.renderBuild(b));
    else if (this.currentPanel === 'elevator') ui.refreshPanel((b) => this.renderElevator(b));
  }

  private openOrderPanel(): void {
    this.currentPanel = 'order';
    ui.openPanel('📦 Order stock', (b) => this.renderOrder(b));
  }

  private renderOrder(body: HTMLElement): void {
    body.appendChild(ui.tip('Cases are delivered to the storage room at the top of the store. Walk into a crate to pick items up, then carry them to the matching shelf.'));
    let any = false;
    for (const p of this.floor.products) {
      if (!this.hasShelfFor(p.id)) continue;
      any = true;
      const shelf = [...this.shelves.values()].find((s) => s.def.productId === p.id)!;
      const color = '#' + p.color.toString(16).padStart(6, '0');
      body.appendChild(ui.row({
        color,
        name: p.name,
        meta: `Case of ${p.caseSize} · sells for ${fmtMoney(p.sellPrice)} each · Storage: ${this.crateStock(p.id)} · Shelf: ${this.shelfStock(shelf.def.id)}/${shelf.def.capacity ?? 12}`,
        button: { label: 'Buy ' + fmtMoney(p.caseCost), disabled: this.save.money < p.caseCost, onClick: () => this.buyCase(p.id) },
      }));
    }
    if (!any) body.appendChild(ui.tip('You have no shelves yet. Walk onto a glowing pad on the sales floor to buy one.'));
  }

  private openBuildPanel(): void {
    this.currentPanel = 'build';
    ui.openPanel('🔨 Build & upgrade', (b) => this.renderBuild(b));
  }

  private renderBuild(body: HTMLElement): void {
    body.appendChild(ui.sectionTitle('This store'));
    for (const f of this.floor.fixtures) {
      const owned = this.fs.purchased.includes(f.id);
      let meta = fmtMoney(f.cost);
      if (f.kind === 'shelf') meta = `Sells ${productById(this.floor, f.productId!).name} · ${fmtMoney(f.cost)}`;
      if (f.kind === 'counter') meta = `Customers can only pay once you have one · ${fmtMoney(f.cost)}`;
      if (f.kind === 'register2') meta = `Check out two customers at once · ${fmtMoney(f.cost)}`;
      if (f.kind === 'cashier') meta = `Rings up customers even when you are away · ${fmtMoney(f.cost)}`;
      if (f.kind === 'stocker') meta = `Carries stock from storage to the shelves for you · ${fmtMoney(f.cost)}`;
      body.appendChild(ui.row({
        color: f.productId ? '#' + productById(this.floor, f.productId).color.toString(16).padStart(6, '0') : undefined,
        name: f.name,
        meta,
        button: owned
          ? { label: '✓ Owned', done: true, disabled: true }
          : { label: 'Buy ' + fmtMoney(f.cost), disabled: this.save.money < f.cost, onClick: () => this.tryBuyInstant(f) },
      }));
    }
    body.appendChild(ui.sectionTitle('Your skills (every floor)'));
    for (const u of UPGRADES) {
      const level = this.save.upgrades[u.id];
      const maxed = level >= u.maxLevel;
      const cost = maxed ? 0 : u.costs[level];
      const stat = u.id === 'carry' ? `Carry ${CARRY_BY_LEVEL[level]}` : `Speed ${SPEED_BY_LEVEL[level]}`;
      body.appendChild(ui.row({
        name: `${u.name} · Lv ${level}/${u.maxLevel}`,
        meta: `${u.desc} ${stat}.`,
        button: maxed
          ? { label: 'MAX', done: true, disabled: true }
          : { label: 'Upgrade ' + fmtMoney(cost), disabled: this.save.money < cost, onClick: () => this.buyUpgrade(u.id) },
      }));
    }
  }

  private openElevatorPanel(): void {
    this.currentPanel = 'elevator';
    ui.openPanel('🛗 Elevator', (b) => this.renderElevator(b));
  }

  private renderElevator(body: HTMLElement): void {
    body.appendChild(ui.tip('Finish every unlock on a floor to open the next one. Your money comes with you, and finished floors stay open.'));
    for (const f of FLOORS) {
      const unlocked = this.save.unlockedFloors.includes(f.id);
      const current = f.id === this.floor.id;
      const done = this.save.floors[f.id]?.completed;
      const prev = FLOORS[FLOORS.indexOf(f) - 1];
      body.appendChild(ui.row({
        name: `Floor ${f.level} · ${f.name}${done ? ' ✓' : ''}`,
        meta: unlocked ? f.tagline : `Locked · finish Floor ${prev?.level ?? 1} to open`,
        locked: !unlocked,
        button: current
          ? { label: 'You are here', done: true, disabled: true }
          : { label: 'Go', disabled: !unlocked, onClick: () => { ui.closePanel(); this.goToFloor(f.id); } },
      }));
    }
  }

  // ---------------------------------------------------------------- update loop
  update(_time: number, delta: number): void {
    const dt = Math.min(delta, 50);
    if (ui.modalOpen()) {
      this.player.setVelocity(0, 0);
      return;
    }
    this.updatePlayer(dt);
    this.updateInteractions(dt);
    this.updateCustomers(dt);
    this.updateCheckout();
    this.stocker?.update(dt);
    this.updateHint();

    this.saveTimer += dt;
    if (this.saveTimer > 2000) {
      this.saveTimer = 0;
      writeSave(this.save);
    }
  }

  private updatePlayer(dt: number): void {
    const speed = SPEED_BY_LEVEL[this.save.upgrades.speed];
    let vx = 0;
    let vy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) vx -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown) vx += 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) vy -= 1;
    if (this.cursors.down.isDown || this.wasd.S.isDown) vy += 1;
    if (vx === 0 && vy === 0 && this.joyVec.length() > 0.15) {
      vx = this.joyVec.x;
      vy = this.joyVec.y;
    }
    const v = new Phaser.Math.Vector2(vx, vy);
    if (v.length() > 1) v.normalize();
    this.player.setVelocity(v.x * speed, v.y * speed);
    if (v.x !== 0) this.player.setFlipX(v.x < 0);

    const moving = v.length() > 0.01;
    if (moving) {
      this.animT += dt;
      if (this.animT > 130) {
        this.animT = 0;
        this.animFrame = 1 - this.animFrame;
        this.player.setTexture(`staff_${this.floor.id}_${this.animFrame}`);
      }
    } else if (this.animFrame !== 0) {
      this.animFrame = 0;
      this.player.setTexture(`staff_${this.floor.id}_0`);
    }
    this.player.setDepth(10 + this.player.y / 10);
    this.playerShadow.setPosition(this.player.x, this.player.y + 4);
    for (let i = 0; i < this.carried.length; i++) {
      this.carried[i].setPosition(this.player.x, this.player.y - 50 - i * 6).setDepth(this.player.depth + 0.1);
    }
  }

  private playerRect(): Phaser.Geom.Rectangle {
    const b = this.player.body as Phaser.Physics.Arcade.Body;
    return new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height);
  }

  private near(r: { x: number; y: number; w: number; h: number }, pad = 14): boolean {
    const zone = new Phaser.Geom.Rectangle(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2);
    return Phaser.Geom.Intersects.RectangleToRectangle(this.playerRect(), zone);
  }

  private updateInteractions(dt: number): void {
    this.pickTimer -= dt;
    const carryCap = CARRY_BY_LEVEL[this.save.upgrades.carry];

    // buy pads: stand on one for a moment to buy it (only if you can afford the whole thing)
    let onPad: PadView | null = null;
    for (const pad of this.pads.values()) {
      if (this.near(pad, -4)) { onPad = pad; break; }
    }
    if (onPad && onPad === this.padUnderPlayer) {
      this.padDwell += dt;
    } else {
      this.padDwell = 0;
      this.padUnderPlayer = onPad;
    }
    if (onPad && this.padDwell > 350 && this.save.money >= onPad.def.cost) {
      this.save.money -= onPad.def.cost;
      this.padDwell = 0;
      this.padUnderPlayer = null;
      this.purchase(onPad.def);
    }

    // elevator
    const elev = { x: ELEVATOR.col * TILE, y: ELEVATOR.row * TILE, w: TILE, h: TILE * 2 };
    if (this.near(elev, -6)) {
      if (!this.onElevator) {
        this.onElevator = true;
        if (!ui.panelOpen()) this.openElevatorPanel();
      }
    } else {
      this.onElevator = false;
    }

    if (this.pickTimer > 0) return;

    // crates: pick up
    for (const c of this.crates.values()) {
      if (!this.near(c, 22)) continue;
      const have = this.carrying?.count ?? 0;
      if (have >= carryCap) continue;
      if (this.carrying && this.carrying.productId !== c.productId) continue;
      if (this.crateStock(c.productId) <= 0) continue;
      this.takeFromCrate(c.productId);
      this.carrying = { productId: c.productId, count: have + 1 };
      const img = this.add.image(this.player.x, this.player.y, this.itemKey(c.productId));
      this.carried.push(img);
      this.tweens.add({ targets: img, scale: { from: 1.5, to: 1 }, duration: 150 });
      this.pickTimer = 160;
      return;
    }

    // shelves: put down
    if (this.carrying) {
      for (const s of this.shelves.values()) {
        if (s.def.productId !== this.carrying.productId) continue;
        if (!this.near(s, 22)) continue;
        if (this.putOnShelf(s.def.id, this.carrying.productId)) {
          this.carrying.count -= 1;
          const img = this.carried.pop();
          img?.destroy();
          if (this.carrying.count <= 0) this.carrying = null;
          this.pickTimer = 160;
          return;
        }
      }
    }
  }

  private spawnInterval(): number {
    const shelves = this.shelves.size;
    const base = this.floor.customerEveryMs;
    const ratingFactor = 0.7 + (this.save.rating / 100) * 0.6; // good rating → more customers
    return Math.max(1600, (base / (0.5 + shelves * 0.22)) / ratingFactor);
  }

  private updateCustomers(dt: number): void {
    const hasCounter = this.fs.purchased.includes('counter');
    const maxCustomers = 6 + this.registerCount() * 2;
    const anyStock = [...this.shelves.keys()].some((id) => this.shelfStock(id) > 0);
    if (hasCounter && anyStock && this.customers.length < maxCustomers) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = this.spawnInterval() * (0.7 + Math.random() * 0.6);
        this.spawnCustomer();
      }
    }
    for (const c of this.customers) c.update(dt);
    const gone = this.customers.filter((c) => c.state === 'done');
    for (const c of gone) c.destroy();
    if (gone.length) this.customers = this.customers.filter((c) => c.state !== 'done');
  }

  private spawnCustomer(): void {
    const shelves = [...this.shelves.values()];
    const stocked = shelves.filter((s) => this.shelfStock(s.def.id) > 0);
    const pick = (): ShelfView => {
      if (stocked.length && Math.random() < 0.75) return Phaser.Utils.Array.GetRandom(stocked);
      return Phaser.Utils.Array.GetRandom(shelves);
    };
    const wants: Want[] = [];
    const n = Math.random() < 0.6 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const s = pick();
      if (wants.some((w) => w.fixtureId === s.def.id)) continue;
      const price = productById(this.floor, s.def.productId!).sellPrice;
      const maxCount = price >= 100 ? 1 : price >= 20 ? 2 : 3;
      wants.push({ fixtureId: s.def.id, count: 1 + Math.floor(Math.random() * maxCount) });
    }
    this.customers.push(new Customer(this, Math.floor(Math.random() * 8), wants));
  }

  private playerAtCounter(): boolean {
    const b = this.player.body as Phaser.Physics.Arcade.Body;
    const col = Math.floor(b.center.x / TILE);
    const row = Math.floor(b.center.y / TILE);
    if (row !== COUNTER_1.row - 1) return false;
    if (col >= COUNTER_1.col && col < COUNTER_1.col + COUNTER_1.width) return true;
    if (this.registerCount() === 2 && col >= COUNTER_2.col && col < COUNTER_2.col + COUNTER_2.width) return true;
    return false;
  }

  private updateCheckout(): void {
    const registers = this.registerCount();
    const cashiers = (this.fs.purchased.includes('cashier') ? 1 : 0) + (this.playerAtCounter() ? 1 : 0);
    const slots = Math.min(registers, cashiers);
    let active = this.queue.filter((c) => c.state === 'checkout').length;
    for (let i = 0; i < Math.min(registers, this.queue.length); i++) {
      if (active >= slots) break;
      const c = this.queue[i];
      if (c.state === 'inQueue' && c.arrivedAtQueue) {
        c.startCheckout();
        active++;
      }
    }
  }

  private updateHint(): void {
    if (ui.panelOpen()) {
      ui.setHint(null);
      return;
    }
    const hasCounter = this.fs.purchased.includes('counter');
    const waiting = this.queue.filter((c) => c.state === 'inQueue').length;
    const cashierHired = this.fs.purchased.includes('cashier');
    let hint: string | null = null;
    if (!hasCounter) hint = 'Walk onto the glowing pad near the bottom to buy a Checkout Counter';
    else if (this.shelves.size === 0) hint = 'Walk onto a glowing pad on the sales floor to buy a shelf';
    else if (this.carrying) {
      const p = productById(this.floor, this.carrying.productId);
      hint = `Carrying ${this.carrying.count} ${p.name} · walk to the ${p.name} shelf`;
    } else if (waiting > 0 && !cashierHired && !this.playerAtCounter()) hint = `${waiting} customer${waiting > 1 ? 's' : ''} waiting · stand behind the counter!`;
    else if (!this.stocker && [...this.crates.values()].some((c) => this.crateStock(c.productId) > 0 && !this.shelfFullFor(c.productId))) hint = 'Grab items from the crates in the storage room (top)';
    else if ([...this.shelves.values()].every((s) => this.shelfStock(s.def.id) === 0)) hint = 'Shelves are empty · tap Order to buy stock';
    else if (this.fs.completed && this.save.unlockedFloors.length > 1 && !this.save.won) hint = 'Floor complete! Step into the elevator (bottom right)';
    ui.setHint(hint);
  }

  private shelfFullFor(productId: string): boolean {
    for (const s of this.shelves.values()) if (s.def.productId === productId && !this.shelfIsFull(s.def.id)) return false;
    return true;
  }
}
