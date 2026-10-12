# Unit Price Calculator for Shopping

A free **unit price calculator** for anyone standing in a shop aisle wondering **which pack is cheaper**. Type the price and the size from each label, in whatever unit it uses (g, kg, oz, lb, ml, L, fl oz, pints, gallons, metres, feet or a number of items), and the app shows **the price per kg, litre, oz or item** of every pack, **which one is cheapest**, **how much more the others cost in percent and per unit**, and **what the same amount would cost** bought the other way. Multipacks and "3 for 5" offers too. Private on your device: no account, no ads. Works offline, so it works in a shop with no signal.

**Live demo:** [umar8092.github.io/apps/unit-price-calculator-for-shopping](https://umar8092.github.io/apps/unit-price-calculator-for-shopping/)

| Desktop | On a phone |
|---|---|
| ![Unit Price Calculator for Shopping on a laptop: three packs of rice on the left (Small bag 500 g for 2.49, Big bag 1.2 kg for 5.29, 4-pack of 250 g for 4.60) and on the right "Big bag is cheapest, 4.41 per kg", with the 4-pack 4% more and the small bag 13% more](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Unit Price Calculator for Shopping on a phone: each pack in its own box with its price per kg, then Big bag is cheapest at 4.41 per kg and the ranked list" width="220"> |

## The situation it solves

You need rice. The shelf has three choices:

- **Small bag**: 500 g for 2.49
- **Big bag**: 1.2 kg for 5.29
- **4-pack** on offer: 4 × 250 g for 4.60

Which is cheaper? The app answers:

**Big bag is cheapest. 4.41 per kg.** The next cheapest, 4-pack, costs 4% more per kg.

1. Big bag: 1.2 kg for 5.29 = **4.41 per kg**, cheapest
2. 4-pack: 4 × 250 g for 4.60 = **4.60 per kg**, 4% more (0.19 more per kg). The same 1.2 kg bought this way costs 5.52, 0.23 more.
3. Small bag: 500 g for 2.49 = **4.98 per kg**, 13% more (0.57 more per kg). The same 1.2 kg bought this way costs 5.98, 0.69 more.

(5.29 ÷ 1.2 = 4.408; 4.60 ÷ 1 kg = 4.60; 2.49 ÷ 0.5 = 4.98. 1.2 kg at 4.98 a kg = 5.976, so 5.98.)

More examples it gets exactly right:

- **Different units:** 16 oz for 3.99 against 500 g for 4.20. The 500 g pack is cheaper; the 16 oz one costs 5% more per oz, and the same 500 g bought that way costs 4.40.
- **Drinks:** 2 L for 1.89, 6 × 330 ml cans for 3.00, 1 US gallon for 4.50: 0.945, 1.515 and 1.189 per litre, so the 2 L bottle wins.
- **Toilet rolls:** 9 rolls for 4.50 against 24 rolls for 11.00: 0.500 and 0.458 per item, so the 24-pack is cheaper.
- **Exactly the same:** 1 kg for 2.00 and 500 g for 1.00: "Both cost the same".

Other cases it handles: a pack filled in alone (its unit price, and "Add another item to see which is cheaper"), a pack in litres when the others are in kg (not compared, with a message saying which unit to change), prices that look the same when rounded (more decimals are shown until they differ, and prices under 1 show 3 decimals), two of three packs tied, prices typed as `2,49`, `$2.49` or `1.299,00`, blank, zero, negative, words, huge numbers and a pack count of 1.5 (each with a plain message in the box), up to 10 packs, very long names (cut to 40 characters and wrapped). Corrupt saved data is cleaned up, and if the browser blocks storage the app still works and says it is not saving.

## Features

- **Help button.** Tap **Help** at the top for a short how-to, and **All apps** to go back to the list of apps. **Light mode / Dark mode** switch.
- **Each pack in its own box**, A, B, C, with its own unit and its own price per unit shown as soon as it is filled in.
- **Units:** g, kg, oz, lb, ml, cl, L, fl oz (US and UK), pints (UK and US), US gallons, m, ft, yd and items (rolls, sheets, tablets, nappies, wash loads).
- **Show the price per** kg, 100 g, lb, oz, litre, 100 ml, US gallon, fl oz, metre, 10 m, ft, 100 ft, item, 10 items or 100 items. Remembered.
- **Which is cheaper?** in plain words, a ranked list with **% more**, **more per unit** and **what the same amount would cost**.
- **+ It is a multipack or multi-buy (optional)**: 6 × 330 ml, or "3 for 5.00".
- **+ Add a name (optional)** for each pack.
- **Remove** a pack with **Undo**, **Start over** with **Undo**, **Try an example**.
- **Currency symbol** (none, $, €, £, ₹, Rs, ¥, ₩, ₦, ₱, R, kr, CHF, AED, SAR, RM), remembered. Plain numbers by default.
- **Copy result** and **Email result** (opens your mail app with the answer written, no address needed).
- **Private, works offline and installable.** Phone and desktop layouts. Works with a keyboard and a screen reader.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `unit-price-calculator-for-shopping/index.html` in your browser. Offline mode and install need the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` is the maths, with no page code. Prices are whole cents. Every size is turned into grams, millilitres, metres or items (1 oz = 28.349523125 g, 1 lb = 453.59237 g, 1 US fl oz = 29.5735295625 ml, 1 UK pint = 568.26125 ml, 1 US gallon = 3,785.411784 ml), multiplied by how many are in the pack, and the price is divided by it. Packs are ranked by that exact price per gram (or ml, metre, item); two packs are the same only when their exact prices per unit are equal. Shown prices round half up.
- `script.js` builds the page. Everything you type is added as plain text, never as HTML. What you type is saved in this browser's storage under `unit-price-calculator-for-shopping.state`, and every saved value is checked before it is used.
- `sw.js` saves the app for offline use (network first, so updates always arrive).
- Checks: `node tests.js` for the maths (also `test.html` in a browser), `node ui-test.js` drives the real page in headless Chromium (add `--base https://umar8092.github.io/apps` to test the live site).

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
