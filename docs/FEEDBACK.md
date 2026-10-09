# Owner feedback (the daily job reads this every run)

Newest first. Every item is a rule.

- **2026-10-10 SCHEDULE (rules, they override the main prompt where they differ).** We now ship 5 apps a day. Build slots in Pakistan time: 01:00, 04:00, 10:00, 15:00 and 20:00 (at least two at night while the owner sleeps). Verifier runs one hour after each. Take the first idea under "Next 5" in docs/IDEAS.md, then from "Later". Keep at least 12 unchecked ideas in the queue at all times (add vetted ideas, never filler). Quality is not reduced because there are more apps: every rule above still applies to each one, and it is better to skip a slot and report why than to ship a weak or broken app.
- **2026-10-10 CALENDAR OVERRIDE.** The invite starts 30 minutes after launch, EXCEPT when the launch happens between 00:00 and 07:00 Pakistan time (19:00 to 02:00 UTC): then start the invite at 08:00 Pakistan time (03:00 UTC) the same morning, so the owner is never woken up. Same 15-minute length and reminders.
- **2026-10-10** A small vendored MIT-licensed library (for example a QR encoder) may be copied into the app folder when writing it by hand would be unreasonable; keep its LICENSE next to it and mention it in the README. No CDN links, the app must still work offline.
- **2026-10-09** Do not ship weak or niche picks; we are just starting and must not look like we ran out of ideas. Apps must solve real day-to-day problems people would like and keep using. (Paint calculator was a weak pick.)
- **2026-10-09** Check ALL use cases the app can meet and handle each one. The UI must make sense to a first-time user. Do the homework before going live; the owner should not have to point out issues you could have caught.
- **2026-10-09** Keep testing after going live, with all cases, on the live URL.
- **2026-10-09** The calendar invite is created only after the app is live and checked, and starts 30 minutes after the launch.
- **2026-10-08** Names say purpose and audience (Time Zone Meeting Planner). Do not force one shared setting where real life differs (per-person working hours, night shifts). Help button and "All apps" back button on every app; light/dark switch where the app has both looks.
- Commits are authored as Muhammad Umar <umar8092@gmail.com> and never carry a Co-Authored-By trailer.
