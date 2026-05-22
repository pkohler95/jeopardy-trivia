// Pulls real clues from j-archive.com via a CORS proxy and shows them
// one at a time. No score, no board — just clue → reveal → next.

const PROXIES = [
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

// J-Archive game IDs have grown over the years. ~9000+ exist; we pick from a
// safe range to avoid hitting unreleased/empty IDs.
const MAX_GAME_ID = 8500;

const queue = [];
let seenCount = 0;
let currentClue = null;
let isLoading = false;
const loadedGameIds = new Set();

// ============ DOM HELPERS ============
const el = id => document.getElementById(id);

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
}

function renderClue(c) {
  currentClue = c;
  const txt = el('clue-text');
  txt.classList.remove('loading');
  txt.textContent = c.clue;

  el('round-tag').textContent = c.round;
  el('category-tag').textContent = c.category;
  el('value-tag').textContent = c.value || '';

  el('answer-text').textContent = c.answer;
  el('answer-box').classList.add('hidden');

  el('source').innerHTML = c.gameId
    ? `From <a href="https://j-archive.com/showgame.php?game_id=${c.gameId}" target="_blank" rel="noopener">${c.gameTitle || `Game #${c.gameId}`}</a>`
    : '';

  el('reveal-btn').disabled = false;
  el('next-btn').disabled = false;
  el('reveal-btn').textContent = 'Show Answer';
  seenCount += 1;
  el('counter').textContent = `Clue ${seenCount}`;
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
      // id format: clue_J_<col>_<row> or clue_DJ_<col>_<row>
      const parts = id.split('_');
      if (parts.length < 4) return;
      const col = parseInt(parts[2], 10) - 1;
      const clueText = cell.textContent.trim();
      if (!clueText) return;

      // Find the matching answer cell
      const answerCell = doc.getElementById(id + '_r');
      let answer = '';
      if (answerCell) {
        const r = answerCell.querySelector('em.correct_response');
        if (r) answer = r.textContent.trim();
      }
      // Fallback: look in onmouseover attribute of any ancestor div
      if (!answer) {
        const div = cell.closest('td')?.parentElement?.parentElement;
        const handler = div?.getAttribute?.('onmouseover');
        if (handler) {
          const m = handler.match(/correct_response[^>]*>([^<]+)</);
          if (m) answer = m[1].trim();
        }
      }
      if (!answer) return;

      // Find dollar value
      const clueTd = cell.closest('td.clue');
      let value = '';
      if (clueTd) {
        const v = clueTd.querySelector('td.clue_value, td.clue_value_daily_double');
        if (v) value = v.textContent.trim();
      }

      clues.push({
        category: categories[col] || 'UNKNOWN',
        value,
        round: roundName,
        clue: clueText,
        answer,
        gameId,
        gameTitle
      });
    });
  }

  extractRound('jeopardy_round', 'Jeopardy!');
  extractRound('double_jeopardy_round', 'Double Jeopardy!');

  // Final Jeopardy
  const fjDiv = doc.getElementById('final_jeopardy_round');
  if (fjDiv) {
    const fjCat = fjDiv.querySelector('td.category_name');
    const fjClueEl = doc.getElementById('clue_FJ');
    const fjAnswerEl = doc.getElementById('clue_FJ_r')?.querySelector('em.correct_response');
    if (fjCat && fjClueEl && fjAnswerEl) {
      clues.push({
        category: fjCat.textContent.trim(),
        value: '',
        round: 'Final Jeopardy!',
        clue: fjClueEl.textContent.trim(),
        answer: fjAnswerEl.textContent.trim(),
        gameId,
        gameTitle
      });
    }
  }

  return { gameTitle, clues };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============ QUEUE MANAGEMENT ============
async function loadMoreClues() {
  if (isLoading) return;
  isLoading = true;
  try {
    for (let attempt = 0; attempt < 6 && queue.length < 8; attempt++) {
      let gameId;
      do {
        gameId = 1 + Math.floor(Math.random() * MAX_GAME_ID);
      } while (loadedGameIds.has(gameId));
      loadedGameIds.add(gameId);

      try {
        const html = await fetchWithProxy(`https://j-archive.com/showgame.php?game_id=${gameId}`);
        const { clues } = parseGame(html, gameId);
        if (clues.length > 0) {
          queue.push(...shuffle(clues));
        }
      } catch (e) {
        console.warn(`Game ${gameId} failed:`, e.message);
      }
    }
  } finally {
    isLoading = false;
  }
}

async function nextClue() {
  if (queue.length === 0) {
    setLoading('Fetching a random game from the J!Archive…');
    await loadMoreClues();
  }
  if (queue.length === 0) {
    el('clue-text').textContent = "Couldn't reach the J!Archive. Try refreshing — the CORS proxies may be rate-limited.";
    el('clue-text').classList.remove('loading');
    return;
  }
  renderClue(queue.shift());

  // Background refill so the next click is instant
  if (queue.length < 4) loadMoreClues();
}

// ============ EVENTS ============
document.addEventListener('DOMContentLoaded', () => {
  el('reveal-btn').addEventListener('click', () => {
    el('answer-box').classList.remove('hidden');
    el('reveal-btn').disabled = true;
  });

  el('next-btn').addEventListener('click', () => {
    nextClue();
  });

  nextClue();
});
