// Everything about a floor (store) is data. To tweak a floor, change numbers here.

import { MALL_MAP } from './mallMap';

export const COLS = MALL_MAP[0].length; // 40
export const ROWS = MALL_MAP.length;    // 30

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
  id: 'speed' | 'carry' | 'endurance' | 'charm';
  name: string;
  desc: string;
  maxLevel: number;
  costs: number[];
}

// Upgrades for the person you play. They carry over to every floor.
export const UPGRADES: UpgradeDef[] = [
  { id: 'speed', name: 'Running Shoes', desc: 'Walk and sprint faster.', maxLevel: 5, costs: [30, 80, 200, 500, 1200] },
  { id: 'carry', name: 'Bigger Arms', desc: 'Carry more items at once.', maxLevel: 5, costs: [25, 70, 180, 450, 1000] },
  { id: 'endurance', name: 'Endurance', desc: 'Sprint for longer before you run out of breath.', maxLevel: 5, costs: [40, 100, 250, 600, 1400] },
  { id: 'charm', name: 'Charm', desc: 'Customers wait longer at an empty shelf before giving up.', maxLevel: 5, costs: [60, 150, 350, 800, 1800] },
];

export const CARRY_BY_LEVEL = [1, 2, 3, 5, 7, 10];
export const SPEED_BY_LEVEL = [3.2, 3.7, 4.2, 4.8, 5.4, 6.2]; // tiles per second
export const STAMINA_BY_LEVEL = [4, 5.5, 7, 9, 11, 14];        // seconds of sprint
export const PATIENCE_MULT_BY_LEVEL = [1, 1.15, 1.3, 1.5, 1.75, 2];
export const SPRINT_MULT = 1.7;

export const RATING_START = 70;
export const RATING_CLOSED_BELOW = 15;
export const RATING_PER_SALE = 1;
export const RATING_PER_ANGRY = 7;

// ---------- layout (shared by every floor) ----------
// The store occupies the top-left of MALL_MAP (cols 0-14, rows 0-21) and opens onto the concourse.
// Sales floor shelf slots: 3 rows x 4 columns, each shelf is 2 tiles wide.
export const SHELF_SLOTS: { col: number; row: number }[] = [
  { col: 1, row: 7 }, { col: 4, row: 7 }, { col: 7, row: 7 }, { col: 10, row: 7 },
  { col: 1, row: 10 }, { col: 4, row: 10 }, { col: 7, row: 10 }, { col: 10, row: 10 },
  { col: 1, row: 13 }, { col: 4, row: 13 }, { col: 7, row: 13 }, { col: 10, row: 13 },
];
export const STORAGE_ROWS = { top: 1, bottom: 3 };       // crates on row 1, walk on rows 2-3
export const STORAGE_WALL_ROW = 4;                         // wall with a door gap
export const STORAGE_DOOR_COLS = [6, 7, 8];
export const COUNTER_1 = { col: 1, row: 18, width: 3 };    // cashier stands on row 17
export const COUNTER_2 = { col: 5, row: 18, width: 3 };
export const QUEUE_TILES: { col: number; row: number }[] = [
  { col: 2, row: 19 }, { col: 6, row: 19 }, { col: 2, row: 20 }, { col: 6, row: 20 },
  { col: 1, row: 20 }, { col: 7, row: 20 }, { col: 3, row: 20 }, { col: 5, row: 20 },
];
export const ENTRANCE = { col: 6, row: 21 };               // store doorway (2 wide: cols 6-7) onto the concourse
export const ELEVATOR = { col: 48, row: 1, width: 2 };     // on the concourse, accessed from row 2
export const PLAYER_START = { col: 7, row: 5 };
export const MALL_EXITS: { col: number; row: number }[] = [ // customers come and go through these
  { col: 6, row: 39 }, { col: 7, row: 39 }, { col: 48, row: 39 }, { col: 49, row: 39 },
];
export const STORE_BOUNDS = { col: 0, row: 0, width: 15, height: 22 };

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
  floorColor: 0xf1dcbd,
  floorAlt: 0xe6cca8,
  wallColor: 0x6fb6ff,
  storageColor: 0xcfd4dc,
  uniformColor: 0x2ec27e,
  patienceMs: 12000,
  customerEveryMs: 5000,
  products: [
    { id: 'chips', name: 'Chips', color: 0xf2c14e, accent: 0xd94141, caseCost: 5, caseSize: 6, sellPrice: 5 },
    { id: 'bananas', name: 'Bananas', color: 0xf7e35c, accent: 0x8b6b1e, caseCost: 12, caseSize: 8, sellPrice: 4 },
    { id: 'bread', name: 'Bread', color: 0xd9a066, accent: 0x8c5a2b, caseCost: 20, caseSize: 8, sellPrice: 6 },
    { id: 'milk', name: 'Milk', color: 0xf4f7fb, accent: 0x3b7dd8, caseCost: 30, caseSize: 8, sellPrice: 8 },
    { id: 'eggs', name: 'Eggs', color: 0xfff1d6, accent: 0xc9a66b, caseCost: 36, caseSize: 8, sellPrice: 9 },
    { id: 'cereal', name: 'Cereal', color: 0xe86f3a, accent: 0xfff1a8, caseCost: 45, caseSize: 8, sellPrice: 10 },
    { id: 'soda', name: 'Soda', color: 0xd7263d, accent: 0xffffff, caseCost: 60, caseSize: 10, sellPrice: 9 },
    { id: 'apples', name: 'Apples', color: 0xe63946, accent: 0x52b788, caseCost: 70, caseSize: 10, sellPrice: 11 },
    { id: 'pizza', name: 'Frozen Pizza', color: 0xc1440e, accent: 0xffd166, caseCost: 90, caseSize: 8, sellPrice: 15 },
    { id: 'icecream', name: 'Ice Cream', color: 0xffd6e8, accent: 0x8b4513, caseCost: 110, caseSize: 8, sellPrice: 17 },
    { id: 'deli', name: 'Deli Meat', color: 0xe07a7a, accent: 0xfff0f0, caseCost: 120, caseSize: 8, sellPrice: 18 },
    { id: 'cake', name: 'Birthday Cake', color: 0xf7a1c4, accent: 0xffffff, caseCost: 200, caseSize: 6, sellPrice: 35 },
  ],
  fixtures: [
    ...commonFixtures(1),
    shelf('rack_chips', 'Chip Rack', 5, 'chips', 0),
    shelf('stand_bananas', 'Produce Stand', 25, 'bananas', 1),
    shelf('shelf_bread', 'Bread Shelf', 60, 'bread', 2),
    shelf('fridge_milk', 'Dairy Fridge', 120, 'milk', 3),
    shelf('fridge_eggs', 'Egg Cooler', 160, 'eggs', 4),
    shelf('shelf_cereal', 'Cereal Aisle', 200, 'cereal', 5),
    shelf('fridge_soda', 'Soda Fridge', 320, 'soda', 6),
    shelf('stand_apples', 'Apple Cart', 400, 'apples', 7),
    shelf('freezer_pizza', 'Freezer', 500, 'pizza', 8),
    shelf('freezer_icecream', 'Ice Cream Chest', 650, 'icecream', 9),
    shelf('case_deli', 'Deli Case', 800, 'deli', 10),
    shelf('display_cake', 'Bakery Display', 1200, 'cake', 11),
  ],
};

// Floor 2: clothing store.
const clothing: FloorDef = {
  id: 'clothing',
  level: 2,
  name: 'Thread Theory',
  tagline: 'Fresh fits for the whole mall.',
  floorColor: 0xf3e4ee,
  floorAlt: 0xe8d2e0,
  wallColor: 0xff8fb1,
  storageColor: 0xd9cfd5,
  uniformColor: 0x7b2cbf,
  patienceMs: 11500,
  customerEveryMs: 5100,
  products: [
    { id: 'socks', name: 'Socks', color: 0xffffff, accent: 0x3a86ff, caseCost: 20, caseSize: 10, sellPrice: 8 },
    { id: 'tees', name: 'T-Shirts', color: 0x4cc9f0, accent: 0xffffff, caseCost: 50, caseSize: 8, sellPrice: 15 },
    { id: 'caps', name: 'Caps', color: 0xe63946, accent: 0x1d3557, caseCost: 80, caseSize: 8, sellPrice: 20 },
    { id: 'jeans', name: 'Jeans', color: 0x2f5d9f, accent: 0xc8a96a, caseCost: 130, caseSize: 6, sellPrice: 35 },
    { id: 'hoodies', name: 'Hoodies', color: 0x6c757d, accent: 0xffffff, caseCost: 180, caseSize: 6, sellPrice: 45 },
    { id: 'dresses', name: 'Dresses', color: 0xf15bb5, accent: 0xfee440, caseCost: 240, caseSize: 6, sellPrice: 60 },
    { id: 'sneakers', name: 'Sneakers', color: 0xffffff, accent: 0xff595e, caseCost: 320, caseSize: 6, sellPrice: 80 },
    { id: 'jackets', name: 'Jackets', color: 0x1b4332, accent: 0xd8f3dc, caseCost: 420, caseSize: 5, sellPrice: 110 },
    { id: 'sunglasses', name: 'Sunglasses', color: 0x111111, accent: 0x9d4edd, caseCost: 500, caseSize: 6, sellPrice: 120 },
    { id: 'boots', name: 'Boots', color: 0x7f5539, accent: 0x111111, caseCost: 650, caseSize: 5, sellPrice: 160 },
    { id: 'watches', name: 'Watches', color: 0xc0c0c0, accent: 0x111111, caseCost: 900, caseSize: 4, sellPrice: 280 },
    { id: 'suits', name: 'Suits', color: 0x22223b, accent: 0xf2e9e4, caseCost: 1400, caseSize: 4, sellPrice: 450 },
  ],
  fixtures: [
    ...commonFixtures(2.5),
    shelf('bin_socks', 'Sock Bin', 40, 'socks', 0),
    shelf('table_tees', 'Tee Table', 110, 'tees', 1),
    shelf('wall_caps', 'Cap Wall', 200, 'caps', 2),
    shelf('rack_jeans', 'Denim Rack', 350, 'jeans', 3),
    shelf('rack_hoodies', 'Hoodie Rack', 500, 'hoodies', 4),
    shelf('rack_dresses', 'Dress Rack', 700, 'dresses', 5),
    shelf('wall_sneakers', 'Sneaker Wall', 950, 'sneakers', 6),
    shelf('rack_jackets', 'Jacket Rack', 1300, 'jackets', 7),
    shelf('case_sunglasses', 'Shades Case', 1600, 'sunglasses', 8),
    shelf('wall_boots', 'Boot Wall', 2100, 'boots', 9),
    shelf('case_watches', 'Watch Case', 2800, 'watches', 10),
    shelf('display_suits', 'Suit Display', 4000, 'suits', 11),
  ],
};

// Floor 3: toy store.
const toys: FloorDef = {
  id: 'toys',
  level: 3,
  name: 'Toy Tower',
  tagline: 'Every kid on the escalator is headed here.',
  floorColor: 0xd8e8ff,
  floorAlt: 0xc4d9f7,
  wallColor: 0xb27dff,
  storageColor: 0xd0cce0,
  uniformColor: 0xff5fa8,
  patienceMs: 11000,
  customerEveryMs: 5200,
  products: [
    { id: 'bouncy', name: 'Bouncy Balls', color: 0x4ecdc4, accent: 0xff6b6b, caseCost: 40, caseSize: 10, sellPrice: 12 },
    { id: 'cars', name: 'Toy Cars', color: 0xff5252, accent: 0x222222, caseCost: 90, caseSize: 8, sellPrice: 22 },
    { id: 'plush', name: 'Plushies', color: 0xffb385, accent: 0x7a4b2a, caseCost: 150, caseSize: 8, sellPrice: 32 },
    { id: 'yoyo', name: 'Yo-Yos', color: 0xffd166, accent: 0xef476f, caseCost: 180, caseSize: 10, sellPrice: 30 },
    { id: 'blocks', name: 'Building Blocks', color: 0xffd93d, accent: 0x3d7dff, caseCost: 220, caseSize: 6, sellPrice: 55 },
    { id: 'puzzles', name: 'Puzzles', color: 0x6a4c93, accent: 0xf8f9fa, caseCost: 300, caseSize: 6, sellPrice: 70 },
    { id: 'nerf', name: 'Foam Blasters', color: 0xff8c00, accent: 0x1e90ff, caseCost: 420, caseSize: 6, sellPrice: 95 },
    { id: 'board', name: 'Board Games', color: 0x2b9348, accent: 0xffffff, caseCost: 560, caseSize: 6, sellPrice: 120 },
    { id: 'dolls', name: 'Action Figures', color: 0x8ac926, accent: 0x1982c4, caseCost: 650, caseSize: 6, sellPrice: 140 },
    { id: 'rc', name: 'RC Cars', color: 0x3a86ff, accent: 0xffbe0b, caseCost: 800, caseSize: 4, sellPrice: 240 },
    { id: 'lego', name: 'Mega Sets', color: 0xe63946, accent: 0xffd166, caseCost: 1100, caseSize: 4, sellPrice: 320 },
    { id: 'console', name: 'Game Consoles', color: 0x222222, accent: 0x00e5ff, caseCost: 1500, caseSize: 4, sellPrice: 450 },
  ],
  fixtures: [
    ...commonFixtures(5),
    shelf('bin_bouncy', 'Bouncy Ball Bin', 60, 'bouncy', 0),
    shelf('shelf_cars', 'Car Track Shelf', 180, 'cars', 1),
    shelf('shelf_plush', 'Plushie Wall', 350, 'plush', 2),
    shelf('bin_yoyo', 'Yo-Yo Bin', 450, 'yoyo', 3),
    shelf('shelf_blocks', 'Block Table', 600, 'blocks', 4),
    shelf('shelf_puzzles', 'Puzzle Shelf', 900, 'puzzles', 5),
    shelf('shelf_nerf', 'Blaster Rack', 1300, 'nerf', 6),
    shelf('shelf_board', 'Game Shelf', 1800, 'board', 7),
    shelf('wall_dolls', 'Figure Wall', 2200, 'dolls', 8),
    shelf('shelf_rc', 'RC Display', 2600, 'rc', 9),
    shelf('display_lego', 'Mega Set Display', 3200, 'lego', 10),
    shelf('shelf_console', 'Console Case', 4000, 'console', 11),
  ],
};

// Floor 4: sports store.
const sports: FloorDef = {
  id: 'sports',
  level: 4,
  name: 'Sport Zone',
  tagline: 'Gear up. Game on.',
  floorColor: 0xd5efc8,
  floorAlt: 0xc1e3b0,
  wallColor: 0x4fcf7a,
  storageColor: 0xc7d3c7,
  uniformColor: 0x2f6bff,
  patienceMs: 10000,
  customerEveryMs: 5400,
  products: [
    { id: 'water', name: 'Water Bottles', color: 0x48cae4, accent: 0xffffff, caseCost: 80, caseSize: 10, sellPrice: 20 },
    { id: 'balls', name: 'Basketballs', color: 0xe07a1f, accent: 0x222222, caseCost: 200, caseSize: 8, sellPrice: 45 },
    { id: 'soccer', name: 'Soccer Balls', color: 0xffffff, accent: 0x111111, caseCost: 240, caseSize: 8, sellPrice: 50 },
    { id: 'gloves', name: 'Baseball Gloves', color: 0x8b5a2b, accent: 0xf1e2c6, caseCost: 350, caseSize: 6, sellPrice: 90 },
    { id: 'cleats', name: 'Cleats', color: 0x111111, accent: 0x39ff14, caseCost: 500, caseSize: 6, sellPrice: 130 },
    { id: 'jersey', name: 'Jerseys', color: 0xd62828, accent: 0xffffff, caseCost: 700, caseSize: 6, sellPrice: 170 },
    { id: 'helmet', name: 'Helmets', color: 0x1d3557, accent: 0xffffff, caseCost: 850, caseSize: 6, sellPrice: 200 },
    { id: 'skate', name: 'Skateboards', color: 0x7b2cbf, accent: 0xffd60a, caseCost: 1000, caseSize: 5, sellPrice: 260 },
    { id: 'hockey', name: 'Hockey Sticks', color: 0xeeeeee, accent: 0x0077b6, caseCost: 1300, caseSize: 5, sellPrice: 330 },
    { id: 'tent', name: 'Tents', color: 0x2a9d8f, accent: 0xe9c46a, caseCost: 1600, caseSize: 4, sellPrice: 420 },
    { id: 'bike', name: 'Bikes', color: 0x00b4d8, accent: 0x222222, caseCost: 2000, caseSize: 4, sellPrice: 600 },
    { id: 'kayak', name: 'Kayaks', color: 0xffb703, accent: 0x023047, caseCost: 3200, caseSize: 3, sellPrice: 1200 },
  ],
  fixtures: [
    ...commonFixtures(10),
    shelf('cooler_water', 'Drink Cooler', 150, 'water', 0),
    shelf('rack_balls', 'Ball Rack', 450, 'balls', 1),
    shelf('bin_soccer', 'Soccer Bin', 600, 'soccer', 2),
    shelf('wall_gloves', 'Glove Wall', 900, 'gloves', 3),
    shelf('shelf_cleats', 'Shoe Wall', 1400, 'cleats', 4),
    shelf('rack_jersey', 'Jersey Rack', 2000, 'jersey', 5),
    shelf('wall_helmet', 'Helmet Wall', 2400, 'helmet', 6),
    shelf('rack_skate', 'Skate Rack', 2800, 'skate', 7),
    shelf('rack_hockey', 'Stick Rack', 3800, 'hockey', 8),
    shelf('display_tent', 'Tent Display', 4600, 'tent', 9),
    shelf('stand_bike', 'Bike Stand', 5500, 'bike', 10),
    shelf('stand_kayak', 'Kayak Rack', 8000, 'kayak', 11),
  ],
};

// Floor 5: electronics.
const electronics: FloorDef = {
  id: 'electronics',
  level: 5,
  name: 'Gizmo Galaxy',
  tagline: 'If it beeps, we sell it.',
  floorColor: 0xdfe3ee,
  floorAlt: 0xcdd3e2,
  wallColor: 0x4c5c8a,
  storageColor: 0xbfc3cf,
  uniformColor: 0x22263a,
  patienceMs: 9000,
  customerEveryMs: 5600,
  products: [
    { id: 'cables', name: 'Cables', color: 0xffffff, accent: 0x222222, caseCost: 150, caseSize: 10, sellPrice: 35 },
    { id: 'earbuds', name: 'Earbuds', color: 0xf8f9fa, accent: 0x6c757d, caseCost: 400, caseSize: 8, sellPrice: 90 },
    { id: 'chargers', name: 'Chargers', color: 0x343a40, accent: 0xffffff, caseCost: 500, caseSize: 8, sellPrice: 110 },
    { id: 'speaker', name: 'Speakers', color: 0x343a40, accent: 0x00d4ff, caseCost: 700, caseSize: 6, sellPrice: 180 },
    { id: 'watch', name: 'Smart Watches', color: 0x212529, accent: 0x51cf66, caseCost: 1100, caseSize: 6, sellPrice: 300 },
    { id: 'camera', name: 'Cameras', color: 0x111111, accent: 0xc0c0c0, caseCost: 1500, caseSize: 5, sellPrice: 420 },
    { id: 'tablet', name: 'Tablets', color: 0xced4da, accent: 0x228be6, caseCost: 1800, caseSize: 5, sellPrice: 520 },
    { id: 'drone', name: 'Drones', color: 0xadb5bd, accent: 0xff922b, caseCost: 2600, caseSize: 4, sellPrice: 900 },
    { id: 'laptop', name: 'Laptops', color: 0x868e96, accent: 0x4dabf7, caseCost: 3600, caseSize: 4, sellPrice: 1300 },
    { id: 'phone', name: 'Phones', color: 0x111111, accent: 0x4cc9f0, caseCost: 4200, caseSize: 4, sellPrice: 1500 },
    { id: 'tv', name: 'Big TVs', color: 0x111111, accent: 0xff6b6b, caseCost: 5000, caseSize: 3, sellPrice: 2200 },
    { id: 'vr', name: 'VR Headsets', color: 0xffffff, accent: 0x845ef7, caseCost: 7000, caseSize: 3, sellPrice: 3200 },
  ],
  fixtures: [
    ...commonFixtures(22),
    shelf('wall_cables', 'Cable Wall', 300, 'cables', 0),
    shelf('shelf_earbuds', 'Earbud Case', 900, 'earbuds', 1),
    shelf('shelf_chargers', 'Charger Shelf', 1200, 'chargers', 2),
    shelf('shelf_speaker', 'Speaker Shelf', 1800, 'speaker', 3),
    shelf('case_watch', 'Watch Case', 2800, 'watch', 4),
    shelf('case_camera', 'Camera Case', 3500, 'camera', 5),
    shelf('table_tablet', 'Tablet Table', 4200, 'tablet', 6),
    shelf('shelf_drone', 'Drone Display', 6000, 'drone', 7),
    shelf('table_laptop', 'Laptop Bar', 8500, 'laptop', 8),
    shelf('table_phone', 'Phone Bar', 10000, 'phone', 9),
    shelf('wall_tv', 'TV Wall', 12000, 'tv', 10),
    shelf('booth_vr', 'VR Booth', 18000, 'vr', 11),
  ],
};

// Floor 6: the food court, top of the mall.
const foodcourt: FloorDef = {
  id: 'foodcourt',
  level: 6,
  name: 'Sky Food Court',
  tagline: 'The top floor. Everybody is hungry.',
  floorColor: 0xf7ddb9,
  floorAlt: 0xefcc9f,
  wallColor: 0xff7a59,
  storageColor: 0xd8cfc2,
  uniformColor: 0xff4757,
  patienceMs: 8000,
  customerEveryMs: 5800,
  products: [
    { id: 'pretzel', name: 'Pretzels', color: 0xc68642, accent: 0xffffff, caseCost: 300, caseSize: 10, sellPrice: 60 },
    { id: 'fries', name: 'Fries', color: 0xffd43b, accent: 0xe03131, caseCost: 600, caseSize: 10, sellPrice: 110 },
    { id: 'lemonade', name: 'Lemonade', color: 0xfff3b0, accent: 0xffd60a, caseCost: 800, caseSize: 10, sellPrice: 140 },
    { id: 'slice', name: 'Pizza Slices', color: 0xffa94d, accent: 0xc92a2a, caseCost: 1000, caseSize: 8, sellPrice: 200 },
    { id: 'taco', name: 'Tacos', color: 0xfab005, accent: 0x40c057, caseCost: 1600, caseSize: 8, sellPrice: 320 },
    { id: 'burger', name: 'Burgers', color: 0xd9480f, accent: 0x51cf66, caseCost: 2400, caseSize: 6, sellPrice: 500 },
    { id: 'ramen', name: 'Ramen', color: 0xf4a261, accent: 0x264653, caseCost: 2900, caseSize: 6, sellPrice: 600 },
    { id: 'sushi', name: 'Sushi', color: 0xffffff, accent: 0xfa5252, caseCost: 3400, caseSize: 6, sellPrice: 750 },
    { id: 'boba', name: 'Boba Tea', color: 0xd0bfa7, accent: 0x343a40, caseCost: 4500, caseSize: 6, sellPrice: 1000 },
    { id: 'sundae', name: 'Ice Cream Sundaes', color: 0xfff0f6, accent: 0xe64980, caseCost: 6000, caseSize: 5, sellPrice: 1500 },
    { id: 'lobster', name: 'Lobster Rolls', color: 0xe76f51, accent: 0xf4a261, caseCost: 7500, caseSize: 4, sellPrice: 2100 },
    { id: 'steak', name: 'Steak Dinners', color: 0x862e2e, accent: 0xffe066, caseCost: 9000, caseSize: 4, sellPrice: 2800 },
  ],
  fixtures: [
    ...commonFixtures(50),
    shelf('stand_pretzel', 'Pretzel Stand', 800, 'pretzel', 0),
    shelf('stand_fries', 'Fry Station', 2000, 'fries', 1),
    shelf('stand_lemonade', 'Lemonade Stand', 3000, 'lemonade', 2),
    shelf('oven_slice', 'Pizza Oven', 4000, 'slice', 3),
    shelf('bar_taco', 'Taco Bar', 6500, 'taco', 4),
    shelf('grill_burger', 'Burger Grill', 9500, 'burger', 5),
    shelf('bar_ramen', 'Ramen Bar', 11000, 'ramen', 6),
    shelf('bar_sushi', 'Sushi Bar', 13000, 'sushi', 7),
    shelf('bar_boba', 'Boba Bar', 17000, 'boba', 8),
    shelf('bar_sundae', 'Sundae Bar', 22000, 'sundae', 9),
    shelf('stand_lobster', 'Lobster Shack', 26000, 'lobster', 10),
    shelf('grill_steak', 'Steakhouse Grill', 30000, 'steak', 11),
  ],
};

export const FLOORS: FloorDef[] = [grocery, clothing, toys, sports, electronics, foodcourt];

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
