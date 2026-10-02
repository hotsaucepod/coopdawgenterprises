# Mall Tycoon

A 3D store-running game seen from above. You run a store inside an open mall floor: buy shelves, order stock, keep the shelves full, ring up customers, and unlock every upgrade to open the next floor. Built with Three.js, runs in any browser, and installs on iPhone through Xcode.

## Play it

- **Phone:** drag anywhere on the store to walk. Hold the Sprint button to run. Walk into a crate to pick items up (you can carry a mix), walk into the matching shelf to put them down.
- **Computer:** WASD or the arrow keys. Hold Shift to sprint. P or Escape pauses.
- **Stamina:** sprinting drains the bar under your money. It refills when you slow down. Endurance upgrades make it longer.
- **Pause:** the ⏸ button pauses, saves on demand, or quits to the title. The game also auto-saves every couple of seconds.
- **Me:** upgrade your shopkeeper: speed, carrying, endurance, and charm (customers wait longer).
- **Buy pads:** stand on a glowing pad for a moment to buy that shelf or counter (only when you can afford it).
- **Order:** buys a case of a product. It shows up in the storage room at the top.
- **Build:** buy shelves, hire a cashier or a stocker, and upgrade your speed and how much you can carry.
- **Elevator:** walk down the concourse to the elevator doors (top right of the mall), or use the Elevator button.
- **The mall:** your store opens onto a concourse with a fountain, benches, empty storefronts, and window shoppers. Customers come in through the mall exits at the bottom and walk to your store.

Win and lose: customers who wait too long at an empty shelf leave angry and your star rating drops. Below 15 the store gets closed. Buy everything on a floor to unlock the next one. Money is cumulative across floors and you can always go back down.

## Run it locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (it also prints a network URL you can open on your phone if it is on the same Wi-Fi).

## Build for the web

```bash
npm run build      # output in dist/
npm run preview    # serve the built game locally
```

## Run on your iPhone (Xcode)

The `ios/` folder is a Capacitor project that wraps the built web game.

On a Mac with Xcode installed:

```bash
npm install
npm run ios        # builds the web app, copies it into ios/, opens Xcode
```

In Xcode: pick the `App` target, set your Team under Signing & Capabilities, plug in your phone, choose it as the run destination, and press Run. After every code change run `npm run ios:sync` and press Run again.

## Change the game

Everything about the floors is data in `src/data/floors.ts`: store names, products, prices, case sizes, shelf costs, how patient customers are, and how often they show up. Add a floor by adding a new entry to the `FLOORS` list.

| File | What it does |
| --- | --- |
| `src/data/floors.ts` | Floors, products, prices, upgrades, layout constants |
| `src/data/mallMap.ts` | The mall floor drawn as a text picture (walls, store, concourse, fountain, elevator, exits) |
| `src/game/Game.ts` | The rules: buying, stocking, customers, checkout, rating, menus |
| `src/render/builders.ts` | Every 3D object (walls, shelves, counters, crates, fountain, elevator), built from blocks |
| `src/render/Character.ts` | The round-headed, thick-legged people and their walk animation |
| `src/render/Renderer3D.ts` | Camera, lighting, shadows, bloom |
| `src/entities/Customer.ts` | Customer behaviour: shop, wait, queue, pay, leave |
| `src/entities/Stocker.ts` | The hired helper who carries stock to shelves |
| `src/entities/Walker.ts` | Window shoppers wandering the concourse |
| `src/systems/save.ts` | Saving progress on the device |
| `index.html`, `src/styles.css` | The HUD and menus |

## Floors

1. Fresh Basket Market (grocery)
2. Thread Theory (clothing)
3. Toy Tower
4. Sport Zone
5. Gizmo Galaxy (electronics)
6. Sky Food Court

Each floor has 12 products, a counter, a second register, a cashier and a stocker to unlock.
