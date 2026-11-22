# PubQuiz Engine

Real-time webová aplikace pro pořádání živých hospodských kvízů (lokálně bez internetu na notebooku moderátora i online přes cloudový hosting).

## Hlavní vlastnosti

- **3 striktně oddělené SignalR pohledy (`/screen`, `/host`, `/play`):**
  - **`/screen` (Projektor / TV):** Prezentační plátno bez ovládacích prvků – QR kód v lobby (generovaný 100% offline), pravidla, intro kola, otázky s odpočtem, lokální audio/video/obrázky i YouTube výřezy (`startSeconds`–`endSeconds`), odhalení odpovědi, animovaný žebříček (Framer Motion), stupně vítězů se statistikami večera a horní banner zpráv od moderátora.
  - **`/host` (Moderátor / Admin):** Ovládací pult s načítáním balíčků a jazykových mutací kvízu, stavovým automatem hry, klávesovými zkratkami (`Space`/`→`, `P`, `E`, `L`, `M`, `?`), přehledem odpovědí v reálném čase se serverovým pořadím a latencí, 1-klik přepínačem `Správně` / `½ bodu` / `Špatně`, ruční korekcí bodů, pauzou s úpravou parametrů živé otázky a zprávami hráčům i na projektor.
  - **`/play` (Hráčský klient pro mobily):** Připojení přes QR kód nebo 6znakový kód hry, úprava názvu a avatara týmu, perzistentní `teamToken` (JWT) v `localStorage` pro okamžité znovupřipojení po uspání telefonu, podpora `MultipleChoice`, `TextInput` (s automatickou tolerancí diakritiky a překlepů pomocí Levenshteinovy vzdálenosti) a `Ordering` (drag & drop i přístupná tlačítka Nahoru/Dolů), a oba režimy **Finálového žolíka** (`OnDemand` i `PreSelect`).
- **Zero-setup perzistence a odolnost:** Žádná externí databáze. Kvízy jsou v `./quizzes/<quiz-id>/`, aktivní hra se atomicky ukládá po každém přechodu stavu do `./state/active-session.json` (při pádu uprostřed otázky se obnoví v pozastaveném stavu se zachovaným zbývajícím časem).
- **Bezpečnost a HTTPS:** Automatický lokální **HTTPS** (`https://<LAN-IP>:5443`) s přesměrováním z HTTP (`:5080`), generovaný X.509 certifikát (TLS 1.2/1.3) pro `localhost` i aktuální LAN IP, role-based JWT tokeny (`Host`, `Screen`, `Player`), rate limiting proti brute-force, bezpečnostní hlavičky (CSP, HSTS, Fetch Metadata, `X-Frame-Options`, `nosniff`, sandbox na média) a validace nahraných souborů. Správné odpovědi a poznámky moderátora se nikdy neposílají na `/screen` ani `/play` před stavem `QuestionReveal`.
- **Přístupnost a vzhled:** WCAG 2.1 úroveň A+, světlý i tmavý režim s přepínačem respektující systémové preference (`light-dark()` + `<meta name="color-scheme">`), čeština jako výchozí jazyk s připraveným přepínačem `CZ`/`EN`.

---

## Rychlé spuštění (Windows, macOS i Linux)

### Požadavky
- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Node.js 20+](https://nodejs.org/) a [pnpm](https://pnpm.io/installation)

### 1. Jednorázové sestavení a spuštění (produkční/lokální režim)
MSBuild automaticky a multiplatformně spustí `pnpm install` a `pnpm run build` a výsledný frontend servíruje přímo ASP.NET Core:

```bash
dotnet run --project src/PubQuiz.Server -c Release
```

Po spuštění server automaticky vygeneruje lokální TLS certifikát pro aktuální **LAN IP adresu** a vypíše do konzole **HTTPS LAN adresu** (funguje pro všechny telefony na stejné Wi-Fi i bez internetu!), **PIN moderátora** (platí pro `/host` i `/screen`) a kód hry pro `/play`:

```text
============================================================
  PubQuiz Engine spuštěn!
  Lokální / LAN adresa : https://192.168.128.71:5443
  Moderátor (/host)    : https://192.168.128.71:5443/host  | PIN: 482910
  Projektor (/screen)  : https://192.168.128.71:5443/screen  (stejný PIN jako moderátor)
  Hráči (/play)        : https://192.168.128.71:5443/play?join=P4X9R3
  TLS / HTTPS          : aktivní (lokální LAN certifikát)
  Lokální CA certifikát: .../state/certs/pubquiz-ca.crt
============================================================
```

> **HTTPS na lokální síti:**
> - Výchozí porty jsou `5443` (HTTPS) a `5080` (HTTP automaticky přesměruje na HTTPS).
> - Při prvním otevření v prohlížeči se u lokálního self-signed certifikátu zobrazí varování – stačí jej jednorázově potvrdit (*Pokročilé → Pokračovat*), případně si na notebooku moderátora/projektoru nainstalovat `state/certs/pubquiz-ca.crt` do důvěryhodných kořenových certifikátů (nebo použít vlastní certifikát přes `QUIZ_HTTPS_CERT_PATH` / `PubQuiz:Https:CertificatePath`).
> - Při spuštění v cloudu s proměnnou `PORT` (Render, Docker) aplikace automaticky poslouchá přes HTTP za cloudovou TLS reverse proxy.

### 2. Vývojový režim (Hot Reload)
V prvním terminálu spusťte backend:
```bash
dotnet run --project src/PubQuiz.Server -p:SkipFrontendBuild=true
```
Ve druhém terminálu spusťte Vite dev server (automaticky proxuje `/api` a `/hubs`):
```bash
cd src/PubQuiz.Client && pnpm install && pnpm dev
```

### 3. Spuštění automatických testů
```bash
dotnet test PubQuiz.sln -p:SkipFrontendBuild=true
```

---

## Nasazení na cloud / free hosting (Render, Fly.io, Railway, Docker)

Aplikace automaticky čte proměnnou `PORT` a je optimalizována pro nízkou spotřebu paměti (`DOTNET_GCServer=0`).

### Konfigurační proměnné prostředí (volitelné)
| Proměnná | Popis |
| :--- | :--- |
| `QUIZ_HOST_PIN` | Vlastní PIN/heslo moderátora (jinak se vygeneruje při 1. startu do `state/runtime-secrets.json`). |
| `QUIZ_JWT_SECRET` | Vlastní tajný klíč pro podepisování JWT (min. 32 znaků). |
| `QUIZ_PUBLIC_URL` | Veřejná URL pro generování QR kódů (např. `https://muj-kviz.onrender.com`; jinak se detekuje automaticky z požadavku nebo LAN IP). |
| `QUIZ_DATA_DIR` | Vlastní složka obsahující podsložky `quizzes/` a `state/`. |

### Docker
```bash
docker build -t pubquiz-engine .
docker run -p 5080:5080 -e QUIZ_HOST_PIN=123456 pubquiz-engine
```

Na **Render.com** stačí propojit repozitář – soubor [render.yaml](render.yaml) je připravený pro okamžité nasazení ve free plánu.

---

## Tvorba vlastního kvízu a překladů

1. Vytvořte novou složku v `./quizzes/<vase-id>/` a přidejte `quiz.json` (JSON schéma pro napovídání v editoru je v [quizzes/schema/quiz.schema.json](quizzes/schema/quiz.schema.json)).
2. Lokální obrázky, audio (`.mp3`, `.wav`, `.ogg`) a videa (`.mp4`, `.webm`, `.vtt` titulky) uložte do `./quizzes/<vase-id>/media/` a odkažte je relativně (např. `"src": "media/song01.mp3"`).
3. Pro další jazykovou mutaci (např. angličtinu) stačí vytvořit soubor `./quizzes/<vase-id>/translations/en.json` (vzor v [quizzes/demo-kviz/translations/en.json](quizzes/demo-kviz/translations/en.json)).
4. **Ukázkové balíčky v repozitáři:**
   - `demo-kviz`: Rychlý 12otázkový kvíz se všemi typy otázek, lokálními médii, překladem do EN a režimem Žolíka `OnDemand`.
   - `hospodsky-kviz-01`: Kompletní 70otázkový český hospodský kvíz (5×12 základních + 10 finálových otázek) s režimem Žolíka `PreSelect`.

## Klávesové zkratky na `/host`
- `Space` nebo `→` — Další krok stavového automatu
- `P` — Pozastavit / Pokračovat aktivní otázku
- `E` — Upravit parametry aktivní otázky (čas, body, text, uznávané odpovědi)
- `Q` — Zobrazit úvodní stránku s QR kódem (při opakovaném stisku návrat zpět)
- `L` — Zobrazit průběžný žebříček (při opakovaném stisku návrat zpět)
- `B` nebo `Backspace` — Návrat zpět na předchozí obrazovku (ze žebříčku nebo QR obrazovky)
- `M` — Odeslat zprávu / předvolbu na projektor (`/screen`)
- `?` — Zobrazit nápovědu zkratek
