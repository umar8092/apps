# Emergency Medical Info Lock Screen and Wallet Card

A free **in case of emergency (ICE)** maker. Type a person's **allergies** (with how bad), **medical conditions**, **medicines and doses**, **blood group**, **date of birth** and **who to call**, and get three things: a **lock screen picture** sized exactly for the phone, a printable **folding wallet card** (bank-card size, front and back), and the **text for the phone's own Medical ID**. If you collapse or have an accident, paramedics and strangers cannot unlock your phone, but they can read the lock screen. Cards for every family member, labels in a second language for travel. No sign-up, no ads, private on the device, works offline.

**Live demo:** [umar8092.github.io/apps/emergency-medical-info-lock-screen-and-wallet-card](https://umar8092.github.io/apps/emergency-medical-info-lock-screen-and-wallet-card/)

| Desktop | On a phone |
|---|---|
| ![Emergency Medical Info Lock Screen and Wallet Card on a laptop: Fatima Khan's details on the left, and on the right the lock screen preview with "In case of emergency", her penicillin allergy in red, her diabetes, warfarin and her son's phone number below the clock](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Emergency Medical Info Lock Screen and Wallet Card on a phone: the lock screen preview with Fatima's allergies, conditions, medicines and two people to call, the phone size, Dark or Light, Save the picture, and the front of the wallet card" width="220"> |

## The situation it solves

Fatima Khan is 68 and lives alone. She has type 2 diabetes and atrial fibrillation, takes **warfarin** (a blood thinner, which matters a lot after a fall), and **penicillin could kill her**. If she collapses in a shop, the paramedic finds a locked phone. Her son Bilal sets this up for her on Monday 19 October 2026:

- Full name *Fatima Khan*, born *3 Mar 1958*, blood group *O+*
- Allergies: *Penicillin*, Life-threatening; *Peanuts*, Moderate
- Conditions: *Type 2 diabetes*, *Atrial fibrillation*
- Medicines: *Warfarin (blood thinner)*, 5 mg every evening; *Metformin*, 500 mg twice a day
- Who to call: *Bilal Khan* (Son) +44 7700 900123, *Sara Ahmed* (Neighbour) +44 7700 900456

The lock screen picture (1179 × 2556 for her iPhone) shows, below the clock and above the torch and camera buttons:

> **IN CASE OF EMERGENCY**
> **Fatima Khan** · Born: 3 Mar 1958 (age 68) · Blood group: O+
> ALLERGIES: **Penicillin: life-threatening (anaphylaxis)** (bold red), Peanuts: moderate
> CONDITIONS: Type 2 diabetes, Atrial fibrillation
> MEDICINES: Warfarin (blood thinner), 5 mg every evening; Metformin, 500 mg twice a day
> EMERGENCY CONTACTS: **Bilal Khan (Son): +44 7700 900123**, **Sara Ahmed (Neighbour): +44 7700 900456**
> Updated 19 Oct 2026

The app says **Everything fits on the lock screen.** The wallet card front has her name, age, blood group, allergies and who to call; the back has her conditions, medicines and the date it was updated. The same text is ready to paste into the iPhone Health app's Medical ID.

When a list is too long (say 18 medicines and a note), the text first gets smaller. If it still does not fit, the app leaves off the notes, then the doctor, then the last items of the longest list, adds "+ 3 more not shown", and says exactly what was left off: *Left off the lock screen because it did not fit: Notes; Doctor; Medicines: Medicine 18 ...* The first item of every list, such as the first allergy and the first person to call, is always kept. A phone number never breaks across two lines.

Blank fields are left off. The card never says "Allergies: none" unless you tick **No known allergies**.

## Features

- **Help button.** Tap **Help** at the top for a short how-to written for this app, and **← All apps** to go back to the list.
- **Each allergy, condition, medicine and person to call in its own box**, with **Remove** and **Undo**. Allergies have **How bad?** (life-threatening, severe, moderate, mild); the serious ones are bold red on the picture.
- **What is still worth adding**: a reminder when no one to call has a number, or when allergies are neither listed nor ticked "No known allergies".
- **Lock screen picture** at the exact pixel size of the phone: most iPhones, iPhone Plus and Pro Max, iPhone SE and older, most Android phones, large Android phones, or **Other size** (320 to 5000 pixels). **Dark** or **Light**. A live preview shows where the clock sits.
- **Save the picture**, or **Share or save to Photos** on phones that offer it, with the steps to set it as the lock screen on iPhone and Android.
- **Wallet card**: front and back at 85.6 × 54 mm, 300 dots per inch. **Print the wallet card** (cut, fold on the dashed line) or **Save the card as a picture**.
- **Text for the phone's Medical ID**, with **Copy the text** and **Email the text** (works without typing an address first).
- **Second language for the labels (optional)**: Spanish, French, German, Italian, Portuguese, Turkish, Arabic or Urdu, shown as "Allergies · Alergias".
- **Doctor and other notes (optional)**, behind "+ Add" buttons.
- **Family members**: **+ Add another person**, each with their own card, phone size, look and language.
- **Age from the date of birth**, worked out again every day; the date of the last change is printed on the card.
- **Save a backup file**, **Restore a backup**, **Delete this person's card** and **Delete everything**, both with Undo. Damaged or blocked saved data is handled with a clear message.
- **Private.** The pictures are drawn in your browser and what you type stays on this device; your data is never sent anywhere.
- **Works offline and installable.**
- **Light and dark mode switch** for the app itself. It follows your device until you choose, and remembers your choice in every app.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `emergency-medical-info-lock-screen-and-wallet-card/index.html` in your browser.

Offline mode and install work best with the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` is the logic, with no page code. It turns the details into the lines for each picture (leaving blank fields off), works out the age from the date of birth (a 29 Feb birthday turns a year older on 1 Mar), and fits the text into the box: the biggest size that fits, found by halving, then leaving off the least important lines and listing them. It also writes the Medical ID text, the email link and checks every saved or restored value.
- `script.js` builds the page and draws the pictures on a canvas at the phone's exact size. Names and notes are added as plain text, never as HTML. The cards are saved in `localStorage` on the device.
- `sw.js` saves the app on your device for offline use (network first, so updates show at once).
- Run the logic checks with `node tests.js` (or open `test.html`), and the full page test with `node ui-test.js` (needs Playwright). The page test fixes "today" to 19 Oct 2026 and checks the exact answers above.

Not medical advice: the app shows only what you type.

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
