import * as THREE from 'three';
import {
  COLS, ROWS, FLOORS, FloorDef, FixtureDef, ProductDef, floorById, productById,
  SHELF_SLOTS, STORAGE_ROWS, COUNTER_1, COUNTER_2, QUEUE_TILES, ELEVATOR, PLAYER_START,
  UPGRADES, CARRY_BY_LEVEL, SPEED_BY_LEVEL, STAMINA_BY_LEVEL, PATIENCE_MULT_BY_LEVEL, SPRINT_MULT,
  RATING_CLOSED_BELOW, RATING_PER_SALE,
} from '../data/floors';
import { SaveData, FloorSave, loadSave, writeSave, floorSave, clearSave, newSave } from '../systems/save';
import { findPath, Pt } from '../systems/pathfinding';
import { ui, fmtMoney } from '../systems/ui';
import { Renderer3D } from '../render/Renderer3D';
import {
  buildWorld, makeShelf, shelfStyleFor, makeCounter, makeCrate, makePad, makeCashierMat, makeItem, mat, tileAt, isSolidTile, disposeGroup, makeFadeable, FadeWall, WALL_H,
} from '../render/builders';
import { makeTextSprite, updateTextSprite } from '../render/text';
import { Character } from '../render/Character';
import { Customer, Want } from '../entities/Customer';
import { Stocker } from '../entities/Stocker';
import { Walker } from '../entities/Walker';
import { Input } from './Input';

interface ShelfView {
  def: FixtureDef;
  col: number; row: number; w: number; h: number;
  group: THREE.Group;
  items: THREE.Group[];
  label: THREE.Sprite;
}
interface FadeFixture { col: number; row: number; w: number; mats: THREE.Material[]; }
interface PadView {
  def: FixtureDef;
  col: number; row: number; w: number; h: number;
  mesh: THREE.Mesh;
  label: THREE.Sprite;
  ok: boolean;
}
interface CrateView {
  productId: string;
  col: number; row: number;
  group: THREE.Group;
  count: THREE.Sprite;
  samples: THREE.Group[];
}
interface FloatText { sprite: THREE.Sprite; life: number; }
interface Pop { obj: THREE.Object3D; t: number; }

const key = (c: number, r: number) => c + ',' + r;
const PLAYER_R = 0.3;

export class Game {
  r3d: Renderer3D;
  input: Input;
  save!: SaveData;
  floor!: FloorDef;
  fs!: FloorSave;

  private world: THREE.Group | null = null;
  private fadeWalls: FadeWall[] = [];
  private fadeFixtures: FadeFixture[] = [];
  private dynamic = new THREE.Group();     // everything that changes per floor besides the world
  player!: Character;
  hand: string[] = [];                     // product ids the player is carrying, bottom to top
  private pickTimer = 0;
  stamina = 0;
  private staminaRest = 0;
  private sprinting = false;
  paused = false;
  private exhausted = false;
  private noRender = false;

  private playerSolid = new Set<string>();
  private customerBlocked = new Set<string>();
  private staffBlocked = new Set<string>();
  private walkerBlocked = new Set<string>();
  private concourseTiles: Pt[] = [];

  shelves = new Map<string, ShelfView>();
  pads = new Map<string, PadView>();
  crates = new Map<string, CrateView>();
  private cashierNpc: Character | null = null;
  stocker: Stocker | null = null;
  customers: Customer[] = [];
  private walkers: Walker[] = [];
  private queue: Customer[] = [];
  private floats: FloatText[] = [];
  private pops: Pop[] = [];

  private spawnTimer = 3000;
  private saveTimer = 0;
  private onElevator = false;
  private padUnderPlayer: PadView | null = null;
  private padDwell = 0;
  private closed = false;
  private lastTime = 0;
  private currentPanel: 'order' | 'build' | 'elevator' | 'player' | null = null;
  private water: THREE.Object3D | null = null;
  private time = 0;
  private fpsSamples = 0;
  private fpsTime = 0;
  private fpsChecked = false;

  constructor(container: HTMLElement) {
    this.r3d = new Renderer3D(container);
    this.input = new Input(container);
    this.r3d.scene.add(this.dynamic);
    ui.onButton('order', () => this.openOrderPanel());
    ui.onButton('build', () => this.openBuildPanel());
    ui.onButton('player', () => this.openPlayerPanel());
    ui.onButton('elevator', () => this.openElevatorPanel());
    ui.onButton('pause', () => this.openPauseMenu());
    this.input.bindSprintButton(ui.sprintButton());
    ui.showSprintButton(this.r3d.isMobile || 'ontouchstart' in window);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key.toLowerCase() === 'p') this.openPauseMenu(); });
    (window as unknown as { __mallTycoon?: Game }).__mallTycoon = this;
    let lowFx = false;
    try { lowFx = location.search.includes('low') || localStorage.getItem('mall-tycoon-lowfx') === '1'; } catch { /* ignore */ }
    if (lowFx) { this.r3d.setQuality('low'); this.fpsChecked = true; }
    try { this.noRender = location.search.includes('norender'); } catch { /* ignore */ }
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- lifecycle
  showTitle(): void {
    this.save = loadSave();
    const hasSave = this.save.lifetimeEarned > 0 || (this.save.floors[this.save.currentFloor]?.purchased.length ?? 0) > 0;
    ui.showHud(false);
    // show the current floor behind the title so it isn't a black screen
    this.loadFloor(this.save.currentFloor);
    ui.showTitle({
      hasSave,
      onContinue: () => { ui.showHud(true); this.r3d.resize(); },
      onNew: () => {
        this.save = newSave();
        writeSave(this.save);
        this.loadFloor(this.save.currentFloor);
        ui.showHud(true);
        this.r3d.resize();
      },
    });
  }

  loadFloor(floorId: string): void {
    // tear down
    for (const c of this.customers) c.destroy();
    for (const w of this.walkers) w.destroy();
    this.stocker?.destroy();
    this.customers = [];
    this.walkers = [];
    this.queue = [];
    this.stocker = null;
    this.cashierNpc = null;
    this.shelves.clear();
    this.pads.clear();
    this.crates.clear();
    this.floats = [];
    this.pops = [];
    this.fadeFixtures = [];
    this.hand = [];
    this.closed = false;
    this.paused = false;
    this.onElevator = false;
    this.padUnderPlayer = null;
    this.padDwell = 0;
    this.spawnTimer = 3000;
    if (this.world) disposeGroup(this.world);
    while (this.dynamic.children.length) disposeGroup(this.dynamic.children[0]);
    ui.closePanel();

    this.floor = floorById(floorId);
    this.save.currentFloor = floorId;
    this.fs = floorSave(this.save, floorId);

    const world = buildWorld(this.floor);
    this.world = world.group;
    this.fadeWalls = world.fadeWalls;
    this.r3d.scene.add(this.world);
    this.water = this.world.getObjectByName('water') ?? null;
    this.buildBlockedSets();
    this.buildCrates();
    for (const f of this.floor.fixtures) {
      if (this.fs.purchased.includes(f.id)) this.placeFixture(f, false);
      else this.placePad(f);
    }
    this.buildPlayer();
    this.hand = [...(this.fs.hand ?? [])].filter((id) => this.floor.products.some((p) => p.id === id));
    this.attachHand();
    this.stamina = this.staminaMax();
    for (let i = 0; i < 8; i++) this.walkers.push(new Walker(this, i + 3, this.randomConcourseTile()));
    this.refreshHud();
    this.persist();
  }

  private buildBlockedSets(): void {
    this.playerSolid.clear();
    this.customerBlocked.clear();
    this.staffBlocked.clear();
    this.walkerBlocked.clear();
    this.concourseTiles = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = tileAt(c, r);
        const k = key(c, r);
        if (isSolidTile(ch) || ch === 'L') {
          this.playerSolid.add(k);
          this.customerBlocked.add(k);
          this.staffBlocked.add(k);
        }
        if (ch === 'S' || ch === 'd') this.customerBlocked.add(k);
        if (ch !== '.') this.walkerBlocked.add(k);
        else this.concourseTiles.push({ col: c, row: r });
      }
    }
    // crates
    this.floor.products.forEach((_, i) => {
      const k = key(1 + i, STORAGE_ROWS.top);
      this.playerSolid.add(k);
      this.customerBlocked.add(k);
      this.staffBlocked.add(k);
    });
    // shelf slots and counters are never walkable for NPCs (either a shelf or a buy pad sits there)
    for (const s of SHELF_SLOTS) for (const dc of [0, 1]) {
      this.customerBlocked.add(key(s.col + dc, s.row));
      this.staffBlocked.add(key(s.col + dc, s.row));
    }
    for (const ctr of [COUNTER_1, COUNTER_2]) for (let i = 0; i < ctr.width; i++) {
      this.customerBlocked.add(key(ctr.col + i, ctr.row));
      this.staffBlocked.add(key(ctr.col + i, ctr.row));
      this.customerBlocked.add(key(ctr.col + i, ctr.row - 1));
      this.staffBlocked.add(key(ctr.col + i, ctr.row - 1));
    }
  }

  private buildCrates(): void {
    this.floor.products.forEach((p, i) => {
      const col = 1 + i;
      const row = STORAGE_ROWS.top;
      const group = makeCrate();
      group.position.set(col + 0.5, 0, row + 0.5);
      // up to four sample items stacked in the crate: more stock, taller pile
      const samples: THREE.Group[] = [];
      const spots = [[-0.18, 0.62, -0.1], [0.18, 0.62, 0.12], [-0.05, 0.86, 0.02], [0.1, 1.1, -0.05]];
      for (const [x, y, z] of spots) {
        const it = makeItem(p);
        it.position.set(x, y, z);
        it.scale.setScalar(1.35);
        it.rotation.y = Math.random() * 0.6;
        group.add(it);
        samples.push(it);
      }
      const count = makeTextSprite(p.name + '\n0', { size: 40, bg: 'rgba(20,24,36,0.85)', color: '#ffffff', height: 0.7 });
      count.position.set(0, i % 2 === 0 ? 1.55 : 2.3, 0.1);   // staggered heights so the row of signs stays readable
      group.add(count);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mat(p.color, { emissive: p.color }));
      dot.position.set(0, i % 2 === 0 ? 1.1 : 1.85, 0.1);
      group.add(dot);
      this.dynamic.add(group);
      this.crates.set(p.id, { productId: p.id, col, row, group, count, samples });
      this.refreshCrate(p.id);
    });
  }

  private buildPlayer(): void {
    this.player = new Character({ skin: 0xf1c27d, shirt: 0xffffff, hair: 0x4a2c17, apron: this.floor.uniformColor, pants: 0x2b3a55 });
    this.player.group.position.set(PLAYER_START.col + 0.5, 0, PLAYER_START.row + 0.5);
    this.dynamic.add(this.player.group);
    this.r3d.snapTo(this.player.group.position.x, this.player.group.position.z);
  }

  private staffLook() {
    return { skin: 0xe0ac69, shirt: 0xffffff, hair: 0x2b1d0e, apron: this.floor.uniformColor, pants: 0x2b3a55 };
  }

  // ---------------------------------------------------------------- fixtures
  private fixtureRect(f: FixtureDef): { col: number; row: number; w: number; h: number } | null {
    if (f.kind === 'shelf' && f.slot !== undefined) {
      const s = SHELF_SLOTS[f.slot];
      return { col: s.col, row: s.row, w: 2, h: 1 };
    }
    if (f.kind === 'counter') return { col: COUNTER_1.col, row: COUNTER_1.row, w: COUNTER_1.width, h: 1 };
    if (f.kind === 'register2') return { col: COUNTER_2.col, row: COUNTER_2.row, w: COUNTER_2.width, h: 1 };
    return null;
  }

  private placePad(f: FixtureDef): void {
    const r = this.fixtureRect(f);
    if (!r) return;
    const ok = this.save.money >= f.cost;
    const mesh = makePad(r.w, ok);
    mesh.position.set(r.col + r.w / 2, 0.02, r.row + 0.5);
    const label = makeTextSprite(`${f.name}\n${fmtMoney(f.cost)}`, { size: 30, color: ok ? '#0b3d22' : '#5a1d1d', bg: 'rgba(255,255,255,0.85)', height: 0.62 });
    label.position.set(r.col + r.w / 2, 0.6, r.row + 0.5);
    this.dynamic.add(mesh, label);
    this.pads.set(f.id, { def: f, ...r, mesh, label, ok });
  }

  private refreshPads(): void {
    for (const pad of this.pads.values()) {
      const ok = this.save.money >= pad.def.cost;
      if (ok === pad.ok) continue;
      pad.ok = ok;
      const fresh = makePad(pad.w, ok);
      fresh.position.copy(pad.mesh.position);
      this.dynamic.remove(pad.mesh);
      this.dynamic.add(fresh);
      pad.mesh = fresh;
      updateTextSprite(pad.label, `${pad.def.name}\n${fmtMoney(pad.def.cost)}`, { size: 30, color: ok ? '#0b3d22' : '#5a1d1d', bg: 'rgba(255,255,255,0.85)', height: 0.62 });
    }
  }

  private placeFixture(f: FixtureDef, animate: boolean): void {
    const pad = this.pads.get(f.id);
    if (pad) {
      this.dynamic.remove(pad.mesh);
      disposeGroup(pad.label);
      this.pads.delete(f.id);
    }
    const r = this.fixtureRect(f);
    if (f.kind === 'shelf' && r) {
      const product = productById(this.floor, f.productId!);
      const cap = f.capacity ?? 12;
      const { group, slots } = makeShelf(shelfStyleFor(f.id), product.accent, cap);
      group.position.set(r.col + r.w / 2, 0, r.row + 0.5);
      const items: THREE.Group[] = [];
      for (const s of slots) {
        const it = makeItem(product);
        it.position.copy(s);
        it.visible = false;
        group.add(it);
        items.push(it);
      }
      const label = makeTextSprite(product.name, { size: 30, color: '#ffffff', height: 0.42 });
      label.position.set(0, 1.85, 0.2);
      group.add(label);
      this.dynamic.add(group);
      this.fadeFixtures.push({ col: r.col, row: r.row, w: r.w, mats: makeFadeable(group) });
      for (const dc of [0, 1]) this.playerSolid.add(key(r.col + dc, r.row));
      this.shelves.set(f.id, { def: f, ...r, group, items, label });
      this.refreshShelf(f.id);
      if (animate) this.pop(group);
    } else if ((f.kind === 'counter' || f.kind === 'register2') && r) {
      const group = makeCounter();
      group.position.set(r.col + r.w / 2, 0, r.row + 0.5);
      this.dynamic.add(group);
      this.fadeFixtures.push({ col: r.col, row: r.row, w: r.w, mats: makeFadeable(group) });
      for (let i = 0; i < r.w; i++) this.playerSolid.add(key(r.col + i, r.row));
      const matMesh = makeCashierMat(r.w, this.floor.uniformColor);
      matMesh.position.set(r.col + r.w / 2, 0.015, r.row - 0.5);
      this.dynamic.add(matMesh);
      if (f.kind === 'counter') {
        const hint = makeTextSprite('CASHIER', { size: 26, color: '#ffffff', bg: 'rgba(0,0,0,0.55)', height: 0.3 });
        hint.position.set(r.col + r.w / 2, 0.35, r.row - 0.5);
        this.dynamic.add(hint);
      }
      if (animate) this.pop(group);
    } else if (f.kind === 'cashier') {
      this.cashierNpc = new Character(this.staffLook());
      this.cashierNpc.group.position.set(COUNTER_1.col + 1.5, 0, COUNTER_1.row - 0.5);
      this.cashierNpc.face(0, 1);
      this.dynamic.add(this.cashierNpc.group);
      if (animate) this.pop(this.cashierNpc.group);
    } else if (f.kind === 'stocker') {
      this.stocker = new Stocker(this, this.staffLook());
    }
    for (const c of this.customers) if (c.state === 'inQueue' || c.state === 'toQueue') c.moveToQueueTile();
  }

  private pop(obj: THREE.Object3D): void {
    obj.scale.setScalar(0.5);
    this.pops.push({ obj, t: 0 });
  }

  // ---------------------------------------------------------------- helpers used by entities
  product(productId: string): ProductDef {
    return productById(this.floor, productId);
  }

  productPrice(productId: string): number {
    return this.product(productId).sellPrice;
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
    if (!s) return null;
    return { col: s.col + (Math.random() < 0.5 ? 0 : 1), row: s.row + 1 };
  }

  shelfCenter(fixtureId: string): { x: number; z: number } | null {
    const s = this.shelves.get(fixtureId);
    if (!s) return null;
    return { x: s.col + s.w / 2, z: s.row + 0.5 };
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
      if (stock < cap && this.crateStock(productId) > 0) jobs.push({ fixtureId: s.def.id, productId, need: cap - stock });
    }
    jobs.sort((a, b) => b.need - a.need);
    return jobs;
  }

  customerPath(from: Pt, to: Pt): Pt[] { return findPath(this.customerBlocked, from, to); }
  staffPath(from: Pt, to: Pt): Pt[] { return findPath(this.staffBlocked, from, to); }
  walkerPath(from: Pt, to: Pt): Pt[] { return findPath(this.walkerBlocked, from, to); }

  randomConcourseTile(): Pt {
    return this.concourseTiles[Math.floor(Math.random() * this.concourseTiles.length)];
  }

  staminaMax(): number {
    return STAMINA_BY_LEVEL[this.save.upgrades.endurance ?? 0];
  }

  patienceMs(): number {
    return this.floor.patienceMs * PATIENCE_MULT_BY_LEVEL[this.save.upgrades.charm ?? 0];
  }

  private persist(): void {
    this.fs.hand = [...this.hand];
    writeSave(this.save);
  }

  // what the player holds, shown as a mixed stack above their head
  private attachHand(): void {
    let stack = this.player.group.getObjectByName('carried') as THREE.Group | undefined;
    if (!stack) {
      stack = new THREE.Group();
      stack.name = 'carried';
      this.player.group.add(stack);
    }
    while (stack.children.length) stack.remove(stack.children[0]);
    this.hand.slice(0, 10).forEach((id, i) => {
      const it = makeItem(this.product(id));
      it.position.set(0, 1.25 + i * 0.25, 0.42);
      stack.add(it);
    });
    this.player.setCarrying(this.hand.length > 0);
  }

  // stack of carried items shown above a character's head
  attachCarried(ch: Character, count: number, productId: string | null): void {
    let stack = ch.group.getObjectByName('carried') as THREE.Group | undefined;
    if (!stack) {
      stack = new THREE.Group();
      stack.name = 'carried';
      ch.group.add(stack);
    }
    while (stack.children.length) stack.remove(stack.children[0]);
    if (productId && count > 0) {
      const p = this.product(productId);
      for (let i = 0; i < Math.min(count, 10); i++) {
        const it = makeItem(p);
        it.position.set(0, 1.25 + i * 0.25, 0.42);
        stack.add(it);
      }
    }
    ch.setCarrying(count > 0);
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
    this.addMoney(c.basketValue(), c.person.pos);
    this.save.rating = Math.min(100, this.save.rating + RATING_PER_SALE);
    this.refreshHud();
  }

  customerAngry(ratingLoss: number, at: THREE.Vector3): void {
    this.save.rating = Math.max(0, this.save.rating - ratingLoss);
    this.floatText('-' + ratingLoss + ' ★', at, '#ff6b6b');
    this.refreshHud();
    if (this.save.rating < RATING_CLOSED_BELOW && !this.closed) this.storeClosed();
  }

  // ---------------------------------------------------------------- economy
  private addMoney(n: number, at: THREE.Vector3): void {
    this.save.money += n;
    this.save.lifetimeEarned += n;
    this.floatText('+' + fmtMoney(n), at, '#3ddc84');
    this.refreshHud();
  }

  private floatText(text: string, at: THREE.Vector3, color: string): void {
    const s = makeTextSprite(text, { size: 44, color, height: 0.5 });
    // spread popups out a little so several at once stay readable
    s.position.set(at.x + (Math.random() - 0.5) * 0.8, at.y + 2.6 + Math.random() * 0.5 + this.floats.length * 0.15, at.z);
    this.r3d.scene.add(s);
    this.floats.push({ sprite: s, life: 1000 });
  }

  private purchase(f: FixtureDef): void {
    if (this.fs.purchased.includes(f.id)) return;
    this.fs.purchased.push(f.id);
    this.placeFixture(f, true);
    this.unstickPlayer();
    this.floatText(f.name + '!', this.player.group.position, '#ffd166');
    this.refreshHud();
    this.checkFloorComplete();
    writeSave(this.save);
  }

  tryBuyInstant(f: FixtureDef): void {
    if (this.save.money < f.cost) return;
    this.save.money -= f.cost;
    this.purchase(f);
  }

  buyCase(productId: string): void {
    const p = this.product(productId);
    if (this.save.money < p.caseCost) return;
    this.save.money -= p.caseCost;
    this.fs.crate[productId] = this.crateStock(productId) + p.caseSize;
    this.refreshCrate(productId);
    const c = this.crates.get(productId)!;
    this.floatText('+' + p.caseSize + ' ' + p.name, c.group.position, '#ffffff');
    this.refreshHud();
    writeSave(this.save);
  }

  private buyUpgrade(id: 'speed' | 'carry' | 'endurance' | 'charm'): void {
    const def = UPGRADES.find((u) => u.id === id)!;
    const level = this.save.upgrades[id] ?? 0;
    if (level >= def.maxLevel) return;
    const cost = def.costs[level];
    if (this.save.money < cost) return;
    this.save.money -= cost;
    this.save.upgrades[id] = level + 1;
    this.floatText(def.name + ' ' + (level + 1) + '!', this.player.group.position, '#ffd166');
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
          this.hand = [];
          this.attachHand();
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
          this.save = newSave();
          writeSave(this.save);
          this.loadFloor(this.save.currentFloor);
        },
      },
    ]);
  }

  goToFloor(id: string): void {
    this.persist();
    this.loadFloor(id);
  }

  // ---------------------------------------------------------------- visuals refresh
  private refreshShelf(fixtureId: string): void {
    const s = this.shelves.get(fixtureId);
    if (!s) return;
    const stock = this.shelfStock(fixtureId);
    s.items.forEach((it, i) => { it.visible = i < stock; });
    updateTextSprite(s.label, `${this.product(s.def.productId!).name} ${stock}/${s.def.capacity ?? 12}`, { size: 30, color: stock === 0 ? '#ff6b6b' : '#ffffff', height: 0.42 });
    if (ui.panelOpen()) this.refreshOpenPanel();
  }

  private refreshCrate(productId: string): void {
    const c = this.crates.get(productId);
    if (!c) return;
    const n = this.crateStock(productId);
    updateTextSprite(c.count, `${this.product(productId).name}\n${n}`, { size: 40, bg: n > 0 ? 'rgba(20,24,36,0.85)' : 'rgba(150,40,40,0.9)', color: n > 0 ? '#ffffff' : '#ffd6d6', height: 0.7 });
    const shown = n <= 0 ? 0 : n < 4 ? 1 : n < 8 ? 2 : n < 12 ? 3 : 4;
    c.samples.forEach((it, i) => { it.visible = i < shown; });
    if (ui.panelOpen()) this.refreshOpenPanel();
  }

  refreshHud(): void {
    ui.setMoney(this.save.money);
    ui.setRating(this.save.rating);
    this.refreshPads();
    const total = this.floor.fixtures.length;
    const done = this.floor.fixtures.filter((f) => this.fs.purchased.includes(f.id)).length;
    ui.setFloor(this.floor.name, `Floor ${this.floor.level} · ${done}/${total} unlocked${this.fs.completed ? ' ✓' : ''}`);
    const nextFixture = this.floor.fixtures.find((f) => !this.fs.purchased.includes(f.id) && (f.kind === 'cashier' || f.kind === 'stocker'));
    ui.setButtonAttention('build', !!nextFixture && this.save.money >= nextFixture.cost);
    const canOrder = this.floor.products.some((p) => this.hasShelfFor(p.id) && this.save.money >= p.caseCost && this.crateStock(p.id) === 0);
    ui.setButtonAttention('order', canOrder);
    ui.setButtonAttention('elevator', this.fs.completed && this.save.unlockedFloors.length > 1);
    const canUpgrade = UPGRADES.some((u) => (this.save.upgrades[u.id] ?? 0) < u.maxLevel && this.save.money >= u.costs[this.save.upgrades[u.id] ?? 0] * 3);
    ui.setButtonAttention('player', canUpgrade);
    if (ui.panelOpen()) this.refreshOpenPanel();
  }

  private hasShelfFor(productId: string): boolean {
    for (const s of this.shelves.values()) if (s.def.productId === productId) return true;
    return false;
  }

  // ---------------------------------------------------------------- panels
  private refreshOpenPanel(): void {
    if (this.currentPanel === 'order') ui.refreshPanel((b) => this.renderOrder(b));
    else if (this.currentPanel === 'build') ui.refreshPanel((b) => this.renderBuild(b));
    else if (this.currentPanel === 'elevator') ui.refreshPanel((b) => this.renderElevator(b));
    else if (this.currentPanel === 'player') ui.refreshPanel((b) => this.renderPlayer(b));
  }

  private openOrderPanel(): void {
    this.currentPanel = 'order';
    ui.openPanel('📦 Order stock', (b) => this.renderOrder(b));
  }

  private renderOrder(body: HTMLElement): void {
    body.appendChild(ui.tip('Cases are delivered to the storage room at the back of the store. Walk into a crate to pick items up, then carry them to the matching shelf.'));
    let any = false;
    for (const p of this.floor.products) {
      if (!this.hasShelfFor(p.id)) continue;
      any = true;
      const shelf = [...this.shelves.values()].find((s) => s.def.productId === p.id)!;
      body.appendChild(ui.row({
        color: '#' + p.color.toString(16).padStart(6, '0'),
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
      if (f.kind === 'shelf') meta = `Sells ${this.product(f.productId!).name} · ${fmtMoney(f.cost)}`;
      if (f.kind === 'counter') meta = `Customers can only pay once you have one · ${fmtMoney(f.cost)}`;
      if (f.kind === 'register2') meta = `Check out two customers at once · ${fmtMoney(f.cost)}`;
      if (f.kind === 'cashier') meta = `Rings up customers even when you are away · ${fmtMoney(f.cost)}`;
      if (f.kind === 'stocker') meta = `Carries stock from storage to the shelves for you · ${fmtMoney(f.cost)}`;
      body.appendChild(ui.row({
        color: f.productId ? '#' + this.product(f.productId).color.toString(16).padStart(6, '0') : undefined,
        name: f.name,
        meta,
        button: owned
          ? { label: '✓ Owned', done: true, disabled: true }
          : { label: 'Buy ' + fmtMoney(f.cost), disabled: this.save.money < f.cost, onClick: () => this.tryBuyInstant(f) },
      }));
    }
    body.appendChild(ui.tip('Upgrades for you (speed, carrying, endurance, charm) are under the Me button.'));
  }

  private openPlayerPanel(): void {
    this.currentPanel = 'player';
    ui.openPanel('👤 Me', (b) => this.renderPlayer(b));
  }

  private renderPlayer(body: HTMLElement): void {
    const u = this.save.upgrades;
    const level = u.speed + u.carry + (u.endurance ?? 0) + (u.charm ?? 0);
    const card = document.createElement('div');
    card.className = 'me-card';
    card.innerHTML = `<div class="me-avatar">🧑‍💼</div><div class="me-stats">
      <div><b>Shopkeeper</b> · Level ${level}</div>
      <div>Speed <b>${SPEED_BY_LEVEL[u.speed]}</b> · Carry <b>${CARRY_BY_LEVEL[u.carry]}</b> items</div>
      <div>Sprint <b>${STAMINA_BY_LEVEL[u.endurance ?? 0]}s</b> · Customer patience <b>×${PATIENCE_MULT_BY_LEVEL[u.charm ?? 0]}</b></div>
      <div>Lifetime earned <b>${fmtMoney(this.save.lifetimeEarned)}</b></div>
    </div>`;
    body.appendChild(card);
    body.appendChild(ui.tip('Hold Shift (or the Sprint button) to run. Upgrades carry over to every floor.'));
    body.appendChild(ui.sectionTitle('Upgrades'));
    for (const def of UPGRADES) {
      const lvl = this.save.upgrades[def.id] ?? 0;
      const maxed = lvl >= def.maxLevel;
      const cost = maxed ? 0 : def.costs[lvl];
      const next = maxed ? '' : ` → ${this.upgradeStat(def.id, lvl + 1)}`;
      body.appendChild(ui.row({
        name: `${def.name} · Lv ${lvl}/${def.maxLevel}`,
        meta: `${def.desc} ${this.upgradeStat(def.id, lvl)}${next}`,
        button: maxed
          ? { label: 'MAX', done: true, disabled: true }
          : { label: 'Upgrade ' + fmtMoney(cost), disabled: this.save.money < cost, onClick: () => this.buyUpgrade(def.id) },
      }));
    }
  }

  private upgradeStat(id: 'speed' | 'carry' | 'endurance' | 'charm', lvl: number): string {
    if (id === 'speed') return `Speed ${SPEED_BY_LEVEL[lvl]}`;
    if (id === 'carry') return `Carry ${CARRY_BY_LEVEL[lvl]}`;
    if (id === 'endurance') return `Sprint ${STAMINA_BY_LEVEL[lvl]}s`;
    return `Patience ×${PATIENCE_MULT_BY_LEVEL[lvl]}`;
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

  // ---------------------------------------------------------------- frame loop
  private frame(t: number): void {
    requestAnimationFrame((n) => this.frame(n));
    const raw = this.lastTime ? t - this.lastTime : 16;
    const dt = Math.min(100, raw);
    this.lastTime = t;
    if (!this.floor) return;
    this.time += dt;
    // after a few seconds of play, drop to low quality if this device can't keep up
    if (!this.fpsChecked) {
      this.fpsSamples++;
      this.fpsTime += raw; // wall-clock frame time
      if (this.fpsTime > 4000 && this.fpsSamples > 10) {
        this.fpsChecked = true;
        const fps = this.fpsSamples / (this.fpsTime / 1000);
        if (fps < 24) {
          this.r3d.setQuality('low');
          try { localStorage.setItem('mall-tycoon-lowfx', '1'); } catch { /* ignore */ }
        }
      }
    }
    this.update(dt);
    this.r3d.follow(this.player.group.position.x, this.player.group.position.z, dt / 1000);
    if (!this.noRender) this.r3d.render();
  }

  private update(dt: number): void {
    const playing = !ui.modalOpen() && !this.paused && document.getElementById('title') === null;
    this.updateWallFade(dt);
    if (this.water) this.water.position.y = 0.36 + Math.sin(this.time / 600) * 0.02;
    this.updateEffects(dt);
    for (const w of this.walkers) w.update(dt);
    if (!playing) {
      this.player.setWalking(false);
      this.player.animate(dt / 1000);
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
      this.persist();
    }
  }

  // walls that stand between the camera and the player turn see-through
  private updateWallFade(dt: number): void {
    const p = this.player.group.position;
    const k = Math.min(1, dt / 120);
    for (const w of this.fadeWalls) {
      const dz = w.row + 0.5 - p.z;        // positive: wall is in front of the player (toward the camera)
      const dx = Math.abs(w.col + 0.5 - p.x);
      const occluding = dz > 0.2 && dz < 7 && dx < 4.5;
      const target = occluding ? 0.16 : 1;
      const m = w.mesh.material as THREE.MeshPhysicalMaterial;
      m.opacity += (target - m.opacity) * k;
      w.mesh.castShadow = m.opacity > 0.6;
    }
    // cabinets and counters right in front of the player go see-through too
    for (const f of this.fadeFixtures) {
      const dz = f.row + 0.5 - p.z;
      const inX = p.x > f.col - 0.6 && p.x < f.col + f.w + 0.6;
      const occluding = dz > 0.3 && dz < 2.6 && inX;
      const target = occluding ? 0.22 : 1;
      for (const m of f.mats) m.opacity += (target - m.opacity) * k;
    }
    void WALL_H;
  }

  // ---------------------------------------------------------------- pause / save
  openPauseMenu(): void {
    if (ui.modalOpen() || document.getElementById('title')) return;
    this.paused = true;
    ui.closePanel();
    ui.showModal('⏸ Paused', `${this.floor.name} · ${fmtMoney(this.save.money)}\nYour game auto-saves every couple of seconds. You can also save right now.`, [
      { label: 'Resume', onClick: () => { this.paused = false; } },
      { label: '💾 Save game', style: 'secondary', onClick: () => { this.persist(); ui.toast('Saved!'); this.paused = false; } },
      { label: 'Save & quit to title', style: 'danger', onClick: () => { this.persist(); this.paused = false; this.showTitle(); } },
    ]);
  }

  private updateEffects(dt: number): void {
    for (const f of this.floats) {
      f.life -= dt;
      f.sprite.position.y += dt * 0.0012;
      (f.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, f.life / 600);
    }
    for (const f of this.floats.filter((x) => x.life <= 0)) disposeGroup(f.sprite);
    this.floats = this.floats.filter((x) => x.life > 0);
    for (const p of this.pops) {
      p.t += dt / 350;
      const k = Math.min(1, p.t);
      const back = 1 + 1.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2); // ease out back
      p.obj.scale.setScalar(0.5 + 0.5 * back);
    }
    this.pops = this.pops.filter((p) => p.t < 1);
    for (const p of this.pops) if (p.t >= 1) p.obj.scale.setScalar(1);
  }

  private updatePlayer(dt: number): void {
    this.unstickPlayer();
    const d = this.input.direction();
    const pos = this.player.group.position;
    const moving = Math.hypot(d.x, d.y) > 0.01;
    // sprinting drains stamina; it refills after a short rest
    const wantSprint = this.input.sprinting() && moving && this.stamina > 0 && !this.exhausted;
    const max = this.staminaMax();
    if (wantSprint) {
      this.stamina = Math.max(0, this.stamina - dt / 1000);
      this.staminaRest = 0;
      if (this.stamina <= 0) this.exhausted = true;
    } else {
      this.staminaRest += dt;
      if (this.staminaRest > 700) this.stamina = Math.min(max, this.stamina + (dt / 1000) * max * 0.3);
      if (this.exhausted && this.stamina > max * 0.3) this.exhausted = false;
    }
    this.sprinting = wantSprint;
    ui.setStamina(this.stamina / max, this.exhausted);
    const speed = SPEED_BY_LEVEL[this.save.upgrades.speed] * (wantSprint ? SPRINT_MULT : 1);
    if (moving) {
      const step = speed * dt / 1000;
      this.moveAxis(pos, d.x * step, 0);
      this.moveAxis(pos, 0, d.y * step);
      this.player.face(d.x, d.y);
    }
    this.player.setWalking(moving);
    this.player.animate(dt / 1000 * (this.sprinting ? 1.5 : 1));
  }

  private moveAxis(pos: THREE.Vector3, dx: number, dz: number): void {
    const nx = THREE.MathUtils.clamp(pos.x + dx, PLAYER_R, COLS - PLAYER_R);
    const nz = THREE.MathUtils.clamp(pos.z + dz, PLAYER_R, ROWS - PLAYER_R);
    const minC = Math.floor(nx - PLAYER_R);
    const maxC = Math.floor(nx + PLAYER_R);
    const minR = Math.floor(nz - PLAYER_R);
    const maxR = Math.floor(nz + PLAYER_R);
    for (let r = minR; r <= maxR; r++) for (let c = minC; c <= maxC; c++) {
      if (this.playerSolid.has(key(c, r))) return;
    }
    pos.x = nx;
    pos.z = nz;
  }

  private playerTile(): Pt {
    return { col: Math.floor(this.player.group.position.x), row: Math.floor(this.player.group.position.z) };
  }

  // If something solid appeared where the player stands (a freshly bought counter or shelf), step out to the nearest free tile.
  private unstickPlayer(): void {
    const pos = this.player.group.position;
    // a touch smaller than the collision radius, so brushing against a crate never counts as being stuck inside it
    const R = PLAYER_R - 0.05;
    const overlaps = (x: number, z: number): boolean => {
      const minC = Math.floor(x - R);
      const maxC = Math.floor(x + R);
      const minR = Math.floor(z - R);
      const maxR = Math.floor(z + R);
      for (let r = minR; r <= maxR; r++) for (let c = minC; c <= maxC; c++) if (this.playerSolid.has(key(c, r))) return true;
      return false;
    };
    if (!overlaps(pos.x, pos.z)) return;
    const t = this.playerTile();
    for (let ring = 1; ring <= 6; ring++) {
      let best: { x: number; z: number; d: number } | null = null;
      for (let dr = -ring; dr <= ring; dr++) for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const c = t.col + dc;
        const r = t.row + dr;
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
        if (this.playerSolid.has(key(c, r))) continue;
        const x = c + 0.5;
        const z = r + 0.5;
        if (overlaps(x, z)) continue;
        const d = Math.hypot(x - pos.x, z - pos.z) + (dr > 0 ? 0 : 0.6); // prefer stepping toward the front (down-screen)
        if (!best || d < best.d) best = { x, z, d };
      }
      if (best) {
        pos.x = best.x;
        pos.z = best.z;
        return;
      }
    }
  }

  private updateInteractions(dt: number): void {
    this.pickTimer -= dt;
    const carryCap = CARRY_BY_LEVEL[this.save.upgrades.carry];
    const p = this.player.group.position;
    const tile = this.playerTile();

    // buy pads: stand on one for a moment to buy it (only if you can afford the whole thing)
    let onPad: PadView | null = null;
    for (const pad of this.pads.values()) {
      if (tile.row === pad.row && tile.col >= pad.col && tile.col < pad.col + pad.w) { onPad = pad; break; }
    }
    if (onPad && onPad === this.padUnderPlayer) this.padDwell += dt;
    else { this.padDwell = 0; this.padUnderPlayer = onPad; }
    if (onPad && this.padDwell > 350 && this.save.money >= onPad.def.cost) {
      this.save.money -= onPad.def.cost;
      this.padDwell = 0;
      this.padUnderPlayer = null;
      this.purchase(onPad.def);
    }

    // elevator: stand in front of the doors
    const atElevator = tile.row === ELEVATOR.row + 1 && tile.col >= ELEVATOR.col && tile.col < ELEVATOR.col + ELEVATOR.width;
    if (atElevator) {
      if (!this.onElevator) {
        this.onElevator = true;
        if (!ui.panelOpen()) this.openElevatorPanel();
      }
    } else this.onElevator = false;

    if (this.pickTimer > 0) return;

    // crates: pick up (any mix of products, up to your carry limit)
    if (this.hand.length < carryCap) {
      for (const c of this.crates.values()) {
        const dist = Math.hypot(p.x - (c.col + 0.5), p.z - (c.row + 0.5));
        if (dist > 1.15) continue;
        if (this.crateStock(c.productId) <= 0) continue;
        this.takeFromCrate(c.productId);
        this.hand.push(c.productId);
        this.attachHand();
        this.pickTimer = 160;
        return;
      }
    }

    // shelves: put down whatever in your hands belongs on this shelf
    if (this.hand.length) {
      for (const s of this.shelves.values()) {
        const idx = this.hand.lastIndexOf(s.def.productId!);
        if (idx === -1) continue;
        const reach = 0.55;
        if (p.x < s.col - reach || p.x > s.col + s.w + reach || p.z < s.row - reach || p.z > s.row + s.h + reach) continue;
        if (this.putOnShelf(s.def.id, s.def.productId!)) {
          this.hand.splice(idx, 1);
          this.attachHand();
          this.pickTimer = 160;
          return;
        }
      }
    }
  }

  private spawnInterval(): number {
    const shelves = this.shelves.size;
    const base = this.floor.customerEveryMs;
    const ratingFactor = 0.7 + (this.save.rating / 100) * 0.6;
    return Math.max(1500, (base / (0.5 + shelves * 0.22)) / ratingFactor);
  }

  private updateCustomers(dt: number): void {
    const hasCounter = this.fs.purchased.includes('counter');
    const maxCustomers = 8 + this.registerCount() * 2;
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
    const rnd = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const pick = (): ShelfView => (stocked.length && Math.random() < 0.75 ? rnd(stocked) : rnd(shelves));
    const wants: Want[] = [];
    const n = Math.random() < 0.6 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const s = pick();
      if (wants.some((w) => w.fixtureId === s.def.id)) continue;
      const price = this.product(s.def.productId!).sellPrice;
      const maxCount = price >= 100 ? 1 : price >= 20 ? 2 : 3;
      wants.push({ fixtureId: s.def.id, count: 1 + Math.floor(Math.random() * maxCount) });
    }
    this.customers.push(new Customer(this, Math.floor(Math.random() * 8), wants));
  }

  private playerAtCounter(): boolean {
    const t = this.playerTile();
    if (t.row !== COUNTER_1.row - 1) return false;
    if (t.col >= COUNTER_1.col && t.col < COUNTER_1.col + COUNTER_1.width) return true;
    if (this.registerCount() === 2 && t.col >= COUNTER_2.col && t.col < COUNTER_2.col + COUNTER_2.width) return true;
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
    if (ui.panelOpen()) { ui.setHint(null); return; }
    const hasCounter = this.fs.purchased.includes('counter');
    const waiting = this.queue.filter((c) => c.state === 'inQueue').length;
    const cashierHired = this.fs.purchased.includes('cashier');
    let hint: string | null = null;
    if (!hasCounter) hint = 'Stand on the glowing pad near the front of your store to buy a Checkout Counter';
    else if (this.shelves.size === 0) hint = 'Stand on a glowing pad on the sales floor to buy a shelf';
    else if (this.hand.length) {
      const names = [...new Set(this.hand)].map((id) => this.product(id).name);
      hint = `Carrying ${this.hand.length}: ${names.join(', ')} · walk to the matching shelves`;
    } else if (waiting > 0 && !cashierHired && !this.playerAtCounter()) hint = `${waiting} customer${waiting > 1 ? 's' : ''} waiting · stand behind the counter!`;
    else if (!this.stocker && [...this.crates.values()].some((c) => this.crateStock(c.productId) > 0 && !this.shelfFullFor(c.productId))) hint = 'Grab items from the crates in the storage room at the back';
    else if ([...this.shelves.values()].every((s) => this.shelfStock(s.def.id) === 0)) hint = 'Shelves are empty · tap Order to buy stock';
    else if (this.fs.completed && this.save.unlockedFloors.length > 1 && !this.save.won) hint = 'Floor complete! The elevator is down the concourse, top right';
    ui.setHint(hint);
  }

  private shelfFullFor(productId: string): boolean {
    for (const s of this.shelves.values()) if (s.def.productId === productId && !this.shelfIsFull(s.def.id)) return false;
    return true;
  }
}
