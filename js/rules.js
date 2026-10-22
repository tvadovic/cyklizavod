// Pravidlá Tour de France Board Game. Čisté funkcie bez DOM, testované v tests/rules.test.mjs.
//
// Hra je uložená ako zoznam udalostí. Celý stav (časy, poradia, dresy) sa z nich vždy
// prepočíta, takže „Späť" znamená len odstrániť poslednú udalosť.
//
// Udalosti (všetky majú id, t = čas zápisu, stage = index etapy):
//   start  { order }                 začiatok etapy, štartové poradie jazdcov
//   turn   {}                        TURN, začiatok ďalšieho kola (sekvencie)
//   prime  { kind, riders }          prémia: kind 'sprint' | 'mountain', jazdci v poradí prejazdu.
//                                    Jazdci sa môžu dopisovať po kolách, prémia sa uzavrie po štvrtom.
//   prime-close { kind }             ručné uzavretie prémie, ktorou prešlo menej ako 4 jazdcov
//   finish { seconds, riders }       skupina v cieli: sekundová hodnota políčka a jazdci v poradí
//   dnf    { rider }                 jazdec odstúpil (Big Crash)
//   card   { rider, card }           použitá karta 'yellow' | 'green' | 'polka'

import { PRIME_POINTS, FINISH_BONUS } from './data.js';

export const CARDS = ['yellow', 'green', 'polka'];

export function allRiders(game) {
  const out = [];
  for (const team of game.teams) for (const r of team.riders) out.push({ ...r, team: team.slot });
  return out;
}

// Čas v cieli: základný čas + minúta za každé odohrané kolo okrem prvého + sekundy políčka.
// Prvé stlačenie TURN spúšťa časomieru (príklady v pravidlách: 28 kôl = +27 minút).
export function finishTime(stageDef, turns, seconds) {
  return stageDef.baseMin * 60 + Math.max(0, turns - 1) * 60 + seconds;
}

export function fmtTime(sec) {
  if (sec == null) return '–';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function fmtGap(sec) {
  if (!sec) return '';
  const m = Math.floor(sec / 60), s = sec % 60;
  return m ? `+${m}:${String(s).padStart(2, '0')}` : `+${s}"`;
}

const primeClosed = (p) => p.closed || p.riders.length >= PRIME_POINTS.length;
const openPrime = (st, kind) => st.primes.find((p) => p.kind === kind && !primeClosed(p)) || null;

function emptyStage(def, index) {
  return { def, index, started: false, order: [], turns: 0, primes: [], groups: [], dnf: [], cards: [] };
}

// Prepočíta celý stav hry z udalostí.
export function derive(game) {
  const riders = allRiders(game);
  const byId = new Map(riders.map((r) => [r.id, r]));
  const stages = game.stages.map(emptyStage);

  for (const ev of game.events || []) {
    const st = stages[ev.stage];
    if (!st) continue;
    switch (ev.type) {
      case 'start': st.started = true; st.order = ev.order; break;
      case 'turn': st.turns++; break;
      case 'prime': {
        const open = openPrime(st, ev.kind);
        if (open) open.riders = [...open.riders, ...ev.riders];
        else st.primes.push({ kind: ev.kind, riders: [...ev.riders], closed: false });
        break;
      }
      case 'prime-close': { const open = openPrime(st, ev.kind); if (open) open.closed = true; break; }
      case 'finish': st.groups.push({ seconds: ev.seconds, turns: st.turns, riders: ev.riders }); break;
      case 'dnf': st.dnf.push(ev.rider); break;
      case 'card': st.cards.push({ rider: ev.rider, card: ev.card }); break;
    }
  }

  const out = new Set(); // jazdci vyradení v predchádzajúcich etapách
  const standings = [];
  let previous = null;

  for (const st of stages) {
    st.starters = riders.filter((r) => !out.has(r.id)).map((r) => r.id);
    st.leaders = previous ? previous.leaders : null;
    st.jerseys = previous ? previous.jerseys : null;
    if (!st.started) { st.complete = false; standings.push(null); continue; }

    // Poradie dojazdu podľa zápisu, čas skupiny podľa kola, v ktorom došla.
    const finishers = [];
    for (const g of st.groups) {
      const time = finishTime(st.def, g.turns, g.seconds);
      for (const id of g.riders) finishers.push({ id, time, seconds: g.seconds });
    }
    finishers.forEach((f, i) => { f.order = i; f.bonus = FINISH_BONUS[i] || 0; });
    const done = new Set([...finishers.map((f) => f.id), ...st.dnf]);
    st.finished = new Set(finishers.map((f) => f.id));
    st.racing = st.starters.filter((id) => !done.has(id));
    st.complete = st.starters.length > 0 && st.racing.length === 0;

    st.results = [...finishers].sort((a, b) => a.time - b.time || a.order - b.order);
    const best = st.results[0]?.time;
    st.results.forEach((f, i) => { f.pos = i + 1; f.gap = f.time - best; });

    st.points = { sprint: {}, mountain: {} };
    for (const p of st.primes) {
      p.riders.forEach((id, i) => {
        st.points[p.kind][id] = (st.points[p.kind][id] || 0) + (PRIME_POINTS[i] || 0);
      });
    }
    // primeCount = začaté prémie, primeDone = uzavreté, open = prémia, do ktorej sa ešte dopisuje.
    st.primeCount = {}; st.primeDone = {}; st.open = {};
    for (const k of ['sprint', 'mountain']) {
      const list = st.primes.filter((p) => p.kind === k);
      st.primeCount[k] = list.length;
      st.primeDone[k] = list.filter(primeClosed).length;
      st.open[k] = openPrime(st, k);
    }

    for (const id of st.dnf) out.add(id);

    if (st.complete) {
      previous = computeStandings(game, stages.slice(0, st.index + 1), out, byId);
      standings.push(previous);
    } else {
      standings.push(null);
    }
  }

  const current = [...stages].reverse().find((s) => s.started) || null;
  const lastDone = [...standings].reverse().find(Boolean) || null;
  const finished = stages.length > 0 && stages[stages.length - 1].complete;
  return { riders, byId, stages, standings, current, latest: lastDone, finished, out };
}

// Celkové poradia po odjazdených (kompletných) etapách.
function computeStandings(game, stages, out, byId) {
  const active = [...byId.keys()].filter((id) => !out.has(id));
  const rows = new Map(active.map((id) => [id, { id, time: 0, bonus: 0, sprint: 0, mountain: 0, placeSum: 0, lastPlace: 0 }]));

  for (const st of stages) {
    for (const f of st.results) {
      const row = rows.get(f.id);
      if (!row) continue;
      row.time += f.time - f.bonus;
      row.bonus += f.bonus;
      row.placeSum += f.pos;
      row.lastPlace = f.pos;
    }
    for (const kind of ['sprint', 'mountain']) {
      for (const [id, pts] of Object.entries(st.points[kind])) {
        const row = rows.get(id);
        if (row) row[kind] += pts;
      }
    }
  }

  const all = [...rows.values()];
  const gc = [...all].sort((a, b) => a.time - b.time || a.placeSum - b.placeSum || a.lastPlace - b.lastPlace);
  gc.forEach((r, i) => { r.gcPos = i + 1; r.gap = r.time - gc[0].time; });
  const byPoints = (k) => all.filter((r) => r[k] > 0).sort((a, b) => b[k] - a[k] || a.gcPos - b.gcPos);
  const sprint = byPoints('sprint');
  const mountain = byPoints('mountain');

  // Tímy: súčet troch najlepších časov tímu v každej etape (bez bonifikácií).
  // Tím, ktorému v niektorej etape došli do cieľa menej ako traja jazdci, zo súťaže vypadáva.
  const teams = [];
  for (const team of game.teams) {
    let time = 0, ok = true;
    for (const st of stages) {
      const t = st.results.filter((f) => byId.get(f.id)?.team === team.slot).map((f) => f.time).sort((a, b) => a - b);
      if (t.length < 3) { ok = false; break; }
      time += t[0] + t[1] + t[2];
    }
    if (ok) teams.push({ slot: team.slot, time });
  }
  teams.sort((a, b) => a.time - b.time);
  teams.forEach((t, i) => { t.pos = i + 1; t.gap = t.time - teams[0].time; });

  // Lídri súťaží držia karty, dres nosí líder, pri viacerých dresoch má prednosť žltý.
  const leaders = { yellow: gc[0]?.id || null, green: sprint[0]?.id || null, polka: mountain[0]?.id || null };
  const jerseys = { yellow: leaders.yellow };
  const worn = new Set([jerseys.yellow]);
  for (const [jersey, list] of [['green', sprint], ['polka', mountain]]) {
    const wearer = list.find((r) => !worn.has(r.id));
    jerseys[jersey] = wearer?.id || null;
    if (wearer) worn.add(wearer.id);
  }

  return { gc, sprint, mountain, teams, leaders, jerseys, stagesDone: stages.length };
}

// Karty dostupné v etape: líder súťaže po predchádzajúcej etape, každá raz za etapu.
export function availableCards(st) {
  if (!st.leaders) return [];
  return CARDS.filter((c) => st.leaders[c] && !st.cards.some((u) => u.card === c))
    .map((c) => ({ card: c, rider: st.leaders[c] }));
}

// Štartové poradie etapy: prvá etapa podľa vylosovaného poradia tímov, ďalšie podľa celkového poradia.
export function startOrder(game, derived, stageIndex, teamOrder) {
  if (stageIndex === 0) {
    const order = [];
    for (const slot of teamOrder) {
      const team = game.teams.find((t) => t.slot === slot);
      if (team) order.push(...team.riders.map((r) => r.id));
    }
    return order;
  }
  const prev = derived.standings[stageIndex - 1];
  return prev ? prev.gc.map((r) => r.id) : derived.stages[stageIndex].starters;
}

export function shuffle(list, rnd = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Kontrola, či udalosť dáva v aktuálnom stave zmysel. Vráti text chyby alebo null.
export function validate(game, derived, ev) {
  const st = derived.stages[ev.stage];
  if (!st) return 'Neznáma etapa.';
  if (ev.type === 'start') {
    if (st.started) return 'Etapa už beží.';
    if (ev.stage > 0 && !derived.stages[ev.stage - 1].complete) return 'Predchádzajúca etapa ešte nie je dokončená.';
    return null;
  }
  if (!st.started) return 'Etapa ešte nezačala.';
  if (st.complete && ev.type !== 'card') return 'Etapa je už dokončená.';
  const racing = new Set(st.racing);
  switch (ev.type) {
    case 'turn': return null;
    case 'prime': {
      const open = st.open[ev.kind];
      const free = PRIME_POINTS.length - (open ? open.riders.length : 0);
      if (!ev.riders.length) return 'Vyber aspoň jedného jazdca.';
      if (ev.riders.length > free) return `Body dostávajú len prví štyria, zostáva ${free} ${free === 1 ? 'miesto' : 'miesta'}.`;
      const limit = ev.kind === 'sprint' ? st.def.sprints : st.def.mountains;
      if (!open && st.primeCount[ev.kind] >= limit) return ev.kind === 'sprint' ? 'Všetky sprinty v etape sú už zapísané.' : 'Všetky vrchárske prémie v etape sú už zapísané.';
      if (open && ev.riders.some((id) => open.riders.includes(id))) return 'Jazdec už je v tejto prémii zapísaný.';
      if (new Set(ev.riders).size !== ev.riders.length) return 'Jazdec je vybraný dvakrát.';
      if (ev.riders.some((id) => !racing.has(id))) return 'Prémiu môžu získať len jazdci, ktorí sú ešte v pretekoch.';
      return null;
    }
    case 'prime-close':
      return st.open[ev.kind] ? null : 'Žiadna otvorená prémia.';
    case 'finish':
      if (st.turns < 1) return 'Najprv spusti etapu tlačidlom TURN.';
      if (!ev.riders.length) return 'Vyber aspoň jedného jazdca.';
      if (!Number.isInteger(ev.seconds) || ev.seconds < 0 || ev.seconds > 59) return 'Sekundy musia byť 0 až 59.';
      if (ev.riders.some((id) => !racing.has(id))) return 'Niektorý jazdec už je v cieli alebo odstúpil.';
      return null;
    case 'dnf':
      return racing.has(ev.rider) ? null : 'Jazdec už nie je v pretekoch.';
    case 'card':
      return availableCards(st).some((c) => c.card === ev.card && c.rider === ev.rider) ? null : 'Karta nie je dostupná.';
  }
  return 'Neznáma udalosť.';
}
