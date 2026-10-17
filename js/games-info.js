/* Game definitions, icons and the step-by-step rule guides shown in the info modals. */
(function () {
  const GN = (window.GN = window.GN || {});

  const icons = {
    countdown:
      '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="34" r="24" fill="none" stroke="currentColor" stroke-width="4"/>' +
      '<path d="M32 34 V18" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M32 34 L44 40" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' +
      '<rect x="27" y="4" width="10" height="6" rx="2" fill="currentColor"/></svg>',
    spellingbee:
      '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 L54 19 V45 L32 58 L10 45 V19 Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M24 22 H35 a6 6 0 0 1 0 10 H24 Z M24 32 H37 a6 6 0 0 1 0 10 H24 Z" fill="currentColor"/></svg>',
    bigfatquiz:
      '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 12 H56 a4 4 0 0 1 4 4 V40 a4 4 0 0 1 -4 4 H30 L16 56 V44 H8 a4 4 0 0 1 -4 -4 V16 a4 4 0 0 1 4 -4 Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M26 22 a6 6 0 1 1 8 5.5 c-2 1 -2 2.500 -2 4" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="37" r="2.500" fill="currentColor"/></svg>',
    taskmaster:
      '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 8 H46 V26 a14 14 0 0 1 -28 0 Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M18 14 H8 v6 a10 10 0 0 0 10 10 M46 14 H56 v6 a10 10 0 0 1 -10 10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M32 40 V50 M20 56 H44" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  };

  const GAMES = {
    countdown: {
      id: 'countdown',
      name: 'Countdown',
      tagline: 'Letters, numbers and the dreaded conundrum.',
      ready: true,
      icon: icons.countdown,
      tags: ['1–8 teams', '13 rounds', '~45 min'],
      steps: [
        {
          title: 'How a game works',
          text:
            '<p>A game has <strong>13 rounds</strong>: eight <strong>letters</strong> rounds, four <strong>numbers</strong> rounds and a final <strong>conundrum</strong>. The order is letters, letters, numbers, repeated four times, then the conundrum.</p>' +
            '<p>Teams take turns being in control. The team in control chooses the letters or numbers for that round.</p>',
        },
        {
          title: 'Letters: choose nine letters',
          text:
            '<p>The team in control taps <strong>Vowel</strong> or <strong>Consonant</strong> to turn over the next tile from that stack, nine times in total.</p>' +
            '<p>The final selection must have <strong>at least 3 vowels</strong> and <strong>at least 4 consonants</strong>, so the buttons lock themselves when a limit is reached. A typical mix is four vowels and five consonants.</p>' +
            '<p>Tiles come from a weighted pile, so common letters like E, R, S, T and N turn up often and Q, Z, X, J, K and V are rare.</p>',
        },
        {
          title: 'Letters: the clock',
          text:
            '<p>When all nine letters are on the board, the game master presses <strong>Start clock</strong>. Teams have <strong>30 seconds</strong> to write down the longest word they can on a pad. The theme music plays while the clock runs.</p>' +
            '<p>Words must be standard British English: no proper nouns, abbreviations, hyphenated words or American spellings (colour yes, color no). Each letter can only be used as many times as it appears on the board.</p>',
        },
        {
          title: 'Letters: declare and check',
          text:
            '<p>When the clock stops, teams declare how many letters their word has. The <strong>longest word is checked first</strong>.</p>' +
            '<p>If it is valid, that team wins the round. If two teams have valid words of the same length, <strong>they both score</strong>. If a word turns out to be invalid, check the next longest.</p>' +
            '<p>Press <strong>Top 3 words</strong> to reveal the three longest words hiding in the letters, then use <strong>Score round</strong> to give out the points.</p>',
        },
        {
          title: 'Letters: scoring',
          text:
            '<p>A valid word scores <strong>1 point per letter</strong>.</p>' +
            '<p>Using <strong>all nine letters</strong> earns <strong>18 points</strong>.</p>' +
            '<p>You can also add or take away points at any time with the + and − buttons on the score bar at the bottom of the screen.</p>',
        },
        {
          title: 'Numbers: choose six tiles',
          text:
            '<p>The team in control picks <strong>six tiles</strong> one at a time from two stacks: <strong>Large</strong> (25, 50, 75, 100, one of each) or <strong>Small</strong> (1 to 10, two of each). Choose anywhere from 0 to 4 large numbers.</p>' +
            '<p>Then press <strong>Reveal target</strong>: a random three-digit number from 100 to 999 is rolled.</p>',
        },
        {
          title: 'Numbers: reach the target',
          text:
            '<p>Press <strong>Start clock</strong>. In 30 seconds, use the six numbers and the operations <strong>+ − × ÷</strong> to get as close to the target as you can.</p>' +
            '<ul><li>Each tile can be used <strong>once</strong> (you do not have to use them all).</li><li>Every step must give a <strong>positive whole number</strong>, so divide only when it comes out exactly.</li></ul>',
        },
        {
          title: 'Numbers: scoring and solution',
          text:
            '<p><strong>10 points</strong> for hitting the target exactly, <strong>7 points</strong> if within 5, and <strong>5 points</strong> if within 10. Any further away scores nothing. Teams that are equally close both score.</p>' +
            '<p>After teams have given their answers, press <strong>Show closest solution</strong> to see the working for an exact answer, or the nearest possible one.</p>',
        },
        {
          title: 'The final conundrum',
          text:
            '<p>A nine-letter word appears scrambled on the board. The first team to <strong>buzz in with the right answer wins 10 points</strong>.</p>' +
            '<p>Press <strong>Start</strong> to reveal the letters and run the clock. Each team has a buzzer button (or press its number key, 1 to 8). The clock pauses when a team buzzes. If the answer is wrong, that team is locked out for the round and the clock carries on.</p>',
        },
        {
          title: 'The podium',
          text:
            '<p>After the conundrum, the game ends with a <strong>podium</strong> showing the top three teams. If more than three teams played, everyone else is listed on the right with their scores.</p>' +
            '<p>Your game is saved automatically all the way through, so you can leave and pick it up again from the home page.</p>',
        },
      ],
    },

    spellingbee: {
      id: 'spellingbee',
      name: 'Spelling Bee',
      tagline: 'Hear it, spell it, don’t get stung.',
      ready: false,
      icon: icons.spellingbee,
      tags: ['Coming soon'],
      draft: true,
      steps: [
        { title: 'The idea', text: '<p>Words are read aloud one at a time. The team whose turn it is must spell the word out letter by letter.</p>' },
        { title: 'Taking turns', text: '<p>Teams take turns in order. The host may give the definition and use the word in a sentence if asked.</p>' },
        { title: 'Scoring', text: '<p>A correctly spelled word earns a point. Words get harder as the game goes on.</p>' },
        { title: 'Winning', text: '<p>The team with the most points when the word list runs out wins.</p>' },
      ],
    },

    bigfatquiz: {
      id: 'bigfatquiz',
      name: 'Big Fat Quiz of Everything',
      tagline: 'Rounds of general knowledge and banter.',
      ready: false,
      icon: icons.bigfatquiz,
      tags: ['Coming soon'],
      draft: true,
      steps: [
        { title: 'The idea', text: '<p>Teams answer rounds of general-knowledge questions on every topic going.</p>' },
        { title: 'Answering', text: '<p>The host reads each question aloud and teams write down their answers before the reveal.</p>' },
        { title: 'Scoring', text: '<p>Each correct answer earns points. The host marks each round before moving on.</p>' },
        { title: 'Winning', text: '<p>The team with the highest total after the final round is crowned champion.</p>' },
      ],
    },

    taskmaster: {
      id: 'taskmaster',
      name: 'Taskmaster',
      tagline: 'Ridiculous tasks, harsh judging.',
      ready: false,
      icon: icons.taskmaster,
      tags: ['Coming soon'],
      draft: true,
      steps: [
        { title: 'The idea', text: '<p>Teams are set silly tasks that have to be completed under strict rules.</p>' },
        { title: 'Doing the tasks', text: '<p>The Taskmaster reads each task. Teams complete it within the time limit, and the Taskmaster decides what counts.</p>' },
        { title: 'Scoring', text: '<p>After each task the Taskmaster ranks the attempts and awards points, with the best attempt scoring the most.</p>' },
        { title: 'Winning', text: '<p>The team with the most points at the end takes the trophy.</p>' },
      ],
    },
  };

  GN.GAMES = GAMES;
  GN.GAME_ORDER = ['spellingbee', 'bigfatquiz', 'countdown', 'taskmaster'];
})();
