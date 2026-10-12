# Invoice Generator for Freelancers

A free **invoice generator** for freelancers and small businesses who need to send a clean invoice now. Fill in **your details**, **the client**, and **what you are charging for** (jobs, hours or products), add an optional **discount**, **tax, VAT or GST** (added on top or already included in your prices) and a **deposit already paid**, and the app shows the **amount due and the due date** with a live preview of the invoice. **Print it or save it as a PDF**, email it or copy it as text. Invoice numbers count up by themselves, clients are remembered, and **My invoices** shows which are paid, due soon or overdue. No sign-up, no watermark, no ads. Private on your device and works offline.

**Live demo:** [umar8092.github.io/apps/invoice-generator-for-freelancers](https://umar8092.github.io/apps/invoice-generator-for-freelancers/)

| Desktop | On a phone |
|---|---|
| ![Invoice Generator for Freelancers on a laptop: the form on the left (Sara Khan Design billing Blue Bird Cafe) and on the right "Amount due: $647.70, due by 12 Nov 2026" above a preview of the invoice with three items, a 10% discount, 8% sales tax and a $300 deposit](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Invoice Generator for Freelancers on a phone: Amount due $647.70, the invoice preview with each item on its own line, and the Print or save as PDF button" width="220"> |

## The situation it solves

Sara is a freelance designer. She finished a job for Blue Bird Cafe, who paid a 300 deposit up front, and she agreed a 10% discount. Her city charges 8% sales tax. She needs to send the invoice today, payable in 30 days.

| Item | Qty | Price | Amount |
|---|---|---|---|
| Logo design | 1 | 600.00 | 600.00 |
| Business card design | 1 | 150.00 | 150.00 |
| Website banners | 3 | 75.00 | 225.00 |

The app answers:

**Amount due: $647.70.** Due by 12 Nov 2026. Total $947.70, already paid $300.00.

- Subtotal 975.00
- Discount (10%) -97.50
- Sales tax (8%) on 877.50 = 70.20
- Total 947.70
- Already paid -300.00
- **Amount due 647.70**

She taps **Print or save as PDF**, picks **Save as PDF**, and attaches the file to her email. Next month she taps **Copy as new** on this invoice and gets INV-0002 for the same client with today's date.

More cases it gets exactly right:

- **Hours:** 12.5 hours × 45.00 = **562.50**.
- **Prices already include tax:** 120.00 including 20% VAT shows **VAT 20.00** inside a total of 120.00. 100.00 including 8.875% has **8.15** of tax inside.
- **Some items not taxed:** labour 200.00 (no tax) and parts 100.00 with a 30.00 discount and 10% tax: the discount is shared by price, so tax is 10% of 90.00 = **9.00** and the total is **279.00**.
- **A credit:** a line of -250.00 takes money off.
- **Odd cents:** 1.005 × 9.99 = **10.04**; 3 × 33.33 = **99.99**. Everything is whole cents, rounded half up.
- **Due dates:** 31 Jan + 30 days = **2 Mar**; on receipt; or any date you pick (not before the invoice date).
- **Invoice numbers:** INV-0009 → **INV-0010**, 2026-099 → **2026-100**, and a warning if a number is already used.

Other cases it handles: an empty form (a calm "Add your first item" and placeholders in the preview, no red errors), print or save with something missing (it lists exactly what to fix and does not print), a description without a price or a price without a description, Qty of 0, below 0, words or more than 3 decimals, huge prices, pasted amounts like `$1,250.00` or `1.250,00`, a discount bigger than the items, a deposit bigger than the total, very long descriptions (cut to 300 characters and wrapped), typed HTML (shown as text), corrupt saved data (fresh start with a message), storage blocked (still works and says so), and a new day (Due today and Overdue update by themselves).

## Features

- **Help button.** Tap **Help** at the top for a short how-to, and **All apps** to go back to the list of apps. **Light mode / Dark mode** switch; the invoice itself always stays white.
- **Live invoice preview** that matches the print, with the **Amount due** and due date above it.
- **Your details and logo** (optional), remembered for every invoice.
- **Bill to** with **saved clients**: pick one to fill in the name, address and email. **+ Add client email (optional)**.
- **Invoice number** that counts up, **Invoice date**, **Payment due** on receipt, in 7, 14, 15, 30, 45 or 60 days, or on a date you pick.
- **Items** each in their own box: description, Qty (hours, days, pieces, up to 3 decimals), Price each, the line amount, **No tax on this item**. Remove with **Undo**, up to 50 items.
- **+ Add a discount** (percent or amount off), **+ Add tax, VAT or GST** (any name and rate, added on top or already included), **+ Add a deposit or amount already paid**. All optional.
- **Notes and payment details**, kept for the next invoice.
- **Print or save as PDF** (only the invoice prints, on one clean page), **Email the invoice** (works without an address), **Copy as text**.
- **My invoices:** each saved invoice in its own box with Paid / Due in N days / Due today / Overdue by N days, the money still to come in, **Open**, **Mark as paid** (PAID stamp on the invoice), **Copy as new**, **Delete** with **Undo**.
- **New invoice** keeps your details, tax, notes and currency and gives the next number, with **Undo**.
- **Currency symbol** per invoice (none, $, €, £, ₹, Rs, ¥, ₩, ₦, ₱, R, R$, kr, zł, ₺, CHF, AED, SAR, RM) and **Number style** 1,234.56 / 1.234,56 / 1 234,56.
- **Download backup** and **Restore backup** to keep your invoices safe or move them to another device.
- **Private, works offline and installable.** Phone and desktop layouts. Works with a keyboard and a screen reader.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `invoice-generator-for-freelancers/index.html` in your browser. Offline mode and install need the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` is the maths, with no page code. Money is whole cents, quantities are thousandths and rates are thousandths of a percent, so nothing is lost to floating point. Each line is Qty × Price rounded half away from zero (BigInt, exact even for very large numbers). The discount comes off before tax; tax is worked out on the taxed items after their share of the discount, either added on top or taken out of prices that already include it (amount × rate ÷ (100 + rate)). Dates are calendar days only, so time zones never move a due date.
- `script.js` builds the page and the preview. Everything you type is added as plain text, never as HTML. It is saved in this browser's storage under `invoice-generator-for-freelancers.state`, and every saved or restored value is checked before it is used.
- Printing uses the browser's print window with a print style sheet that shows only the invoice, so **Save as PDF** gives a real text PDF.
- `sw.js` saves the app for offline use (network first, so updates always arrive).
- Checks: `node tests.js` for the maths (also `test.html` in a browser), `node ui-test.js` drives the real page in headless Chromium at 11 screen widths in light and dark (add `--base https://umar8092.github.io/apps` to test the live site).

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
