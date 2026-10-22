# Cyklizávod

Časomiera a výsledky pre [Tour de France Board Game](https://www.cycling-game.com/en/tour-de-france-board-game). Náhrada oficiálnej aplikácie: počíta časy etáp, bonifikácie, prémie a všetky klasifikácie.

Otvor <https://tvadovic.github.io/cyklizavod/>. Na Androide sa dá v Chrome nainštalovať ako appka (menu → Inštalovať aplikáciu) a funguje aj bez internetu.

## Ako sa hrá

1. **Nový závod:** vyber etapy v poradí, v akom sa pôjdu (jedna etapa = jednorazový závod), tímy a počet jazdcov.
2. **Štart:** pri prvej etape vylosuj poradie tímov, ďalšie etapy štartujú podľa celkového poradia.
3. **Počas etapy:**
   - **TURN** na začiatku každého kola. Prvé TURN spustí časomieru, každé ďalšie pridá minútu.
   - **Sprint / Vrch:** jazdci v poradí, v akom prešli čiarou (5-3-2-1 bodov).
   - **Cieľ:** sekundy z políčka, na ktoré dorazil prvý jazdec skupiny, potom jazdci skupiny v poradí.
   - **Odstúpil (DNF):** jazdec po Big Crash, vypadne z ďalších etáp.
   - **Karty dresov:** lídri súťaží môžu svoju kartu použiť raz za etapu.
   - **Späť** vráti posledný zápis.
4. **Výsledky** etapy, celkové poradie, body, vrchy a tímy. Na konci export do CSV, zdieľanie a tlač.

## Pravidlá výpočtov

| | |
|---|---|
| Čas v cieli | základný čas etapy + (počet kôl − 1) min + sekundy políčka |
| Bonifikácie | prví traja v cieli 10, 6, 4 s, odpočítajú sa len z celkového času |
| Prémie | 5-3-2-1 bodov pre prvých štyroch |
| Celkové poradie | súčet časov mínus bonifikácie, pri rovnosti rozhodne súčet umiestnení v etapách |
| Tímy | súčet troch najlepších časov tímu v každej etape; tím s menej ako troma jazdcami v cieli vypadáva |
| Dresy | nosí ich líder; ak vedie viac súťaží, nosí žltý a ďalší dres ide ďalšiemu v poradí |

Oficiálne etapy (údaje z oficiálnej aplikácie):

| Etapa | Základný čas | Sprinty | Vrchy |
|---|---|---|---|
| Roskilde › Nyborg | 4:10:00 | 1 | 0 |
| Briançon › Alpe d'Huez | 4:20:00 | 1 | 2 |
| Carcassonne › Foix | 4:00:00 | 1 | 1 |
| Paris La Défense › Champs-Élysées | 2:10:00 | 2 | 0 |

Ďalšie dosky sa dajú pridať ako vlastné etapy.

## Tímy

| Tím | Čísla |
|---|---|
| Zelený | 1–6 |
| Červený | 7–12 |
| Modrý | 13–18 |
| Fialový | 19–24 |
| Oranžový | 25–30 |
| Žltý | 31–36 |

## Ukladanie a databáza

Bez nastavenia sa hry ukladajú do prehliadača v tomto zariadení. Po pripojení Firebase sa hráči prihlasujú cez Google, hry sa synchronizujú medzi zariadeniami, závod môže zapisovať viac ľudí naraz (pozvánka odkazom) a všetko funguje aj offline.

Nastavenie Firebase:

1. Na [console.firebase.google.com](https://console.firebase.google.com) vytvor projekt.
2. Zapni **Firestore Database** a **Authentication** s poskytovateľom Google.
3. V Authentication → Settings → Authorized domains pridaj `tvadovic.github.io`.
4. Pridaj webovú appku a jej `firebaseConfig` vlož do `js/firebase-config.js`.
5. Obsah súboru `firestore.rules` vlož do Firestore → Rules a publikuj.

## Vývoj

Statická stránka bez build kroku: `index.html`, `css/app.css` a moduly v `js/`.

- `js/rules.js`: všetky herné výpočty (čisté funkcie)
- `js/store.js`: úložisko (lokálne a Firestore)
- `js/app.js`: obrazovky a ovládanie
- `js/data.js`: etapy, tímy, mená

Hra sa ukladá ako zoznam udalostí (TURN, cieľ, prémia…) a výsledky sa z nich vždy prepočítajú. Preto funguje „Späť" a zápisy z viacerých zariadení sa neprepisujú.

Testy pravidiel: `npm test` (Node 20+). Lokálne spustenie: `python3 -m http.server` a otvoriť `http://localhost:8000`.

Pri zmene súborov zvýš verziu `CACHE` v `sw.js`, aby si nainštalované appky stiahli novú verziu.
