# Pending updates

Changes requested during review and testing.

> **Status (2026-09-22): items 1–7 and 9–12 are implemented, tested and deployed** (migrations `…08` and `…09`).
> Item 8 is still unclear and not built. New requests get logged below and wait for the next go-ahead.

*Consolidated 2026-09-22 after several rounds of answers. Each item shows the current decision; earlier versions are summarized at the end.*

---

## 1. Workouts: counted as 30+ minute sessions, several per day allowed
- The gym goal becomes **workouts per week**. A workout is any session of **30+ minutes**, so a 30-minute run plus 30 minutes of lifting in one day is **2 workouts**.
- **Check-in flow for workouts**, still one question at a time:
  1. **"Did you work out for 30 minutes or more today?"** Yes / No.
  2. If yes, **"How many times?"** (1, 2, 3…).
  3. For each workout: **"What workout?"** (type, e.g. walk/run, lifting) + minutes (≥ 30) + **photo/clip**.
- Every workout logged counts toward the **weekly total**, so knocking out 2 in a day puts you ahead for the week.
- **Under 30 minutes is blocked** with a message ("A workout needs to be 30+ minutes"). *Found testing account "lodie": "Yes" + 20 min of cardio was accepted.*
- Weekly targets can go above 7 (e.g. 12 workouts/week).

## 2. A photo or video clip for every workout
- **A workout can't be submitted without a photo or short video clip**, taken during the workout.
- Disclaimer shown in the app: *"Snap a photo of yourself while you're working out. It's accountability."*
- **No photo? Ask your mentor.** The participant can submit the workout as an **exception request** with a written explanation. It **doesn't count** unless the mentor accepts it. Rejected requests stay not counted.
- Photo/clip present → the workout is **approved automatically** at the end of the day. The mentor can review, and if they **reject** a photo, that workout doesn't count.
- There's **no separate photo-minimum punishment and no photo-free allowance**. Every workout needs a photo or an accepted exception. Too few counted workouts shows up as a gray/red week anyway.

## 3. The program: 12 weeks = 2-week prep + 3 months
- **The 2 prep weeks are credited to everyone as green weeks at 100% of their targets**, so everyone starts at the same spot.
  - They count **only toward Gold Month 1** (as 2 green weeks, and 2 full weeks toward the monthly total).
  - They're **not in the actual metrics**: no leaderboard rows, points, or check-in history for prep.
- The program has **3 months (4-week blocks)**:
  - **Month 1** = 2 prep weeks + program weeks 1–2, decided at the end of program week 2.
  - **Month 2** = program weeks 3–6, decided at week 6.
  - **Month 3** = program weeks 7–10, decided at week 10.

  So **3 Gold Months** are possible in one program.
- Month 1 in practice: with the prep's 2 greens banked, a participant who goes green in program weeks 1 and 2 (and hits the monthly total) has their first Gold Month. Per the Gold rule (≥3 green, ≤1 gray, no red), green + gray would also qualify, and **any red week rules it out**.
- **No late joiners.** Everyone starts together on the admin-set launch date.
- **After week 12 the app becomes read-only history.** A continuous, multi-cohort app (100+ people) is a **separate future build**, not part of this one.
- The **leaderboard stays weekly**.
- The punishment/reward section shows where you are in the month: **"Week 2 of 4"**, with month-to-date progress.
- Everyone shares the same program dates, counted from the cohort's start.

## 4. Weekly bands and red-week punishments (per goal)
- Bands stay **Green ≥ 80%**, **Gray 60–79%**, **Red < 60%** of the weekly target. (The 83% / 58% in the example only came from 12 workouts/week.)
- **Red week → that goal's punishment, immediately.** It's done during the following week, and the participant **proves it to the mentor** (photo/video through the existing proof flow).
- **Gray week:** no punishment. Only **1 gray week per month** is allowed for a Gold Month.

## 4b. Mid-week colors: behind = gray, never red until the week ends
- **Live pace colors (leaderboard dots and the Today screen) only use Green or Gray while a week is in progress.**
  - **On pace or ahead → Green.** Day 1 of a 12x/week goal with 1 or 2 workouts logged = green.
  - **Behind pace → Gray**, meaning "catch up", recalculated day by day. Having done nothing yet is never red mid-week.
- **Red only appears when the week closes** below 60%, which is also when the red-week punishment triggers (#4).
- Applies to **all goals**, not just workouts.
- *Change vs. what's built:* pace already starts neutral before your first log and counts whole days owed. But it can show **red mid-week** when someone's far behind (e.g. 0 of 12 workouts after day 2), and that becomes gray.

## 5. Monthly results: Gold Months and the "Ultra" month
**Per goal, each month → Gold Month** if all of these hold:
- monthly total ≥ the goal's monthly Gold number (e.g. 40 workouts)
- at least 3 green weeks
- at most 1 gray week
- **no red weeks**

A Gold Month earns that goal's **reward** (e.g. spa day). **3 Gold Months** in a goal earns its **big reward** (e.g. workout wardrobe splurge).

**Overall, each month → Ultra tier** (all 5 goals). *Decided: "every goal" rules, not an average, for Gold and Green.*
| Tier | Rule | Message / consequence |
|---|---|---|
| **Ultra Gold** | **every goal ≥ 80%** for the month, and no gray or red weeks in any goal | "Grant yourself one wish!" |
| **Ultra Green** | **every goal ≥ 75%**, at most 1 gray week per goal, no red weeks | "You stayed on track. Good job!" |
| **Ultra Gray** | plain average of the 5 goals is 60% – 74.9%, or it misses the Green rules while averaging ≥ 60% | "Participation trophy. Lock in and do better." |
| **Ultra Red** | plain average of the 5 goals < 60% | Shame message + **Ultra Punishment** |

Messages use the founder's wording from the original spec text.

## 6. Consequences written at signup, approved by the mentor
- During goal setup, each participant writes their consequences **with their coach**. Per goal:
  - a **red-week punishment**
  - a **Gold Month reward**
  - a **3 Gold Months reward**

  Plus their personal **Ultra Punishment** and **"one wish"**.
- The **mentor approves or edits** them along with the goals, in the existing approval screen.
- The shared **placeholder punishment library** is retired. It could stay as a list of suggestions during setup.

## 7. Rewards are self-granted
- An earned reward shows up in the app ("You earned it: Spa Day. Grant yourself!").
- **No proof needed.** An optional "Mark as claimed" is there for anyone who wants it. Claiming isn't required.

## 9–12. Feature batch from `shadow-routine-feature-prompt.md` (logged 2026-09-22, built + deployed the same day)

**9. Signup sex field (male / female).** Required at signup, stored on the profile. It only picks which rank titles a user sees; nothing else uses it.
- *Plan:* existing accounts get a one-time "pick your path" prompt the next time they open the app.

**10. Rank/level system: `cumulative_cycle_points`.** The sum of every program week's `total_points` across the 10-week cycle. It's separate from the weekly leaderboard, which stays as-is, and it resets only on a new cycle.
- **Levels** (threshold → male title / female title):
  1. 0 → Shadow Initiate
  2. 525 → Shadow Apprentice
  3. 1,350 → Ronin / Huntress
  4. 2,350 → Blade / Oracle
  5. 3,475 → Berserker / Valkyrie
  6. 4,710 → Marshal / Matriarch
  7. 6,035 → Warlord / Empress
  8. 7,450 → Regent / Sovereign
  9. 8,935 → King / Queen
  10. exactly 10,490 → **The Eclipse** (shared)
- Recomputed on every check-in. Crossing a threshold shows a **Level Up** screen with the new title before the normal confirmation, and the cumulative bar animates upward.
- *Plan:* only program weeks 1–10 count (prep weeks aren't in the metrics), so the max is 10 × 1,049 = 10,490, matching the table.

**11. Rank emblems (placeholder art).** An `emblems` table: `rank_level` 1–10, `path` male | female | shared (shared only for level 10), `image_url` nullable. Show a placeholder graphic until the real AI art arrives.
- Shown next to the name on the user's own profile and on their leaderboard row.

**12. Cohort chat.** Text-only chat scoped to the cohort, in a `messages` table (id, cohort_id, user_id, message_text, created_at).
- Live via Realtime, on its own tab, with the sender's name + emblem on each message.
- The admin/mentor can view it and delete messages (basic moderation only).
- *Plan:* there's one cohort today, so this adds a minimal `cohorts` table with a single cohort and `cohort_id` on profiles, ready for the future multi-cohort build.

## 13. Notifications + global chat (logged, built and deployed 2026-09-22)
- Notifications for app actions (approvals, rejections/reviews, punishments, rewards, chat), in-app inbox + push.
- Two chat channels: Cohort and Everyone (global, for the future multi-cohort app).
- Me → Notifications: per-type toggles. Defaults: everything on except Everyone chat.

## 14. "How it works" intro at signup (logged, built and deployed 2026-09-22)
- 10 swipeable screens after signup, before goal setup:
  1. Welcome
  2. The 5 goals and points
  3. The nightly check-in
  4. Green/gray/red
  5. Punishments and infractions
  6. Gold Months and rewards
  7. The Ultra month
  8. Ranks
  9. The mentor
  10. Cohort, chat and notifications
- Shown once per account (server-side flag). Existing accounts see it once too. Reopen any time from Me → How the app works.

## 15. Mentors in the cohort + mentor invite links (logged, built and deployed 2026-09-22)
- **Me → Join the cohort** (mentors only): set goals and check in. Scored weekly and shown on the leaderboard marked Mentor, but unranked: no place, never "most consistent", no punishments/rewards/month results/ranks.
- **Admin → Invites:** choose Participant or Mentor. A mentor code signs someone up as a mentor (full mentor tools), active immediately.

## 16. Cohort names (logged 2026-09-23, for the multi-cohort build; not built yet)
- Each cohort gets an old Japanese spiritual/god name instead of "Cohort 1". Shown in the header, chat ("Cohort · Marishiten"), leaderboard and admin.
- The schema is ready: `cohorts.name` already exists. The work is naming at creation, a picker for Admins, and showing the name in the UI.
- Name bank (pick in order, or let the Admin choose):
  1. **Marishiten**: goddess of light and mirage, patron of warriors, said to move unseen (the "shadow" one)
  2. **Fudō**: Fudō Myō-ō, the Immovable One; burns away weakness, holds a sword and rope (discipline)
  3. **Hachiman**: god of warriors and archery
  4. **Bishamonten**: armored guardian, god of warriors
  5. **Raijin**: god of thunder
  6. **Fūjin**: god of wind
  7. **Susanoo**: god of storms and the sea, slayer of the eight-headed serpent
  8. **Tsukuyomi**: god of the moon
  9. **Amaterasu**: goddess of the sun
  10. **Takemikazuchi**: god of thunder and the sword
  11. **Ryūjin**: dragon god of the sea
  12. **Kagutsuchi**: god of fire
  13. **Izanagi / Izanami**: the creator pair (good for a founding or combined cohort)
- Done 2026-09-23: "Cohort 1" is renamed **Marishiten**, and the name shows on the chat tab, the message box and chat notifications. Still to build: naming new cohorts (part of the multi-cohort build).

## 17. The Ultimate Shadow (built 2026-09-23)
- A bracket of all cohorts on the Board ("The Ultimate Shadow" button).
- No earlier rules were on record, so this default format was used (easy to change in `src/lib/ultimate.ts`):
  - Score = average weekly points per member.
  - Round 1 (weeks 1–2), top 8 of 10 move on. Quarterfinals (3–4), 1v8 / 2v7 / 3v6 / 4v5. Semifinals (5–6). Final (7–10).
- Test data: 8 more cohorts (Hachiman, Bishamonten, Raijin, Fūjin, Susanoo, Tsukuyomi, Amaterasu, Takemikazuchi), each with one test member (Kenji, Mika, Taro, Yumi, Ren, Aiko, Haru, Sora). They have no password, so nobody can sign in as them.
- Cohort emblem art is still to come (`cohorts.emblem_url`).

## 8. (Unclear) "We'll graph the punishments"
- Means a chart of punishments over time? Or writing up the real punishment list? *(Possibly covered now by #6.)*

---

## Open questions
- None right now. (#8, "graph the punishments", is still unclear but may be covered by #6.)

*(Answered and folded in: week numbering, prep counting, photo exceptions, no late joiners, read-only after week 12, Ultra rule = every goal ≥ 80%, workout check-in flow, and mid-week gray instead of red.)*

---

### History
- #3 went from weekly punishments to every 2 weeks, then monthly in a 10-week program (checkpoints weeks 4 and 8, closing weeks 9–10), and now a 12-week program with a 2-week prep (checkpoints program weeks 2, 6 and 10).
- The band cutoffs briefly looked like 83% / 58%, but were confirmed to stay at 80% / 60%.
- Photo rule: "1 per workout, with one free per week" → "every workout". Then "can't submit without one, but you can ask the mentor for an exception". The photo-minimum punishment and the allowance were dropped.
- Ultra %: first proposed as points-weighted vs. plain average; the founder chose a plain average, pending the "all goals ≥ 80%" clarification.
