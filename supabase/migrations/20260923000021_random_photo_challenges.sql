-- ============================================================================
-- Random daily challenges, different for everyone, with photo proof
--
--   bonus_presets is the library: 320 challenges in 8 categories (body, fuel,
--   mind, discipline, outdoors, connection, order, craft), each with a hint
--   for the photo. Source: supabase/seed/bonus_challenges.tsv.
--
--   Each person gets their own challenge each day (bonus_challenges.user_id),
--   picked at random: not one they've had in the last 120 days, not one someone
--   else already has that day (while there are enough), and not the same
--   category as their challenge yesterday.
--
--   The bonus only counts with a photo or clip (set_bonus_photo). A mentor can
--   reject it (review_bonus), which takes the 7 points away.
--   Older shared daily challenges (user_id null) keep counting as they were.
-- ============================================================================

alter table public.bonus_presets add column category text, add column photo_hint text;
-- The old placeholder list isn't photo-ready: retire it (kept for history)
update public.bonus_presets set active = false;

insert into public.bonus_presets (category, description, photo_hint, sort_order) values
  ('body', 'Do 100 push-ups today, in as many sets as you need.', 'You mid-set, or your tally.', 1),
  ('body', 'Hold a plank for a total of 5 minutes today.', 'You holding the plank, with a timer in frame.', 2),
  ('body', 'Do 150 bodyweight squats today.', 'You at the bottom of a squat.', 3),
  ('body', 'Walk 12,000 steps today.', 'Your step counter at the end of the day.', 4),
  ('body', 'Do 50 burpees today.', 'You mid-burpee, or your tally sheet.', 5),
  ('body', 'Stretch for 20 minutes before bed.', 'You mid-stretch.', 6),
  ('body', 'Do a 20-minute mobility routine for your hips.', 'You in a hip-opener pose.', 7),
  ('body', 'Take the stairs every time today.', 'A staircase you climbed.', 8),
  ('body', 'Do 60 lunges (30 each leg).', 'You mid-lunge.', 9),
  ('body', 'Hold a wall sit for 3 minutes total.', 'You against the wall, timer visible.', 10),
  ('body', 'Do 5 minutes of jump rope (or jumping jacks).', 'You mid-jump.', 11),
  ('body', 'Do 30 minutes of yoga.', 'You in your favorite pose.', 12),
  ('body', 'Go for a 3-mile walk, run, or ride.', 'Your route or tracker screen.', 13),
  ('body', 'Do 100 sit-ups or crunches today.', 'You mid-rep.', 14),
  ('body', 'Do 40 pull-ups or 80 inverted rows today.', 'The bar or setup you used, with you on it.', 15),
  ('body', 'Do a 10-minute cool-down stretch after your workout.', 'You stretching.', 16),
  ('body', 'Hang from a bar for 2 minutes total.', 'You hanging.', 17),
  ('body', 'Do 30 minutes of a sport you haven''t played in a while.', 'The ball, court or gear.', 18),
  ('body', 'Carry something heavy for a 5-minute farmer''s walk.', 'What you carried.', 19),
  ('body', 'Do 20 minutes of foam rolling.', 'You on the roller.', 20),
  ('body', 'Do 200 jumping jacks.', 'You mid-jack.', 21),
  ('body', 'Hold a 2-minute deep squat, in sets if needed.', 'You in the squat.', 22),
  ('body', 'Walk or stand for 10 minutes after every meal today.', 'Where you walked.', 23),
  ('body', 'Do 3 rounds: 20 squats, 15 push-ups, 10 burpees.', 'Your finished rounds, written down.', 24),
  ('body', 'Swim, bike, or row for 20 minutes.', 'The pool, bike or rower.', 25),
  ('body', 'Do 50 glute bridges.', 'You at the top of a bridge.', 26),
  ('body', 'Balance on one foot for 2 minutes per leg.', 'You balancing.', 27),
  ('body', 'Do 25 slow tempo push-ups (3 seconds down).', 'You at the bottom of a rep.', 28),
  ('body', 'Take a 20-minute walk without your phone (photo after).', 'Where you ended up.', 29),
  ('body', 'Do 10 minutes of shadowboxing.', 'You in your stance.', 30),
  ('body', 'Try a workout class or video you''ve never done.', 'The class or screen.', 31),
  ('body', 'Do 100 calf raises.', 'You on your toes.', 32),
  ('body', 'Hold a side plank for 1 minute per side.', 'You in a side plank.', 33),
  ('body', 'Climb 30 flights of stairs today (total).', 'The stairwell or tracker.', 34),
  ('body', 'Do 20 minutes of core work.', 'You mid-exercise.', 35),
  ('body', 'Walk a mile at a brisk pace, timed.', 'Your time.', 36),
  ('body', 'Stand up and move for 2 minutes every hour you''re awake.', 'Your hourly checklist.', 37),
  ('body', 'Do 50 mountain climbers, 3 times today.', 'You mid-climber.', 38),
  ('body', 'Do a 15-minute stretch for your back and shoulders.', 'You stretching.', 39),
  ('body', 'Hit a new personal best on any lift or exercise.', 'The weight, reps or time.', 40),
  ('fuel', 'Drink 3 liters of water today.', 'Your bottle count or tracker.', 41),
  ('fuel', 'Eat 5 servings of vegetables today.', 'One of the plates.', 42),
  ('fuel', 'No sugar at all today.', 'Your cleanest meal of the day.', 43),
  ('fuel', 'Cook every meal yourself today.', 'One meal you cooked.', 44),
  ('fuel', 'Eat a protein-rich breakfast (30g+).', 'Your breakfast.', 45),
  ('fuel', 'No fast food or takeout today.', 'Your homemade dinner.', 46),
  ('fuel', 'Eat a fruit you haven''t had in a month.', 'The fruit.', 47),
  ('fuel', 'Meal-prep lunches for the next 3 days.', 'The containers.', 48),
  ('fuel', 'No soda or juice today, only water, tea or black coffee.', 'Your drink of the day.', 49),
  ('fuel', 'Eat slowly: no screens at one full meal.', 'The table, screen-free.', 50),
  ('fuel', 'Try a vegetable you''ve never cooked before.', 'It on your plate.', 51),
  ('fuel', 'Hit your protein target today.', 'Your food log or plates.', 52),
  ('fuel', 'No snacking after 8 pm.', 'Your kitchen, closed for the night.', 53),
  ('fuel', 'Eat a big salad as one meal.', 'The salad.', 54),
  ('fuel', 'Pack your own lunch.', 'The packed lunch.', 55),
  ('fuel', 'Skip alcohol today.', 'What you drank instead.', 56),
  ('fuel', 'Cook a new healthy recipe.', 'The finished dish.', 57),
  ('fuel', 'Eat a handful of nuts or seeds instead of a sweet snack.', 'Your snack.', 58),
  ('fuel', 'No fried food today.', 'Your healthiest meal.', 59),
  ('fuel', 'Start the day with a full glass of water before coffee.', 'The glass.', 60),
  ('fuel', 'Build a plate that''s half vegetables.', 'The plate.', 61),
  ('fuel', 'Read the label of everything you eat today, and skip one thing.', 'What you skipped.', 62),
  ('fuel', 'Make a smoothie with greens in it.', 'The smoothie.', 63),
  ('fuel', 'Eat fish or a plant protein for dinner.', 'Dinner.', 64),
  ('fuel', 'No processed snacks today.', 'Your whole-food snack.', 65),
  ('fuel', 'Drink a glass of water with every meal.', 'Your glass at a meal.', 66),
  ('fuel', 'Clear one junk item out of your pantry for good.', 'The item heading out.', 67),
  ('fuel', 'Eat breakfast sitting down, no phone.', 'Your breakfast spot.', 68),
  ('fuel', 'Cook enough dinner for tomorrow''s lunch.', 'The leftovers packed.', 69),
  ('fuel', 'Swap your usual dessert for fruit.', 'The fruit.', 70),
  ('fuel', 'Eat three meals at regular times today.', 'One of the meals, with the time.', 71),
  ('fuel', 'Make your own coffee or tea instead of buying one.', 'Your cup.', 72),
  ('fuel', 'Try a new spice or herb in a meal.', 'The spice and the meal.', 73),
  ('fuel', 'Eat a high-fiber food at every meal.', 'One of them.', 74),
  ('fuel', 'Write a grocery list and stick to it exactly.', 'The list and your haul.', 75),
  ('fuel', 'No eating in the car today.', 'Your meal at a table.', 76),
  ('fuel', 'Have a bowl of soup or stew you made.', 'The bowl.', 77),
  ('fuel', 'Eat the rainbow: 4 different-colored foods today.', 'The colorful plate.', 78),
  ('fuel', 'No added salt at the table today.', 'Your meal.', 79),
  ('fuel', 'Batch-cook a big pot of grains or beans.', 'The pot.', 80),
  ('mind', 'Journal for 15 minutes.', 'The journal page (cover the private parts).', 81),
  ('mind', 'Meditate for 15 minutes.', 'Your meditation spot.', 82),
  ('mind', 'Write down 10 things you''re grateful for.', 'The list.', 83),
  ('mind', 'Read 30 pages of a book.', 'The book, open to where you stopped.', 84),
  ('mind', 'Spend 30 minutes with no screens at all.', 'What you did instead.', 85),
  ('mind', 'Write your top 3 goals for the week.', 'The note.', 86),
  ('mind', 'Do a 10-minute breathing exercise.', 'Where you did it.', 87),
  ('mind', 'Write a letter to your future self.', 'The sealed envelope.', 88),
  ('mind', 'Sit in silence for 10 minutes.', 'The spot.', 89),
  ('mind', 'Write down one fear and one step to face it.', 'The note.', 90),
  ('mind', 'Read a chapter of a book about discipline or habits.', 'The book.', 91),
  ('mind', 'Spend 20 minutes on a puzzle, sudoku or crossword.', 'The finished (or attempted) puzzle.', 92),
  ('mind', 'Listen to a full podcast or lecture on something new.', 'The episode screen.', 93),
  ('mind', 'Write out your ideal day in detail.', 'The page.', 94),
  ('mind', 'Write down 3 wins from this week.', 'The list.', 95),
  ('mind', 'Do a 20-minute digital declutter (apps, photos, files).', 'Your cleaner home screen.', 96),
  ('mind', 'Plan tomorrow tonight, hour by hour.', 'The plan.', 97),
  ('mind', 'Learn and write down 10 words in a new language.', 'Your list.', 98),
  ('mind', 'Watch the sunset or sunrise without your phone (photo after).', 'The sky.', 99),
  ('mind', 'Write down a mistake you made and what you learned.', 'The note.', 100),
  ('mind', 'Take a 20-minute nap or rest with eyes closed.', 'Where you rested.', 101),
  ('mind', 'Turn off all notifications for 3 hours.', 'Your notification settings.', 102),
  ('mind', 'Write a one-page reflection on why you joined the Shadow Routine.', 'The page.', 103),
  ('mind', 'Spend 15 minutes in a place you find peaceful.', 'The place.', 104),
  ('mind', 'Do a body scan meditation before bed.', 'Your bed or mat.', 105),
  ('mind', 'Read something from a philosopher or old text.', 'The passage.', 106),
  ('mind', 'Write down a limiting belief and rewrite it.', 'Both versions.', 107),
  ('mind', 'Draw or doodle for 15 minutes, no judging.', 'The drawing.', 108),
  ('mind', 'Write 3 things you''d tell your younger self.', 'The note.', 109),
  ('mind', 'Name your biggest distraction and remove it for the day.', 'The distraction, put away.', 110),
  ('mind', 'Keep your phone in another room for 2 hours.', 'Your phone, far away.', 111),
  ('mind', 'Memorize a short poem or quote.', 'It, written from memory.', 112),
  ('mind', 'Write your personal rules: 5 things you always do.', 'The list.', 113),
  ('mind', 'Listen to a full album start to finish, doing nothing else.', 'The album.', 114),
  ('mind', 'Write a list of 10 things that energize you.', 'The list.', 115),
  ('mind', 'Spend 10 minutes visualizing your goal as done.', 'Where you sat.', 116),
  ('mind', 'Write about your best day this year.', 'The page.', 117),
  ('mind', 'Put your phone on grayscale for the day.', 'Your gray screen.', 118),
  ('mind', 'End the day with a written "done" list.', 'The list.', 119),
  ('mind', 'Read for 20 minutes before bed instead of scrolling.', 'The book on your nightstand.', 120),
  ('discipline', 'Wake up 30 minutes earlier than usual.', 'Your clock or alarm.', 121),
  ('discipline', 'Make your bed as soon as you get up.', 'The made bed.', 122),
  ('discipline', 'Take a 2-minute cold shower.', 'The shower (keep it decent).', 123),
  ('discipline', 'No social media for the whole day.', 'Your screen-time report.', 124),
  ('discipline', 'Be in bed with lights out by 10:30 pm.', 'Your clock at lights out.', 125),
  ('discipline', 'Do the task you''ve been avoiding the longest.', 'Proof it''s done.', 126),
  ('discipline', 'Work in a 90-minute focus block, no interruptions.', 'Your timer and workspace.', 127),
  ('discipline', 'No complaining at all today; start over if you slip.', 'A tally of your restarts.', 128),
  ('discipline', 'Lay out tomorrow''s clothes and gear tonight.', 'The laid-out clothes.', 129),
  ('discipline', 'Finish your hardest task before noon.', 'Proof it''s done, with the time.', 130),
  ('discipline', 'Say no to one thing that doesn''t serve you.', 'Something that stands for it.', 131),
  ('discipline', 'No phone for the first hour after waking.', 'Your morning without it.', 132),
  ('discipline', 'Keep your screen time under 2 hours today.', 'Your screen-time report.', 133),
  ('discipline', 'Do 25 minutes of work, 5 off, four times in a row.', 'Your timer or tally.', 134),
  ('discipline', 'Get up at the first alarm, no snooze.', 'The alarm time.', 135),
  ('discipline', 'Finish something you started and never completed.', 'The finished thing.', 136),
  ('discipline', 'Stand up straight all day: set 5 posture reminders.', 'Your reminders.', 137),
  ('discipline', 'No online shopping today.', 'Your empty cart.', 138),
  ('discipline', 'Spend 30 minutes on a skill you want to master.', 'You practicing.', 139),
  ('discipline', 'Do every chore on your list before relaxing.', 'The checked-off list.', 140),
  ('discipline', 'Track every dollar you spend today.', 'Your spending log.', 141),
  ('discipline', 'No caffeine after noon.', 'Your afternoon drink.', 142),
  ('discipline', 'Arrive 10 minutes early to everything today.', 'You early, with the time.', 143),
  ('discipline', 'Write a to-do list and finish every item.', 'The completed list.', 144),
  ('discipline', 'Turn your phone off for an hour in the evening.', 'The phone, off.', 145),
  ('discipline', 'Do 10 push-ups every time you check social media.', 'Your push-up tally.', 146),
  ('discipline', 'Wake up and move for 10 minutes before anything else.', 'You moving.', 147),
  ('discipline', 'No TV or streaming today.', 'What you did instead.', 148),
  ('discipline', 'Set a budget for the week and write it down.', 'The budget.', 149),
  ('discipline', 'Keep one promise to yourself you usually break.', 'Proof you kept it.', 150),
  ('discipline', 'Read instead of watching anything tonight.', 'The book.', 151),
  ('discipline', 'Clear your inbox to zero (or under 10).', 'Your inbox.', 152),
  ('discipline', 'Do a full weekly review: calendar, goals, money.', 'Your review notes.', 153),
  ('discipline', 'End your cold shower with 30 seconds colder.', 'The shower dial.', 154),
  ('discipline', 'No eating after dinner.', 'Your kitchen, closed for the night.', 155),
  ('discipline', 'Delete one time-wasting app for a week.', 'Your home screen without it.', 156),
  ('discipline', 'Wake up at the same time as yesterday, weekend or not.', 'Your alarm.', 157),
  ('discipline', 'Walk away from one argument or impulse today.', 'Something that stands for it.', 158),
  ('discipline', 'Put in 20 minutes on your side project.', 'Your progress.', 159),
  ('discipline', 'Plan your whole week''s workouts.', 'The plan.', 160),
  ('outdoors', 'Get 20 minutes of sunlight before 10 am.', 'The morning sky.', 161),
  ('outdoors', 'Go for a walk in a park or nature spot.', 'The trail or trees.', 162),
  ('outdoors', 'Eat one meal outside.', 'Your outdoor meal.', 163),
  ('outdoors', 'Watch the sunrise.', 'The sunrise.', 164),
  ('outdoors', 'Find and photograph something beautiful on a walk.', 'That thing.', 165),
  ('outdoors', 'Take a hike of 2 miles or more.', 'The trail.', 166),
  ('outdoors', 'Spend an hour outside without your phone out.', 'Where you were.', 167),
  ('outdoors', 'Go barefoot on grass or sand for 10 minutes.', 'Your feet in the grass.', 168),
  ('outdoors', 'Work out outdoors today.', 'Your outdoor workout spot.', 169),
  ('outdoors', 'Pick up 10 pieces of litter.', 'The litter bag.', 170),
  ('outdoors', 'Visit a place in your town you''ve never been.', 'The place.', 171),
  ('outdoors', 'Watch the sunset.', 'The sunset.', 172),
  ('outdoors', 'Look at the stars for 10 minutes.', 'The night sky.', 173),
  ('outdoors', 'Walk to an errand instead of driving.', 'Where you walked to.', 174),
  ('outdoors', 'Find a new running or walking route.', 'The route map.', 175),
  ('outdoors', 'Sit by water (lake, river, ocean, fountain) for 10 minutes.', 'The water.', 176),
  ('outdoors', 'Plant something or tend a plant.', 'The plant.', 177),
  ('outdoors', 'Take a walk in the rain (safely).', 'The rainy street.', 178),
  ('outdoors', 'Stretch or do yoga outside.', 'Your outdoor spot.', 179),
  ('outdoors', 'Bike somewhere you''d normally drive.', 'Your bike at the destination.', 180),
  ('outdoors', 'Climb to the highest point you can find nearby.', 'The view.', 181),
  ('outdoors', 'Spot and photograph 3 different birds or animals.', 'One of them.', 182),
  ('outdoors', 'Take a 30-minute walk at lunch.', 'The walk.', 183),
  ('outdoors', 'Have a phone call while walking outside.', 'Where you walked.', 184),
  ('outdoors', 'Find a tree and read under it for 20 minutes.', 'The tree.', 185),
  ('outdoors', 'Go on a walk and don''t take the same street twice.', 'Your route.', 186),
  ('outdoors', 'Watch the clouds for 5 minutes.', 'The clouds.', 187),
  ('outdoors', 'Sit outside with your coffee or tea in the morning.', 'Your cup outside.', 188),
  ('outdoors', 'Do a workout in a park using only what''s there.', 'The park.', 189),
  ('outdoors', 'Take a photo walk: 10 photos of details you usually miss.', 'Your favorite one.', 190),
  ('outdoors', 'Spend 30 minutes in the sun (with sunscreen).', 'The sunny spot.', 191),
  ('outdoors', 'Walk a new loop of at least 2 miles.', 'The map.', 192),
  ('outdoors', 'Visit a trail, beach or field before 8 am.', 'The early view.', 193),
  ('outdoors', 'Collect a leaf, stone or shell from your walk.', 'What you found.', 194),
  ('outdoors', 'Do your stretching routine in the backyard or on a balcony.', 'The spot.', 195),
  ('outdoors', 'Get outside for 10 minutes every 3 hours today.', 'One of the breaks.', 196),
  ('outdoors', 'Find a hill and walk or run it 5 times.', 'The hill.', 197),
  ('outdoors', 'Go for a night walk (in a safe area).', 'The night street.', 198),
  ('outdoors', 'Garden, rake or do yard work for 30 minutes.', 'The finished work.', 199),
  ('outdoors', 'Take someone on a walk with you.', 'The path you walked.', 200),
  ('connection', 'Text 3 people to tell them what they mean to you.', 'One of the texts (hide names).', 201),
  ('connection', 'Call a family member you haven''t talked to lately.', 'The call log (hide numbers).', 202),
  ('connection', 'Write a handwritten note to someone.', 'The note.', 203),
  ('connection', 'Buy coffee for a stranger or coworker.', 'The coffee.', 204),
  ('connection', 'Compliment 5 people today.', 'Your tally.', 205),
  ('connection', 'Help someone with a task without being asked.', 'The finished task.', 206),
  ('connection', 'Send a thank-you message to a mentor or teacher.', 'The message (hide names).', 207),
  ('connection', 'Have a meal with someone, phones away.', 'The table.', 208),
  ('connection', 'Reach out to an old friend.', 'The message (hide names).', 209),
  ('connection', 'Leave a positive review for a small business.', 'The review.', 210),
  ('connection', 'Donate something you don''t use.', 'The donation bag.', 211),
  ('connection', 'Cook for someone.', 'The meal.', 212),
  ('connection', 'Ask someone how they''re really doing, and listen.', 'Where you talked.', 213),
  ('connection', 'Encourage someone in the cohort chat.', 'Your message.', 214),
  ('connection', 'Write down what you appreciate about your partner, friend or family.', 'The note.', 215),
  ('connection', 'Hold the door, let someone go first, be patient all day.', 'A tally of kind acts.', 216),
  ('connection', 'Share something useful you learned with a friend.', 'What you shared.', 217),
  ('connection', 'Spend 30 minutes fully present with someone you love.', 'Where you spent it.', 218),
  ('connection', 'Send a voice note instead of a text to someone.', 'The voice note.', 219),
  ('connection', 'Apologize for something you''ve been holding onto.', 'Something that stands for it.', 220),
  ('connection', 'Invite someone to work out with you.', 'You two after (with their okay), or the spot.', 221),
  ('connection', 'Tip generously today.', 'The receipt.', 222),
  ('connection', 'Volunteer for an hour.', 'Where you volunteered.', 223),
  ('connection', 'Write a list of people who helped you get here.', 'The list.', 224),
  ('connection', 'Check in on someone who''s been having a hard time.', 'The message (hide names).', 225),
  ('connection', 'Make a playlist for someone.', 'The playlist.', 226),
  ('connection', 'Give an honest, kind piece of feedback someone needs.', 'Something that stands for it.', 227),
  ('connection', 'Introduce two people who should know each other.', 'The intro (hide names).', 228),
  ('connection', 'Leave a kind note for a neighbor or coworker.', 'The note.', 229),
  ('connection', 'Say thank you to someone who serves you today.', 'Where it happened.', 230),
  ('connection', 'Play a game with family or friends.', 'The game.', 231),
  ('connection', 'Call your parents or grandparents.', 'The call log (hide numbers).', 232),
  ('connection', 'Write a birthday card ahead of time.', 'The card.', 233),
  ('connection', 'Share your progress in the cohort chat.', 'Your post.', 234),
  ('connection', 'Help a neighbor with something.', 'The task.', 235),
  ('connection', 'Send a photo of something that reminded you of a friend.', 'What you sent.', 236),
  ('connection', 'Spend time with a pet, or someone else''s pet.', 'The pet.', 237),
  ('connection', 'Forgive someone in writing (you don''t have to send it).', 'The page.', 238),
  ('connection', 'Make plans with a friend for this week.', 'The calendar invite.', 239),
  ('connection', 'Tell someone about a goal and ask them to hold you to it.', 'The message (hide names).', 240),
  ('order', 'Clean and organize your desk.', 'The clean desk.', 241),
  ('order', 'Declutter one drawer completely.', 'The drawer.', 242),
  ('order', 'Wash, dry, fold and put away all your laundry.', 'The folded stack.', 243),
  ('order', 'Clean out your car.', 'The clean car.', 244),
  ('order', 'Clean the kitchen before bed, sink empty.', 'The empty sink.', 245),
  ('order', 'Throw away or donate 10 things.', 'The pile.', 246),
  ('order', 'Organize your closet.', 'The closet.', 247),
  ('order', 'Clean your bathroom top to bottom.', 'The bathroom.', 248),
  ('order', 'Clear out your fridge.', 'The fridge.', 249),
  ('order', 'Organize your phone''s home screen.', 'The home screen.', 250),
  ('order', 'Vacuum or sweep your whole place.', 'The clean floor.', 251),
  ('order', 'Make your bed perfectly (hospital corners).', 'The bed.', 252),
  ('order', 'Clean your shoes.', 'The shoes.', 253),
  ('order', 'Organize your gym bag.', 'The packed bag.', 254),
  ('order', 'Deep-clean one appliance.', 'The appliance.', 255),
  ('order', 'Back up your phone or computer.', 'The finished backup screen.', 256),
  ('order', 'Pay or schedule every bill that''s due.', 'The confirmation (hide numbers).', 257),
  ('order', 'Unsubscribe from 10 email lists.', 'Your cleaner inbox.', 258),
  ('order', 'Organize your computer desktop and files.', 'The clean desktop.', 259),
  ('order', 'Clean your windows or mirrors.', 'The shine.', 260),
  ('order', 'Organize one shelf or cabinet.', 'The shelf.', 261),
  ('order', 'Change your sheets.', 'The fresh bed.', 262),
  ('order', 'Clear everything off your floor.', 'The clear floor.', 263),
  ('order', 'Clean and organize your nightstand.', 'The nightstand.', 264),
  ('order', 'Water and care for your plants.', 'The plants.', 265),
  ('order', 'Delete 100 old photos you don''t need.', 'Your camera roll count.', 266),
  ('order', 'Organize your wallet or bag.', 'What''s inside, neatly.', 267),
  ('order', 'Tidy your entryway.', 'The entryway.', 268),
  ('order', 'Wipe down every surface in your kitchen.', 'The counters.', 269),
  ('order', 'Take out all trash and recycling.', 'The empty bins.', 270),
  ('order', 'Fix one small thing that''s been broken.', 'The fixed thing.', 271),
  ('order', 'Organize your pantry by type.', 'The pantry.', 272),
  ('order', 'Set up tomorrow''s workspace tonight.', 'The workspace.', 273),
  ('order', 'Clean your phone and keyboard.', 'Them, shining.', 274),
  ('order', 'Label something that''s always messy.', 'The labels.', 275),
  ('order', 'Sort your mail and paperwork.', 'The sorted pile.', 276),
  ('order', 'Clean out one digital folder you keep avoiding.', 'The folder, cleaner.', 277),
  ('order', 'Iron or steam tomorrow''s outfit.', 'The outfit.', 278),
  ('order', 'Put everything back where it belongs before bed.', 'The tidy room.', 279),
  ('order', 'Clean your workout gear and water bottle.', 'The gear.', 280),
  ('craft', 'Learn to cook one new dish.', 'The dish.', 281),
  ('craft', 'Practice an instrument for 30 minutes.', 'You playing, or the instrument.', 282),
  ('craft', 'Write 500 words of anything.', 'The page or word count.', 283),
  ('craft', 'Sketch something in front of you.', 'The sketch.', 284),
  ('craft', 'Take 10 photos with a theme, and post your best in chat.', 'The best one.', 285),
  ('craft', 'Watch a tutorial and try the skill right away.', 'Your attempt.', 286),
  ('craft', 'Write a short poem.', 'The poem.', 287),
  ('craft', 'Build or repair something with your hands.', 'What you made.', 288),
  ('craft', 'Learn 5 chords or a new song section.', 'Your practice.', 289),
  ('craft', 'Spend 30 minutes on a course you started.', 'The lesson screen.', 290),
  ('craft', 'Learn to tie a new knot.', 'The knot.', 291),
  ('craft', 'Write a page about something you know well, as if teaching it.', 'The page.', 292),
  ('craft', 'Cook a meal from another culture.', 'The meal.', 293),
  ('craft', 'Learn a basic first-aid skill.', 'Your notes.', 294),
  ('craft', 'Practice handwriting or calligraphy for 15 minutes.', 'The page.', 295),
  ('craft', 'Make something for someone.', 'What you made.', 296),
  ('craft', 'Learn one keyboard shortcut per hour you work.', 'The list.', 297),
  ('craft', 'Practice public speaking: record a 2-minute talk.', 'The recording screen.', 298),
  ('craft', 'Solve a hard problem on paper.', 'The page.', 299),
  ('craft', 'Write out your 5-year vision.', 'The page.', 300),
  ('craft', 'Learn how something you use every day works.', 'Your notes.', 301),
  ('craft', 'Try a new recipe without a phone, from a cookbook.', 'The dish and the book.', 302),
  ('craft', 'Spend 20 minutes on a language app.', 'Your streak screen.', 303),
  ('craft', 'Paint, color or design something.', 'The piece.', 304),
  ('craft', 'Write a letter by hand.', 'The letter.', 305),
  ('craft', 'Take a class or workshop online.', 'The screen.', 306),
  ('craft', 'Build a budget spreadsheet.', 'The spreadsheet (hide numbers).', 307),
  ('craft', 'Learn a magic trick or card trick.', 'The cards.', 308),
  ('craft', 'Write a short story of 300 words.', 'The page.', 309),
  ('craft', 'Teach someone a skill you have.', 'What you taught.', 310),
  ('craft', 'Take apart and clean something with parts.', 'The parts.', 311),
  ('craft', 'Learn 3 facts about your city''s history.', 'Your notes.', 312),
  ('craft', 'Practice a speech, pitch or introduction out loud.', 'Your notes.', 313),
  ('craft', 'Start a book you''ve been meaning to read.', 'The book.', 314),
  ('craft', 'Make a vision board, digital or paper.', 'The board.', 315),
  ('craft', 'Write a review of the last book or movie you finished.', 'The review.', 316),
  ('craft', 'Learn to cook a healthy breakfast you can repeat.', 'The breakfast.', 317),
  ('craft', 'Map out a project from start to finish.', 'The map.', 318),
  ('craft', 'Try photography: shoot one object 10 different ways.', 'Your favorite shot.', 319),
  ('craft', 'Learn to properly sharpen a knife or tool.', 'The tool.', 320);

-- ---------------------------------------------------------------------------
-- One challenge per person per day
-- ---------------------------------------------------------------------------
alter table public.bonus_challenges
  add column user_id     uuid references public.profiles (id) on delete cascade,
  add column preset_id   uuid references public.bonus_presets (id) on delete set null,
  add column category    text,
  add column photo_hint  text,
  add column photo_path  text,
  add column review_status text check (review_status in ('rejected')),
  add column review_note text,
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz;
alter table public.bonus_challenges drop constraint bonus_challenges_challenge_date_key;
alter table public.bonus_challenges add constraint bonus_challenges_date_user_key unique (challenge_date, user_id);
create index bonus_challenges_user_idx on public.bonus_challenges (user_id, challenge_date desc);
create index bonus_challenges_preset_idx on public.bonus_challenges (preset_id, challenge_date);

-- Your own, shared legacy rows, and staff for people they can see
drop policy challenges_read on public.bonus_challenges;
drop policy challenges_admin on public.bonus_challenges;
create policy challenges_read on public.bonus_challenges for select to authenticated
  using (user_id is null or user_id = auth.uid() or public.staff_can_see(user_id));
create policy challenges_admin on public.bonus_challenges for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- The shared rotation job is replaced by per-person challenges made on demand
do $$ begin perform cron.unschedule('bonus-rotation'); exception when others then null; end $$;

-- Today's (or any day's) challenge for the signed-in person, created on first ask
create or replace function public.ensure_bonus_challenge(p_date date)
returns public.bonus_challenges language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_row  public.bonus_challenges;
  v_pick public.bonus_presets;
  v_prev text;
begin
  if v_uid is null then return null; end if;

  select * into v_row from public.bonus_challenges where challenge_date = p_date and user_id = v_uid;
  if found then return v_row; end if;
  -- Already completed the old shared challenge that day: keep it (no double points)
  select ch.* into v_row from public.bonus_challenges ch
    join public.bonus_completions c on c.bonus_challenge_id = ch.id and c.user_id = v_uid
   where ch.challenge_date = p_date and ch.user_id is null
   limit 1;
  if found then return v_row; end if;

  select pr.category into v_prev from public.bonus_challenges ch
    join public.bonus_presets pr on pr.id = ch.preset_id
   where ch.user_id = v_uid and ch.challenge_date = p_date - 1;

  select p.* into v_pick from public.bonus_presets p
   where p.active
   order by
     exists (select 1 from public.bonus_challenges c
              where c.user_id = v_uid and c.preset_id = p.id and c.challenge_date > p_date - 120),
     exists (select 1 from public.bonus_challenges c where c.challenge_date = p_date and c.preset_id = p.id),
     p.category is not distinct from v_prev,
     random()
   limit 1;
  if v_pick.id is null then return null; end if;

  insert into public.bonus_challenges (challenge_date, user_id, preset_id, description, category, photo_hint, source)
  values (p_date, v_uid, v_pick.id, v_pick.description, v_pick.category, v_pick.photo_hint, 'auto')
  on conflict (challenge_date, user_id) do nothing;

  select * into v_row from public.bonus_challenges where challenge_date = p_date and user_id = v_uid;
  return v_row;
end $$;

-- Attach the photo/clip for today's challenge (uploaded to proofs/<uid>/...)
create or replace function public.set_bonus_photo(p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ch  public.bonus_challenges;
begin
  if v_uid is null then raise exception 'NOT_ALLOWED'; end if;
  if coalesce(p_path, '') not like v_uid::text || '/%' then raise exception 'BAD_PATH'; end if;
  v_ch := public.ensure_bonus_challenge(public.local_today(v_uid));
  if v_ch.id is null or v_ch.user_id is distinct from v_uid then raise exception 'NO_CHALLENGE'; end if;
  update public.bonus_challenges
     set photo_path = p_path, review_status = null, review_note = null, reviewed_by = null, reviewed_at = null
   where id = v_ch.id;
end $$;

-- A completed bonus needs a photo, and can't be re-marked done after a rejection
-- (a new photo clears the rejection)
create or replace function public.bonus_completion_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ch public.bonus_challenges;
begin
  if not new.completed then return new; end if;
  select * into v_ch from public.bonus_challenges where id = new.bonus_challenge_id;
  if v_ch.user_id is null then return new; end if;  -- older shared challenge: no photo rule
  if v_ch.photo_path is null then raise exception 'BONUS_PHOTO_REQUIRED'; end if;
  if v_ch.review_status = 'rejected' then raise exception 'BONUS_REJECTED'; end if;
  return new;
end $$;
create trigger bonus_completion_guard before insert or update on public.bonus_completions
  for each row execute function public.bonus_completion_guard();

-- Staff: reject a bonus photo (takes the 7 points away) or undo a rejection
create or replace function public.review_bonus(p_challenge uuid, p_accept boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ch   public.bonus_challenges;
  v_week date;
begin
  select * into v_ch from public.bonus_challenges where id = p_challenge for update;
  if not found or v_ch.user_id is null then raise exception 'NOT_FOUND'; end if;
  if not public.staff_can_see(v_ch.user_id) then raise exception 'ADMIN_ONLY'; end if;

  update public.bonus_challenges set
    review_status = case when p_accept then null else 'rejected' end,
    review_note   = nullif(trim(p_note), ''),
    reviewed_by   = auth.uid(),
    reviewed_at   = now()
  where id = p_challenge;
  if p_accept then
    update public.bonus_completions set completed = true
     where bonus_challenge_id = p_challenge and v_ch.photo_path is not null;
  else
    update public.bonus_completions set completed = false where bonus_challenge_id = p_challenge;
    perform public.notify(v_ch.user_id, 'workout_reviews', 'Bonus photo rejected',
      coalesce(nullif(trim(p_note), ''), 'Your mentor didn''t accept the photo for "' || v_ch.description || '".'),
      '/checkin');
  end if;

  v_week := public.week_start(v_ch.challenge_date);
  if exists (select 1 from public.weekly_scores where week_start_date = v_week and finalized) then
    perform public.finalize_week(v_week);
  else
    perform public.compute_week(v_week);
  end if;
end $$;

-- today_context: include the challenge's category, photo hint and photo state
do $$
declare def text;
begin
  def := pg_get_functiondef('public.today_context()'::regprocedure);
  if position('''point_value'', v_ch.point_value) end' in def) = 0 then raise exception 'today_context: pattern not found'; end if;
  execute replace(def, '''point_value'', v_ch.point_value) end',
    '''point_value'', v_ch.point_value, ''category'', v_ch.category, ''photo_hint'', v_ch.photo_hint,
                                              ''photo_path'', v_ch.photo_path, ''review_status'', v_ch.review_status,
                                              ''review_note'', v_ch.review_note) end');
end $$;

revoke execute on function public.set_bonus_photo(text)                  from public, anon;
revoke execute on function public.bonus_completion_guard()               from public, anon, authenticated;
revoke execute on function public.review_bonus(uuid, boolean, text)      from public, anon;
