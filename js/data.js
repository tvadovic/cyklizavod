// Údaje hry: oficiálne etapy, tímy (farby a čísla figúrok) a generátor mien.

// Hodnoty etáp sú prevzaté z oficiálnej aplikácie Tour de France Board Game.
// baseMin = základný čas etapy v minútach, km = dĺžka etapy.
export const OFFICIAL_STAGES = [
  { key: 'roskilde-nyborg', name: 'Roskilde › Nyborg', baseMin: 250, km: 199, sprints: 1, mountains: 0 },
  { key: 'briancon-alpe-dhuez', name: "Briançon › Alpe d'Huez", baseMin: 260, km: 166, sprints: 1, mountains: 2 },
  { key: 'carcassonne-foix', name: 'Carcassonne › Foix', baseMin: 240, km: 179, sprints: 1, mountains: 1 },
  { key: 'paris', name: 'Paris La Défense › Champs-Élysées', baseMin: 130, km: 112, sprints: 2, mountains: 0 },
];

// Šesť tímov po šesť figúrok, každá figúrka má pevné číslo.
export const TEAM_SLOTS = [
  { slot: 0, name: 'Zelený', color: '#1f9d55' },
  { slot: 1, name: 'Červený', color: '#d63a2f' },
  { slot: 2, name: 'Modrý', color: '#2f74c0' },
  { slot: 3, name: 'Fialový', color: '#8a4fb0' },
  { slot: 4, name: 'Oranžový', color: '#e8871e' },
  { slot: 5, name: 'Žltý', color: '#f2c200' },
];

export const RIDERS_PER_SLOT = 6;
export const riderNumber = (slot, i) => slot * RIDERS_PER_SLOT + i + 1;

export const PRIME_POINTS = [5, 3, 2, 1];
export const FINISH_BONUS = [10, 6, 4];

const FIRST = ['Adam', 'Alex', 'Andrej', 'Boris', 'Dávid', 'Filip', 'Jakub', 'Ján', 'Jozef', 'Juraj', 'Karol', 'Lukáš', 'Marek', 'Martin', 'Matúš', 'Michal', 'Ondrej', 'Patrik', 'Pavol', 'Peter', 'Roman', 'Samuel', 'Štefan', 'Tomáš', 'Viktor'];
const LAST = ['Novák', 'Svoboda', 'Dvořák', 'Černý', 'Kučera', 'Veselý', 'Horák', 'Němec', 'Pokorný', 'Havel', 'Szabo', 'Baláž', 'Mlynár', 'Kollár', 'Bárta', 'Malý', 'Dostál', 'Hudec', 'Urban', 'Sagan', 'Velits', 'Kolář', 'Bašista', 'Fodor', 'Hrinák'];

export function randomName(taken = new Set()) {
  for (let i = 0; i < 50; i++) {
    const n = `${FIRST[Math.floor(Math.random() * FIRST.length)]} ${LAST[Math.floor(Math.random() * LAST.length)]}`;
    if (!taken.has(n)) return n;
  }
  return `Jazdec ${taken.size + 1}`;
}
