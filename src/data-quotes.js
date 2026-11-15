/* data-quotes.js — a line for the top of Home.
 *
 * A fresh quote on every page load, picked at random and never the same one
 * twice in a row. It holds still for the rest of the visit, so moving between
 * tabs does not reshuffle it. Two kinds: training lines, and lines about life
 * in general. Attributed where the line belongs to someone; the unattributed
 * ones are plain truths.
 *
 * Kept short on purpose: a banner is not the place for a paragraph.
 */
(function (global) {
  'use strict';

  // [text, attribution]  — attribution empty for common-sense lines.
  var QUOTES = [
    ['The body achieves what the mind believes.', ''],
    ['Discipline is choosing between what you want now and what you want most.', ''],
    ['You do not have to be extreme, just consistent.', ''],
    ['Small daily improvements are what stack up over time.', ''],
    ['The only bad workout is the one that did not happen.', ''],
    ['Strength does not come from what you can do.', 'Rikki Rogers'],
    ['Take care of your body. It is the only place you have to live.', 'Jim Rohn'],
    ['Motivation gets you started. Habit keeps you going.', 'Jim Ryun'],
    ['It never gets easier, you just get stronger.', ''],
    ['Progress, not perfection.', ''],
    ['Fall seven times, stand up eight.', 'Japanese proverb'],
    ['A year from now you will wish you had started today.', 'Karen Lamb'],
    ['The hardest lift is the one off the couch.', ''],
    ['Sweat is just fat crying.', ''],
    ['Your only limit is you.', ''],
    ['Train for the body you want, not the one you have.', ''],
    ['Rest is part of the programme, not a break from it.', ''],
    ['Show up on the days you do not feel like it. Those count double.', ''],
    ['Nothing will work unless you do.', 'Maya Angelou'],
    ['Success is the sum of small efforts repeated daily.', 'Robert Collier'],
    ['The groundwork for all happiness is good health.', 'Leigh Hunt'],
    ['Energy and persistence conquer all things.', 'Benjamin Franklin'],
    ['What you do today can improve all your tomorrows.', 'Ralph Marston'],
    ['Do something today your future self will thank you for.', ''],
    ['Slow progress is still progress.', ''],
    ['Comparison is the thief of joy.', 'Theodore Roosevelt'],
    ['Train your weaknesses, show off your strengths.', ''],
    ['The pain you feel today is the strength you feel tomorrow.', ''],
    ['You are one workout away from a better mood.', ''],
    ['Make time, not excuses.', ''],
    ['Done is better than perfect.', ''],
    ['Be stronger than your strongest excuse.', ''],
    ['Every rep counts, even the ugly ones.', ''],
    ['Trust the process.', ''],
    ['Consistency beats intensity.', ''],
    ['You cannot out-train a bad diet.', ''],
    ['Eat for the body you are building.', ''],
    ['Protein first, everything else after.', ''],
    ['Hydration is the cheapest performance gain there is.', ''],
    ['Sleep is the most underrated supplement.', ''],
    ['Recovery is where the growth happens.', ''],
    ['The scale measures gravity, not progress.', ''],
    ['Strong is a skill. Practise it.', ''],
    ['Lift heavy, eat well, sleep deep.', ''],
    ['Your body can stand almost anything. It is your mind you must convince.', ''],
    ['Start where you are. Use what you have. Do what you can.', 'Arthur Ashe'],
    ['Action is the foundational key to all success.', 'Pablo Picasso'],
    ['Well done is better than well said.', 'Benjamin Franklin'],
    ['Quality is not an act, it is a habit.', 'Aristotle'],
    ['We are what we repeatedly do.', 'Will Durant'],
    ['He who has a why can bear almost any how.', 'Friedrich Nietzsche'],
    ['The journey of a thousand miles begins with one step.', 'Lao Tzu'],
    ['Fortune favours the prepared mind.', 'Louis Pasteur'],
    ['Knowing is not enough; we must apply.', 'Johann Wolfgang von Goethe'],
    ['Perseverance is not a long race, it is many short races.', 'Walter Elliot'],
    ['Patience and perseverance have a magical effect.', 'John Quincy Adams'],
    ['Little by little, a little becomes a lot.', 'Tanzanian proverb'],
    ['The expert in anything was once a beginner.', 'Helen Hayes'],
    ['The secret of getting ahead is getting started.', 'Mark Twain'],
    ['Continuous effort unlocks potential.', 'Winston Churchill'],
    ['It does not matter how slowly you go as long as you do not stop.', 'Confucius'],
    ['Quality over ego. Always.', ''],
    ['Leave the gym better than you walked in.', ''],
    ['Form first. Weight second. Ego last.', ''],
    ['A heavy set done badly is a light set done dangerously.', ''],
    ['The best programme is the one you will actually follow.', ''],
    ['You cannot rush adaptation.', ''],
    ['Train smart on the days you cannot train hard.', ''],
    ['Missing one day is a gap. Missing three is a pattern.', ''],
    ['Decide once, then stop negotiating with yourself.', ''],
    ['Habits beat willpower on a tired day.', ''],
    ['Prepare the meal, win the day.', ''],
    ['Hunger is information, not an emergency.', ''],
    ['A plate you can repeat beats a plate you cannot.', ''],
    ['Boring meals build interesting physiques.', ''],
    ['Track it and you will see it. See it and you can change it.', ''],
    ['Measure the trend, not the day.', ''],
    ['One bad meal will not undo a good week.', ''],
    ['Walk more. It is free and it works.', ''],
    ['Steps count. All of them.', ''],
    ['The warm-up is part of the workout.', ''],
    ['Mobility now is independence later.', ''],
    ['Train so that life gets easier.', ''],
    ['Strength is the most useful thing you can own.', ''],
    ['Lift so you can carry your own things at seventy.', ''],
    ['Your future knees are watching.', ''],
    ['Rest days are not lazy days, they are quiet work.', ''],
    ['Deload before your body deloads you.', ''],
    ['Listen to pain. Ignore discomfort. Know the difference.', ''],
    ['An injury costs more weeks than caution ever did.', ''],
    ['Start lighter than your ego suggests.', ''],
    ['Add a rep before you add a plate.', ''],
    ['The last two reps build the most.', ''],
    ['Breathe. Brace. Move.', ''],
    ['Tempo is free intensity.', ''],
    ['You will never regret finishing the set.', ''],
    ['Five minutes of warm-up beats five weeks of rehab.', ''],
    ['Be the person who shows up.', ''],
    ['Nobody regrets the workout they finished.', ''],
    ['You are allowed to be proud of a small win.', ''],
    ['Celebrate the streak, not just the scale.', ''],
    ['The gym does not care how you feel. Go anyway.', ''],
    ['You are not behind. You are starting.', ''],
    ['Everyone in here started at zero.', ''],
    ['The weight does not know your age.', ''],
    ['Strong today, stronger in six months.', ''],
    ['Six weeks of boring beats six days of perfect.', ''],
    ['Make the next rep your best rep.', ''],
    ['Effort is the only input you fully control.', ''],
    ['Control the controllables.', ''],
    ['Standards, not moods.', ''],
    ['Show up tired. Train smart. Go home proud.', ''],
    ['Suffer the discipline or suffer the regret.', 'Jim Rohn'],
    ['The difference between try and triumph is a little effort.', ''],
    ['Do not count the days. Make the days count.', 'Muhammad Ali'],
    ['Champions keep playing until they get it right.', 'Billie Jean King'],
    ['It is hard to beat a person who never gives up.', 'Babe Ruth'],
    ['The will to win means nothing without the will to prepare.', 'Juma Ikangaa'],
    ['Persistence can change failure into achievement.', 'Matt Biondi'],
    ['The body is a machine. Maintain it.', ''],
    ['Good food is a long-term investment, not a short-term reward.', ''],
    ['Train because you can, not because you must.', ''],
    ['Fitness is a relationship, not an event.', ''],
    ['Begin again, as many times as it takes.', ''],
    ['You are closer than you were yesterday.', ''],
    ['Keep the promise you made to yourself.', ''],

    // ---- life, not just lifting
    ['Be kind to yourself today. You are doing better than you think.', ''],
    ['Every day is a fresh start.', ''],
    ['Good things take time, and so do you.', ''],
    ['You are allowed to be both a work in progress and proud of yourself.', ''],
    ['Breathe. You have handled every hard day so far.', ''],
    ['Choose joy in small things — a good meal, a long walk, a full night of sleep.', ''],
    ['A calm mind is a strong mind.', ''],
    ['Gratitude turns what you have into enough.', ''],
    ['Be the reason someone smiles today.', ''],
    ['Your pace is still progress.', ''],
    ['Rest without guilt. Recovery is growth too.', ''],
    ['Kindness costs nothing and changes everything.', ''],
    ['Look how far you have come, not just how far you have to go.', ''],
    ['Today is a good day to have a good day.', ''],
    ['Happiness is built from ordinary days done well.', ''],
    ['You do not need to have it all figured out to keep moving forward.', ''],
    ['Let go of what you cannot control. Pour yourself into what you can.', ''],
    ['A little progress each day adds up to a different life.', ''],
    ['Celebrate the small wins. They are the big ones in disguise.', ''],
    ['Surround yourself with people who make you better.', ''],
    ['Hard days are part of the story, not the end of it.', ''],
    ['Drink your water, get some sunlight, and be patient with yourself.', ''],
    ['You are stronger than the thing you are worried about.', ''],
    ['Make today count, then let it go.', ''],
    ['Peace begins with how you talk to yourself.', ''],
    ['Your health is an investment, not an expense.', ''],
    ['There is always something to be thankful for.', ''],
    ['Believe in the person you are becoming.', ''],
    ['Slow down. Notice the good. It is there.', ''],
    ['A positive mind finds a way. A negative one finds an excuse.', ''],
    ['What you think, you become.', 'Buddha'],
    ['Keep your face to the sunshine and you cannot see the shadow.', 'Helen Keller'],
    ['It always seems impossible until it is done.', 'Nelson Mandela'],
    ['Happiness depends upon ourselves.', 'Aristotle'],
    ['Act as if what you do makes a difference. It does.', 'William James']
  ];

  var LAST_KEY = 'bkl.lastQuote';
  var picked = null;

  /* One pick per page load. The index shown last time is remembered so a
   * refresh can never land on the same line again. */
  function current() {
    if (picked) return picked;
    var last = -1;
    try { last = Number(localStorage.getItem(LAST_KEY)); } catch (e) {}
    var i = Math.floor(Math.random() * QUOTES.length);
    if (i === last) i = (i + 1 + Math.floor(Math.random() * (QUOTES.length - 1))) % QUOTES.length;
    try { localStorage.setItem(LAST_KEY, String(i)); } catch (e) {}
    picked = { text: QUOTES[i][0], by: QUOTES[i][1] };
    return picked;
  }

  global.Quotes = { current: current };

}(window));
