'use strict';

const J_BARON = 126;
const J_MIME = 14;
const J_BLUEPRINT = 30;
const J_BRAINSTORM = 77;

const ED_NONE = 0;
const ED_POLYCHROME = 3;

const EH_NONE = 0;
const EH_STEEL = 5;
const EH_GOLD = 7;

const SEAL_NONE_LOCAL = 0;
const SEAL_RED_LOCAL = 2;
const SEAL_BLUE_LOCAL = 3;

const HIGH_CARD_INDEX = 11;

const JOKER_DEFS = [
  { key: 'baron',      name: 'Baron',      id: J_BARON },
  { key: 'mime',       name: 'Mime',       id: J_MIME },
  { key: 'blueprint',  name: 'Blueprint',  id: J_BLUEPRINT },
  { key: 'brainstorm', name: 'Brainstorm', id: J_BRAINSTORM },
];

const CARD_DEFS = [
  { key: 'steelRedKing',   label: 'Steel + Red Seal Kings',       rank: 11, enh: EH_STEEL, seal: SEAL_RED_LOCAL,  swatches: ['steel', 'redseal'] },
  { key: 'goldRedKing',    label: 'Gold + Red Seal Kings',        rank: 11, enh: EH_GOLD,  seal: SEAL_RED_LOCAL,  swatches: ['gold', 'redseal'] },
  { key: 'plainKing',      label: 'Plain Kings',                  rank: 11, enh: EH_NONE,  seal: SEAL_NONE_LOCAL, swatches: ['plain'] },
  { key: 'steelRedOther',  label: 'Steel + Red Seal (non-King)',  rank: 8,  enh: EH_STEEL, seal: SEAL_RED_LOCAL,  swatches: ['steel', 'redseal'] },
  { key: 'plainSteel',     label: 'Plain Steel (non-King)',       rank: 8,  enh: EH_STEEL, seal: SEAL_NONE_LOCAL, swatches: ['steel'] },
  { key: 'goldBlueSeal',   label: 'Gold + Blue Seal (planets)',   rank: 8,  enh: EH_GOLD,  seal: SEAL_BLUE_LOCAL, swatches: ['gold', 'blueseal'] },
  { key: 'filler',         label: 'Other filler cards',           rank: 8,  enh: EH_NONE,  seal: SEAL_NONE_LOCAL, swatches: ['plain'] },
];

const state = {
  plasma: true,
  optimizeJokers: true,
  highCardLevel: 200,
  handSize: 10,
  jokers: {
    baron:      { count: 1, poly: 0 },
    mime:       { count: 1, poly: 0 },
    blueprint:  { count: 1, poly: 0 },
    brainstorm: { count: 1, poly: 0 },
  },
  cards: {
    steelRedKing:  5,
    goldRedKing:   0,
    plainKing:     0,
    steelRedOther: 0,
    plainSteel:    0,
    goldBlueSeal:  0,
    filler:        0,
  }
};

const PLAY_CARD = [0 /*RANK = 2*/, 0 /*SUIT = HEARTS*/, ED_NONE, EH_NONE, SEAL_NONE_LOCAL, 0, false, 9999, 0];

function clampInt(n, min, max) {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n)) n = min;
  if (n < min) n = min;
  if (max !== undefined && n > max) n = max;
  return n;
}

function buildCardsInHand() {
  const cards = [];
  let id = 0;
  for (const def of CARD_DEFS) {
    const n = state.cards[def.key] | 0;
    for (let i = 0; i < n; i++) {
      cards.push([def.rank, 0 /*SUIT*/, ED_NONE, def.enh, def.seal, 0, false, id++, 0]);
    }
  }
  return cards;
}

function buildJokerList() {
  const list = [];
  let id = 0;
  for (const def of JOKER_DEFS) {
    const j = state.jokers[def.key];
    if (!j) continue;
    const total = j.count | 0;
    const poly = Math.min(j.poly | 0, total);
    const plain = total - poly;
    for (let i = 0; i < poly; i++) {
      list.push([def.id, 0 /*VALUE*/, ED_POLYCHROME, false, 0, id++]);
    }
    for (let i = 0; i < plain; i++) {
      list.push([def.id, 0, ED_NONE, false, 0, id++]);
    }
  }
  return list;
}

function buildHandsData(level) {
  const hands = [];
  for (let i = 0; i < 12; i++) hands.push([1, 0, 0, 0]);
  hands[HIGH_CARD_INDEX] = [level, 0, 0, 0];
  return hands;
}

function permutationsOf(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutationsOf(rest)) {
      out.push([arr[i], ...p]);
    }
  }
  return out;
}

function dedupeByKey(perms, keyFn) {
  const seen = new Set();
  const out = [];
  for (const p of perms) {
    const k = keyFn(p);
    if (!seen.has(k)) { seen.add(k); out.push(p); }
  }
  return out;
}

function scoreOnce(jokers) {
  const cardsInHand = buildCardsInHand().map(c => c.slice());
  const playedCards = [PLAY_CARD.slice()];
  const hands = buildHandsData(state.highCardLevel);

  const h = new Hand({
    hands,
    PlasmaDeck: state.plasma,
    TheFlint: false, TheEye: false, Observatory: false
  });

  h.cards = playedCards;
  h.cardsInHand = cardsInHand;
  h.actualCardsInHand = [];
  h.jokers = jokers.map(j => j.slice());

  h.compileJokers();
  h.compileJokerOrder();
  h.compileCards();
  return h.simulateBestHand();
}

function isBetter(a, b) {
  if (!b) return true;
  if (a[1] > b[1]) return true;
  if (a[1] === b[1] && a[0] > b[0]) return true;
  return false;
}

function compute() {
  const baseJokers = buildJokerList();
  let bestScore = null;
  let bestOrder = baseJokers;

  const cardsInHand = buildCardsInHand();
  const totalInHand = cardsInHand.length;
  updateFillHint(totalInHand);

  if (baseJokers.length === 0) {
    const score = scoreOnce([]);
    showScore(score, []);
    return;
  }

  if (!state.optimizeJokers) {
    const score = scoreOnce(baseJokers);
    showScore(score, baseJokers);
    return;
  }

  const perms = dedupeByKey(
    permutationsOf(baseJokers),
    p => p.map(j => `${j[0]}-${j[2]}`).join('|')
  );

  for (const p of perms) {
    const s = scoreOnce(p);
    if (isBetter(s, bestScore)) {
      bestScore = s;
      bestOrder = p;
    }
  }

  showScore(bestScore, bestOrder);
}

function bigNumStr(num) {
  if (!num) return '0';
  const mantissa = num[0];
  const exp = num[1];
  if (exp > 11) {
    return `${(Math.floor(mantissa * 10000) / 10000).toString()}e${exp}`;
  }
  const x = mantissa * Math.pow(10, exp);
  if (Math.abs(x) < 1e11) {
    return Math.floor(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  return `${Math.floor(mantissa * 10000) / 10000}e${exp}`;
}

function simpleNumStr(num) {
  if (typeof num === 'object') return bigNumStr(num);
  if (num < 1e11) {
    return Math.floor(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  return num.toExponential(4);
}

function jokerNameForId(id) {
  for (const d of JOKER_DEFS) if (d.id === id) return d.name;
  return `#${id}`;
}

function showScore(score, order) {
  const scoreEl = document.getElementById('bestPlayScore');
  const nameEl  = document.getElementById('bestPlayName');
  const chipsEl = document.getElementById('scoreChips');
  const multEl  = document.getElementById('scoreMult');
  const orderEl = document.getElementById('bestOrder');

  if (!score) {
    scoreEl.innerHTML = '<span class="chipIcon"></span>0';
    nameEl.innerHTML = `High Card<span class="nameLvl"> lvl.${state.highCardLevel}</span>`;
    chipsEl.innerText = '0';
    multEl.innerText  = '0';
    orderEl.innerHTML = '';
    return;
  }

  const [m, e, chips, mult] = score;
  scoreEl.innerHTML = `<span class="chipIcon"></span>${bigNumStr([m, e])}`;
  nameEl.innerHTML  = `High Card<span class="nameLvl"> lvl.${state.highCardLevel}</span>`;
  chipsEl.innerText = simpleNumStr(chips);
  multEl.innerText  = bigNumStr(mult);

  if (!order || order.length === 0) {
    orderEl.innerHTML = '<em>No jokers</em>';
    return;
  }

  const chips_ = order.map(j => {
    const name = jokerNameForId(j[0]);
    const isPoly = j[2] === ED_POLYCHROME;
    return `<span class="jokerChip${isPoly ? ' poly' : ''}">${name}${isPoly ? ' (poly)' : ''}</span>`;
  }).join(' &rarr; ');
  orderEl.innerHTML = `Best joker order: ${chips_}`;
}

function updateFillHint(total) {
  const hint = document.getElementById('handFillHint');
  const playable = total + 1;
  if (state.handSize < playable) {
    hint.innerHTML = `<span style="color: #fda200">Warning: you've specified ${total} cards in hand + 1 played card = ${playable}, but hand size is only ${state.handSize}.</span>`;
  } else {
    hint.innerHTML = `${total} cards held in hand, plus 1 played &mdash; hand size ${state.handSize}.`;
  }
}

function renderJokerGrid() {
  const grid = document.getElementById('jokerGrid');
  grid.innerHTML = '';
  for (const def of JOKER_DEFS) {
    const row = document.createElement('div');
    row.className = 'jokerRow';
    row.innerHTML = `
      <span class="jokerName">${def.name}</span>
      <div class="numberControl">
        <span class="lvlBtn" data-action="dec" data-key="${def.key}" data-field="count">-</span>
        <span class="handLvl" contenteditable="true" data-key="${def.key}" data-field="count">${state.jokers[def.key].count}</span>
        <span class="lvlBtn" data-action="inc" data-key="${def.key}" data-field="count">+</span>
      </div>
      <span class="polyToggle" data-toggle="poly" data-key="${def.key}">
        <span class="lvlBtn">${state.jokers[def.key].poly > 0 ? state.jokers[def.key].poly : '&nbsp;'}</span>
        Polychrome
      </span>
    `;
    grid.appendChild(row);
  }
}

function renderCardGrid() {
  const grid = document.getElementById('cardGrid');
  grid.innerHTML = '';
  for (const def of CARD_DEFS) {
    const row = document.createElement('div');
    row.className = 'cardRow';
    const swatches = (def.swatches || []).map(s => `<span class="cardSwatch swatch-${s}"></span>`).join('');
    row.innerHTML = `
      <span class="cardName">${swatches}${def.label}</span>
      <div class="numberControl">
        <span class="lvlBtn" data-action="dec" data-key="${def.key}" data-field="cards">-</span>
        <span class="handLvl" contenteditable="true" data-key="${def.key}" data-field="cards">${state.cards[def.key]}</span>
        <span class="lvlBtn" data-action="inc" data-key="${def.key}" data-field="cards">+</span>
      </div>
    `;
    grid.appendChild(row);
  }
}

function renderToggles() {
  document.getElementById('togglePlasmaBtn').innerHTML = state.plasma ? 'X' : '&nbsp;';
  document.getElementById('toggleOptimizeBtn').innerHTML = state.optimizeJokers ? 'X' : '&nbsp;';
}

function syncPolyButton(key) {
  const grid = document.getElementById('jokerGrid');
  const wrapper = grid.querySelector(`.polyToggle[data-key="${key}"]`);
  if (!wrapper) return;
  const btn = wrapper.querySelector('.lvlBtn');
  const count = state.jokers[key].poly;
  btn.innerHTML = count > 0 ? String(count) : '&nbsp;';
  wrapper.classList.toggle('polyActive', count > 0);
}

function updateJokerCountDisplay(key) {
  const el = document.querySelector(`.jokerRow .handLvl[data-key="${key}"][data-field="count"]`);
  if (el && document.activeElement !== el) el.innerText = state.jokers[key].count;
}

function updateCardCountDisplay(key) {
  const el = document.querySelector(`.cardRow .handLvl[data-key="${key}"][data-field="cards"]`);
  if (el && document.activeElement !== el) el.innerText = state.cards[key];
}

function readEditableValue(el) {
  const txt = el.innerText.trim();
  if (txt === '' || isNaN(Number(txt))) return null;
  return Math.floor(Number(txt));
}

function bindEvents() {
  const root = document.getElementById('naninfMain');

  root.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    if (t.id === 'togglePlasmaBtn' || t.closest('.toggle-item')?.querySelector('#togglePlasmaBtn')) {
      state.plasma = !state.plasma;
      renderToggles();
      compute();
      return;
    }
    if (t.id === 'toggleOptimizeBtn' || t.closest('.toggle-item')?.querySelector('#toggleOptimizeBtn')) {
      state.optimizeJokers = !state.optimizeJokers;
      renderToggles();
      compute();
      return;
    }

    if (t.classList.contains('lvlBtn') && t.hasAttribute('data-action')) {
      const key = t.getAttribute('data-key');
      const field = t.getAttribute('data-field');
      const dir = t.getAttribute('data-action') === 'inc' ? 1 : -1;
      if (field === 'count') {
        state.jokers[key].count = clampInt(state.jokers[key].count + dir, 0, 30);
        if (state.jokers[key].poly > state.jokers[key].count) state.jokers[key].poly = state.jokers[key].count;
        updateJokerCountDisplay(key);
        syncPolyButton(key);
        compute();
      } else if (field === 'cards') {
        state.cards[key] = clampInt(state.cards[key] + dir, 0, 100);
        updateCardCountDisplay(key);
        compute();
      }
      return;
    }

    if (t.classList.contains('lvlBtn') && t.hasAttribute('data-step')) {
      const wrapper = t.closest('.numberControl');
      const field = wrapper.getAttribute('data-input');
      const step = Number(t.getAttribute('data-step'));
      if (field === 'highCardLevel') {
        state.highCardLevel = clampInt(state.highCardLevel + step, 1, 100000);
        wrapper.querySelector('[data-field="highCardLevel"]').innerText = state.highCardLevel;
      } else if (field === 'handSize') {
        state.handSize = clampInt(state.handSize + step, 1, 100);
        wrapper.querySelector('[data-field="handSize"]').innerText = state.handSize;
      }
      compute();
      return;
    }

    const polyToggle = t.closest('.polyToggle');
    if (polyToggle) {
      const key = polyToggle.getAttribute('data-key');
      const j = state.jokers[key];
      j.poly = j.poly >= j.count ? 0 : j.poly + 1;
      syncPolyButton(key);
      compute();
      return;
    }
  });

  root.addEventListener('input', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (!t.hasAttribute('contenteditable') || t.getAttribute('contenteditable') !== 'true') return;

    const field = t.getAttribute('data-field');
    if (!field) return;

    const key = t.getAttribute('data-key');
    const v = readEditableValue(t);
    if (v === null) return;

    if (field === 'count' && key) {
      state.jokers[key].count = clampInt(v, 0, 30);
      if (state.jokers[key].poly > state.jokers[key].count) {
        state.jokers[key].poly = state.jokers[key].count;
        syncPolyButton(key);
      }
    } else if (field === 'cards' && key) {
      state.cards[key] = clampInt(v, 0, 100);
    } else if (field === 'highCardLevel') {
      state.highCardLevel = clampInt(v, 1, 100000);
    } else if (field === 'handSize') {
      state.handSize = clampInt(v, 1, 100);
    }
    compute();
  });

  root.addEventListener('wheel', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (!t.hasAttribute('contenteditable') || t.getAttribute('contenteditable') !== 'true') return;
    e.preventDefault();
    const field = t.getAttribute('data-field');
    const key = t.getAttribute('data-key');
    const dir = e.deltaY < 0 ? 1 : -1;
    if (field === 'count' && key) {
      state.jokers[key].count = clampInt(state.jokers[key].count + dir, 0, 30);
      if (state.jokers[key].poly > state.jokers[key].count) state.jokers[key].poly = state.jokers[key].count;
      updateJokerCountDisplay(key);
      syncPolyButton(key);
    } else if (field === 'cards' && key) {
      state.cards[key] = clampInt(state.cards[key] + dir, 0, 100);
      updateCardCountDisplay(key);
    } else if (field === 'highCardLevel') {
      state.highCardLevel = clampInt(state.highCardLevel + dir, 1, 100000);
      t.innerText = state.highCardLevel;
    } else if (field === 'handSize') {
      state.handSize = clampInt(state.handSize + dir, 1, 100);
      t.innerText = state.handSize;
    }
    compute();
  }, { passive: false });
}

function init() {
  renderJokerGrid();
  renderCardGrid();
  renderToggles();
  bindEvents();
  compute();
}

init();
