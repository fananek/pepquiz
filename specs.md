# Projekt: PubQuiz Engine (Real-time lokální kvízová aplikace)

## 1. Cíl a kontext aplikace
Vytvoř real-time webovou aplikaci pro pořádání živých hospodských kvízů (pro 4–6 týmů u stolů, jeden telefon, tablet nebo počítač na tým) běžící buď lokálně na notebooku moderátora (bez nutnosti připojení k internetu, pokud jsou média uložena lokálně, s volitelnou podporou odkazů, např. na YouTube a podobně), nebo hostovanou na nějakém free hostingu pro studenty a podobně. ,tak aby se dalo hrát i přes internet.

Aplikace musí striktně oddělit **3 klientské pohledy** synchronizované v reálném čase přes **SignalR**:
1. **`/screen` (Projektor / TV):** Prezentační plátno bez ovládacích prvků. Zobrazuje QR kód v lobby, úvodní pravidla, intro kola, otázku, odpočet času, přehrávač audia/videa, správnou odpověď po vyhodnocení a animovaný průběžný žebříček.
2. **`/host` (Moderátor / Admin):** Ovládací pult na notebooku moderátora. Umožňuje načíst balíček kvízu, řídit stavový automat hry, sledovat v reálném čase, kdo už odpověděl, vidět správnou odpověď včetně moderátorských poznámek a ručně korigovat body (např. uznání překlepů u textových odpovědí nebo udělení půl bodu). Moderátor má možnost kdykoloiv pozastavit hru (otázku) a upravit její parametry (např. časový limit, počet bodů a podobně). Má také možnost poslat dodatečnou zprávu hráčům. Dále má možnost na pár kliknutí vypsat na /screen krátkou zprávu (např.tip na vyřešení hádanky, omluva za zdrzeni apod.).
3. **`/play` (Hráčský klient, primárně na mobilu):** Minimalistické mobilní UI. Tým se připojí přes QR kód nebo odkaz na stránce moderátora v lobby. Zadá název týmu, případně si upraví avatara a dostane perzistentní `teamToken` uložený v `localStorage` (pro okamžité znovupřipojení po obnovení stránky nebo uspání mobilu). Během aktivní otázky zobrazuje odpovědní rozhraní (tlačítka A/B/C/D, textové pole, nebo drag & drop řazení položek). 

---

## 2. Technologický stack a požadavky na sestavení
- **Backend:** .NET 10, ASP.NET Core Minimal APIs + SignalR Hub (`/hubs/quiz`).
- **Frontend:** React + TypeScript + Vite + Tailwind CSS + Framer Motion (pro plynulé animace pořadí v žebříčku).
- **Správa balíčků a sestavení:** `pnpm` pro frontend. Projekt musí být **100% cross-platform (Windows, linux i macOS)** – MSBuild musí spouštět `pnpm` přímo (bez platformně závislých PowerShell/bash skriptů), a ASP.NET Core v produkčním režimu servíruje zkompilovaný frontend i lokální mediální soubory z balíčku kvízu.
- **Perzistence:** Bez externí databáze (zero-setup). Kvízy se načítají ze složky `./quizzes/<quiz-id>/` obsahující `quiz.json` a podsložku `media/`. Aktuální stav běžící hry žije v paměti serveru (thread-safe state service) a po každém významném přechodu stavu se automaticky ukládá do `./state/active-session.json` pro okamžitou obnovu po případném pádu aplikace. Je třeba zajistit správnou časovou posloupnost odpovědí jednotlivých teamů a maximálně eliminovat race conditions, rozdíly v kvalitě připojení a podobné anomálie.
- **Rozhraní** by mělo splňovat základní požadavky přístupnosti (WCAG 2.1 úroveň A), zejména pokud jde o klávesové zkratky, kontrast barev a velikost textu.
- **Bezpečnost:** Všechna rozhraní musí být chráněna tokenem (pro frontend stačí JWT token vydávaný serverem, pro SignalR by měl být vyžadován token v query parametru, např. `/hubs/quiz?token=<token>`).
- **Nasazení:** Aplikace by měla být schopna běžet lokálně na notebooku moderátora (bez nutnosti připojení k internetu, pokud jsou média uložena lokálně, s volitelnou podporou odkazů, např. na YouTube a podobně), nebo hostovaná na nějakém free hostingu pro studenty a podobně, tak aby se dalo hrát i přes internet. Je potřeba myslet na co nejjednodušší spuštění a konfiguraci pro běžné uživatele. . Také je potřeba zajistit co nejefektivnější využití prostředků (rychlost, paměť, CPU). Konkrétně prosím o řešení, která umožní běh na současných zařízeních studentů, která často mívají omezené možnosti.
- **Jazyky:**
  - Všechny texty (popisy, UI, atd) musí být primárně v češtině s možností vytvořit další jazykové mutace. Programová část, názvy souborů a backend kód by měly být primárně v angličtině.
  - Kvízy by měly být vytvářeny primárně v češtině, ale měla by být možnost v budoucnu vytvořit i jiné jazykové mutace (jednoduchý systém překladů).

---

## 3. Herní struktura a pravidla (Doménový model)
Standardní kvíz se skládá z **5 základních kol po 12 otázkách** + **1 finálového kola o 10 otázkách** (celkem 70 otázek).

### Typy otázek (`QuestionType`)
1. `MultipleChoice`: Výběr jedné správné odpovědi (A/B/C/D).
2. `TextInput`: Otevřená textová odpověď. Backend provádí automatické vyhodnocení pomocí normalizace (odstranění diakritiky, lowercase, trim) a Levenshteinovy vzdálenosti (tolerance překlepů), moderátor má na `/host` možnost jedním kliknutím přepnout stav (`Correct` / `HalfPoint` / `Wrong`) před zobrazením výsledků na `/screen`.
3. `Ordering`: Seřazení 3–5 položek do správného pořadí (např. chronologicky).

### Multimédia (`MediaAttachment`)
Každá otázka může obsahovat volitelné médium:
- `type`: `"audio"` | `"video"` | `"image"` | `"youtube"`
- `src`: Relativní cesta k lokálnímu souboru v `media/` (např. `media/song01.mp3`) nebo YouTube Video ID.
- `startSeconds` a `endSeconds`: Přesný časový výřez ukázky (aplikace automaticky spustí přehrávání v `startSeconds` a zastaví v `endSeconds`).
- `playbackMode`: `"duringQuestion"` (hraje během odpočtu otázky) nebo `"onReveal"` (hraje až při odhalení správné odpovědi).

### Bodování a časový faktor
- Základní body za správnou odpověď (např. `1000` bodů v základních kolech, `2000` bodů ve finále).
- **Rychlostní bonus (`speedBonusMax`, např. `200` bodů):** Začíná lineárně klesat až po uplynutí ochranné doby (`gracePeriodSeconds`, např. prvních 5 sekund, aby týmy měly čas přečíst otázku bez bezhlavého klikání) až do konce časového limitu.
- **Finálový žolík (`Joker`):** Před zahájením finálového kola si každý tým na mobilu vybere 2 otázky (nebo aktivuje žolíka před konkrétní otázkou), kde se jeho zisk násobí `2x`, ale za špatnou odpověď se odečítá polovina základních bodů.

---

## 4. Stavový automat hry (`GameState`)
Řízen výhradně moderátorem z `/host` (s automatickým přechodem při vypršení časovače otázky):
1. `Lobby`: Zobrazení názvu kvízu, lokální URL adresy a QR kódu pro připojení týmů; seznam připojených týmů v reálném čase.
2. `QuizIntro`: Zobrazení názvu a obecných pravidel kvízu (např. *Vánoční speciál*).
3. `RoundIntro`: Zobrazení názvu a pravidel nadcházejícího kola (např. *Kolo 2: Filmové hlášky – 12 otázek*).
4. `QuestionActive`: Běží serverový odpočet (`endsAtUtc`), na `/screen` běží otázka a médium, na `/play` se zadávají odpovědi. Jakmile odpoví všechny připojené týmy nebo vyprší čas, stav přejde do `QuestionLocked`.
5. `QuestionLocked`: Hlasování uzavřeno. Moderátor na `/host` vidí přehled odpovědí všech týmů, může upravit uznání textových odpovědí a klikne na *Odhalit odpověď*.
6. `QuestionReveal`: Na `/screen` se zobrazí správná odpověď, získané body týmů za tuto otázku a volitelně se přehraje ukázka s řešením.
7. `Leaderboard`: Průběžné pořadí týmů (animované přeskládání podle celkového skóre) po skončení kola nebo po vybraných otázkách.
8. `Finished`: Finální stupně vítězů a statistiky večera (nejrychlejší tým, nejúspěšnější kolo).

---

## 5. Schéma `quiz.json` (Příklad struktury)
Navrhni čistý C# datový model a JSON schéma odpovídající tomuto formátu:
```json
{
  "id": "hospodsky-kviz-01",
  "title": "Podzimní hospodský speciál",
  "settings": {
    "defaultTimeLimitSeconds": 30,
    "gracePeriodSeconds": 5,
    "basePoints": 1000,
    "speedBonusMax": 200
  },
  "rounds": [
    {
      "roundNumber": 1,
      "title": "Všeobecný přehled",
      "description": "12 otázek na rozehřátí",
      "isFinal": false,
      "pointMultiplier": 1.0,
      "questions": [
        {
          "id": "r1-q1",
          "type": "MultipleChoice",
          "text": "Který film získal Oscara za nejlepší film za rok 2023?",
          "options": ["Barbie", "Oppenheimer", "Chudáčci", "Zabijáci rozkvetlého měsíce"],
          "correctAnswer": "Oppenheimer",
          "hostNote": "Režie Christopher Nolan, 7 Oscarů celkem.",
          "timeLimitSeconds": 25,
          "media": null
        },
        {
          "id": "r1-q2",
          "type": "TextInput",
          "text": "Poznejte interpreta a název této skladby:",
          "acceptedAnswers": ["Queen - Bohemian Rhapsody", "Bohemian Rhapsody"],
          "correctAnswer": "Queen – Bohemian Rhapsody",
          "timeLimitSeconds": 45,
          "media": {
            "type": "audio",
            "src": "media/r1-q2-queen.mp3",
            "startSeconds": 42,
            "endSeconds": 65,
            "playbackMode": "duringQuestion"
          }
        }
      ]
    }
  ]
}