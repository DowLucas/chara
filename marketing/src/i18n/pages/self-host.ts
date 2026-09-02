import { en as shell } from "../en";
import { sv as shellSv } from "../sv";

/**
 * /self-host — the page for people who read the compose file before the copy.
 *
 * Every command, port, variable and file name on the page is literal in the
 * route and comes from `deploy/` in the repo; this bundle only carries prose.
 *
 * The landing page already owns `selfHost.*` (its terminal strip: `titleA`,
 * `items`, `copy`, …) and `config.ts` merges page bundles into the catalogue
 * with a shallow spread, so a bare `{ selfHost: {...} }` would replace that
 * block and the homepage strip would render raw keys. Spreading the shell's
 * block in first keeps both alive whichever way the merge is done. Every key
 * added here is nested one level down so nothing can collide.
 */
const en = {
  ...shell.selfHost,
  meta: {
    title: "Self-host Chara — open-source bill splitting in Docker",
    description:
      "Run your own Chara server with Docker Compose and automatic HTTPS. AGPL-3.0, and the App Store and Play Store apps connect straight to it.",
  },
  hero: {
    eyebrow: "Run it yourself",
    title: "Self-host Chara.",
    lede: "One Docker Compose stack and a setup script. The App Store and Play Store apps connect straight to your server, so the only thing you run is the backend.",
  },
  install: {
    title: "The install.",
    body: "You need a machine that stays on and runs Docker — Intel or ARM, a Raspberry Pi is fine — and about ten minutes. The script asks three questions, generates every secret, writes a .env with chmod 600, starts the stack and waits until the API reports healthy. The first run pulls around 300 MB.",
    copy: "Copy",
    copied: "Copied",
    copyLabel: "Copy the install commands",
    questionsTitle: "What it asks",
    reachTitle: "How will phones reach this server?",
    modes: [
      {
        h: "Your own domain, bundled Caddy.",
        b: "Point DNS at the machine and forward ports 80 and 443. The Caddy add-on fetches and renews the TLS certificate, and the API is not exposed on the host at all.",
      },
      {
        h: "Behind a reverse proxy you already run.",
        b: "nginx, Traefik, your own Caddy. Proxy to 127.0.0.1:8080, give the public https address as BASE_URL, and set TRUSTED_PROXIES to the range your proxy sends X-Forwarded-For from.",
      },
      {
        h: "Home Wi-Fi only.",
        b: "Plain http on the machine's LAN address, port 8080. No domain, nothing to configure. The app accepts http only for private ranges — 192.168.x.x, 10.x.x.x, 172.16–31.x.x — so a Tailscale or .local name needs a or b.",
      },
    ],
    emailTitle: "How should Chara send email?",
    emailBody:
      "Sign-in is by magic link, so it needs SMTP — a Gmail app password is the easiest to get. Or pick test mode, where anyone who types an email is signed straight in and no mail is sent. Fine on home Wi-Fi; on the internet the script steers you away from it and makes you type YES.",
    geminiTitle: "Gemini API key?",
    geminiBody:
      "Optional. Press Enter to skip. It gates receipt scanning and voice entry; see the limits below.",
    after: "At the end it prints the address to type into the app.",
  },
  stack: {
    title: "What you get.",
    intro: "Three containers, wired together by the compose file in deploy/. Nothing else.",
    services: {
      postgres:
        "The only database. Expenses, balances, groups, sessions — every amount an int64 in minor units, never a float. Background jobs — recurring bills, reminders, push — run on River inside Postgres. No Redis.",
      minio:
        "S3-compatible storage for receipt images and other uploads. The console is on 127.0.0.1:9001, loopback only.",
      api: "The Go backend. Runs its own migrations on start, serves the app on 8080, exposes /api/health/liveness and /readiness. Pin a build with CHARA_VERSION=sha-<short>.",
    },
    appsTitle: "The client is already built.",
    appsBody:
      "Install Chara from the App Store or Google Play, tap “use my server →” on the sign-in screen, and type the address the script printed. The app holds several servers at once, so Chara Cloud and your own box share one home screen. Friends join the same way — same address — or via an invite link from inside a group.",
    everydayTitle: "Everyday",
    everyday: {
      logs: "watch logs",
      update: "update to the newest Chara",
      stop: "stop",
      reconfigure: "change a setting — answer n to “keep .env?”; secrets are kept",
      reset: "start over — deletes all data",
    },
  },
  manual: {
    title: "By hand, if you'd rather.",
    body: "The script is a convenience, not a requirement. Everything it writes is documented in .env.example.",
    addonsTitle: "Add-ons, combined with -f",
    addons: {
      caddy:
        "Bundled Caddy with automatic HTTPS. Needs CHARA_DOMAIN in .env, DNS pointing at your machine, and 80/443 forwarded. Set COMPOSE_FILE=docker-compose.yml:docker-compose.caddy.yml so plain docker compose always includes it.",
      build: "Build the API from the checkout instead of pulling the published image.",
    },
  },
  limits: {
    title: "What it does not do.",
    intro: "Stated up front, so you do not find out after the DNS is set.",
    items: [
      {
        h: "No Google or Apple sign-in.",
        b: "Those are hosted-only. Self-hosted servers sign people in with an email magic link — which is why SMTP matters.",
      },
      {
        h: "OIDC is not wired yet.",
        b: "The backend reads OIDC_ISSUER_URL, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET and advertises the method, but there is no sign-in flow behind it in either the API or the app today. Magic link is what works. Watch the repo.",
      },
      {
        h: "Receipt scanning needs your own Gemini key.",
        b: "So does voice entry — one key enables both. Leave it empty and the app hides both buttons. With it set, receipt images and voice recordings leave your server for Google's Gemini API for the length of the request; they are never written to disk or logs, but your users should know.",
      },
      {
        h: "No web client.",
        b: "Phone apps only, iOS and Android. ALLOWED_CORS_ORIGINS is in the compose file for the day there is one.",
      },
      {
        h: "Test mode is a door with no lock.",
        b: "DEV_MODE=true signs anyone in as anyone. It exists so you can try Chara on your own Wi-Fi in a minute. Set up SMTP before you open a port.",
      },
    ],
  },
  source: {
    title: "Actually open source.",
    body: "The whole thing — Go backend, Expo app, this site — is one repository under the GNU AGPL-3.0. That is not a source-available licence with a self-host carve-out: you can read it, change it, run it and redistribute it. The network clause cuts the other way too — run a modified Chara for other people and you owe them your changes. The published image at ghcr.io/dowlucas/chara-backend is built from main, and docker-compose.build.yml builds it from your own checkout if you would rather not trust ours.",
    link: "Read the source on GitHub →",
    readme: "The deploy README →",
  },
  faq: {
    title: "Questions.",
    items: [
      {
        q: "Is it really free to self-host?",
        a: "Yes. No licence key, no seat count, no “community edition” missing the good parts. The licence guarantees it: AGPL-3.0 means the source stays open and you can run it without asking us. What you pay for is your own hardware, a domain if you want one, and — only if you turn it on — Google's Gemini API for receipt scanning, billed by Google to you. We meter nothing.",
      },
      {
        q: "What does it need to run?",
        a: "One computer that stays on, with Docker and Compose v2: a Raspberry Pi, an old laptop, a NAS, a cheap VPS. Intel or ARM, including 32-bit Raspberry Pi OS. Three containers, about 300 MB of images on the first pull. And an address a phone can reach — localhost will never work, because sign-in links and invites are built from it.",
      },
      {
        q: "Can I use my own OIDC provider — Authentik, Keycloak, Authelia?",
        a: "Not today, honestly. The config variables exist and the server advertises the method, but neither the API nor the app has the sign-in flow behind it yet. Self-hosted sign-in is email magic link. If OIDC is a hard requirement, star the repo and wait for the release note rather than planning around it now.",
      },
      {
        q: "Do the phone apps work with my server?",
        a: "Yes — that is the point. The same App Store and Play Store builds connect to any Chara server. On the sign-in screen tap “use my server →” and type your address. An account on Chara Cloud, if you have one, keeps working alongside it; the app aggregates every server into one home screen. There is nothing to build or sideload.",
      },
      {
        q: "How do I back it up?",
        a: "Two Docker volumes and one file. The volumes are deploy_postgres_data and deploy_minio_data; the file is .env, because without JWT_SECRET and the Postgres password the volumes are just bytes. Stop the stack, tar the volumes, copy .env somewhere safe, start it again. The line below is the README's.",
      },
    ],
  },
  cta: {
    eyebrow: "Then the app",
    title: "Your server. Their phones.",
    body: "Install the app, tap “use my server →”, type the address.",
  },
};

const sv: typeof en = {
  ...shellSv.selfHost,
  meta: {
    title: "Hosta Chara själv — räkningsdelning i öppen källkod, i Docker",
    description:
      "Kör din egen Chara-server med Docker Compose och automatisk HTTPS. AGPL-3.0, och apparna i App Store och Play Store kopplar upp direkt mot den.",
  },
  hero: {
    eyebrow: "Kör den själv",
    title: "Hosta Chara själv.",
    lede: "En Docker Compose-stack och ett installationsskript. Apparna från App Store och Play Store kopplar upp direkt mot din server, så det enda du kör är backenden.",
  },
  install: {
    title: "Installationen.",
    body: "Du behöver en maskin som står på och kör Docker — Intel eller ARM, en Raspberry Pi duger — och ungefär tio minuter. Skriptet ställer tre frågor, genererar alla hemligheter, skriver en .env med chmod 600, startar stacken och väntar tills API:et svarar friskt. Första körningen hämtar runt 300 MB.",
    copy: "Kopiera",
    copied: "Kopierat",
    copyLabel: "Kopiera installationskommandona",
    questionsTitle: "Vad det frågar",
    reachTitle: "Hur ska telefonerna nå servern?",
    modes: [
      {
        h: "Egen domän, medföljande Caddy.",
        b: "Peka DNS mot maskinen och vidarebefordra port 80 och 443. Caddy-tillägget hämtar och förnyar TLS-certifikatet, och API:et exponeras inte alls på värden.",
      },
      {
        h: "Bakom en reverse proxy du redan kör.",
        b: "nginx, Traefik, din egen Caddy. Proxa till 127.0.0.1:8080, ange den publika https-adressen som BASE_URL och sätt TRUSTED_PROXIES till det intervall din proxy skickar X-Forwarded-For från.",
      },
      {
        h: "Bara hemma på Wi-Fi.",
        b: "Ren http på maskinens LAN-adress, port 8080. Ingen domän, inget att konfigurera. Appen accepterar http bara för privata intervall — 192.168.x.x, 10.x.x.x, 172.16–31.x.x — så ett Tailscale- eller .local-namn kräver a eller b.",
      },
    ],
    emailTitle: "Hur ska Chara skicka e-post?",
    emailBody:
      "Inloggning sker med magisk länk, så det behövs SMTP — ett Gmail-applösenord är enklast att få tag på. Eller välj testläge, där vem som helst som skriver in en e-postadress loggas in direkt utan att något mejl skickas. Funkar hemma på Wi-Fi; på internet styr skriptet bort dig från det och kräver att du skriver YES.",
    geminiTitle: "Gemini-API-nyckel?",
    geminiBody:
      "Valfritt. Tryck Enter för att hoppa över. Den styr kvittoskanning och röstinmatning; se begränsningarna nedan.",
    after: "Till sist skriver det ut adressen du ska skriva in i appen.",
  },
  stack: {
    title: "Det här får du.",
    intro: "Tre containrar, sammankopplade av compose-filen i deploy/. Inget mer.",
    services: {
      postgres:
        "Den enda databasen. Utlägg, saldon, grupper, sessioner — varje belopp ett int64 i ören, aldrig ett flyttal. Bakgrundsjobben — återkommande räkningar, påminnelser, push — körs på River inne i Postgres. Ingen Redis.",
      minio:
        "S3-kompatibel lagring för kvittobilder och andra uppladdningar. Konsolen ligger på 127.0.0.1:9001, bara loopback.",
      api: "Go-backenden. Kör sina egna migreringar vid start, serverar appen på 8080, exponerar /api/health/liveness och /readiness. Lås ett bygge med CHARA_VERSION=sha-<kort>.",
    },
    appsTitle: "Klienten är redan byggd.",
    appsBody:
      "Installera Chara från App Store eller Google Play, tryck på ”använd min server →” på inloggningsskärmen och skriv in adressen skriptet skrev ut. Appen håller flera servrar samtidigt, så Chara Cloud och din egen låda delar en hemskärm. Vänner ansluter på samma sätt — samma adress — eller via en inbjudningslänk inifrån en grupp.",
    everydayTitle: "Vardag",
    everyday: {
      logs: "se loggarna",
      update: "uppdatera till nyaste Chara",
      stop: "stoppa",
      reconfigure: "ändra en inställning — svara n på ”behåll .env?”; hemligheterna behålls",
      reset: "börja om — raderar all data",
    },
  },
  manual: {
    title: "För hand, om du hellre vill.",
    body: "Skriptet är en bekvämlighet, inte ett krav. Allt det skriver finns dokumenterat i .env.example.",
    addonsTitle: "Tillägg, kombineras med -f",
    addons: {
      caddy:
        "Medföljande Caddy med automatisk HTTPS. Kräver CHARA_DOMAIN i .env, DNS som pekar mot din maskin och 80/443 vidarebefordrade. Sätt COMPOSE_FILE=docker-compose.yml:docker-compose.caddy.yml så tar vanliga docker compose alltid med det.",
      build: "Bygg API:et från utcheckningen i stället för att hämta den publicerade avbilden.",
    },
  },
  limits: {
    title: "Det här gör den inte.",
    intro: "Sagt på förhand, så du inte upptäcker det efter att DNS:en är satt.",
    items: [
      {
        h: "Ingen inloggning med Google eller Apple.",
        b: "De finns bara i den hostade versionen. Servrar du kör själv loggar in folk med en magisk länk via e-post — därför spelar SMTP roll.",
      },
      {
        h: "OIDC är inte inkopplat än.",
        b: "Backenden läser OIDC_ISSUER_URL, OIDC_CLIENT_ID och OIDC_CLIENT_SECRET och annonserar metoden, men det finns inget inloggningsflöde bakom den i vare sig API:et eller appen idag. Magisk länk är det som fungerar. Håll koll på repot.",
      },
      {
        h: "Kvittoskanning kräver din egen Gemini-nyckel.",
        b: "Det gör röstinmatning också — en nyckel slår på båda. Lämna den tom så döljer appen båda knapparna. Med den satt lämnar kvittobilder och röstinspelningar din server till Googles Gemini-API så länge anropet pågår; de skrivs aldrig till disk eller loggar, men dina användare bör veta om det.",
      },
      {
        h: "Ingen webbklient.",
        b: "Bara mobilappar, iOS och Android. ALLOWED_CORS_ORIGINS ligger i compose-filen för den dag det finns en.",
      },
      {
        h: "Testläget är en dörr utan lås.",
        b: "DEV_MODE=true loggar in vem som helst som vem som helst. Det finns för att du ska kunna prova Chara på ditt eget Wi-Fi på en minut. Sätt upp SMTP innan du öppnar en port.",
      },
    ],
  },
  source: {
    title: "Öppen källkod på riktigt.",
    body: "Alltihop — Go-backend, Expo-app, den här sajten — ligger i ett repo under GNU AGPL-3.0. Det är ingen ”source available”-licens med ett undantag för egen server: du får läsa, ändra, köra och sprida den. Nätverksklausulen skär åt andra hållet också — kör du en modifierad Chara åt andra är du skyldig dem dina ändringar. Den publicerade avbilden på ghcr.io/dowlucas/chara-backend byggs från main, och docker-compose.build.yml bygger den från din egen utcheckning om du hellre slipper lita på vår.",
    link: "Läs källkoden på GitHub →",
    readme: "Deploy-README:n →",
  },
  faq: {
    title: "Frågor.",
    items: [
      {
        q: "Är det verkligen gratis att köra själv?",
        a: "Ja. Ingen licensnyckel, inget antal platser, ingen ”community edition” som saknar de bra delarna. Licensen garanterar det: AGPL-3.0 betyder att källkoden förblir öppen och att du får köra den utan att fråga oss. Det du betalar för är din egen hårdvara, en domän om du vill ha en, och — bara om du slår på det — Googles Gemini-API för kvittoskanning, som Google fakturerar dig för. Vi mäter ingenting.",
      },
      {
        q: "Vad krävs för att köra den?",
        a: "En dator som står på, med Docker och Compose v2: en Raspberry Pi, en gammal laptop, en NAS, en billig VPS. Intel eller ARM, inklusive 32-bitars Raspberry Pi OS. Tre containrar, runt 300 MB avbilder vid första hämtningen. Och en adress en telefon kan nå — localhost fungerar aldrig, eftersom inloggningslänkar och inbjudningar byggs från den.",
      },
      {
        q: "Kan jag använda min egen OIDC-leverantör — Authentik, Keycloak, Authelia?",
        a: "Inte idag, ärligt talat. Konfigurationsvariablerna finns och servern annonserar metoden, men varken API:et eller appen har inloggningsflödet bakom den än. Inloggning på egen server är magisk länk via e-post. Är OIDC ett skarpt krav: stjärnmärk repot och vänta på utgåvan i stället för att planera runt det nu.",
      },
      {
        q: "Fungerar mobilapparna med min server?",
        a: "Ja — det är hela poängen. Samma byggen från App Store och Play Store kopplar upp mot vilken Chara-server som helst. Tryck på ”använd min server →” på inloggningsskärmen och skriv din adress. Ett konto på Chara Cloud, om du har ett, fortsätter fungera bredvid; appen samlar varje server på en hemskärm. Inget att bygga eller sidladda.",
      },
      {
        q: "Hur säkerhetskopierar jag?",
        a: "Två Docker-volymer och en fil. Volymerna heter deploy_postgres_data och deploy_minio_data; filen är .env, för utan JWT_SECRET och Postgres-lösenordet är volymerna bara bytes. Stoppa stacken, tar:a volymerna, lägg .env någonstans säkert, starta igen. Raden nedan är README:ns.",
      },
    ],
  },
  cta: {
    eyebrow: "Sen appen",
    title: "Din server. Deras telefoner.",
    body: "Installera appen, tryck på ”använd min server →”, skriv in adressen.",
  },
};

export const selfHost = { en, sv };
