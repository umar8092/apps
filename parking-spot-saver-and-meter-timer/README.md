# Parking Spot Saver and Meter Timer

Free **parking spot saver and parking meter timer** for anyone who parks in a big mall, airport, hospital or office car park, or on a paid street. When you park, type the level, row or bay, add a photo of the nearest sign and the location from your phone, and say how long you paid for. The app then shows **Paid until 3:40 PM, 22 min left**, warns you before the time runs out (the box turns amber, then red), lets you add time with one tap, makes a calendar reminder that rings even when your phone is locked, and leads you back with **Walk back in Maps** or **How far is my car?** (distance and direction, even with no internet). Two cars or more, each in its own box. No sign-up, no ads, private, works offline.

**Live demo:** [umar8092.github.io/apps/parking-spot-saver-and-meter-timer](https://umar8092.github.io/apps/parking-spot-saver-and-meter-timer/)

| Desktop | On a phone |
|---|---|
| ![Parking Spot Saver and Meter Timer on a laptop: on the left the Save another car's spot form with the note, Add my location, optional photo and car name, paid time choices with 2 hours picked and the line Paid until 5:18 PM; on the right My car shows 22 min left, Paid until 3:40 PM, parked at 1:40 PM, Where: Level B2, row F, bay 34, Walk back in Maps and the answer Your car is about 200 m away, to the north; below it the Honda at the airport shows 14 h 42 min left, paid until tomorrow at 6:00 AM](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Parking Spot Saver and Meter Timer on a phone: My car with 22 min left, paid until 3:40 PM, the note Level B2, row F, bay 34, Walk back in Maps, How far is my car? answered with about 200 m to the north, +15 min, +30 min and +1 hour buttons, and the Honda below with 14 h 42 min left" width="220"> |

## The situation it solves

Sara drives to the mall on Sunday 25 October and parks underground at **1:40 pm**. She pays the machine for **2 hours**. Before walking to the lifts she opens the app, types **Level B2, row F, bay 34 (blue zone, near the lifts)**, taps **Add my location** (*Location added (accurate to about 10 m).*), taps **2 hours** (*Paid until 3:40 PM (2 h from now).*) and presses **Save my spot**. She leaves **Warn me before it runs out** on **10 min before**, and presses **Add reminder to calendar** so her phone rings even while it is locked in her bag.

- At **3:18 pm** the box says **22 min left**, *Paid until 3:40 PM*, *Parked at 1:40 PM (1 h 38 min ago)*.
- At **3:30 pm** the warning comes: the box turns amber with **Ending soon**, the page beeps and the tab says *10 min left: My car · Parking*. Her calendar alerts her at the same time.
- She is still shopping, pays for 30 more minutes in the app the car park uses, and presses **+30 min**: *Added 30 min. Paid until 4:10 PM.* (Undo if she tapped by mistake.)
- If she had been late, at **3:41 pm** the box is red: **Paid time ran out**, *Ran out 1 min ago, at 3:40 PM*. Pressing **+15 min** then counts from now, as a new ticket would: *Paid until 3:56 PM*.
- Coming out of a different exit, she presses **How far is my car?**: *Your car is about 200 m away, to the north.* **Walk back in Maps** opens walking directions to the saved spot.
- At the car she presses **I'm back, clear this spot** (*Cleared My car. Welcome back!* with Undo).

Her husband left the **Honda** at the airport long-stay park on **Friday at 6:00 am** for 3 days (**Other length**, 3 days): it shows **Paid until tomorrow at 6:00 AM** with the time left, in its own box.

Underground with no GPS signal? The app says the location is not available (or rough, with how rough), and the note and photo of the pillar still find the car.

## Features

- **Help button.** Tap **Help** at the top for a short how-to written for this app, and tap **All apps** to go back to the list.
- **Save the spot your way**: a note (level, row, bay or street), the phone's location with its accuracy, and an optional photo of the sign or pillar (shrunk and kept on the device). Each is optional; the car name is hidden behind **+ Name this car (optional)** and defaults to *My car*, *Car 2* and so on.
- **Paid time**: No time limit, 30 min, 1, 2, 3 or 4 hours, **Other length** (days, hours and minutes, up to 30 days, decimals like 1.5 work) or **Until a time** (a time earlier than now means tomorrow, so past midnight works). The line under the choices says *Paid until ...* before you save. Clear messages for blank, 0, negative, words and over 30 days.
- **Time left in big numbers** with a bar, *Paid until*, *Parked at* and how long ago; seconds in the last 10 minutes; amber **Ending soon** and red **Time is up** boxes; the tab title shows the time left.
- **Warning** 5, 10, 15 or 30 minutes before (or none), remembered for next time: beep, vibration and an optional notification while the page is open.
- **Add reminder to calendar**: a calendar file with an alert before the end and one at the end, so the phone reminds you even when locked.
- **+15 min, +30 min, +1 hour** (added to the end while running, from now after it ran out) with Undo, and **Change** to fix the note, photo, location, name or paid time (*Keep as it is* by default).
- **Walk back in Maps** (walking directions) and **How far is my car?** (distance and compass direction from where you stand, works with no internet).
- **Copy or share** the spot and a map link, to send to whoever is collecting the car.
- **Several cars** (up to 5), each in its own clearly bordered box. **I'm back, clear this spot** with Undo.
- **Keeps the right time** through reloads and closing the page, because it saves the end time, not a countdown. A warning that came while the page was closed beeps when you come back if time is still left; a long-past end does not ring.
- **Private.** Your spot, photo and location stay in this browser on this device; your data is never sent anywhere. The location only goes to your maps app when you press Walk back in Maps. Damaged or blocked saved data is handled with a clear message.
- **Works offline and installable** (the map needs internet).
- **Back to all apps.** A "← All apps" button at the top of the page.
- **Light and dark mode switch.** It follows your device until you choose, and remembers your choice in every app.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `parking-spot-saver-and-meter-timer/index.html` in your browser.

Offline mode, install and location work best with the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` is the logic, with no page code. A spot stores when you parked and the moment the paid time ends, in whole milliseconds, so the time left is always right after a reload. It reads the typed length, works out "until a time" (tomorrow if the time has passed), adds time (to the end, or from now if it ran out), decides when the warning and the end alerts fire (once each), works out the distance and direction with the haversine formula, builds the maps link, the share text and the calendar file (RFC 5545, with alarms), and checks every saved value.
- `script.js` builds the page. Notes and names are added as plain text, never as HTML. The spot is saved in `localStorage` on the device, each photo under its own key. The location comes from the browser's Geolocation API; the beep is made with the Web Audio API (no sound files).
- `sw.js` saves the app on your device for offline use (network first, so updates show at once).
- Run the logic checks with `node tests.js` (or open `test.html`), and the full page test with `node ui-test.js` (needs Playwright). The page test fixes the clock to Sun 25 Oct 2026, 1:40 pm in Karachi and a fake location, and checks the exact answers above. `node shots.js` makes the screenshots.

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
