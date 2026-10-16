# Spaced Repetition Flashcards for Exams

Free **spaced repetition flashcards** for anyone with an exam coming or a language to learn. Type your cards, or **paste your notes** one card per line ("der Hund - the dog", or two columns copied from a spreadsheet). Each day the app shows **only the cards due today**: you think of the answer, tap **Show answer**, then tap **Again, Hard, Good or Easy**, and the card comes back **just before you would forget it**. Add your **exam date** and no card is put off past the day before; the app also tells you whether all your new cards will be started in time, and **how many a day you need** if not. Several decks, each with its own settings. No account, no ads. Your cards stay on your device, and the app works offline.

**Live demo:** [umar8092.github.io/apps/spaced-repetition-flashcards-for-exams](https://umar8092.github.io/apps/spaced-repetition-flashcards-for-exams/)

| Desktop | On a phone |
|---|---|
| ![Spaced Repetition Flashcards for Exams on a laptop: on the left "26 cards to study today, 11 to review, 15 new", studied 5 days in a row, and a study card from the Pharmacology exam deck showing Atorvastatin with the answer "Statin: lowers cholesterol" and the Again, Hard, Good and Easy buttons; below, the deck boxes with "Exam Fri 23 Oct 2026: in 7 days"; on the right the open Pharmacology deck with Add cards and the list of cards](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Spaced Repetition Flashcards for Exams on a phone: 26 cards to study today, then the study card Atorvastatin with the answer Statin: lowers cholesterol, the four answer buttons with when each brings the card back, and the deck boxes below" width="220"> |

## The situation it solves

Sara is a nursing student. Her pharmacology exam is on **Friday 23 October 2026** and she has to know 60 drugs and what each one is for. She is also learning German for a job. Quizlet wants a subscription for its Learn mode and Anki looked complicated, so she types her lecture notes as lines like `Atorvastatin - Statin: lowers cholesterol` and pastes them into **Paste many cards at once**. The app says **Found 60 cards** and shows the first three so she can see it read them right.

On **Friday 16 October** (she has studied 20 of the drugs already, at 5 new cards a day, and 30 German words) the app says:

- **26 cards to study today. 11 to review, 15 new. About 4 min.** (27 before her first answer: 8 drug cards due again plus 5 new, and 4 German words due plus 10 new.)
- **Studied 5 days in a row.**
- Deck boxes: **Pharmacology exam, 13 cards to study today, 60 cards: 40 new, 16 learning, 4 known, Exam Fri 23 Oct 2026: in 7 days**, and **German A1 words, 14 cards to study today**.
- In the Pharmacology deck's settings: **At 5 a day, 40 new cards will not all be started before the exam. You need 6 a day.** Today 5 and then 5 a day for 7 more days only reaches the 40th card on the exam day itself. 40 cards over the 7 days left is 5.7, so **6 a day**. She taps **Use 6 new cards a day** and it now says **40 new cards at 6 a day: all started by Thu 22 Oct 2026, before the exam** (6 today, then 34 / 6 = 5.7, so 6 more days).

While she studies, the small text under each button says when the card comes back:

| The card | Again | Hard | Good | Easy |
|---|---|---|---|---|
| A new card | again soon | later today | 1 day | 4 days |
| Last seen 3 days ago (no exam) | again soon | 4 days | 8 days | 10 days |
| Last seen 10 days ago (no exam) | again soon | 12 days | 25 days | 33 days |
| Atorvastatin, last seen 8 days ago, exam in 7 days | again soon | 6 days | 6 days | 6 days |

With the exam a week away, the app says **"Your exam is Fri 23 Oct, so this card comes back by Thu 22 Oct at the latest."** Without an exam, Good multiplies the gap by 2.5 (3 days becomes 7.5, rounded to 8), Hard by 1.2 and Easy by 3.25. Hard makes the card come a little sooner from then on, Easy a little later. **Again** puts the card back 3 cards later in today's session and it starts over from 1 day.

Then life happens:

- **She finishes everything** (she pressed Again once, so that card came back a few cards later): **Done for today. You answered 28 cards. Next: 23 cards tomorrow, plus new cards.** Tomorrow's 23 are the 7 that were already due then plus today's 15 new cards and the forgotten one, each back after 1 day. Wants more? **Learn 10 more new cards today.**
- **She is tired after 10 cards**: **Stop for now**. Her 10 answers are saved; the rest stay due.
- **She tapped Easy by mistake**: **Undo answer** brings the card back.
- **A typo in a card**: **Edit card** during study, or **Edit** in the deck's card list. Progress is kept.
- **She misses three days**: nothing is lost. The missed cards are still due, the most overdue first.
- **She studies at 1 am**: a study day starts at 4 am, so it counts for the evening before and the cards due "tomorrow" are not shown early.
- **German**: she ticks **Also ask back to front** so she is also asked "the dog" and has to say "der Hund". Only one side of a card is asked per session.
- **A classmate wants her cards**: **Copy cards**, **Email cards** (opens her mail app with the cards, no address needed), **Save as CSV** or **Print cards**.
- **After the exam**: the deck box says **Exam was on Fri 23 Oct 2026**. She removes the date and keeps reviewing, or taps **Start this deck over** or **Delete this deck** (both with Undo).

Other cases it handles: lines with no separator, a missing front or back, cards already in the deck (also in a different case) and lines over 1000 characters are skipped and listed with their line numbers; the separator can be chosen (tab, dash, =, ;, :, comma) when the automatic choice is wrong, and quoted CSV lines with commas inside work; a hyphen inside a word ("well-known") is not taken as a separator; a card with the same front but a different answer is added with a note; very long cards get smaller, left-aligned text; New cards a day from None (only review) to 999, with presets and Custom; an exam date in the past or more than 10 years ahead is refused; a deck name that is blank or already used is refused; up to 100 decks and 5000 cards; a new day while the page stays open; a bad or empty backup file (refused, nothing changed); corrupt saved data (starts fresh and keeps a copy); blocked or full storage (works and says it is not saving).

## Features

- **Help button.** Tap **Help** at the top for a short how-to, and **All apps** to go back to the list of apps. **Light mode / Dark mode** switch.
- **Today**: how many cards to study, how many to review and how many new, and your days in a row.
- **Study** one deck or all of them: **Show answer** (Space), **Again / Hard / Good / Easy** (1 2 3 4) with when the card comes back, **Undo answer**, **Edit card**, **Stop for now**, a progress bar, and **Learn 10 more new cards today** at the end.
- **Decks**, each in its own box with cards due, new, learning and known, and the exam countdown.
- **Add cards** one by one or **Paste many cards at once** (or open a .txt or .csv file) with a preview of what will be added and what is skipped.
- **Cards in this deck** with search, when each card is due, how often it was forgotten, Edit and Delete with Undo.
- **Deck settings**: name, **New cards a day** (presets and Custom), **exam date** with "you need N a day", **Also ask back to front**, **Copy cards**, **Email cards**, **Save as CSV**, **Print cards**, **Start this deck over**, **Delete this deck**.
- **Save backup file** and **Load backup file** to keep a copy or move to another phone or computer. **Delete everything** with Undo. **Try an example deck** to look around.
- **Private, works offline and installable.** Phone and desktop layouts. Works with a keyboard and a screen reader.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `spaced-repetition-flashcards-for-exams/index.html` in your browser. Offline mode and install need the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` is the scheduling and text maths, with no page code. It is a simple version of SM-2 (the method Anki started from), in whole days: each card has a gap in days and an ease (2.5 to start, between 1.3 and 4.0). A new or forgotten card goes to 1 day on Good and 4 on Easy; after that Hard is the gap x 1.2, Good the gap x ease and Easy the gap x ease x 1.3, always at least one day more than the button before. With an exam date the gap is cut so the card comes back by the day before the exam (never sooner than tomorrow). The study queue is the cards due, most overdue first, then today's new cards in the order they were added. The paste reader splits each line at the first tab, " - ", " = ", ";", ":" or ",".
- `script.js` builds the page. Everything you type is added as plain text, never as HTML. Your cards are saved in this browser's storage under `spaced-repetition-flashcards-for-exams.state`, and every saved or loaded value is checked before it is used.
- `sw.js` saves the app for offline use (network first, so updates always arrive).
- Checks: `node tests.js` for the maths (also `test.html` in a browser), `node ui-test.js` drives the real page in headless Chromium with the clock fixed at 16 October 2026 (add `--base https://umar8092.github.io/apps` to test the live site). `node shots.js` redoes the screenshots from `fixtures.js`.

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
