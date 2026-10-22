import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derive, finishTime, fmtTime, validate, availableCards, startOrder } from '../js/rules.js';
import { OFFICIAL_STAGES } from '../js/data.js';

// Dva tímy po troch jazdcoch: zelení g1–g3, červení r1–r3.
function makeGame(stages = OFFICIAL_STAGES.slice(0, 2)) {
  const team = (slot, p) => ({ slot, name: p, color: '#000', riders: [1, 2, 3].map((i) => ({ id: `${p}${i}`, num: slot * 6 + i, name: `${p}${i}` })) });
  return { teams: [team(0, 'g'), team(1, 'r')], stages, events: [] };
}
let n = 0;
const ev = (stage, type, extra = {}) => ({ id: `e${n++}`, t: 0, stage, type, ...extra });
const turns = (stage, k) => Array.from({ length: k }, () => ev(stage, 'turn'));

test('čas v cieli: prvé TURN nepridáva minútu (príklad z pravidiel, Paríž)', () => {
  const paris = OFFICIAL_STAGES[3];
  assert.equal(fmtTime(finishTime(paris, 28, 14)), '2:37:14');
});

test('bonifikácie sa neodpočítajú z času etapy, len z celkového času', () => {
  const g = makeGame();
  g.events = [
    ev(0, 'start', { order: [] }), ...turns(0, 10),
    ev(0, 'finish', { seconds: 5, riders: ['g1', 'r1', 'g2'] }),
    ev(0, 'turn'),
    ev(0, 'finish', { seconds: 0, riders: ['g3', 'r2', 'r3'] }),
  ];
  const d = derive(g);
  const st = d.stages[0];
  assert.equal(st.complete, true);
  const base = 250 * 60 + 9 * 60 + 5;
  assert.deepEqual(st.results.slice(0, 3).map((f) => [f.id, f.time, f.bonus]), [['g1', base, 10], ['r1', base, 6], ['g2', base, 4]]);
  assert.equal(st.results[3].time, 250 * 60 + 10 * 60);
  const gc = d.standings[0].gc;
  assert.deepEqual(gc.slice(0, 3).map((r) => [r.id, r.time]), [['g1', base - 10], ['r1', base - 6], ['g2', base - 4]]);
});

test('DNF vyradí len jedného jazdca a ten vypadne z ďalších etáp', () => {
  const g = makeGame();
  g.events = [ev(0, 'start', { order: [] }), ev(0, 'turn'), ev(0, 'dnf', { rider: 'r3' })];
  let d = derive(g);
  assert.deepEqual(d.stages[0].racing.sort(), ['g1', 'g2', 'g3', 'r1', 'r2']);
  g.events.push(ev(0, 'finish', { seconds: 0, riders: ['g1', 'g2', 'g3', 'r1', 'r2'] }));
  d = derive(g);
  assert.equal(d.stages[0].complete, true);
  assert.equal(d.standings[0].gc.length, 5);
  assert.ok(!d.stages[1].starters.includes('r3'));
  // Červený tím má len dvoch v cieli, z tímovej súťaže vypadáva.
  assert.deepEqual(d.standings[0].teams.map((t) => t.slot), [0]);
});

test('prémie 5-3-2-1, limit podľa etapy a súčet cez etapy', () => {
  const g = makeGame();
  g.events = [ev(0, 'start', { order: [] }), ev(0, 'turn'), ev(0, 'prime', { kind: 'sprint', riders: ['r1', 'g1', 'g2', 'g3'] })];
  let d = derive(g);
  assert.equal(validate(g, d, ev(0, 'prime', { kind: 'sprint', riders: ['r2'] })), 'Všetky sprinty v etape sú už zapísané.');
  assert.notEqual(validate(g, d, ev(0, 'prime', { kind: 'mountain', riders: ['r2'] })), null); // Roskilde nemá vrchy
  g.events.push(ev(0, 'finish', { seconds: 0, riders: ['g1', 'g2', 'g3', 'r1', 'r2', 'r3'] }));
  d = derive(g);
  assert.deepEqual(d.standings[0].sprint.map((r) => [r.id, r.sprint]), [['r1', 5], ['g1', 3], ['g2', 2], ['g3', 1]]);
});

test('dres nosí líder, pri dvoch dresoch dostane druhý ďalší v poradí; karty majú lídri', () => {
  const g = makeGame();
  g.events = [
    ev(0, 'start', { order: [] }), ev(0, 'turn'),
    ev(0, 'prime', { kind: 'sprint', riders: ['g1', 'r1'] }),
    ev(0, 'finish', { seconds: 0, riders: ['g1', 'r1', 'g2', 'g3', 'r2', 'r3'] }),
  ];
  const d = derive(g);
  const s = d.standings[0];
  assert.equal(s.leaders.yellow, 'g1');
  assert.equal(s.leaders.green, 'g1');
  assert.equal(s.jerseys.green, 'r1');
  g.events.push(ev(1, 'start', { order: startOrder(g, d, 1) }));
  const d2 = derive(g);
  assert.deepEqual(availableCards(d2.stages[1]).map((c) => [c.card, c.rider]), [['yellow', 'g1'], ['green', 'g1']]);
  g.events.push(ev(1, 'card', { rider: 'g1', card: 'yellow' }));
  assert.deepEqual(availableCards(derive(g).stages[1]).map((c) => c.card), ['green']);
});

test('štart ďalšej etapy podľa celkového poradia a len po dokončení predchádzajúcej', () => {
  const g = makeGame();
  g.events = [ev(0, 'start', { order: [] }), ev(0, 'turn')];
  assert.notEqual(validate(g, derive(g), ev(1, 'start', { order: [] })), null);
  g.events.push(ev(0, 'finish', { seconds: 3, riders: ['r2'] }), ev(0, 'turn'), ev(0, 'finish', { seconds: 0, riders: ['g1', 'g2', 'g3', 'r1', 'r3'] }));
  const d = derive(g);
  assert.equal(validate(g, d, ev(1, 'start', { order: [] })), null);
  assert.equal(startOrder(g, d, 1)[0], 'r2');
});

test('cieľ nejde zapísať pred prvým TURN ani dvakrát pre toho istého jazdca', () => {
  const g = makeGame();
  g.events = [ev(0, 'start', { order: [] })];
  assert.equal(validate(g, derive(g), ev(0, 'finish', { seconds: 0, riders: ['g1'] })), 'Najprv spusti etapu tlačidlom TURN.');
  g.events.push(ev(0, 'turn'), ev(0, 'finish', { seconds: 0, riders: ['g1'] }));
  assert.notEqual(validate(g, derive(g), ev(0, 'finish', { seconds: 0, riders: ['g1'] })), null);
});

test('celkové poradie pri rovnosti času rozhodne súčet umiestnení', () => {
  const g = makeGame();
  g.events = [
    ev(0, 'start', { order: [] }), ev(0, 'turn'),
    ev(0, 'finish', { seconds: 0, riders: ['r1', 'r2', 'r3'] }),
    ev(0, 'finish', { seconds: 30, riders: ['g1', 'g2', 'g3'] }),
  ];
  const s = derive(g).standings[0];
  assert.deepEqual(s.gc.map((r) => r.id), ['r1', 'r2', 'r3', 'g1', 'g2', 'g3']);
  assert.equal(s.teams[0].slot, 1);
  assert.equal(s.teams[1].gap, 90);
});
