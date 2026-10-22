import { OFFICIAL_STAGES, TEAM_SLOTS, riderNumber, randomName, PRIME_POINTS } from './data.js';
import { derive, validate, availableCards, startOrder, shuffle, finishTime, fmtTime, fmtGap } from './rules.js';
import { LocalStore, CloudStore, newId } from './store.js';

const $app = document.getElementById('app');
const ui = {
  local: null, cloud: null, store: null, user: null, authReady: false, cloudFailed: false,
  route: { name: 'home' }, games: [], localGames: [],
  game: null, d: null, unsub: null, watching: null,
  sheet: null, tab: 'stage', draw: null, prepare: null, form: null, customStages: [], toast: null,
};

// ---------- Pomocné funkcie ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const team = (slot) => ui.game.teams.find((t) => t.slot === slot);
const rider = (id) => ui.d.byId.get(id);
const stageLabel = (st) => `${st.index + 1}. etapa`;
const fmtBase = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}:00`;
const isLight = (hex) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 170; };

function bib(id, { sm = false, jerseys = null } = {}) {
  const r = rider(id); if (!r) return '';
  const c = team(r.team)?.color || '#888';
  const j = jerseys ? Object.entries(jerseys).find(([, rid]) => rid === id)?.[0] : null;
  return `<span class="bib${sm ? ' sm' : ''}${isLight(c) ? ' light' : ''}" style="--c:${c}" title="${esc(r.name)}">${r.num}${j ? `<i class="jersey j-${j}" title="${jerseyName[j]}"></i>` : ''}</span>`;
}
const jerseyName = { yellow: 'žltý dres', green: 'zelený dres', polka: 'bodkovaný dres' };
const cardName = { yellow: 'Žltá karta', green: 'Zelená karta', polka: 'Bodkovaná karta' };

function toast(msg) {
  ui.toast = msg; render();
  clearTimeout(toast.t); toast.t = setTimeout(() => { ui.toast = null; render(); }, 2600);
}

function go(hash) { if (location.hash !== hash) location.hash = hash; else route(); }

// ---------- Štart a smerovanie ----------

async function boot() {
  ui.local = new LocalStore();
  ui.store = ui.local;
  const join = new URLSearchParams(location.search).get('join');
  if (join) { sessionStorage.setItem('cz:join', join); history.replaceState(null, '', location.pathname + `#/game/${join}`); }

  if (CloudStore.configured) {
    try {
      ui.cloud = new CloudStore();
      await ui.cloud.init(async (user) => {
        ui.user = user;
        ui.store = user ? ui.cloud : ui.local;
        ui.authReady = true;
        if (user) await handleJoin();
        ui.watching = null;
        route();
      });
    } catch (e) {
      console.error(e);
      ui.cloud = null; ui.cloudFailed = true; ui.authReady = true; route();
    }
  } else {
    ui.authReady = true;
  }
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function handleJoin() {
  const id = sessionStorage.getItem('cz:join');
  if (!id) return;
  sessionStorage.removeItem('cz:join');
  try { await ui.cloud.joinGame(id); location.hash = `#/game/${id}`; }
  catch (e) { console.error(e); toast('Závod sa nepodarilo otvoriť. Skontroluj odkaz.'); }
}

async function route() {
  const [, name, id] = location.hash.split('/');
  ui.sheet = null;
  if (name === 'game' && id) {
    ui.route = { name: 'game', id };
    if (ui.watching !== `${ui.store.kind}:${id}`) {
      ui.unsub?.(); ui.game = null; ui.d = null; ui.tab = 'stage'; ui.draw = null; ui.prepare = null; ui.finalSeen = false;
      ui.watching = `${ui.store.kind}:${id}`;
      ui.unsub = ui.store.watchGame(id, (g) => {
        ui.game = g; ui.d = g ? derive(g) : null;
        render();
      });
    }
  } else {
    ui.unsub?.(); ui.unsub = null; ui.watching = null; ui.game = null;
    if (name === 'new') {
      ui.route = { name: 'new' };
      ui.customStages = await safe(() => ui.store.getCustomStages(), []);
      if (!ui.form) ui.form = newForm();
    } else {
      ui.route = { name: 'home' };
      ui.localGames = ui.store.kind === 'cloud' ? await ui.local.listGames() : [];
      ui.unsub = ui.store.watchGames((games) => {
        ui.games = games;
        if (ui.route.name === 'home') render();
      });
    }
  }
  render();
}

async function safe(fn, fallback) {
  try { return await fn(); } catch (e) { console.error(e); return fallback; }
}

// ---------- Vykresľovanie ----------

function render() {
  if (!ui.authReady) { $app.innerHTML = `<div class="hero"><h1>Cyklizávod</h1><p>Načítavam…</p></div>`; return; }
  let html = '';
  if (ui.route.name === 'home') html = viewHome();
  else if (ui.route.name === 'new') html = viewNew();
  else html = viewGame();
  if (ui.sheet) html += viewSheet();
  if (ui.toast) html += `<div class="toast" role="status">${esc(ui.toast)}</div>`;
  $app.innerHTML = html;
  document.body.style.overflow = ui.sheet ? 'hidden' : '';
}

function gameLine(g) {
  const d = derive(g);
  const started = d.stages.filter((s) => s.started).length;
  const riders = d.riders.length;
  if (d.finished) {
    const w = d.latest.gc[0] && d.byId.get(d.latest.gc[0].id);
    return { meta: `${g.stages.length === 1 ? '1 etapa' : `${g.stages.length} etapy`}, víťaz ${esc(w?.name || '')}`, side: '🏆' };
  }
  return { meta: started ? `${started}. etapa z ${g.stages.length}, ${riders} jazdcov` : `Pripravený, ${riders} jazdcov`, side: `${started}/${g.stages.length}` };
}

function gamesList(list, empty) {
  if (!list.length) return `<p class="empty">${empty}</p>`;
  return `<ul class="games">${list.map((g) => {
    const l = gameLine(g);
    return `<li><a href="#/game/${g.id}"><span class="name">${esc(g.name)}</span><span class="meta">${l.meta} · ${new Date(g.updatedAt).toLocaleDateString('sk-SK')}</span><span class="side">${l.side}</span></a></li>`;
  }).join('')}</ul>`;
}

function viewHome() {
  const running = ui.games.filter((g) => !derive(g).finished);
  const done = ui.games.filter((g) => derive(g).finished);
  let account = '';
  if (ui.cloud && ui.user) {
    account = `<div class="account">${ui.user.photo ? `<img src="${esc(ui.user.photo)}" alt="">` : ''}<span class="grow">Hry sa ukladajú do účtu ${esc(ui.user.email || ui.user.name)}</span><button class="btn small" data-act="signout">Odhlásiť</button></div>`;
  } else if (ui.cloud) {
    account = `<div class="notice">Hry sa teraz ukladajú len do tohto zariadenia. Po prihlásení sa synchronizujú medzi zariadeniami a závod môžete zapisovať viacerí naraz.<div class="row" style="margin-top:10px"><button class="btn dark" data-act="signin">Prihlásiť sa cez Google</button></div></div>`;
  } else if (ui.cloudFailed) {
    account = `<div class="notice err">Pripojenie k databáze zlyhalo, hry sa ukladajú len do tohto zariadenia.</div>`;
  }
  const local = ui.localGames.length ? `<h2>V tomto zariadení</h2><p class="muted small">Hry uložené pred prihlásením. Môžeš ich presunúť do účtu.</p>${gamesListLocal()}` : '';
  return `
    <section class="hero">
      <h1>Cyklizávod</h1>
      <p>Časomiera a výsledky pre Tour de France Board Game.</p>
      ${account}
    </section>
    <div class="row" style="margin-top:20px"><a class="btn primary block" href="#/new">Nový závod</a></div>
    <h2>Rozohrané</h2>
    ${gamesList(running, 'Žiadny rozohraný závod.')}
    <h2>História</h2>
    ${gamesList(done, 'Dokončené závody sa zobrazia tu, aj s víťazmi všetkých súťaží.')}
    ${local}`;
}

function gamesListLocal() {
  return `<ul class="games">${ui.localGames.map((g) => `<li><div class="row" style="padding:10px 4px"><span class="grow"><b>${esc(g.name)}</b><br><span class="muted small">${gameLine(g).meta}</span></span><button class="btn small" data-act="upload" data-id="${g.id}">Presunúť do účtu</button></div></li>`).join('')}</ul>`;
}

// ---------- Nový závod ----------

function newForm() {
  const taken = new Set();
  return {
    name: `Závod ${new Date().toLocaleDateString('sk-SK')}`,
    stageKeys: OFFICIAL_STAGES.map((s) => s.key),
    teamSize: 6,
    teams: TEAM_SLOTS.map((t) => ({
      ...t, on: t.slot < 2,
      riders: Array.from({ length: 6 }, () => { const n = randomName(taken); taken.add(n); return n; }),
    })),
  };
}

const allStageDefs = () => [...OFFICIAL_STAGES, ...ui.customStages.map((s) => ({ ...s, custom: true }))];

function viewNew() {
  const f = ui.form;
  if (!f) return '';
  const stages = allStageDefs();
  const activeTeams = f.teams.filter((t) => t.on).length;
  const canCreate = f.stageKeys.length > 0 && activeTeams >= 2;
  return `
    <div class="top"><a class="icon-btn" href="#/" aria-label="Späť">←</a><h1>Nový závod</h1></div>
    <label class="field"><span>Názov závodu</span><input type="text" data-bind="name" value="${esc(f.name)}"></label>

    <h2>Etapy</h2>
    <p class="muted small">Ťukni na etapy v poradí, v akom sa pôjdu. Jedna etapa je jednorazový závod.</p>
    <ul class="check-list">${stages.map((s) => {
      const i = f.stageKeys.indexOf(s.key);
      return `<li>
        <button class="order-badge${i >= 0 ? ' on' : ''}" data-act="toggle-stage" data-key="${s.key}" aria-label="Vybrať etapu ${esc(s.name)}">${i >= 0 ? i + 1 : ''}</button>
        <span class="info">${esc(s.name)}<small>${fmtBase(s.baseMin)}, ${s.km ? `${s.km} km, ` : ''}${s.sprints} ${s.sprints === 1 ? 'sprint' : 'sprinty'}, ${s.mountains} ${s.mountains === 1 ? 'vrch' : 'vrchy'}</small></span>
        ${s.custom ? `<button class="btn small" data-act="edit-custom" data-key="${s.key}">Upraviť</button>` : ''}
      </li>`;
    }).join('')}</ul>
    <div class="row" style="margin-top:10px"><button class="btn small" data-act="edit-custom">Pridať vlastnú etapu</button></div>

    <h2>Tímy</h2>
    <div class="row"><span class="grow muted small">Jazdcov v tíme</span>
      <div class="seg">${[3, 4, 5, 6].map((n) => `<button class="${f.teamSize === n ? 'on' : ''}" data-act="team-size" data-n="${n}">${n}</button>`).join('')}</div>
    </div>
    ${f.teams.map((t) => `
      <div class="team-edit${t.on ? '' : ' off'}" style="--team:${t.color}">
        <div class="head">
          <input type="checkbox" ${t.on ? 'checked' : ''} data-act="team-toggle" data-slot="${t.slot}" aria-label="Hrá tím ${esc(t.name)}" style="width:22px;height:22px">
          <input type="text" data-bind="team.${t.slot}" value="${esc(t.name)}" aria-label="Názov tímu" ${t.on ? '' : 'disabled'}>
        </div>
        ${t.on ? t.riders.slice(0, f.teamSize).map((n, i) => `
          <div class="rider-edit">
            <span class="bib sm${isLight(t.color) ? ' light' : ''}" style="--c:${t.color}">${riderNumber(t.slot, i)}</span>
            <input type="text" data-bind="rider.${t.slot}.${i}" value="${esc(n)}" aria-label="Meno jazdca ${riderNumber(t.slot, i)}">
          </div>`).join('') : ''}
      </div>`).join('')}
    <div class="row" style="margin-top:14px"><button class="btn small" data-act="random-names">Vygenerovať nové mená</button></div>

    <div style="margin-top:28px">
      ${canCreate ? '' : `<p class="muted small" style="margin-bottom:8px">Vyber aspoň jednu etapu a dva tímy.</p>`}
      <button class="btn primary block" data-act="create" ${canCreate ? '' : 'disabled'}>Vytvoriť závod</button>
    </div>`;
}

// ---------- Hra ----------

function viewGame() {
  const g = ui.game, d = ui.d;
  if (!g) return `<div class="top"><a class="icon-btn" href="#/" aria-label="Späť">←</a><h1>Závod</h1></div><p class="empty">Závod sa načítava alebo neexistuje.</p>`;
  const top = `<div class="top"><a class="icon-btn" href="#/" aria-label="Domov">←</a><h1>${esc(g.name)}</h1>${ui.store.kind === 'cloud' ? `<button class="icon-btn" data-act="invite" aria-label="Pozvať ďalších zapisovateľov" title="Pozvať">👥</button>` : ''}</div>`;

  if (d.finished && ui.prepare == null) return top + viewFinal();
  const cur = d.current;
  if (!cur) return top + viewStart(0);
  if (cur.complete) {
    if (ui.prepare === cur.index + 1 && d.stages[cur.index + 1]) return top + viewStart(cur.index + 1);
    return top + viewStageDone(cur);
  }
  return viewRace(cur);
}

function viewStart(idx) {
  const st = ui.d.stages[idx];
  const g = ui.game;
  let body;
  if (idx === 0) {
    const order = ui.draw;
    body = `
      <p class="muted">Vylosuj poradie tímov. V tomto poradí si hráči rozostavia figúrky do štartového koridoru.</p>
      ${order ? `<ol class="check-list" style="margin-top:12px">${order.map((slot, i) => {
        const t = team(slot);
        return `<li><span class="order-badge on">${i + 1}</span><span class="info"><b style="color:${t.color}">■</b> ${esc(t.name)}</span><span class="row">${t.riders.map((r) => bib(r.id, { sm: true })).join('')}</span></li>`;
      }).join('')}</ol>` : ''}
      <div class="row" style="margin-top:16px">
        <button class="btn ${order ? '' : 'dark'}" data-act="draw">${order ? 'Losovať znova' : 'Losovať poradie tímov'}</button>
      </div>`;
  } else {
    const prev = ui.d.standings[idx - 1];
    body = `
      <p class="muted">Štartová listina podľa celkového poradia. Figúrky sa rozostavia v tomto poradí.</p>
      <table class="res" style="margin-top:8px">${prev.gc.map((r) => `<tr><td class="pos">${r.gcPos}</td><td class="who">${bib(r.id, { sm: true, jerseys: prev.jerseys })}<span class="nm">${esc(rider(r.id).name)}</span></td><td class="num">${r.gap ? fmtGap(r.gap) : fmtTime(r.time)}</td></tr>`).join('')}</table>`;
  }
  const ready = idx > 0 || ui.draw;
  return `
    <h2 style="margin-top:8px">${stageLabel(st)}: ${esc(st.def.name)}</h2>
    <p class="muted small">${fmtBase(st.def.baseMin)} základný čas${st.def.km ? `, ${st.def.km} km` : ''}, ${st.def.sprints} ${st.def.sprints === 1 ? 'sprint' : 'sprinty'}, ${st.def.mountains} ${st.def.mountains === 1 ? 'vrch' : 'vrchy'}</p>
    ${body}
    <div style="margin-top:24px" class="stack">
      <button class="btn primary block" data-act="start-stage" data-idx="${idx}" ${ready ? '' : 'disabled'}>Štart etapy</button>
      ${idx > 0 ? `<button class="btn block" data-act="cancel-prepare">Späť na výsledky</button>` : ''}
    </div>`;
}

function viewRace(st) {
  const g = ui.game;
  const clock = st.turns ? fmtTime(finishTime(st.def, st.turns, 0)) : fmtBase(st.def.baseMin);
  const inCount = st.racing.length, finCount = st.finished.size;
  const chips = [];
  const primeChip = (kind, i, label, dot) => {
    const open = st.open[kind] && st.primeDone[kind] === i;
    return `<span class="chip${st.primeDone[kind] > i ? ' done' : ''}"><i class="dot ${dot}"></i>${label}${st.def[kind === 'sprint' ? 'sprints' : 'mountains'] > 1 ? ` ${i + 1}` : ''}${open ? ` (${st.open[kind].riders.length}/4)` : ''}</span>`;
  };
  for (let i = 0; i < st.def.sprints; i++) chips.push(primeChip('sprint', i, 'Sprint', 'j-green'));
  for (let i = 0; i < st.def.mountains; i++) chips.push(primeChip('mountain', i, 'Vrch', 'j-polka'));
  chips.push(`<span class="chip${finCount ? ' done' : ''}"><i class="dot" style="background:#fff"></i>Cieľ</span>`);

  const cards = st.leaders ? ['yellow', 'green', 'polka'].filter((c) => st.leaders[c]).map((c) => {
    const used = st.cards.some((u) => u.card === c);
    const id = st.leaders[c];
    const out = !st.racing.includes(id);
    return `<button class="card-use${used || out ? ' used' : ''}" data-act="use-card" data-card="${c}" data-id="${id}" ${used || out ? 'disabled' : ''}>
      <i class="swatch j-${c}"></i>${bib(id, { sm: true })}<span class="small">${used ? 'Použitá' : cardName[c]}</span></button>`;
  }).join('') : '';

  const results = new Map(st.results.map((f) => [f.id, f]));
  const field = g.teams.map((t) => `
    <div class="team-row" style="--team:${t.color}"><span class="stripe"></span><div>
      <div class="tname">${esc(t.name)}</div>
      <div class="bibs">${t.riders.filter((r) => st.starters.includes(r.id)).map((r) => {
        const f = results.get(r.id), dnf = st.dnf.includes(r.id);
        const cls = dnf ? ' out' : f ? ' done' : '';
        const label = dnf ? 'DNF' : f ? `${f.pos}.` : '&nbsp;';
        return `<span class="rider-state${cls}">${bib(r.id, { jerseys: st.jerseys })}<span>${label}</span></span>`;
      }).join('')}</div></div></div>`).join('');

  const last = g.events[g.events.length - 1];
  const primeBtn = (kind, label) => {
    const limit = kind === 'sprint' ? st.def.sprints : st.def.mountains;
    const open = st.open[kind];
    const ok = st.turns && (open || st.primeCount[kind] < limit);
    const info = open ? `${open.riders.length}/4 jazdci` : `${st.primeDone[kind]}/${limit}`;
    return `<button class="btn${open ? ' open' : ''}" data-act="sheet" data-type="${kind}" ${ok ? '' : 'disabled'}>${label}<small>${info}</small></button>`;
  };
  return `
    <div class="board">
      <div class="stage"><span>${stageLabel(st)}: ${esc(st.def.name)}</span><a href="#/" style="color:inherit" aria-label="Domov">✕</a></div>
      <div class="clock" aria-live="polite">${clock}</div>
      <div class="sub"><span>${st.turns ? `Kolo <b>${st.turns}</b>` : 'Stlač TURN na začiatku prvého kola'}</span><span>${inCount} v pretekoch, ${finCount} v cieli</span></div>
      <div class="profile">${chips.join('')}</div>
    </div>
    ${cards ? `<div class="cards">${cards}</div>` : ''}
    <div class="field-teams">${field}</div>
    <div class="tools">
      <button class="btn small" data-act="sheet" data-type="dnf" ${st.racing.length ? '' : 'disabled'}>Odstúpil (DNF)</button>
      <button class="btn small" data-act="sheet" data-type="standings">Priebežné poradie</button>
      <button class="btn small" data-act="sheet" data-type="undo" ${last ? '' : 'disabled'}>Späť: ${last ? esc(describe(last)) : ''}</button>
    </div>
    <div class="actions"><div class="inner">
      <button class="btn primary turn" data-act="turn">TURN</button>
      ${primeBtn('sprint', 'Sprint')}
      ${primeBtn('mountain', 'Vrch')}
      <button class="btn dark" data-act="sheet" data-type="finish" ${st.turns ? '' : 'disabled'}>Cieľ<small>skupina</small></button>
    </div></div>`;
}

function describe(ev) {
  const nums = (ids) => ids.map((id) => ui.d.byId.get(id)?.num).join(', ');
  switch (ev.type) {
    case 'start': return `štart ${ev.stage + 1}. etapy`;
    case 'turn': return 'TURN';
    case 'prime': return `${ev.kind === 'sprint' ? 'sprint' : 'vrch'} ${nums(ev.riders)}`;
    case 'prime-close': return `uzavretie ${ev.kind === 'sprint' ? 'sprintu' : 'vrchu'}`;
    case 'finish': return `cieľ ${nums(ev.riders)}`;
    case 'dnf': return `DNF ${nums([ev.rider])}`;
    case 'card': return cardName[ev.card].toLowerCase();
  }
  return '';
}

// ---------- Výsledky ----------

const TABS = [['stage', 'Etapa'], ['gc', 'Celkovo'], ['sprint', 'Body'], ['mountain', 'Vrchy'], ['team', 'Tímy']];

function tabs(list) {
  return `<div class="tabs" role="tablist">${list.map(([k, l]) => `<button role="tab" class="${ui.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}</div>`;
}

function whoCell(id, jerseys) {
  const r = rider(id);
  return `<td class="who">${bib(id, { sm: true, jerseys })}<span class="nm">${esc(r.name)}<small>${esc(team(r.team).name)}</small></span></td>`;
}

function table(kind, st, s) {
  if (kind === 'stage') {
    if (!st.results.length) return `<p class="empty">Do cieľa zatiaľ nikto nedorazil.</p>`;
    const rows = st.results.map((f) => `<tr><td class="pos">${f.pos}</td>${whoCell(f.id, s?.jerseys)}<td class="num">${f.pos === 1 ? fmtTime(f.time) : f.gap ? fmtGap(f.gap) : 'r. č.'}${f.bonus ? `<br><small class="muted">bonus −${f.bonus}"</small>` : ''}</td></tr>`);
    const dnf = st.dnf.map((id) => `<tr><td class="pos">–</td>${whoCell(id)}<td class="num">DNF</td></tr>`);
    return `<table class="res">${rows.join('')}${dnf.join('')}</table>`;
  }
  if (!s) return `<p class="empty">Celkové poradie bude po prvej dokončenej etape.</p>`;
  if (kind === 'gc') return `<table class="res">${s.gc.map((r) => `<tr><td class="pos">${r.gcPos}</td>${whoCell(r.id, s.jerseys)}<td class="num">${r.gcPos === 1 ? fmtTime(r.time) : fmtGap(r.gap) || 'r. č.'}</td></tr>`).join('')}</table>`;
  if (kind === 'sprint' || kind === 'mountain') {
    const list = s[kind];
    if (!list.length) return `<p class="empty">Zatiaľ nikto nezískal body.</p>`;
    return `<table class="res">${list.map((r, i) => `<tr><td class="pos">${i + 1}</td>${whoCell(r.id, s.jerseys)}<td class="num"><b>${r[kind]}</b> b.</td></tr>`).join('')}</table>`;
  }
  if (!s.teams.length) return `<p class="empty">Žiadny tím nemá v každej etape aspoň troch jazdcov v cieli.</p>`;
  return `<table class="res">${s.teams.map((t) => {
    const tm = team(t.slot);
    return `<tr><td class="pos">${t.pos}</td><td class="who"><span class="bib sm${isLight(tm.color) ? ' light' : ''}" style="--c:${tm.color}">&nbsp;</span><span class="nm">${esc(tm.name)}</span></td><td class="num">${t.pos === 1 ? fmtTime(t.time) : fmtGap(t.gap)}</td></tr>`;
  }).join('')}</table>`;
}

function viewStageDone(st) {
  const s = ui.d.standings[st.index];
  const next = ui.d.stages[st.index + 1];
  return `
    <h2 style="margin-top:8px">${stageLabel(st)} dokončená</h2>
    <p class="muted small">${esc(st.def.name)}, ${st.turns} ${st.turns === 1 ? 'kolo' : st.turns < 5 ? 'kolá' : 'kôl'}</p>
    ${jerseyLeaders(s)}
    ${tabs(TABS)}
    ${table(ui.tab, st, s)}
    <div style="margin-top:24px" class="stack">
      ${next ? `<button class="btn primary block" data-act="prepare" data-idx="${st.index + 1}">Pripraviť ${st.index + 2}. etapu</button>` : ''}
      <button class="btn block" data-act="sheet" data-type="undo">Opraviť posledný zápis</button>
    </div>`;
}

function jerseyLeaders(s) {
  const items = [['yellow', s.gc[0]?.id], ['green', s.sprint[0]?.id], ['polka', s.mountain[0]?.id]].filter(([, id]) => id);
  return `<div class="cards">${items.map(([c, id]) => `<span class="card-use"><i class="swatch j-${c}"></i>${bib(id, { sm: true })}<span class="small">${esc(rider(id).name)}</span></span>`).join('')}</div>`;
}

function viewFinal() {
  if (!ui.finalSeen) { ui.finalSeen = true; ui.tab = ui.d.stages.length > 1 ? 'gc' : 'stage'; }
  const d = ui.d, s = d.latest, last = d.stages[d.stages.length - 1];
  const winner = (id) => id ? `${bib(id, { sm: true })}<div class="n">${esc(rider(id).name)}</div>` : '<div class="n muted">nikto</div>';
  const t0 = s.teams[0] && team(s.teams[0].slot);
  return `
    <h2 style="margin-top:8px">Konečné výsledky</h2>
    <div class="podium">
      <div class="p" style="--c:var(--yellow)"><div class="t">Celkovo</div>${winner(s.gc[0]?.id)}</div>
      <div class="p" style="--c:var(--green)"><div class="t">Body</div>${winner(s.sprint[0]?.id)}</div>
      <div class="p" style="--c:var(--polka)"><div class="t">Vrchy</div>${winner(s.mountain[0]?.id)}</div>
    </div>
    ${t0 ? `<p style="margin-top:12px">Najlepší tím: <b style="color:${t0.color}">${esc(t0.name)}</b></p>` : ''}
    ${tabs([...(d.stages.length > 1 ? [['gc', 'Celkovo']] : []), ['stage', d.stages.length > 1 ? 'Posledná etapa' : 'Etapa'], ['sprint', 'Body'], ['mountain', 'Vrchy'], ['team', 'Tímy']])}
    ${table(ui.tab, last, s)}
    <div class="tools">
      <button class="btn small" data-act="export">Stiahnuť CSV</button>
      <button class="btn small" data-act="share">Zdieľať výsledky</button>
      <button class="btn small" data-act="print">Tlačiť / PDF</button>
      <button class="btn small" data-act="sheet" data-type="undo">Opraviť posledný zápis</button>
      <button class="btn small danger" data-act="sheet" data-type="delete">Zmazať závod</button>
    </div>`;
}

// ---------- Dialógy ----------

function pickGrid(ids, sel, offset = 0) {
  const byTeam = new Map();
  for (const id of ids) { const t = rider(id).team; if (!byTeam.has(t)) byTeam.set(t, []); byTeam.get(t).push(id); }
  return [...byTeam].map(([slot, list]) => `<div class="pick-team"><div class="tname">${esc(team(slot).name)}</div><div class="pick">${list.map((id) => {
    const i = sel.indexOf(id);
    return `<button class="${i >= 0 ? 'sel' : ''}" data-act="pick" data-id="${id}" aria-pressed="${i >= 0}" aria-label="${esc(rider(id).name)}">${bib(id)}${i >= 0 ? `<span class="ord">${i + 1 + offset}</span>` : ''}</button>`;
  }).join('')}</div></div>`).join('');
}

function viewSheet() {
  const sh = ui.sheet, st = ui.d?.current;
  let body = '';
  if (sh.type === 'sprint' || sh.type === 'mountain') {
    const open = st.open[sh.type];
    const done = open ? open.riders : [];
    const no = open ? st.primeCount[sh.type] : st.primeCount[sh.type] + 1;
    const name = sh.type === 'sprint' ? 'Sprint' : 'Vrchárska prémia';
    body = `<h2>${name} ${no}</h2>
      ${done.length ? `<p class="small" style="margin-bottom:6px">Už zapísaní:</p><div class="row">${done.map((id, i) => `<span class="rider-state">${bib(id, { sm: true })}<span>${PRIME_POINTS[i]} b.</span></span>`).join('')}</div>` : ''}
      <p class="muted small" style="margin-top:10px">Ťukni na jazdcov, ktorí prešli čiarou v tomto kole, v poradí prejazdu. Body ${PRIME_POINTS.join('-')} pre prvých štyroch, zostáva ${4 - done.length} ${4 - done.length === 1 ? 'miesto' : 'miesta'}. Ostatných dopíšeš v ďalšom kole.</p>
      ${pickGrid(st.racing.filter((id) => !done.includes(id)), sh.sel, done.length)}
      ${open ? `<div class="row" style="margin-top:12px"><button class="btn small" data-act="close-prime">Uzavrieť prémiu, nikto ďalší neprejde</button></div>` : ''}
      <div class="foot"><button class="btn" data-act="close">Zrušiť</button><button class="btn primary" data-act="save" ${sh.sel.length ? '' : 'disabled'}>Zapísať ${sh.sel.length || ''}</button></div>`;
  } else if (sh.type === 'finish') {
    const t = finishTime(st.def, st.turns, sh.seconds);
    body = `<h2>Skupina v cieli</h2>
      <p class="muted small">Zadaj sekundy z políčka, na ktoré dorazil prvý jazdec skupiny. Potom ťukni na jazdcov skupiny v poradí.</p>
      <div class="stepper" style="margin-top:12px">
        <button class="btn" data-act="sec" data-d="-1" aria-label="Menej">−</button>
        <input type="number" inputmode="numeric" min="0" max="59" data-bind="seconds" value="${sh.seconds}" aria-label="Sekundy">
        <button class="btn" data-act="sec" data-d="1" aria-label="Viac">+</button>
      </div>
      <div class="preview">Čas skupiny ${fmtTime(t)}</div>
      ${pickGrid(st.racing, sh.sel)}
      <div class="row" style="margin-top:10px"><button class="btn small" data-act="pick-all">Vybrať všetkých zvyšných</button></div>
      <div class="foot"><button class="btn" data-act="close">Zrušiť</button><button class="btn primary" data-act="save" ${sh.sel.length ? '' : 'disabled'}>Zapísať ${sh.sel.length || ''}</button></div>`;
  } else if (sh.type === 'dnf') {
    body = `<h2>Odstúpil z pretekov</h2>
      <p class="muted small">Pri „Big Crash" jazdec odstupuje. Vypadne z celkového poradia aj z ďalších etáp.</p>
      ${pickGrid(st.racing, sh.sel)}
      <div class="foot"><button class="btn" data-act="close">Zrušiť</button><button class="btn primary" data-act="save" ${sh.sel.length === 1 ? '' : 'disabled'}>Zapísať DNF</button></div>`;
  } else if (sh.type === 'undo') {
    const last = ui.game.events[ui.game.events.length - 1];
    body = `<h2>Vrátiť posledný zápis?</h2><p>Odstráni sa: <b>${esc(describe(last))}</b>. Ostatné zápisy ostanú.</p>
      <div class="foot"><button class="btn" data-act="close">Nie</button><button class="btn primary" data-act="undo">Vrátiť</button></div>`;
  } else if (sh.type === 'delete') {
    body = `<h2>Zmazať závod?</h2><p>Závod <b>${esc(ui.game.name)}</b> sa natrvalo vymaže${ui.store.kind === 'cloud' ? ' aj pre ostatných zapisovateľov' : ''}.</p>
      <div class="foot"><button class="btn" data-act="close">Nie</button><button class="btn primary" data-act="delete">Zmazať</button></div>`;
  } else if (sh.type === 'card') {
    body = `<h2>${cardName[sh.card]}</h2><p>Zapísať, že ${esc(rider(sh.id).name)} použil kartu v tejto etape?</p>
      <div class="foot"><button class="btn" data-act="close">Nie</button><button class="btn primary" data-act="save">Použiť kartu</button></div>`;
  } else if (sh.type === 'standings') {
    const prev = st.index > 0 ? ui.d.standings[st.index - 1] : null;
    const list = st.index > 0 ? TABS : TABS.slice(0, 1);
    body = `<h2>Priebežné poradie</h2><p class="muted small">Etapa podľa doteraz dojazdených jazdcov, ostatné súťaže po ${st.index > 0 ? `${st.index}. etape` : 'prvej etape'}.</p>
      ${tabs(list)}${table(ui.tab, st, prev)}
      <div class="foot"><button class="btn" data-act="close">Zavrieť</button></div>`;
  } else if (sh.type === 'custom') {
    const c = sh.c;
    body = `<h2>${sh.key ? 'Upraviť etapu' : 'Vlastná etapa'}</h2>
      <label class="field"><span>Názov</span><input type="text" data-bind="c.name" value="${esc(c.name)}" placeholder="Štart › Cieľ"></label>
      <div class="grid2">
        <label class="field"><span>Základný čas: hodiny</span><input type="number" inputmode="numeric" min="0" data-bind="c.h" value="${c.h}"></label>
        <label class="field"><span>minúty</span><input type="number" inputmode="numeric" min="0" max="59" data-bind="c.m" value="${c.m}"></label>
        <label class="field"><span>Sprinty</span><input type="number" inputmode="numeric" min="0" max="9" data-bind="c.sprints" value="${c.sprints}"></label>
        <label class="field"><span>Vrchy</span><input type="number" inputmode="numeric" min="0" max="9" data-bind="c.mountains" value="${c.mountains}"></label>
      </div>
      <label class="field"><span>Dĺžka v km (nepovinné)</span><input type="number" inputmode="numeric" min="0" data-bind="c.km" value="${c.km}"></label>
      <div class="foot">${sh.key ? `<button class="btn danger" data-act="delete-custom">Zmazať</button>` : `<button class="btn" data-act="close">Zrušiť</button>`}<button class="btn primary" data-act="save-custom">Uložiť etapu</button></div>`;
  } else if (sh.type === 'invite') {
    body = `<h2>Pozvať zapisovateľov</h2><p>Pošli odkaz ďalším hráčom. Po prihlásení cez Google uvidia závod naživo a môžu zapisovať.</p>
      <input type="text" readonly value="${esc(sh.link)}" style="margin-top:12px" onfocus="this.select()">
      <div class="foot"><button class="btn" data-act="close">Zavrieť</button><button class="btn primary" data-act="copy-link">${navigator.share ? 'Poslať odkaz' : 'Kopírovať odkaz'}</button></div>`;
  }
  return `<div class="sheet-wrap" data-act="backdrop"><div class="sheet" role="dialog" aria-modal="true">${body}</div></div>`;
}

// ---------- Akcie ----------

function commit(partial) {
  const ev = { id: newId(), t: Date.now(), ...partial };
  const err = validate(ui.game, ui.d, ev);
  if (err) { toast(err); return false; }
  ui.store.addEvent(ui.game.id, ev);
  return true;
}

const actions = {
  async signin() { try { await ui.cloud.signIn(); } catch (e) { console.error(e); toast('Prihlásenie zlyhalo.'); } },
  async signout() { await ui.cloud.signOut(); },
  async upload({ id }) {
    const g = await ui.local.read(id);
    if (!g) return;
    await ui.cloud.createGame({ ...g, id: undefined });
    await ui.local.deleteGame(id);
    toast('Závod je presunutý do účtu.');
    route();
  },

  'toggle-stage'({ key }) {
    const k = ui.form.stageKeys, i = k.indexOf(key);
    if (i >= 0) k.splice(i, 1); else k.push(key);
  },
  'team-size'({ n }) { ui.form.teamSize = +n; },
  'team-toggle'({ slot }) { const t = ui.form.teams[+slot]; t.on = !t.on; },
  'random-names'() {
    const taken = new Set();
    for (const t of ui.form.teams) t.riders = t.riders.map(() => { const n = randomName(taken); taken.add(n); return n; });
  },
  'edit-custom'({ key }) {
    const s = key ? ui.customStages.find((x) => x.key === key) : null;
    ui.sheet = { type: 'custom', key, c: s ? { name: s.name, h: Math.floor(s.baseMin / 60), m: s.baseMin % 60, km: s.km || '', sprints: s.sprints, mountains: s.mountains } : { name: '', h: 4, m: 0, km: '', sprints: 1, mountains: 1 } };
  },
  async 'save-custom'() {
    const { c, key } = ui.sheet;
    if (!c.name.trim()) { toast('Zadaj názov etapy.'); return; }
    const def = { key: key || `c-${newId()}`, name: c.name.trim(), baseMin: (+c.h || 0) * 60 + Math.min(59, +c.m || 0), km: +c.km || 0, sprints: Math.max(0, +c.sprints || 0), mountains: Math.max(0, +c.mountains || 0) };
    ui.customStages = key ? ui.customStages.map((s) => (s.key === key ? def : s)) : [...ui.customStages, def];
    await ui.store.saveCustomStages(ui.customStages);
    if (!key) ui.form.stageKeys.push(def.key);
    ui.sheet = null;
  },
  async 'delete-custom'() {
    const key = ui.sheet.key;
    ui.customStages = ui.customStages.filter((s) => s.key !== key);
    ui.form.stageKeys = ui.form.stageKeys.filter((k) => k !== key);
    await ui.store.saveCustomStages(ui.customStages);
    ui.sheet = null;
  },
  async create() {
    const f = ui.form;
    const defs = allStageDefs();
    const game = {
      name: f.name.trim() || 'Závod',
      stages: f.stageKeys.map((k) => { const { custom, ...s } = defs.find((x) => x.key === k); return s; }),
      teams: f.teams.filter((t) => t.on).map((t) => ({
        slot: t.slot, name: t.name.trim() || TEAM_SLOTS[t.slot].name, color: t.color,
        riders: t.riders.slice(0, f.teamSize).map((n, i) => ({ id: `r${riderNumber(t.slot, i)}`, num: riderNumber(t.slot, i), name: n.trim() || `Jazdec ${riderNumber(t.slot, i)}` })),
      })),
      status: 'running',
    };
    try {
      const id = await ui.store.createGame(game);
      ui.form = null;
      go(`#/game/${id}`);
      return 'skip';
    } catch (e) { console.error(e); toast('Závod sa nepodarilo uložiť.'); }
  },

  draw() { ui.draw = shuffle(ui.game.teams.map((t) => t.slot)); },
  'start-stage'({ idx }) {
    idx = +idx;
    const order = startOrder(ui.game, ui.d, idx, ui.draw || []);
    if (commit({ type: 'start', stage: idx, order })) { ui.prepare = null; ui.tab = 'stage'; window.scrollTo(0, 0); }
  },
  prepare({ idx }) { ui.prepare = +idx; window.scrollTo(0, 0); },
  'cancel-prepare'() { ui.prepare = null; },
  turn() {
    if (commit({ type: 'turn', stage: ui.d.current.index })) navigator.vibrate?.(20);
  },
  sheet({ type }) {
    if (type === 'standings') ui.tab = 'stage';
    ui.sheet = { type, sel: [], seconds: 0 };
  },
  'use-card'({ card, id }) { ui.sheet = { type: 'card', card, id }; },
  invite() {
    const link = `${location.origin}${location.pathname}?join=${ui.game.id}`;
    ui.sheet = { type: 'invite', link };
  },
  async 'copy-link'() {
    const link = ui.sheet.link;
    if (navigator.share) { try { await navigator.share({ title: ui.game.name, text: 'Zapisuj so mnou závod', url: link }); } catch { /* zrušené */ } }
    else { await navigator.clipboard?.writeText(link); toast('Odkaz je skopírovaný.'); }
  },
  pick({ id }) {
    const sh = ui.sheet, i = sh.sel.indexOf(id);
    if (i >= 0) sh.sel.splice(i, 1);
    else if (sh.type === 'dnf') sh.sel = [id];
    else if ((sh.type === 'sprint' || sh.type === 'mountain') && sh.sel.length >= 4 - (ui.d.current.open[sh.type]?.riders.length || 0)) toast('Body dostávajú len prví štyria.');
    else sh.sel.push(id);
  },
  'pick-all'() {
    const sh = ui.sheet;
    for (const id of ui.d.current.racing) if (!sh.sel.includes(id)) sh.sel.push(id);
  },
  'close-prime'() {
    if (commit({ type: 'prime-close', stage: ui.d.current.index, kind: ui.sheet.type })) ui.sheet = null;
  },
  sec({ d }) { ui.sheet.seconds = Math.min(59, Math.max(0, ui.sheet.seconds + +d)); },
  save() {
    const sh = ui.sheet, stage = ui.d.current.index;
    let ok = false;
    if (sh.type === 'sprint' || sh.type === 'mountain') ok = commit({ type: 'prime', stage, kind: sh.type, riders: sh.sel });
    else if (sh.type === 'finish') ok = commit({ type: 'finish', stage, seconds: sh.seconds, riders: sh.sel });
    else if (sh.type === 'dnf') ok = commit({ type: 'dnf', stage, rider: sh.sel[0] });
    else if (sh.type === 'card') ok = commit({ type: 'card', stage, rider: sh.id, card: sh.card });
    if (ok) ui.sheet = null;
  },
  undo() {
    const last = ui.game.events[ui.game.events.length - 1];
    if (last) {
      ui.store.removeEvent(ui.game.id, last);
      if (last.type === 'start') {
        ui.prepare = last.stage;
        if (last.stage === 0) ui.draw = [...new Set(last.order.map((id) => ui.d.byId.get(id)?.team))];
      }
    }
    ui.sheet = null;
  },
  async delete() {
    const id = ui.game.id;
    ui.sheet = null;
    await ui.store.deleteGame(id);
    go('#/');
  },
  close() { ui.sheet = null; },
  backdrop(_, e) { if (e.target.classList.contains('sheet-wrap')) ui.sheet = null; else return 'skip'; },
  tab({ tab }) { ui.tab = tab; },
  export() { download(`${ui.game.name}.csv`, toCsv()); },
  async share() {
    const text = shareText();
    if (navigator.share) { try { await navigator.share({ title: ui.game.name, text }); } catch { /* zrušené */ } }
    else { await navigator.clipboard?.writeText(text); toast('Výsledky sú skopírované.'); }
  },
  print() { window.print(); },
};

// ---------- Export ----------

function toCsv() {
  const s = ui.d.latest;
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['Poradie', 'Číslo', 'Jazdec', 'Tím', 'Celkový čas', 'Strata', 'Bonifikácie (s)', 'Body', 'Vrchárske body']];
  for (const r of s.gc) {
    const x = rider(r.id);
    rows.push([r.gcPos, x.num, x.name, team(x.team).name, fmtTime(r.time), r.gap ? fmtGap(r.gap) : '', r.bonus, r.sprint, r.mountain]);
  }
  rows.push([], ['Tímy', 'Čas', 'Strata']);
  for (const t of s.teams) rows.push([`${t.pos}. ${team(t.slot).name}`, fmtTime(t.time), t.gap ? fmtGap(t.gap) : '']);
  return '﻿' + rows.map((r) => r.map(q).join(';')).join('\r\n');
}

function shareText() {
  const s = ui.d.latest;
  const name = (id) => (id ? `${rider(id).name} (${rider(id).num})` : 'nikto');
  const lines = [`🏁 ${ui.game.name}`, `🟨 ${name(s.gc[0]?.id)} ${s.gc[0] ? fmtTime(s.gc[0].time) : ''}`, `🟩 ${name(s.sprint[0]?.id)}`, `🔴 ${name(s.mountain[0]?.id)}`];
  if (s.teams[0]) lines.push(`👥 ${team(s.teams[0].slot).name}`);
  lines.push('', ...s.gc.slice(0, 10).map((r) => `${r.gcPos}. ${rider(r.id).name} ${r.gcPos === 1 ? fmtTime(r.time) : fmtGap(r.gap) || 'r. č.'}`));
  return lines.join('\n');
}

function download(name, content) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Udalosti DOM ----------

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'A') return;
  if (el.type !== 'checkbox') e.preventDefault();
  const res = await fn({ ...el.dataset }, e);
  if (res !== 'skip') render();
});

document.addEventListener('input', (e) => {
  const path = e.target.dataset?.bind;
  if (!path) return;
  const v = e.target.value;
  const [a, b, c] = path.split('.');
  if (ui.route.name === 'new' && !ui.sheet) {
    if (a === 'name') ui.form.name = v;
    else if (a === 'team') ui.form.teams[+b].name = v;
    else if (a === 'rider') ui.form.teams[+b].riders[+c] = v;
  } else if (ui.sheet) {
    if (a === 'seconds') {
      ui.sheet.seconds = Math.min(59, Math.max(0, parseInt(v, 10) || 0));
      const p = document.querySelector('.preview');
      if (p) p.textContent = `Čas skupiny ${fmtTime(finishTime(ui.d.current.def, ui.d.current.turns, ui.sheet.seconds))}`;
    } else if (a === 'c') ui.sheet.c[b] = v;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.sheet) { ui.sheet = null; render(); }
});

boot();
