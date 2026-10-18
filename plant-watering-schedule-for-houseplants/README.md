# Plant Watering Schedule for Houseplants

A free **plant watering schedule** for houseplants and balcony pots. Add each plant with **how often it needs water** and **when you last watered it**, and the app shows **which plants need water today**, which are **late**, and what comes next. Tap **Watered** when you water, **Still wet** when the soil is still damp, or **I watered all** for everything due. Each plant can have its **own winter number** and its own **plant food** schedule, and when you go away the app makes a **day-by-day list for the plant-sitter**. Works offline, no sign-up, no ads.

**Live demo:** [umar8092.github.io/apps/plant-watering-schedule-for-houseplants](https://umar8092.github.io/apps/plant-watering-schedule-for-houseplants/)

| Desktop | On a phone |
|---|---|
| ![Plant Watering Schedule on a laptop: today 2 plants need water, Basil (1 day late) and Monstera, with an I watered all 2 button, plant food today for the Monstera, each plant in its own box on the left, and a day-by-day list for the plant-sitter from Sat 24 Oct to Sun 1 Nov on the right](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Plant Watering Schedule on a phone: Today, 2 plants need water today, Basil (1 day late), Monstera, I watered all 2, next Peace lily tomorrow Mon 19 Oct, plant food today Monstera, season Spring and summer" width="220"> |

## The situation it solves

Sara has six houseplants. The basil wilts because she forgets it, the snake plant nearly rotted because she watered it with everything else, and in two weeks she is going away for nine days and her neighbour will water them. On Sunday 18 October 2026 she adds them:

- Monstera, living room, every week (every 2 weeks in winter), last watered Sun 11 Oct, plant food every 4 weeks, last fed Sun 20 Sep
- Basil, kitchen window, every 2 days, last watered Thu 15 Oct, note "Water from below"
- Fern, bathroom, every 3 days, last watered Sat 17 Oct
- Snake plant, living room, every 3 weeks (every 4 weeks in winter), last watered Sat 3 Oct
- Peace lily, bedroom, every 5 days, last watered Wed 14 Oct
- Aloe vera, kitchen window, every 2 weeks, last watered Fri 9 Oct

The app answers:

- **Today: 2 plants need water today: Basil (1 day late), Monstera.** **Next: Peace lily, tomorrow, Mon 19 Oct.** **Plant food today: Monstera.**
- Each plant's box: Basil **Water now: 1 day late (was due Sat 17 Oct)**, Fern **Water Tue 20 Oct (in 2 days)**, Aloe vera **Water Fri 23 Oct (in 5 days)**, Snake plant **Water Sat 24 Oct (in 6 days)**.
- She waters the basil and taps **Watered**: **Basil watered. Next: Tue 20 Oct (in 2 days).** She feels the Monstera's soil, it is still damp, so she taps **Still wet**: **Soil was still wet: check again tomorrow**.

Going away from **Sat 24 Oct to Sun 1 Nov**, watering everything on Fri 23 Oct, the list for her neighbour says:

```
Sun 25 Oct: Basil (Kitchen window)
Mon 26 Oct: Fern (Bathroom)
Tue 27 Oct: Basil (Kitchen window)
Wed 28 Oct: Peace lily (Bedroom)
Thu 29 Oct: Basil (Kitchen window), Fern (Bathroom)
Fri 30 Oct: Monstera (Living room)
Sat 31 Oct: Basil (Kitchen window)
Sun 1 Nov: Fern (Bathroom)

No water needed while I am away: Aloe vera (Kitchen window), Snake plant (Living room).

Notes:
- Basil: Water from below
```

In November she switches the season to **Autumn and winter**: the Monstera moves to every 2 weeks, the snake plant to every 4 weeks, and the Monstera's plant food pauses until spring.

How the dates are counted: the next watering is the last watering plus the plant's number of days (every 7 days, watered Sun 11 Oct, means Sun 18 Oct). Watering early or late always counts from the day you tap **Watered**. **Still wet** moves the plant to tomorrow. "Not sure" when you last watered makes the plant due today.

## Features

- **Help button.** Tap **Help** at the top for a short how-to written for this app, and tap **All apps** to go back to the list.
- **Today** at the top: the plants to water today with how many days late, **I watered all** with Undo, the next plant coming up, and plant food due today.
- **Each plant in its own box**, grouped into **Water today** and **Coming up**, soonest first, with its place, how often, when it was last watered and your note.
- **Water it every day up to every 4 weeks**, or any number of days from 1 to 90. **Last watered** with Today, Yesterday, 3 days ago, A week ago or **Not sure**. A preview shows the next watering before you save.
- **Watered**, **Still wet** (ask again tomorrow), **Fed**, **Edit**. Watered twice on the same day is counted once.
- **Water less in winter (optional):** each plant its own winter number, used when you set the **Season** to "Autumn and winter". You choose when, because seasons differ around the world.
- **Plant food (optional):** how often, when last fed, and **Pause plant food in autumn and winter**.
- **Where it is and a note (optional):** places you type are offered again, and buttons above the list show one place at a time.
- **Going away?** A day-by-day list for the plant-sitter from the first to the last day away, with the plants that need nothing and your notes. **Copy**, **Email** (works without typing an address) or **Print** it.
- **Daily reminder:** a calendar file that reminds you every day at the time you choose to check the plants.
- **It died or I gave it away** moves a plant to **Gone plants** (Bring back any time); **Delete** with Undo. Your average gap between waterings shows when you edit a plant.
- **Copy my plant list**, **Email my plant list**, **Save a backup file**, **Restore a backup**, **Delete everything** with Undo. Damaged or blocked saved data is handled with a clear message.
- **Private.** Your plants stay in this browser on this device; your data is never sent anywhere.
- **Works offline and installable.** The dates update by themselves every day.
- **Back to all apps.** A "← All apps" button at the top of the page.
- **Light and dark mode switch.** It follows your device until you choose, and remembers your choice in every app.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `plant-watering-schedule-for-houseplants/index.html` in your browser.

Offline mode and install work best with the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` is the logic, with no page code. Dates are calendar dates (`2026-10-18`), so time zones and summer time never move a date. It works out each plant's next watering and plant food (with the winter numbers and Still wet), groups and sorts the plants, makes the plant-sitter list, the copy text and the daily calendar reminder, reads the form with plain error messages, and checks every saved or restored value.
- `script.js` builds the page. Names and notes are added as plain text, never as HTML. Everything is saved in `localStorage` on the device.
- `sw.js` saves the app on your device for offline use (network first, so updates show at once).
- Run the logic checks with `node tests.js` (or open `test.html`), and the full page test with `node ui-test.js` (needs Playwright). The page test fixes "today" to Sun 18 Oct 2026 and checks the exact answers above.

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
