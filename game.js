// Pulls real clues from j-archive.com via a CORS proxy and shows them
// one at a time. Random Next pulls from a new show each click; Next in
// Category advances within the current episode's category.

const PROXIES = [
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

// J-Archive has ~9000+ games; safe range avoids unreleased IDs.
const MAX_GAME_ID = 8500;

// Topics map J-Archive's countless unique category names to broad themes
// via keyword matching against tokenized category strings.
const TOPICS = {
  all: { label: 'All Topics', keywords: null },
  history: {
    label: 'History',
    keywords: [
      'history', 'historical', 'war', 'wars', 'century', 'ancient', 'medieval',
      'dynasty', 'dynasties', 'empire', 'empires', 'revolution', 'battle', 'battles',
      'kings', 'queens', 'presidents', 'monarchs', 'rulers', 'civil war',
      'world war', 'rome', 'roman', 'romans', 'greek', 'greeks', 'colonial',
      'byzantine', 'pharaohs', '1800s', '1900s', '19th', '20th', '18th', '17th', '16th',
      'founding fathers', 'historic'
    ]
  },
  science: {
    label: 'Science',
    keywords: [
      'science', 'sciences', 'biology', 'chemistry', 'physics', 'anatomy',
      'the body', 'computer', 'computers', 'computing', 'technology',
      'tech', 'scientists', 'inventions', 'invention', 'astronomy', 'space',
      'planet', 'planets', 'elements', 'periodic', 'atoms', 'molecules',
      'medicine', 'medical', 'weather', 'animal', 'animals', 'botany',
      'plants', 'the brain', 'evolution', 'genetics', 'dna', 'cells',
      'ecology', 'environment', 'dinosaurs', 'nature', 'engineering'
    ]
  },
  math: {
    label: 'Math',
    keywords: [
      'math', 'maths', 'mathematics', 'mathematical', 'numbers', 'number',
      'arithmetic', 'geometry', 'geometric', 'algebra', 'algebraic',
      'calculus', 'equations', 'equation', 'statistics', 'percentages',
      'percent', 'fractions', 'fraction', 'addition', 'subtraction',
      'multiplication', 'division', 'do the math', 'by the numbers'
    ]
  },
  literature: {
    label: 'Literature',
    keywords: [
      'literature', 'literary', 'authors', 'author', 'books', 'novels',
      'poetry', 'poets', 'poem', 'poems', 'writers', 'novelists', 'shakespeare',
      'the bard', 'fiction', 'nonfiction', 'plays', 'playwright', 'playwrights',
      'best seller', 'bestseller', 'bestsellers', 'classics', 'characters'
    ]
  },
  geography: {
    label: 'Geography',
    keywords: [
      'geography', 'capitals', 'capital', 'countries', 'country', 'cities',
      'city', 'states', 'state', 'rivers', 'river', 'mountains', 'mountain',
      'lakes', 'lake', 'islands', 'island', 'oceans', 'ocean', 'continents',
      'continent', 'europe', 'european', 'asia', 'asian', 'africa', 'african',
      'south america', 'north america', 'australia', 'antarctica', 'maps',
      'map', 'travel', 'nations', 'nation', 'borders'
    ]
  },
  sports: {
    label: 'Sports',
    keywords: [
      'sport', 'sports', 'baseball', 'football', 'basketball', 'tennis',
      'olympic', 'olympics', 'hockey', 'golf', 'boxing', 'soccer',
      'athletes', 'athlete', 'nfl', 'mlb', 'nba', 'nhl', 'champions',
      'world cup', 'super bowl', 'wimbledon', 'wrestling', 'racing',
      'coaches', 'players', 'teams', 'stadiums'
    ]
  },
  moviesTv: {
    label: 'Movies & TV',
    keywords: [
      'movie', 'movies', 'film', 'films', 'hollywood', 'actor', 'actors',
      'actress', 'actresses', 'tv', 'television', 'sitcom', 'sitcoms',
      'oscar', 'oscars', 'academy award', 'director', 'directors', 'cartoon',
      'cartoons', 'animated', 'silent film', 'shows', 'show', 'soap opera',
      'netflix', 'hbo', 'cinema', 'screen', 'emmy', 'emmys'
    ]
  },
  music: {
    label: 'Music',
    keywords: [
      'music', 'song', 'songs', 'singer', 'singers', 'musician', 'musicians',
      'band', 'bands', 'rock', 'pop music', 'jazz', 'classical music',
      'country music', 'opera', 'operas', 'composer', 'composers', 'musical',
      'musicals', 'broadway', 'album', 'albums', 'hit songs', 'lyrics',
      'instruments', 'instrument', 'hip hop', 'rap', 'grammy', 'grammys'
    ]
  },
  art: {
    label: 'Art',
    keywords: [
      'art', 'arts', 'artist', 'artists', 'painter', 'painters', 'painting',
      'paintings', 'sculpture', 'sculptor', 'architecture', 'museum', 'museums',
      'renaissance', 'impressionism', 'modern art', 'fine art', 'photography',
      'photographers'
    ]
  },
  food: {
    label: 'Food & Drink',
    keywords: [
      'food', 'foods', 'drink', 'drinks', 'cooking', 'wine', 'wines', 'beer',
      'beers', 'chef', 'chefs', 'cuisine', 'restaurant', 'restaurants',
      'vegetables', 'fruits', 'cocktails', 'cocktail', 'kitchen', 'recipe',
      'recipes', 'dessert', 'desserts', 'candy', 'spices', 'baking', 'dining',
      'cheese', 'meat', 'breads', 'bread', 'beverages'
    ]
  },
  wordplay: {
    label: 'Wordplay',
    keywords: [
      'words', 'word', 'vocabulary', 'spelling', 'letters', 'letter',
      'rhyme', 'rhymes', 'anagrams', 'anagram', 'puns', 'pun',
      'before after', 'compound', 'phrases', 'language', 'languages',
      'synonyms', 'idioms', 'alliteration', 'hidden words', 'wordplay',
      'crossword', 'palindrome', 'homophones', 'phrase', 'abbreviations'
    ]
  }
};

let activeTopic = 'all';

const gameQueue = [];               // gameIds ready for "Random Next"
const gamesCache = new Map();       // gameId -> { gameTitle, clues }
const seen = new Set();             // clueKey() strings of shown clues
const loadedGameIds = new Set();
const history = [];                 // clue objects in order shown
let historyIndex = -1;              // pointer into history
let currentClue = null;
let isLoading = false;
let seenCount = 0;
let answerRevealed = false;

// ============ HELPERS ============
const el = id => document.getElementById(id);

function clueKey(c) {
  return `${c.gameId}::${c.id || c.clue.slice(0, 40)}`;
}

function parseValueNumber(v) {
  if (!v) return 9999;
  const m = v.match(/[\d,]+/);
  return m ? parseInt(m[0].replace(/,/g, ''), 10) : 9999;
}

function tokenize(s) {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function categoryMatchesTopic(category, topicKey) {
  if (topicKey === 'all') return true;
  const topic = TOPICS[topicKey];
  if (!topic || !topic.keywords) return true;
  const catTokens = tokenize(category);
  const catJoined = catTokens.join(' ');
  return topic.keywords.some(kw => {
    const kwTokens = tokenize(kw);
    if (kwTokens.length === 1) return catTokens.includes(kwTokens[0]);
    return catJoined.includes(kwTokens.join(' '));
  });
}

// ============ RENDERING ============
function setLoading(message) {
  const txt = el('clue-text');
  txt.classList.add('loading');
  txt.textContent = message;
  el('round-tag').textContent = 'Loading';
  el('category-tag').textContent = '';
  el('value-tag').textContent = '';
  el('source').textContent = '';
  el('answer-box').classList.add('hidden');
  el('reveal-btn').disabled = true;
  el('next-btn').disabled = true;
  el('category-next-btn').disabled = true;
  el('back-btn').disabled = historyIndex <= 0;
}

// Show a clue and record it in history.
function showClue(c) {
  // Drop any forward history (no forward button, but keeps invariant clean)
  history.length = historyIndex + 1;
  history.push(c);
  historyIndex = history.length - 1;
  renderClue(c);
}

// Render without touching history (used by back/forward navigation).
function renderClue(c) {
  currentClue = c;
  const key = clueKey(c);
  if (!seen.has(key)) {
    seen.add(key);
    seenCount += 1;
  }

  const txt = el('clue-text');
  txt.classList.remove('loading');
  txt.textContent = c.clue;

  el('round-tag').textContent = c.round;
  el('category-tag').textContent = c.category;
  el('value-tag').textContent = c.value || '';

  el('answer-text').textContent = c.answer;
  hideAnswer();
  el('reveal-btn').disabled = false;
  el('next-btn').disabled = false;

  el('source').innerHTML = c.gameId
    ? `From <a href="https://j-archive.com/showgame.php?game_id=${c.gameId}" target="_blank" rel="noopener">${c.gameTitle || `Game #${c.gameId}`}</a>`
    : '';

  el('counter').textContent = `Clue ${seenCount}`;
  updateCategoryButton();
  updateBackButton();
}

function updateBackButton() {
  el('back-btn').disabled = historyIndex <= 0;
}

function updateCategoryButton() {
  const btn = el('category-next-btn');
  if (!currentClue) {
    btn.disabled = true;
    btn.textContent = 'Next in Category';
    return;
  }
  const remaining = remainingInCategory();
  if (remaining.length === 0) {
    btn.disabled = true;
    btn.textContent = 'Category exhausted';
  } else {
    btn.disabled = false;
    btn.textContent = `Next in Category (${remaining.length})`;
  }
}

function goBack() {
  if (historyIndex <= 0) return;
  historyIndex -= 1;
  renderClue(history[historyIndex]);
}

function remainingInCategory() {
  if (!currentClue) return [];
  const game = gamesCache.get(currentClue.gameId);
  if (!game) return [];
  return game.clues
    .filter(c => c.category === currentClue.category && !seen.has(clueKey(c)))
    .sort((a, b) => parseValueNumber(a.value) - parseValueNumber(b.value));
}

function showAnswer() {
  answerRevealed = true;
  el('answer-box').classList.remove('hidden');
  el('reveal-btn').textContent = 'Hide Answer';
}

function hideAnswer() {
  answerRevealed = false;
  el('answer-box').classList.add('hidden');
  el('reveal-btn').textContent = 'Show Answer';
}

function toggleAnswer() {
  if (answerRevealed) hideAnswer();
  else showAnswer();
}

// ============ NETWORK ============
async function fetchWithProxy(targetUrl) {
  let lastErr;
  for (const proxify of PROXIES) {
    try {
      const res = await fetch(proxify(targetUrl), { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text && text.length > 1000) return text;
      throw new Error('Empty response');
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('All proxies failed');
}

// ============ PARSER ============
function parseGame(html, gameId) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const titleEl = doc.querySelector('#game_title h1') || doc.querySelector('#game_title') || doc.querySelector('title');
  const gameTitle = titleEl ? titleEl.textContent.trim() : `Game #${gameId}`;

  const clues = [];

  function extractRound(roundDivId, roundName) {
    const roundDiv = doc.getElementById(roundDivId);
    if (!roundDiv) return;
    const categoryEls = roundDiv.querySelectorAll('td.category_name');
    const categories = Array.from(categoryEls).map(e => e.textContent.trim());

    const clueCells = roundDiv.querySelectorAll('td.clue_text');
    clueCells.forEach(cell => {
      const id = cell.id || '';
      if (!id || id.endsWith('_r')) return;
      const parts = id.split('_');
      if (parts.length < 4) return;
      const col = parseInt(parts[2], 10) - 1;
      const clueText = cell.textContent.trim();
      if (!clueText) return;

      const answerCell = doc.getElementById(id + '_r');
      let answer = '';
      if (answerCell) {
        const r = answerCell.querySelector('em.correct_response');
        if (r) answer = r.textContent.trim();
      }
      if (!answer) {
        const div = cell.closest('td')?.parentElement?.parentElement;
        const handler = div?.getAttribute?.('onmouseover');
        if (handler) {
          const m = handler.match(/correct_response[^>]*>([^<]+)</);
          if (m) answer = m[1].trim();
        }
      }
      if (!answer) return;

      const clueTd = cell.closest('td.clue');
      let value = '';
      if (clueTd) {
        const v = clueTd.querySelector('td.clue_value, td.clue_value_daily_double');
        if (v) value = v.textContent.trim();
      }

      clues.push({
        id,
        category: categories[col] || 'UNKNOWN',
        value,
        round: roundName,
        clue: clueText,
        answer,
        gameId,
        gameTitle,
      });
    });
  }

  extractRound('jeopardy_round', 'Jeopardy!');
  extractRound('double_jeopardy_round', 'Double Jeopardy!');

  const fjDiv = doc.getElementById('final_jeopardy_round');
  if (fjDiv) {
    const fjCat = fjDiv.querySelector('td.category_name');
    const fjClueEl = doc.getElementById('clue_FJ');
    const fjAnswerEl = doc.getElementById('clue_FJ_r')?.querySelector('em.correct_response');
    if (fjCat && fjClueEl && fjAnswerEl) {
      clues.push({
        id: 'clue_FJ',
        category: fjCat.textContent.trim(),
        value: '',
        round: 'Final Jeopardy!',
        clue: fjClueEl.textContent.trim(),
        answer: fjAnswerEl.textContent.trim(),
        gameId,
        gameTitle,
      });
    }
  }

  return { gameTitle, clues };
}

// ============ QUEUE MANAGEMENT ============
async function loadMoreGames() {
  if (isLoading) return;
  isLoading = true;
  try {
    for (let attempt = 0; attempt < 8 && gameQueue.length < 4; attempt++) {
      let gameId;
      do {
        gameId = 1 + Math.floor(Math.random() * MAX_GAME_ID);
      } while (loadedGameIds.has(gameId));
      loadedGameIds.add(gameId);

      try {
        const html = await fetchWithProxy(`https://j-archive.com/showgame.php?game_id=${gameId}`);
        const { gameTitle, clues } = parseGame(html, gameId);
        if (clues.length > 0) {
          gamesCache.set(gameId, { gameTitle, clues });
          gameQueue.push(gameId);
        }
      } catch (e) {
        console.warn(`Game ${gameId} failed:`, e.message);
      }
    }
  } finally {
    isLoading = false;
  }
}

async function nextRandomClue(fetchAttempts = 0) {
  // Pull from a fresh game each click. Filter by active topic; skip games
  // with no matching unseen clues.
  while (gameQueue.length > 0) {
    const gameId = gameQueue.shift();
    const game = gamesCache.get(gameId);
    if (!game) continue;
    const candidates = game.clues.filter(c =>
      !seen.has(clueKey(c)) && categoryMatchesTopic(c.category, activeTopic)
    );
    if (candidates.length === 0) continue;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    showClue(pick);
    if (gameQueue.length < 2) loadMoreGames(); // background prefetch
    return;
  }

  // Cap attempts so niche topics don't loop forever.
  if (fetchAttempts >= 5) {
    el('clue-text').textContent = activeTopic === 'all'
      ? "Couldn't reach the J!Archive. Try refreshing — the CORS proxies may be rate-limited."
      : `Couldn't find a "${TOPICS[activeTopic].label}" clue in the games we tried. Pick another topic or try again.`;
    el('clue-text').classList.remove('loading');
    el('reveal-btn').disabled = true;
    el('next-btn').disabled = false;
    return;
  }

  setLoading(activeTopic === 'all'
    ? 'Fetching a new game from the J!Archive…'
    : `Searching for "${TOPICS[activeTopic].label}" clues…`);
  await loadMoreGames();
  return nextRandomClue(fetchAttempts + 1);
}

function nextInCategory() {
  const remaining = remainingInCategory();
  if (remaining.length === 0) return;
  showClue(remaining[0]);
}

function setActiveTopic(topicKey) {
  if (!TOPICS[topicKey] || topicKey === activeTopic) return;
  activeTopic = topicKey;
  document.querySelectorAll('.topic-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.topic === topicKey);
  });
  nextRandomClue();
}

// ============ EVENTS ============
document.addEventListener('DOMContentLoaded', () => {
  el('reveal-btn').addEventListener('click', toggleAnswer);
  el('next-btn').addEventListener('click', () => nextRandomClue());
  el('category-next-btn').addEventListener('click', nextInCategory);
  el('back-btn').addEventListener('click', goBack);
  document.querySelectorAll('.topic-chip').forEach(chip => {
    chip.addEventListener('click', () => setActiveTopic(chip.dataset.topic));
  });
  nextRandomClue();
});
