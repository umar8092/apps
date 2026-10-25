# Pet Care Log and Reminders

A free **pet care log** for cats, dogs, rabbits, birds, fish and other pets. Each pet gets its **own box** with its **own reminders** for **flea treatment, worming, vaccine boosters, heartworm prevention, nail trims** and anything else you add, so you see **what is due today, how many days late, and what comes next**. Tap **Done today** after each dose and the next date counts from that day. Tick off **meals** with **Fed now**, save **weight** with the change since last time, log **vet visits** with what the vet said and the **cost** (this month, this year, per pet), copy a **care sheet** for the pet sitter or a new vet, and put the due dates in your calendar. Works offline, no sign-up, no ads.

**Live demo:** [umar8092.github.io/apps/pet-care-log-and-reminders](https://umar8092.github.io/apps/pet-care-log-and-reminders/)

| Desktop | On a phone |
|---|---|
| ![Pet Care Log on a laptop: Today, 2 things need doing now, Milo: Worming 6 days late, Bruno: Nail trim due today, next Milo flea treatment Thu 29 Oct in 4 days, meals so far today Milo 1 of 2; Milo's box with Fed today at 9:00 am (1 of 2), and care reminders each in their own box with Done today and Edit; on the right vet visits and costs with this month and this year totals per pet](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Pet Care Log on a phone: Today, Milo: Worming 6 days late, Bruno: Nail trim due today, Milo's box with Fed now and his worming, flea and vaccine reminders" width="220"> |

## The situation it solves

Ayesha has a cat, **Milo** (born 20 Aug 2023), and a dog, **Bruno**. She never remembers when Milo was last wormed, whether the flea drops are due, when the yearly vaccine is, or whether anyone fed the cat this morning. On Sunday 25 October 2026 at 9:00 am she adds:

- Milo, Cat, 2 meals a day: **Worming** every 3 months, last done Sun 19 Jul; **Flea treatment** every month, last done Tue 29 Sep; **Vaccine booster** every year, last done Mon 12 Jan
- Bruno, Dog, 2 meals a day: **Nail trim** every 4 weeks, last done Sun 27 Sep; **Flea and tick treatment** every month, last done Sat 10 Oct

The app answers:

- **Today: 2 things need doing now. Milo: Worming, 6 days late. Bruno: Nail trim, due today.**
- **Next: Milo, Flea treatment, Thu 29 Oct (in 4 days).** **Meals so far today: Milo none of 2, Bruno none of 2.**
- Milo's box: **Cat · 3 years 2 months old**; Worming **6 days late (was due Mon 19 Oct)**, Flea treatment **Due Thu 29 Oct (in 4 days)**, Vaccine booster **Due Tue 12 Jan 2027 (in 2 months)**.
- She feeds Milo and taps **Fed now**: **Fed today at 9:00 am (1 of 2)**. A second tap by mistake says **Already fed at 9:00 am, just now: tap Undo if this was a mistake.**
- She wormed Milo today and taps **Done today**: **Milo: Worming done. Next: Mon 25 Jan 2027 (in 3 months).**
- Weight 4.3 kg on 12 Aug and 4.6 kg today: **Weight: 4.6 kg on Sun 25 Oct (up 0.3 kg since Wed 12 Aug)** (or 10.1 lb, up 0.66 lb).
- Vet visits: Milo's vaccines and check-up on 12 Oct (3,500) and a dental check today (1,500), Bruno's ear infection on 3 Oct (9,000): **This month: 14,000 · This year: 14,000. This year per pet: Milo 5,000, Bruno 9,000.**

**Copy care sheet** gives the pet sitter everything in one message:

```
Milo (Cat)
Born Sun 20 Aug 2023, 3 years 2 months old
Meals: 2 meals a day
Weight: 4.6 kg on Sun 25 Oct (up 0.3 kg since Wed 12 Aug)
Notes: Indoor cat. Whiskas dry food, no milk.

Care:
- Worming: 6 days late (was due Mon 19 Oct), every 3 months, last done Sun 19 Jul 2026
- Flea treatment: Due Thu 29 Oct (in 4 days), every month, last done Tue 29 Sep 2026
- Vaccine booster: Due Tue 12 Jan 2027 (in 2 months), every year, last done Mon 12 Jan 2026

Vet visits:
- Sun 25 Oct 2026: Dental check, 1,500
- Mon 12 Oct 2026: Vaccines and check-up, 3,500
```

How the dates are counted: the next date is the last time done plus the reminder's time. Weeks are 7 days and months are calendar months (19 Jul + 3 months = 19 Oct; 31 Jan + 1 month = 28 Feb, or 29 Feb in a leap year). Doing it early or late always counts from the day you tap **Done today**. "Not sure" when it was last done shows it as due now. Meals count from midnight, so a meal at 11:50 pm belongs to that day.

## Features

- **Help button.** Tap **Help** at the top for a short how-to written for this app, and tap **All apps** to go back to the list.
- **Today** at the top: everything due or late for all pets with how many days late, the next thing coming, and which pets still need a meal.
- **Each pet in its own bordered box**, with its kind and age, notes, meals, its own care reminders (each in its own box, most urgent first), weight with a small chart, and its last vet visit.
- **Usual care for each kind of pet** in one tap: flea treatment, worming and vaccine booster for cats; flea and tick, worming, vaccine, rabies, heartworm, nail trim and grooming for dogs; vaccines and hutch cleaning for rabbits; cage cleaning for small pets and birds; water changes for fish. Or type your own.
- **How often:** any number of **days, weeks, months or years** (up to 730 days, 104 weeks, 36 months or 5 years), or **just once** for a vet appointment on a set date. **Last done** with Today, Yesterday, A week ago, A month ago or **Not sure**. A preview shows the next date before you save.
- **Done today**, **Edit** (any date, for a dose given another day), **Delete** with Undo. A done appointment offers **Save it as a vet visit**.
- **Meals (optional):** choose 1 to 6 meals a day and tap **Fed now**; the times are shown, a double tap is flagged, and Undo removes a wrong tap.
- **Weight** in **kg or lb**, with the change since last time and a chart; old weights listed with **Remove** and Undo.
- **Vet visits and costs:** pet, date, what it was for, and optional cost and what the vet said; totals this month, this year and per pet. Optional **currency symbol** (none, $, €, £, ₹, Rs, AED and more), remembered.
- **Copy care sheet** and **Email care sheet** for a pet sitter or a new vet (email works without typing an address); **Copy all care sheets** for every pet.
- **Add the due dates to my calendar:** a calendar file with a 9:00 reminder on each due date, repeating at each reminder's own time.
- **Archive** a pet that was rehomed or passed away (records kept, no reminders, **Bring back** any time), or delete a pet and its records with Undo.
- **Save a backup file**, **Restore a backup**, **Delete everything** with Undo. Damaged or blocked saved data is handled with a clear message.
- **Private.** Everything stays in this browser on this device; your data is never sent anywhere.
- **Works offline and installable.** The dates and meals update by themselves at midnight.
- **Back to all apps.** A "← All apps" button at the top of the page.
- **Light and dark mode switch.** It follows your device until you choose, and remembers your choice in every app.

The suggested times are the usual numbers for adult pets, not veterinary advice: follow your vet and the packet, and change the number to match.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `pet-care-log-and-reminders/index.html` in your browser.

Offline mode and install work best with the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` is the logic, with no page code. Dates are calendar dates (`2026-10-25`), so time zones and summer time never move a date. Money is kept in whole cents and weight in whole grams, so totals are exact. It works out each reminder's next date, the Today list, ages, meals per day, weight changes, cost totals, the care sheets and the calendar file, reads every form with plain error messages, and checks every saved or restored value.
- `script.js` builds the page. Names and notes are added as plain text, never as HTML. Everything is saved in `localStorage` on the device.
- `sw.js` saves the app on your device for offline use (network first, so updates show at once).
- Run the logic checks with `node tests.js` (or open `test.html`), and the full page test with `node ui-test.js` (needs Playwright). The page test fixes the time to Sun 25 Oct 2026, 9:00 am, and checks the exact answers above.

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
