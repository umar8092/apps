# Idea queue

The daily job builds the FIRST unchecked idea below, then adds new vetted ideas at the bottom so there are always at least 8 waiting.
An idea only goes on this list if it solves a real everyday problem, people would keep it, and it is not already offered by every site (see `REJECTED.md`).
Each idea says who needs it, the situation, and the answer the app must give. Add the edge cases the app must handle.

## Built
- [x] **Subscription Tracker** (built 2026-10-09 as `subscription-tracker`) — Anyone paying for streaming, apps and memberships. Add each subscription (name, price, how often, next bill date); the app shows the monthly and yearly total, what is due in the next 7 days, and which are the most expensive. Edge cases: weekly/monthly/quarterly/yearly/custom billing, free trials that end, paused or cancelled, prices that change, amounts like 0 or 9.99, same name twice, backup export/import, everything stays on the device.
- [x] **Hourly to Salary Converter** (built 2026-10-10 as `hourly-to-salary-converter`; queued as "Hourly, Daily, Monthly and Yearly Pay Converter") — A job seeker comparing offers. Enter pay per hour/day/week/2 weeks/month/year plus hours and days a week; see all the others. Each job has its own paid holiday days, unpaid days off and overtime; up to 4 jobs compared by yearly pay and by pay per hour actually worked.

## Next 5 (build in this order, the owner reviews these)
- [ ] **Loan and Credit Card Payoff Planner** — Someone with a debt who wants to know when they will be free and how much extra helps. Enter balance, rate and payment; show the payoff date, total interest, and how much sooner they finish by paying a bit more. Edge cases: payment too low to ever pay it off (say so plainly), 0% rate, several debts (snowball vs avalanche), extra one-off payments.
- [ ] **Grocery List with Running Total** — A shopper who wants to stay on budget. Add items with price and quantity, tick them off in the shop, see the total and what is left of the budget.
- [ ] **Photo Size Reducer (offline)** — Someone who must upload a photo or ID under 200 KB or 1 MB. Drop in a photo, pick the size limit, get a smaller JPEG without sending it anywhere. Edge cases: HEIC, huge photos, rotation, "can't reach the limit" message.
- [ ] **Recipe Scaler and Unit Converter** — A home cook with a recipe for 4 who is cooking for 7, or an American recipe in grams. Paste or type ingredients, set servings from X to Y, and get scaled amounts in friendly units (1 1/2 cups, not 1.4999). Edge cases: fractions, "a pinch", ranges ("2-3"), cups to grams per ingredient (flour, sugar, butter), metric/US/UK, oven temperature, copy the result.

## Later
- [ ] **Medication and Habit Reminder Log** — Someone who keeps forgetting if they took today's tablet. Log doses with time, show "last taken", warn about double doses. (Not medical advice; clear disclaimer.)
- [ ] **Trip Packing Checklist** — A traveller who always forgets something. Pick the trip type and length and get a checklist they can edit and tick off, saved on the device.
- [ ] **Age and Date Difference Calculator** — Exact age, days between dates, days until an event; handles leap years and different time zones.
- [ ] **Expense and Budget Tracker** — Someone who wants to know where the month's money went. Log spending with a category, set a monthly budget per category, see what is left and a warning before going over. Edge cases: refunds, split across categories, month rollover, backup export/import, optional currency symbol.
- [ ] **Savings Goal Planner** — Someone saving for a trip, deposit or emergency fund. Enter the goal, what is saved and a date, and see the monthly amount needed, or enter a monthly amount and see when they reach it. Edge cases: already reached, date in the past, 0 saved, interest 0% or a savings rate, several goals.
- [ ] **Unit Price Comparison (Which Is Cheaper)** — A shopper in the aisle with two or more sizes of the same product. Enter price and size (kg, g, L, ml, per item) for each and see the cheapest per unit and by how much. Edge cases: mixed units, 0 or blank size, packs of N, ties.
- [ ] **Free Invoice Generator** — A freelancer who needs a clean invoice now. Fill in from/to, items, tax and due date, preview, print or save as PDF through the browser. Edge cases: many items, discounts, tax-inclusive, long text, saved sender details, invoice number that counts up.
- [ ] **QR Code Generator (offline)** — Someone who needs a QR for a link, Wi-Fi login, phone number or text. Type it, get a QR to download or print, nothing sent anywhere. Edge cases: very long text, Wi-Fi with special characters, error-correction level, a vendored MIT QR library is allowed.
- [ ] **Study Planner and Exam Countdown** — A student with several exams. Add exams with dates and topics, see days left and a daily study plan that spreads topics across the days. Edge cases: exams on the same day, date passed, rest days.
- [ ] **Weekly Meal Planner with Shopping List** — A household planning dinners. Pick meals for each day and get one combined shopping list with quantities merged. Edge cases: same ingredient in two meals, units, leftovers, copy the list.
- [ ] **Road-Trip Fuel Cost Calculator** — A driver planning a trip. Distance, fuel price and mileage give the fuel cost and the share per passenger, with return trip. Edge cases: miles/km and L/100km vs mpg, 0 passengers, tolls.
- [ ] **Chore Rota for Households** — Flatmates or a family who argue about chores. Add people and chores, get a fair weekly rota that rotates, with a printable view. Edge cases: uneven numbers, someone away, one-off swaps.
- [ ] **Water and Habit Tracker** — Someone building a daily habit. Tap to log glasses of water or any habit, see the day's progress and a streak. Edge cases: day rollover at midnight, time zones, missed day, editing yesterday.
