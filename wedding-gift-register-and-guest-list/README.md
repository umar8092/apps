# Wedding Gift Register and Guest List

A free **register for the cash envelopes and gifts (salami, neota, shagun, lifafa) that families give at your wedding, aqiqah, walima or other event, and for what you give at theirs**. Type each envelope as you open it: the family, the event and the amount (or a gift in kind such as a gold ring). Each of your events shows its total, such as **"Received 3,45,000 from 112 families"**, and each family gets its own box that answers the question you have years later when they invite you: **"Gave you: 5,000 at Sara's wedding. You gave them: 3,000 at Bilal's wedding. They have given you 2,000 more than you gave them."** A **guest list** for each event keeps the number of people per family and who has replied, so you know how many to plan food for. No sign-up, no ads, private on your device, works offline.

**Live demo:** [umar8092.github.io/apps/wedding-gift-register-and-guest-list](https://umar8092.github.io/apps/wedding-gift-register-and-guest-list/)

| Desktop | On a phone |
|---|---|
| ![Wedding Gift Register on a laptop: Sara's wedding received Rs 43,500 from 5 families and 2 gifts in kind, Omar's aqiqah Rs 4,000 from 2 families; the add form on the left already shows that Ahmed Khan (Lahore) gave Rs 5,000 at Sara's wedding and was given Rs 3,000 at Bilal's wedding; each family's box on the right](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Wedding Gift Register on a phone: typing Ahmed Khan (Lahore) in the Add a gift form shows what they gave you, what you gave them and that they have given Rs 2,000 more" width="220"> |

## The situation it solves

Sara's family hosts her wedding in March. After the last guest leaves, there is a bag of about 100 envelopes, plus a gold ring and some suits. In the past the names and amounts went into a notebook that was lost by the time the next family wedding came round, and nobody could remember what the Khans had given, or what was given at their son's wedding.

With the app, Sara's mother chooses **They gave us**, types the event once (**Sara's wedding**) and sets its date, then for each envelope types a name and an amount and presses Enter. The event and date stay filled in for the next one. The page then answers:

- **Sara's wedding: Received Rs 43,500 from 5 families · 2 gifts in kind** (gold ring, two suits). Omar's aqiqah last year: **Rs 4,000 from 2 families**.
- **Ahmed Khan (Lahore), cousin: Gave you Rs 5,000 at Sara's wedding, 12 Mar 2026. You gave them Rs 3,000 at Bilal's wedding, 5 Nov 2022. They have given you Rs 2,000 more than you gave them.**
- **Ahmed Khan (Karachi)**, a different family with the same name, is kept apart by the city: Rs 2,000 and a gold ring.
- **Shah family: gave you Rs 25,000; you gave them Rs 20,000 at their son's walima.** Nadia and Usman: gave you Rs 10,000; you gave them Rs 5,000 at their housewarming.

When an invitation card arrives, typing the family's name (in the form or in **Find a family, city or event**) shows the answer straight away. For the next event, the **Guest list** page says: *Invited 6 families (28 people). Coming: 15 people. No reply yet from 2 families (11 people), so plan for 15 to 26 people.*

Worked examples from the tests (all checked by hand):

- 5,000 received, 3,000 given: **they have given you 2,000 more**. 2,500 received in two gifts and 3,500 given: **you have given them 1,000 more**. Equal: **Even: you have each given 2,500.**
- A gift of only two suits: listed with the family, **not added to the cash totals** ("Gifts in kind only, no cash").
- Sara's wedding with 5,000 + 2,000 and a gold ring + two suits + 1,500: **Received 8,500 from 3 families · 2 gifts in kind**.
- Guest list of 4 (Coming), 3 (No reply), 2 (Not coming), 5 (Coming): **Coming 9 people, plan for 9 to 12 people**.
- Amounts can be typed as `5000`, `5,000`, `1,00,000`, `Rs 1500` or `12.50`; rupee amounts are shown the local way (3,45,000). A minus sign, `0`, words or more than two decimals get a clear message.

## Features

- **Help button** at the top with a how-to for this app, **All apps** to go back to the list, and a **Light / Dark** switch.
- **Fast entry for a pile of envelopes:** after each Save the event and date stay filled in and the cursor goes back to the name; Enter saves.
- **They gave us / We gave them**, each with its own event name and date, so both sides of the record are kept.
- **Your events** at the top: the cash received at each event, from how many families, and the gifts in kind. **Copy list** copies who gave what at that event; **Rename or delete** with Undo.
- **Each family in its own box:** what they gave you, what you gave them (with event and date), and who has given more. **Add for** (with the family's name), **History** with **Edit** and **Delete**, **Edit family** and **Delete family**, all with Undo.
- **Same name, different family:** **+ Add relation and city (optional)** keeps "Ahmed Khan (Lahore)" and "Ahmed Khan (Karachi)" apart; a name that matches two families asks which one.
- **A second envelope from the same family** at the same event is pointed out before saving, so a double entry is caught.
- **Gifts in kind** (gold, clothes) with or without cash; an optional **note** ("sent with his brother").
- **Find a family, city or event** as you type and **Sort** by name, by who gave most, or by latest gift. Long registers (500 families tested) show 50 at a time with **Show more**.
- **Guest list** per event: number of people per family with − and +, **No reply yet / Coming / Not coming**, totals and how many to plan for, a mark on families who gave a gift at that event, **Add every family in the register**, **Copy** and **Print** for the caterer.
- **Copy the register**, **Email the register** (no address needed), **Print or save as PDF**.
- **Currency symbol** (none, Rs, ₹, $, € and more), remembered. **Backup file** and **Restore** (checked, with Undo), **Delete everything** with Undo.
- Private: no account and your data is never sent anywhere. Works offline once loaded, and can be installed on the home screen.

## Run it yourself

```
git clone https://github.com/umar8092/apps.git
```

Then open `wedding-gift-register-and-guest-list/index.html` in a browser. No build step and no dependencies.

Tests: `node wedding-gift-register-and-guest-list/tests.js` checks the maths and the wording (or open `test.html`), and `node wedding-gift-register-and-guest-list/ui-test.js` drives the page in headless Chromium at 11 screen widths (needs Playwright).

## How it works

Plain HTML, CSS and JavaScript. The maths and the words live in `core.js`: every amount is a whole number of cents (paisa), so totals are exact; each family's difference is the cash they gave you minus the cash you gave them, and gifts in kind are listed but never added. A family is told apart by name and city. Your own events have an id, so renaming one updates every gift; their events are kept as the name you typed. Everything is saved in this browser's `localStorage` and checked when loaded or restored; a network-first service worker keeps the app working offline.

## License

MIT, see [LICENSE](LICENSE).
