# Cyklizávod

**Cyklizávod** je neoficiálna náhrada aplikácie ku stolovej hre [Tour de France Board Game](https://www.cycling-game.com/en/tour-de-france-board-game) od TLAMA games. Rozhodca v nej počas hry zapisuje kolá, prémie a dojazdy do cieľa. Appka z toho vypočíta časy etáp, bonifikácie, body a všetky klasifikácie.

Otvorenie: <https://tvadovic.github.io/cyklizavod/>

Appka beží v prehliadači na telefóne, tablete aj počítači. Na Androide sa dá v Chrome nainštalovať ako bežná appka (menu ⋮ → **Inštalovať aplikáciu**) a funguje aj bez internetu.

## Na čo slúži

Stolová hra potrebuje „rozhodcu", ktorý počíta kolá, sleduje, kto prešiel sprintom alebo vrchom, a na konci etapy vypočíta časy. Oficiálna aplikácia na to existuje, ale nefunguje na všetkých telefónoch, neukladá históriu a nedá sa v nej opraviť chybný zápis. Cyklizávod robí to isté a navyše:

- **ukladá závody do účtu** a synchronizuje ich medzi zariadeniami,
- **závod môže zapisovať viac ľudí naraz**, každý na svojom telefóne,
- má **históriu** odohraných závodov s víťazmi všetkých súťaží,
- **každý zápis sa dá vrátiť** tlačidlom Späť,
- eviduje **karty dresov** (kto ich v etape už použil),
- **funguje offline**, zápisy sa odošlú, keď sa vráti internet,
- výsledky sa dajú **exportovať do CSV, zdieľať a vytlačiť**.

## Ako sa hrá

### 1. Prihlásenie

Na úvodnej obrazovke sa prihlás cez Google. Bez prihlásenia appka funguje tiež, ale závody ukladá len do daného zariadenia. Tie sa dajú neskôr presunúť do účtu tlačidlom **Presunúť do účtu**.

### 2. Nový závod

- **Etapy:** ťukni na etapy v poradí, v akom sa pôjdu. Jedna etapa = jednorazový závod, viac etáp = etapový závod. Ďalšie dosky (rozšírenia) sa dajú pridať ako **vlastná etapa** so základným časom a počtom prémií.
- **Tímy:** zapni tímy, ktoré hrajú (2 až 6), a počet jazdcov v tíme (3 až 6). Mená jazdcov sa vygenerujú, dajú sa prepísať.

### 3. Štart etapy

Pri prvej etape appka vylosuje **poradie tímov**. V ňom si hráči rozostavia figúrky do štartového koridoru. Ďalšie etapy štartujú podľa **celkového poradia**.

### 4. Počas etapy

Hore je časová tabuľa s aktuálnym časom etapy a číslom kola, pod ňou figúrky všetkých tímov s ich stavom (v pretekoch, poradie v cieli, DNF).

| Tlačidlo | Kedy | Čo zapíše |
|---|---|---|
| **TURN** | na začiatku každého kola | Prvé TURN spustí časomieru, každé ďalšie pridá minútu. |
| **Sprint** / **Vrch** | keď jazdci prejdú čiarou prémie | Jazdcov v poradí prejazdu. Dá sa dopĺňať po kolách, prémia sa uzavrie po štvrtom jazdcovi. Ak ďalší nikto neprejde, uzavrie sa ručne. |
| **Cieľ** | keď skupina dorazí do cieľa | Sekundy z políčka, na ktoré dorazil prvý jazdec skupiny, a jazdcov skupiny v poradí. Každá skupina sa zapisuje v kole, v ktorom došla. |
| **Odstúpil (DNF)** | pri Big Crash | Jazdec odstupuje zo závodu a vypadne aj z ďalších etáp. |
| **Karta dresu** | keď líder použije kartu | Každá karta sa dá použiť raz za etapu. |
| **Späť** | pri chybnom zápise | Vráti posledný zápis, ostatné ostanú. |
| **Priebežné poradie** | kedykoľvek | Doterajší dojazd etapy a celkové poradie po predchádzajúcej etape. |

Etapa sa skončí sama, keď sú všetci jazdci v cieli alebo odstúpili.

### 5. Výsledky

Po etape sa zobrazia výsledky: **Etapa**, **Celkovo** (žltý dres), **Body** (zelený), **Vrchy** (bodkovaný) a **Tímy**. Po poslednej etape nasledujú konečné výsledky s víťazmi a možnosťou exportu.

### 6. Viac zapisovateľov

V závode klikni na ikonu 👥 a pošli odkaz ďalším hráčom. Po prihlásení cez Google uvidia závod naživo a môžu doň zapisovať. Hodí sa napríklad keď jeden zapisuje TURN a druhý cieľ.

## Pravidlá výpočtov

Podľa [oficiálnych pravidiel](https://www.cycling-game.com/sites/default/files/prilohy/tour_de_france_bg-rules_en_0.pdf):

| | |
|---|---|
| **Čas v cieli** | základný čas etapy + (číslo kola − 1) min + sekundy políčka. Prvé TURN čas len spúšťa, ako v príkladoch v pravidlách (28 kôl = +27 min). |
| **Skupina** | všetci jazdci skupiny dostanú čas prvého z nej, poradie v skupine určuje poradie zápisu |
| **Bonifikácie** | prví traja v cieli 10, 6 a 4 sekundy. Odpočítajú sa len z celkového času, výsledky etapy neovplyvnia. |
| **Prémie** | 5-3-2-1 bodov pre prvých štyroch na každom sprinte a vrchu |
| **Celkové poradie** | súčet časov mínus bonifikácie, pri rovnosti rozhodne súčet umiestnení v etapách |
| **Body a vrchy** | súčet bodov, pri rovnosti rozhodne celkové poradie |
| **Tímy** | súčet troch najlepších časov tímu v každej etape (bez bonifikácií). Tím, ktorému v niektorej etape dôjdu do cieľa menej ako traja jazdci, vypadáva. |
| **Dresy** | nosí ich líder súťaže. Ak vedie viac súťaží, nosí žltý a ďalší dres dostane ďalší v poradí. |
| **Karty** | patria lídrom súťaží po predchádzajúcej etape, každá raz za etapu |
| **DNF** | jazdec vypadne z celkového poradia, prémií aj ďalších etáp |

### Etapy

Údaje oficiálnych etáp sú prevzaté z oficiálnej aplikácie:

| Etapa | Základný čas | Dĺžka | Sprinty | Vrchy |
|---|---|---|---|---|
| Roskilde › Nyborg | 4:10:00 | 199 km | 1 | 0 |
| Briançon › Alpe d'Huez | 4:20:00 | 166 km | 1 | 2 |
| Carcassonne › Foix | 4:00:00 | 179 km | 1 | 1 |
| Paris La Défense › Champs-Élysées | 2:10:00 | 112 km | 2 | 0 |

### Tímy a čísla figúrok

| Tím | Čísla |
|---|---|
| Zelený | 1–6 |
| Červený | 7–12 |
| Modrý | 13–18 |
| Fialový | 19–24 |
| Oranžový | 25–30 |
| Žltý | 31–36 |

## Ako to funguje vo vnútri

Appka je statická webová stránka bez servera a bez build kroku, hostovaná na GitHub Pages. Dáta ukladá do [Firebase](https://firebase.google.com/) (Firestore + prihlásenie cez Google), prípadne do prehliadača.

**Závod ako zoznam udalostí.** Závod sa neukladá ako tabuľka výsledkov, ale ako zoznam zápisov rozhodcu: štart etapy, TURN, prémia, cieľ, DNF, karta. Všetky časy, poradia a dresy sa z neho vždy prepočítajú. Preto:

- **Späť** len odstráni posledný zápis a výsledky sa prepočítajú,
- zápisy z viacerých zariadení sa neprepisujú, len pribúdajú,
- oprava chyby vo výpočte sa prejaví aj na už odohraných závodoch.

### Súbory

| Súbor | Obsah |
|---|---|
| `index.html` | kostra stránky |
| `css/app.css` | vzhľad |
| `js/app.js` | obrazovky a ovládanie |
| `js/rules.js` | všetky herné výpočty (čisté funkcie bez UI) |
| `js/data.js` | etapy, tímy, body, bonifikácie, generátor mien |
| `js/store.js` | úložisko: lokálne (localStorage) a cloudové (Firestore) |
| `js/firebase-config.js` | pripojenie k Firebase projektu |
| `firestore.rules` | bezpečnostné pravidlá databázy |
| `sw.js` | service worker pre offline režim |
| `tests/rules.test.mjs` | testy herných výpočtov |

### Dáta vo Firestore

- `games/{id}`: závod (názov, tímy, etapy, zoznam udalostí, členovia). Čítať a zapisovať môžu len členovia. Nečlen sa môže pridať, ak pozná ID závodu z pozvánky.
- `users/{uid}`: vlastné etapy používateľa.

### Firebase projekt

Appka je pripojená na projekt `cycling-board-game`. Pri zakladaní nového projektu:

1. Na [console.firebase.google.com](https://console.firebase.google.com) vytvor projekt.
2. Zapni **Firestore Database** a **Authentication** s poskytovateľom Google.
3. V Authentication → Settings → Authorized domains pridaj doménu stránky (`tvadovic.github.io`).
4. Pridaj webovú appku a jej `firebaseConfig` vlož do `js/firebase-config.js`.
5. Obsah `firestore.rules` vlož do Firestore → Rules a publikuj.

Kľúče v `firebase-config.js` nie sú tajné, prístup k dátam chránia pravidlá databázy.

### Vývoj

```sh
python3 -m http.server 8000   # spustenie na http://localhost:8000
npm test                      # testy pravidiel (Node 20+)
```

Pri každej zmene súborov zvýš verziu `CACHE` v `sw.js`, aby si nainštalované appky stiahli novú verziu.

## Upozornenie

Cyklizávod je neoficiálny projekt fanúšikov hry. Nie je spojený s TLAMA games ani s organizátormi Tour de France. Názvy hry a etáp patria ich vlastníkom.
