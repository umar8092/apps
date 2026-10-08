# Heartbeat Sound

A free, calming **heartbeat sound** you can loop all night, for sleep, newborns, puppies, focus and relaxation. No ads, no sign-up, no tracking. Everything runs in your browser.

**Live demo:** [umar8092.github.io/apps/sleepbeat](https://umar8092.github.io/apps/sleepbeat/)

| Desktop | Phone |
|---|---|
| ![Heartbeat Sound playing a heartbeat at 70 BPM with heart rate presets, volume and sleep timer](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Heartbeat Sound on a phone" width="220"> |

## What you can do

- **Play a soft "lub-dub" heartbeat** made in the browser with the Web Audio API. No audio files.
- **Loop it all night.** It plays until you pause it.
- **Set the heart rate from 40 to 200 BPM**, with presets: Resting 60, Calm 70, Puppy 100, Newborn 120 and Excited 183. Change it while it plays.
- **Set a sleep timer** (15 min, 30 min, 60 min or 8 hours) that fades the sound out gently.
- **Control the volume.**
- **Watch a heart pulse in time** with each beat.
- **Keeps playing when your phone screen locks.** The sound is played by a normal audio player, so you can lock the phone or turn the screen off and it carries on. The lock screen shows the controls (play, pause) and the heart rate.
- **Optional: keep the screen on** while playing, if you want the beating heart in view.
- **Play and pause with the spacebar.**
- **Help button.** Tap **Help** at the top for a short how-to, and **All apps** to go back to the list.
- It remembers your heart rate and volume.

## Good for

Sleep, settling a newborn, comforting a new puppy or kitten, studying, meditation, and as a free looping sound effect for videos, games and podcasts.

## Tips

- Phone and laptop speakers are weak at deep bass. The sound is tuned to work on small speakers, but headphones or a speaker with some bass will sound fuller.
- You can lock the phone: it keeps playing with the screen off. Leave the phone plugged in overnight so the battery lasts.
- On an iPhone, use the side volume buttons to set how loud it is. The volume slider in the app also works, but it takes a moment to apply, and the sleep timer stops the sound at the end instead of fading it.
- For a baby or a pet, keep the volume low and the speaker a few feet away, never inside a crib or bed.
- A heartbeat sound is a comfort aid, not a medical device or a treatment for sleep problems.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `sleepbeat/index.html` in your browser.

## How it works

`beat.js` builds each thump from two sine waves plus a short burst of filtered noise, softened by a low-pass filter. The "dub" follows the "lub" after a gap that shrinks as the heart rate rises. `script.js` schedules beats a fraction of a second ahead of the audio clock, so the rhythm stays steady and heart-rate changes take effect on the very next beat. A quick second tap on the play button is ignored, so a double tap can never start a second loop on top of the first.

`loop.js` renders that sound once into a seamless loop of whole beats (about 30 seconds, whole beats so it joins on the beat) and plays it with a normal audio player. That is what lets it keep playing when the screen locks. When you change the heart rate a new loop is built in a fraction of a second and swapped in.

To check the sound without speakers, open `test.html` in a browser. It renders the heartbeat offline and verifies that each beat has two thumps, the timing is right at several heart rates, nothing clips, and most of the energy is in the low frequencies.

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
