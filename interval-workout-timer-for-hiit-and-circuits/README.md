# Interval Workout Timer for HIIT and Circuits

Free **interval timer for home workouts, HIIT, Tabata, circuits, EMOM and stretching**. Set the work and rest times, rounds, sets, warm-up and cool-down, and name each move (with its own time if you like). Before you start you see the **total time and when you will finish**; then one big countdown, coloured by what to do (work, rest, rest between sets), tells you the move, the time left and what comes next, with a beep when each step starts and a 3-2-1 count before it ends. Pause, skip, back, saved workouts and a log of the workouts you did. It keeps time when the phone locks or the page reloads, works offline, no sign-up, no ads.

**Live demo:** [umar8092.github.io/apps/interval-workout-timer-for-hiit-and-circuits](https://umar8092.github.io/apps/interval-workout-timer-for-hiit-and-circuits/)

| Desktop | On a phone |
|---|---|
| ![Interval Workout Timer on a laptop: Pick a workout with Tabata, 30/30, Circuit, EMOM 10 and Stretching, My workouts with Evening circuit 18:00 and Tabata 3:50; on the right Start shows Evening circuit, Total 18:00, Ends at 7:18 PM if you start now, Warm-up 3:00, 3 sets of 4 rounds: 0:40 work, 0:20 rest, 1:00 rest between sets, Cool-down 2:00, and a Start workout button](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Interval Workout Timer on a phone during a workout: green WORK badge, Round 3 of 4, Set 1 of 3, Lunges, 0:30 left, Next: Rest 0:20, Back, Pause and Skip buttons, 12:50 left of 18:00, ends at 7:18 PM, and a Coming up list" width="220"> |

## The situation it solves

Sana works out at home three evenings a week without a coach. Her routine: a 3-minute warm-up, then **Squats, Push-ups, Lunges and Plank**, 40 seconds each with 20 seconds rest, three times through with a minute's rest between the sets, and a 2-minute cool-down. Watching the phone's stopwatch and counting rounds in her head, she loses track by the second set.

She taps **Circuit** (it is exactly this), names it **Evening circuit** and presses **Save to My workouts**. At **7:00 pm** the Start card shows:

- **Total 18:00. Ends at 7:18 PM if you start now.** (3:00 warm-up + 3 sets of 4 × 0:40 work and 3 × 0:20 rest = 3 × 3:40 + 2 × 1:00 between sets + 2:00 cool-down = 18:00. The rest after the last round of each set is left out, because the set rest or the cool-down follows.)

She presses **Start workout** and puts the phone on the floor. At **7:05:10** the screen is green and shows **WORK · Round 3 of 4 · Set 1 of 3 · Lunges · 0:30**, *Next: Rest 0:20*, and *12:50 left of 18:00 · ends at 7:18 PM* (the phone screenshot). Three short beeps count down the last 3 seconds of each step and a double beep starts each work period, so she never has to look.

The doorbell rings: **Pause** freezes everything (the finish time moves on by the pause). Plank is too hard today: **Skip** jumps to the next step; **Back** starts the step again. At 7:18 the screen says **Workout done! 18:00**, and *Workouts done* shows *This week: 4 workouts, 43 min 40 s · 2 days in a row*.

Other answers it gives:

- **Tabata** (20 s on, 10 s off, 8 rounds) is **3:50**: 8 × 20 s + 7 × 10 s.
- **EMOM 10**: 10 one-minute steps back to back, a beep at the start of each minute, **10:00**.
- 1:30 work, no rest, 4 rounds, 3 sets with the Circuit's warm-up, set rests and cool-down: **25:00**.
- A workout over 3 hours is refused with a clear message.

## Features

- **Help button.** Tap **Help** at the top for a short how-to written for this app, and tap **All apps** to go back to the list.
- **Ready-made workouts**: Tabata, 30 / 30, Circuit (4 moves, 3 sets), EMOM 10 and Stretching (6 named stretches), each with its total. Loading one can be undone.
- **Your own workout**: Work, Rest after each round, Rounds, Sets (with Rest between sets, shown only when there is more than one set), Warm-up and Cool-down. Type seconds (40), minutes:seconds (1:30), "2 min" or use − and +. Clear messages for blank, 0, negative, words, decimals in rounds, more than 60 minutes a step, 100 rounds, 20 sets or 3 hours in total; the total keeps showing the last correct workout meanwhile.
- **Named moves**, each in its own box, optional, hidden behind **+ Add move names (optional)**. Each round does the next move and they repeat; a move can have **its own time** (Plank 1:00 while the rest are 0:40). **Paste a list** (one per line, "Plank 1:00" gives its own time, numbering and bullets are removed). If there are more moves than rounds it says so and offers **Make it 7 rounds**. Remove one or all, with Undo.
- **Before you start**: the total, the clock time you will finish, a one-line summary, and **See every step** with the time each one starts.
- **During the workout**: a big countdown with the step's colour (amber warm-up, green work, blue rest, purple rest between sets, teal cool-down), the move name, Round and Set, **Next**, a **Coming up** list, the time left in the whole workout and when it ends. **Pause / Resume**, **Skip**, **Back** (restarts the step, or goes to the step before in its first 3 seconds), and keyboard keys: Space, right and left arrows. **End workout** asks first. The tab title shows the time and the move.
- **Sound and screen**: a beep when each step starts (two short for work, one long for rest), a 3, 2, 1 count before each step ends, the move said out loud (optional), vibration, and keeping the screen on. **Test the sound** plays them.
- **Keeps the right time** through reloads, app switching and a locked phone: it works from the clock, not a countdown. A workout that finished while the page was closed is shown as done.
- **My workouts**: save, update (same name), load and delete with Undo.
- **Workouts done**: each finished workout (or one ended after at least a minute) with date, time and length; this week's and the last 30 days' count and time, days in a row; remove with Undo; **Copy the list**.
- **Private.** Everything stays in this browser on this device; your data is never sent anywhere. Damaged or blocked saved data is handled with a clear message.
- **Works offline and installable.**
- **Back to all apps.** A "← All apps" button at the top of the page.
- **Light and dark mode switch.** It follows your device until you choose, and remembers your choice in every app.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `interval-workout-timer-for-hiit-and-circuits/index.html` in your browser.

Offline mode and install work best with the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` is the logic, with no page code. Every length is whole seconds. It reads what you type, builds the list of steps (leaving out 0-second steps and the rest after the last round of a set), and stores a running workout as the moment it started (moved on by pauses, skips and backs), so the current step is always worked out from the clock. It also counts the week, the last 30 days and the days in a row, and checks every saved value.
- `script.js` builds the page. Names are added as plain text, never as HTML. Everything is saved in `localStorage` on the device. The beeps are made with the Web Audio API (no sound files) and planned on the audio clock for the next 10 minutes, so they stay on time even when the browser slows the page; pausing or skipping re-plans them. Speech uses the browser's own voice, and the Screen Wake Lock API keeps the screen on.
- `sw.js` saves the app on your device for offline use (network first, so updates show at once).
- Run the logic checks with `node tests.js` (or open `test.html`), and the full page test with `node ui-test.js` (needs Playwright; add the live address to test the live site). The page test fixes the clock to Sun 18 Oct 2026, 7:00 pm and checks the exact answers above. `node shots.js` makes the screenshots.

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
