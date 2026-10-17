# Multiple Kitchen Timers for Cooking

Free **kitchen timers for cooking several dishes at once**. A phone's own timer, or a single online timer, runs only one countdown, but dinner has rice, pasta, garlic bread and something in the oven. Give each dish its own named timer, see them sorted so the one that ends first is on top, and when one is done the alarm sounds, its box turns red and the tab title says **Garlic bread done!**, so you never wonder which pot it was. Pause, +1 min, restart, change, and saved timers for the things you cook often. It keeps time through reloads, keeps the screen on, works offline, no sign-up, no ads.

**Live demo:** [umar8092.github.io/apps/multiple-kitchen-timers-for-cooking](https://umar8092.github.io/apps/multiple-kitchen-timers-for-cooking/)

| Desktop | On a phone |
|---|---|
| ![Multiple Kitchen Timers on a laptop: Add a timer with quick lengths and Saved timers on the left; on the right Garlic bread is done at 6:36 PM with a red box and a Stop alarm button, Pasta has 2:40 left and ends at 6:41 PM, Rice has 6:40 left and ends at 6:45 PM](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Multiple Kitchen Timers on a phone: Garlic bread is done (red box with Stop alarm), then Pasta 2:40, Rice 6:40 and Roast chicken 51:40, each in its own box with Pause, +1 min and Restart" width="220"> |

## The situation it solves

Amir is cooking dinner on Saturday 17 October. The roast chicken went in the oven at **6:10 pm** for 1 h 20 min (he taps the saved **Roast chicken 1:20:00**). At **6:30 pm** he types **Rice** and taps **15 min**, then **Garlic bread** with 6 minutes 30 seconds typed in, and at **6:31 pm** he taps **Pasta** (10 min) under Saved timers.

The app shows, earliest first:

- **Garlic bread**: ends at **6:36 pm**
- **Pasta**: ends at **6:41 pm**
- **Rice**: ends at **6:45 pm**
- **Roast chicken**: ends at **7:30 pm**

and the line at the top says *4 running. Next: Garlic bread in 6:30.*

At **6:36 pm** the alarm rings, the Garlic bread box turns red and jumps to the top with **Done at 6:36 PM. Press Stop alarm.**, and the tab title flashes **⏰ Garlic bread done!**. At 6:38 pm (the screenshot) Pasta has **2:40** left and Rice **6:40**. He presses **Stop alarm**; the garlic bread box moves to the bottom with *Done 2 min ago*.

The pasta needs a little longer: when it rings at 6:41 he presses **+1 min** and it runs one more minute. The doorbell rings, so he presses **Pause** on the rice with 3:28 left; it stays at 3:28 until he presses **Resume**. If he reloads the page or the phone switches apps, each timer still shows the right time, because it saves the moment it ends, not a countdown.

## Features

- **Help button.** Tap **Help** at the top for a short how-to written for this app, and tap **All apps** to go back to the list.
- **Several timers at once** (up to 20), each in its own clearly bordered box with its name, a big countdown, a bar, the clock time it ends ("Ends at 6:45 PM", "Ends tomorrow at 12:20 AM" after midnight) and a state badge (Running, Paused, Done!).
- **Name is optional**: leave it empty and timers are called Timer 1, Timer 2 and so on. Pasted names are tidied and cut to 60 characters.
- **Lengths**: quick taps for 1, 3, 5, 10, 15, 20, 30 and 45 minutes and 1 hour, or type hours, minutes and seconds (90 minutes, 1.5 or 1,5 all work) from 1 second to 24 hours. The line under the boxes says when it will ring before you start. Clear messages for blank, 0, negative, words and over 24 hours.
- **Sorted by what ends first.** A ringing timer goes to the top, finished ones to the bottom.
- **Pause / Resume, +1 min, Restart** (the button shows the full length, for example **Restart 6:30**), **Change** (rename or set a new time left; Escape cancels), **Save** to Saved timers and **Remove**, with Undo. **Remove finished timers** and **Remove all timers**, both with Undo.
- **When a timer is done**: loud beeps or a bell for 1 minute, then a short beep every 15 seconds until **Stop alarm** (10 minutes at most); the phone vibrates; the tab title flashes the dish's name; screen readers hear "Garlic bread is done." **Stop all alarms** appears when two or more ring together. An optional notification shows when the page is in the background on a computer.
- **Saved timers**: tap one to start it straight away (Undo if you tapped by mistake). Starts with Soft-boiled egg 6:00, Hard-boiled egg 10:00, Pasta 10:00, White rice 15:00 and Tea 3:00; remove them with × (Undo) and save your own with **Also keep it in Saved timers** or a timer's **Save** button. The same name and length is never saved twice.
- **Keeps the right time** through reloads and app switching: a timer that finished while the page was closed shows "Done 14 min ago", and rings when you come back if it finished in the last 10 minutes.
- **Keeps the screen on** while timers run (a locked phone cannot play sound), with a switch to turn it off. If the browser blocks sound after a reload, a **Turn sound on** button appears.
- **Private.** Your timers stay in this browser on this device; your data is never sent anywhere. Damaged or blocked saved data is handled with a clear message.
- **Works offline and installable.**
- **Back to all apps.** A "← All apps" button at the top of the page.
- **Light and dark mode switch.** It follows your device until you choose, and remembers your choice in every app.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `multiple-kitchen-timers-for-cooking/index.html` in your browser.

Offline mode and install work best with the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` is the logic, with no page code. A running timer stores the moment it ends, a paused one the time left, a finished one the moment it ended, all in whole milliseconds. It reads the typed length, shows times (rounded up, so it never shows 0:00 while still running), sorts the timers, handles pause, +1 min, restart and change, stops an alarm by itself after 10 minutes, and checks every saved value.
- `script.js` builds the page. Names are added as plain text, never as HTML. Everything is saved in `localStorage` on the device. The alarm sounds are made with the Web Audio API (no sound files) and planned on the audio clock at each timer's end time, so they ring on time even when the browser slows down a background tab; pausing, changing or removing a timer cancels its alarm. The Screen Wake Lock API keeps the screen on.
- `sw.js` saves the app on your device for offline use (network first, so updates show at once).
- Run the logic checks with `node tests.js` (or open `test.html`), and the full page test with `node ui-test.js` (needs Playwright). The page test fixes the clock to Sat 17 Oct 2026, 6:30 pm and checks the exact answers above. `node shots.js` makes the screenshots.

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
