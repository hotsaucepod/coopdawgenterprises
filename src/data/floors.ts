// Everything about a floor (store) is data. To tweak a floor, change numbers here.

export const TILE = 48;
export const COLS = 11;
export const ROWS = 18;
export const GAME_W = COLS * TILE; // 528
export const GAME_H = ROWS * TILE; // 864

export interface ProductDef {
  id: string;
  name: string;
  color: number;      // main colour of the item icon
  accent: number;     // secondary colour of the item icon
  caseCost: number;   // what one case costs to order
  caseSize: number;   // how many items a case spawns in the storage room
  sellPrice: number;  // what a customer pays per item
}

export type FixtureKind = 'counter' | 'shelf' | 'register2' | 'cashier' | 'stocker';

export interface FixtureDef {
  id: string;
  name: string;
  cost: number;
  kind: FixtureKind;
  productId?: string; // shelves only
  slot?: number;      // shelves only: 0..8, which shelf slot on the sales floor
  capacity?: number;  // shelves only
}

export interface FloorDef {
  id: string;
  level: number;
  name: string;
  tagline: string;
  floorColor: number;
  floorAlt: number;
  wallColor: number;
  storageColor: number;
  uniformColor: number;
  products: ProductDef[];
  fixtures: FixtureDef[];
  patienceMs: number;        // how long a customer waits at an empty shelf
  customerEveryMs: number;   // base spawn interval (gets faster with more shelves)
}

export interface UpgradeDef {
  id: 'speed' | 'carry';
  name: string;
  desc: string;
  maxLevel: number;
  costs: number[];
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'speed',
    name: 'Running Shoes',
    desc: 'Move faster around the store.',
    maxLevel: 5,
    costs: [30, 80, 200, 500, 1200],
  },
  {
    id: 'carry',
    name: 'Bigger Arms',
    desc: 'Carry more items at once.',
    maxLevel: 5,
    costs: [25, 70, 180, 450, 1000],
  },
];

export const CARRY_BY_LEVEL = [1, 2, 3, 5, 7, 10];
export const SPEED_BY_LEVEL = [150, 175, 200, 230, 260, 300];

export const RATING_START = 70;
export const RATING_CLOSED_BELOW = 15;
export const RATING_PER_SALE = 1;
export const RATING_PER_ANGRY = 7;

// ---------- layout (shared by every floor) ----------
// Sales floor shelf slots: 3 rows x 3 columns, each shelf is 2 tiles wide.
export const SHELF_SLOTS: { col: number; row: number }[] = [
  { col: 1, row: 5 }, { col: 4, row: 5 }, { col: 7, row: 5 },
  { col: 1, row: 8 }, { col: 4, row: 8 }, { col: 7, row: 8 },
  { col: 1, row: 11 }, { col: 4, row: 11 }, { col: 7, row: 11 },
];
export const STORAGE_ROWS = { top: 1, bottom: 2 };       // crates on row 1, walk on row 2
export const STORAGE_WALL_ROW = 3;                         // wall with a door gap
export const STORAGE_DOOR_COLS = [4, 5, 6];
export const COUNTER_1 = { col: 1, row: 14, width: 3 };    // cashier stands on row 13
export const COUNTER_2 = { col: 5, row: 14, width: 3 };
export const QUEUE_TILES: { col: number; row: number }[] = [
  { col: 2, row: 15 }, { col: 6, row: 15 }, { col: 2, row: 16 }, { col: 6, row: 16 },
  { col: 1, row: 16 }, { col: 7, row: 16 }, { col: 3, row: 16 }, { col: 5, row: 16 },
];
export const ENTRANCE = { col: 4, row: 17 };               // door in the bottom wall
export const ELEVATOR = { col: 9, row: 15 };               // 1 wide, 2 tall (rows 15-16)

// ---------- helpers to build floors quickly ----------
function shelf(id: string, name: string, cost: number, productId: string, slot: number, capacity = 12): FixtureDef {
  return { id, name, cost, kind: 'shelf', productId, slot, capacity };
}

function commonFixtures(mult: number): FixtureDef[] {
  return [
    { id: 'counter', name: 'Checkout Counter', cost: Math.round(10 * mult), kind: 'counter' },
    { id: 'register2', name: 'Second Register', cost: Math.round(400 * mult), kind: 'register2' },
    { id: 'cashier', name: 'Hire a Cashier', cost: Math.round(250 * mult), kind: 'cashier' },
    { id: 'stocker', name: 'Hire a Stocker', cost: Math.round(350 * mult), kind: 'stocker' },
  ];
}

// Floor 1: a regular neighbourhood grocery store.
const grocery: FloorDef = {
  id: 'grocery',
  level: 1,
  name: 'Fresh Basket Market',
  tagline: 'Your neighbourhood grocery store.',
  floorColor: 0xe8e2d2,
  floorAlt: 0xded7c5,
  wallColor: 0x7a8fa6,
  storageColor: 0xb9b3a6,
  uniformColor: 0x2e8b57,
  patienceMs: 12000,
  customerEveryMs: 5000,
  products: [
    { id: 'chips', name: 'Chips', color: 0xf2c14e, accent: 0xd94141, caseCost: 5, caseSize: 6, sellPrice: 5 },
    { id: 'bananas', name: 'Bananas', color: 0xf7e35c, accent: 0x8b6b1e, caseCost: 12, caseSize: 8, sellPrice: 4 },
    { id: 'bread', name: 'Bread', color: 0xd9a066, accent: 0x8c5a2b, caseCost: 20, caseSize: 8, sellPrice: 6 },
    { id: 'milk', name: 'Milk', color: 0xf4f7fb, accent: 0x3b7dd8, caseCost: 30, caseSize: 8, sellPrice: 8 },
    { id: 'cereal', name: 'Cereal', color: 0xe86f3a, accent: 0xfff1a8, caseCost: 45, caseSize: 8, sellPrice: 10 },
    { id: 'soda', name: 'Soda', color: 0xd7263d, accent: 0xffffff, caseCost: 60, caseSize: 10, sellPrice: 9 },
    { id: 'pizza', name: 'Frozen Pizza', color: 0xc1440e, accent: 0xffd166, caseCost: 90, caseSize: 8, sellPrice: 15 },
    { id: 'deli', name: 'Deli Meat', color: 0xe07a7a, accent: 0xfff0f0, caseCost: 120, caseSize: 8, sellPrice: 18 },
    { id: 'cake', name: 'Birthday Cake', color: 0xf7a1c4, accent: 0xffffff, caseCost: 200, caseSize: 6, sellPrice: 35 },
  ],
  fixtures: [
    ...commonFixtures(1),
    shelf('rack_chips', 'Chip Rack', 5, 'chips', 0),
    shelf('stand_bananas', 'Produce Stand', 25, 'bananas', 1),
    shelf('shelf_bread', 'Bread Shelf', 60, 'bread', 2),
    shelf('fridge_milk', 'Dairy Fridge', 120, 'milk', 3),
    shelf('shelf_cereal', 'Cereal Aisle', 200, 'cereal', 4),
    shelf('fridge_soda', 'Soda Fridge', 320, 'soda', 5),
    shelf('freezer_pizza', 'Freezer', 500, 'pizza', 6),
    shelf('case_deli', 'Deli Case', 800, 'deli', 7),
    shelf('display_cake', 'Bakery Display', 1200, 'cake', 8),
  ],
};

// Floor 2: toy store.
const toys: FloorDef = {
  id: 'toys',
  level: 2,
  name: 'Toy Tower',
  tagline: 'Every kid on the escalator is headed here.',
  floorColor: 0xdfe9f7,
  floorAlt: 0xd2def0,
  wallColor: 0x8e6bc7,
  storageColor: 0xb5b0c4,
  uniformColor: 0xd9418c,
  patienceMs: 11000,
  customerEveryMs: 5200,
  products: [
    { id: 'bouncy', name: 'Bouncy Balls', color: 0x4ecdc4, accent: 0xff6b6b, caseCost: 40, caseSize: 10, sellPrice: 12 },
    { id: 'cars', name: 'Toy Cars', color: 0xff5252, accent: 0x222222, caseCost: 90, caseSize: 8, sellPrice: 22 },
    { id: 'plush', name: 'Plushies', color: 0xffb385, accent: 0x7a4b2a, caseCost: 150, caseSize: 8, sellPrice: 32 },
    { id: 'blocks', name: 'Building Blocks', color: 0xffd93d, accent: 0x3d7dff, caseCost: 220, caseSize: 6, sellPrice: 55 },
    { id: 'puzzles', name: 'Puzzles', color: 0x6a4c93, accent: 0xf8f9fa, caseCost: 300, caseSize: 6, sellPrice: 70 },
    { id: 'nerf', name: 'Foam Blasters', color: 0xff8c00, accent: 0x1e90ff, caseCost: 420, caseSize: 6, sellPrice: 95 },
    { id: 'board', name: 'Board Games', color: 0x2b9348, accent: 0xffffff, caseCost: 560, caseSize: 6, sellPrice: 120 },
    { id: 'rc', name: 'RC Cars', color: 0x3a86ff, accent: 0xffbe0b, caseCost: 800, caseSize: 4, sellPrice: 240 },
    { id: 'console', name: 'Game Consoles', color: 0x222222, accent: 0x00e5ff, caseCost: 1500, caseSize: 4, sellPrice: 450 },
  ],
  fixtures: [
    ...commonFixtures(3),
    shelf('bin_bouncy', 'Bouncy Ball Bin', 60, 'bouncy', 0),
    shelf('shelf_cars', 'Car Track Shelf', 180, 'cars', 1),
    shelf('shelf_plush', 'Plushie Wall', 350, 'plush', 2),
    shelf('shelf_blocks', 'Block Table', 600, 'blocks', 3),
    shelf('shelf_puzzles', 'Puzzle Shelf', 900, 'puzzles', 4),
    shelf('shelf_nerf', 'Blaster Rack', 1300, 'nerf', 5),
    shelf('shelf_board', 'Game Shelf', 1800, 'board', 6),
    shelf('shelf_rc', 'RC Display', 2600, 'rc', 7),
    shelf('shelf_console', 'Console Case', 4000, 'console', 8),
  ],
};

// Floor 3: sports store.
const sports: FloorDef = {
  id: 'sports',
  level: 3,
  name: 'Sport Zone',
  tagline: 'Gear up. Game on.',
  floorColor: 0xd9ead3,
  floorAlt: 0xcce0c4,
  wallColor: 0x2f6b4f,
  storageColor: 0xaab5aa,
  uniformColor: 0x1f4fbf,
  patienceMs: 10000,
  customerEveryMs: 5400,
  products: [
    { id: 'water', name: 'Water Bottles', color: 0x48cae4, accent: 0xffffff, caseCost: 80, caseSize: 10, sellPrice: 20 },
    { id: 'balls', name: 'Basketballs', color: 0xe07a1f, accent: 0x222222, caseCost: 200, caseSize: 8, sellPrice: 45 },
    { id: 'gloves', name: 'Baseball Gloves', color: 0x8b5a2b, accent: 0xf1e2c6, caseCost: 350, caseSize: 6, sellPrice: 90 },
    { id: 'cleats', name: 'Cleats', color: 0x111111, accent: 0x39ff14, caseCost: 500, caseSize: 6, sellPrice: 130 },
    { id: 'jersey', name: 'Jerseys', color: 0xd62828, accent: 0xffffff, caseCost: 700, caseSize: 6, sellPrice: 170 },
    { id: 'skate', name: 'Skateboards', color: 0x7b2cbf, accent: 0xffd60a, caseCost: 1000, caseSize: 5, sellPrice: 260 },
    { id: 'hockey', name: 'Hockey Sticks', color: 0xeeeeee, accent: 0x0077b6, caseCost: 1300, caseSize: 5, sellPrice: 330 },
    { id: 'bike', name: 'Bikes', color: 0x00b4d8, accent: 0x222222, caseCost: 2000, caseSize: 4, sellPrice: 600 },
    { id: 'kayak', name: 'Kayaks', color: 0xffb703, accent: 0x023047, caseCost: 3200, caseSize: 3, sellPrice: 1200 },
  ],
  fixtures: [
    ...commonFixtures(8),
    shelf('cooler_water', 'Drink Cooler', 150, 'water', 0),
    shelf('rack_balls', 'Ball Rack', 450, 'balls', 1),
    shelf('wall_gloves', 'Glove Wall', 900, 'gloves', 2),
    shelf('shelf_cleats', 'Shoe Wall', 1400, 'cleats', 3),
    shelf('rack_jersey', 'Jersey Rack', 2000, 'jersey', 4),
    shelf('rack_skate', 'Skate Rack', 2800, 'skate', 5),
    shelf('rack_hockey', 'Stick Rack', 3800, 'hockey', 6),
    shelf('stand_bike', 'Bike Stand', 5500, 'bike', 7),
    shelf('stand_kayak', 'Kayak Rack', 8000, 'kayak', 8),
  ],
};

// Floor 4: electronics.
const electronics: FloorDef = {
  id: 'electronics',
  level: 4,
  name: 'Gizmo Galaxy',
  tagline: 'If it beeps, we sell it.',
  floorColor: 0xe0e3ea,
  floorAlt: 0xd3d7e0,
  wallColor: 0x2b2d42,
  storageColor: 0xa7a9b3,
  uniformColor: 0x111111,
  patienceMs: 9000,
  customerEveryMs: 5600,
  products: [
    { id: 'cables', name: 'Cables', color: 0xffffff, accent: 0x222222, caseCost: 150, caseSize: 10, sellPrice: 35 },
    { id: 'earbuds', name: 'Earbuds', color: 0xf8f9fa, accent: 0x6c757d, caseCost: 400, caseSize: 8, sellPrice: 90 },
    { id: 'speaker', name: 'Speakers', color: 0x343a40, accent: 0x00d4ff, caseCost: 700, caseSize: 6, sellPrice: 180 },
    { id: 'watch', name: 'Smart Watches', color: 0x212529, accent: 0x51cf66, caseCost: 1100, caseSize: 6, sellPrice: 300 },
    { id: 'tablet', name: 'Tablets', color: 0xced4da, accent: 0x228be6, caseCost: 1800, caseSize: 5, sellPrice: 520 },
    { id: 'drone', name: 'Drones', color: 0xadb5bd, accent: 0xff922b, caseCost: 2600, caseSize: 4, sellPrice: 900 },
    { id: 'laptop', name: 'Laptops', color: 0x868e96, accent: 0x4dabf7, caseCost: 3600, caseSize: 4, sellPrice: 1300 },
    { id: 'tv', name: 'Big TVs', color: 0x111111, accent: 0xff6b6b, caseCost: 5000, caseSize: 3, sellPrice: 2200 },
    { id: 'vr', name: 'VR Headsets', color: 0xffffff, accent: 0x845ef7, caseCost: 7000, caseSize: 3, sellPrice: 3200 },
  ],
  fixtures: [
    ...commonFixtures(20),
    shelf('wall_cables', 'Cable Wall', 300, 'cables', 0),
    shelf('shelf_earbuds', 'Earbud Case', 900, 'earbuds', 1),
    shelf('shelf_speaker', 'Speaker Shelf', 1800, 'speaker', 2),
    shelf('case_watch', 'Watch Case', 2800, 'watch', 3),
    shelf('table_tablet', 'Tablet Table', 4200, 'tablet', 4),
    shelf('shelf_drone', 'Drone Display', 6000, 'drone', 5),
    shelf('table_laptop', 'Laptop Bar', 8500, 'laptop', 6),
    shelf('wall_tv', 'TV Wall', 12000, 'tv', 7),
    shelf('booth_vr', 'VR Booth', 18000, 'vr', 8),
  ],
};

// Floor 5: the food court, top of the mall.
const foodcourt: FloorDef = {
  id: 'foodcourt',
  level: 5,
  name: 'Sky Food Court',
  tagline: 'The top floor. Everybody is hungry.',
  floorColor: 0xf6e7d2,
  floorAlt: 0xeedcc3,
  wallColor: 0xc9503f,
  storageColor: 0xbfb4a5,
  uniformColor: 0xe63946,
  patienceMs: 8000,
  customerEveryMs: 5800,
  products: [
    { id: 'pretzel', name: 'Pretzels', color: 0xc68642, accent: 0xffffff, caseCost: 300, caseSize: 10, sellPrice: 60 },
    { id: 'fries', name: 'Fries', color: 0xffd43b, accent: 0xe03131, caseCost: 600, caseSize: 10, sellPrice: 110 },
    { id: 'slice', name: 'Pizza Slices', color: 0xffa94d, accent: 0xc92a2a, caseCost: 1000, caseSize: 8, sellPrice: 200 },
    { id: 'taco', name: 'Tacos', color: 0xfab005, accent: 0x40c057, caseCost: 1600, caseSize: 8, sellPrice: 320 },
    { id: 'burger', name: 'Burgers', color: 0xd9480f, accent: 0x51cf66, caseCost: 2400, caseSize: 6, sellPrice: 500 },
    { id: 'sushi', name: 'Sushi', color: 0xffffff, accent: 0xfa5252, caseCost: 3400, caseSize: 6, sellPrice: 750 },
    { id: 'boba', name: 'Boba Tea', color: 0xd0bfa7, accent: 0x343a40, caseCost: 4500, caseSize: 6, sellPrice: 1000 },
    { id: 'sundae', name: 'Ice Cream Sundaes', color: 0xfff0f6, accent: 0xe64980, caseCost: 6000, caseSize: 5, sellPrice: 1500 },
    { id: 'steak', name: 'Steak Dinners', color: 0x862e2e, accent: 0xffe066, caseCost: 9000, caseSize: 4, sellPrice: 2800 },
  ],
  fixtures: [
    ...commonFixtures(50),
    shelf('stand_pretzel', 'Pretzel Stand', 800, 'pretzel', 0),
    shelf('stand_fries', 'Fry Station', 2000, 'fries', 1),
    shelf('oven_slice', 'Pizza Oven', 4000, 'slice', 2),
    shelf('bar_taco', 'Taco Bar', 6500, 'taco', 3),
    shelf('grill_burger', 'Burger Grill', 9500, 'burger', 4),
    shelf('bar_sushi', 'Sushi Bar', 13000, 'sushi', 5),
    shelf('bar_boba', 'Boba Bar', 17000, 'boba', 6),
    shelf('bar_sundae', 'Sundae Bar', 22000, 'sundae', 7),
    shelf('grill_steak', 'Steakhouse Grill', 30000, 'steak', 8),
  ],
};

export const FLOORS: FloorDef[] = [grocery, toys, sports, electronics, foodcourt];

export function floorById(id: string): FloorDef {
  const f = FLOORS.find((x) => x.id === id);
  if (!f) throw new Error('Unknown floor ' + id);
  return f;
}

export function productById(floor: FloorDef, id: string): ProductDef {
  const p = floor.products.find((x) => x.id === id);
  if (!p) throw new Error('Unknown product ' + id);
  return p;
}
