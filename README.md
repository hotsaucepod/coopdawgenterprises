# Mall Tycoon

A top-down store-running game. Buy shelves, order stock, keep the shelves full, ring up customers, and unlock every upgrade on a floor to open the next floor of the mall. Runs in any browser and installs on iPhone through Xcode.

## Play it

- **Phone:** drag anywhere on the store to walk. Walk into a crate to pick items up, walk into the matching shelf to put them down.
- **Computer:** WASD or the arrow keys.
- **Buy pads:** stand on a glowing pad for a moment to buy that shelf or counter (only when you can afford it).
- **Order:** buys a case of a product. It shows up in the storage room at the top.
- **Build:** buy shelves, hire a cashier or a stocker, and upgrade your speed and how much you can carry.
- **Elevator:** bottom right of the store, or the Elevator button.

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
| `src/scenes/GameScene.ts` | The store: buying, stocking, customers, checkout, rating, menus |
| `src/entities/Customer.ts` | Customer behaviour: shop, wait, queue, pay, leave |
| `src/entities/Stocker.ts` | The hired helper who carries stock to shelves |
| `src/systems/textures.ts` | All the art, drawn with code |
| `src/systems/save.ts` | Saving progress on the device |
| `index.html`, `src/styles.css` | The HUD and menus |

## Floors

1. Fresh Basket Market (grocery)
2. Toy Tower
3. Sport Zone
4. Gizmo Galaxy (electronics)
5. Sky Food Court
