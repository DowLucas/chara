/**
 * /splitwise-alternative — the pillar page for "splitwise alternative".
 *
 * The competitor names and /vs/ slugs come from `src/lib/competitors.ts`; this
 * bundle only carries the prose around them, keyed by slug under `apps.items`.
 * The FAQ array here is the one the page renders AND the one the FAQPage
 * JSON-LD is built from, so the two can never drift.
 */
export const splitwiseAlternative = {
  en: {
    meta: {
      title: "Splitwise alternatives, compared honestly (2026)",
      description:
        "Five Splitwise alternatives — Chara, Tricount, Settle Up, Splid, Steven — who each one is for, what stays free, and how to bring your balances over.",
    },
    eyebrow: "Alternatives · 2026",
    h1: "Splitwise alternatives, compared honestly.",
    lede: "People don't search for this because Splitwise is bad. It isn't. They search because the free tier changed: there is now a cap on how many expenses you can add in a day, and receipt scanning, currency conversion and recurring bills moved behind Splitwise Pro. If you would rather not pay for things that used to be free, here is what else there is — including where each app beats the one we make.",
    criteria: {
      eyebrow: "Before you switch",
      title: "Four things to check.",
      items: [
        {
          h: "Does the free tier stay free?",
          b: 'Read the pricing page for the word "limit". An app that is free until you use it is not free. Look for a cap on entries, on groups, on members, or a feature list that thins out after the first screen.',
        },
        {
          h: "Can you get your history out?",
          b: "Whatever you pick, one day you will want to leave it. Check for an export — a spreadsheet, a file, anything a human can read. If the only way out is retyping, that is a cost you pay later.",
        },
        {
          h: "Does it handle your currency?",
          b: "If your group ever travels, one currency is not enough. Check whether conversion is included or paid for, and whether the rate is current or something you type in by hand.",
        },
        {
          h: "Is it ad-free?",
          b: "Ads between entries are how most free split apps pay for themselves. That is a fair trade if you know you are making it. Just make sure you know.",
        },
      ],
    },
    apps: {
      eyebrow: "The alternatives",
      title: "Five apps, and who each one is for.",
      intro:
        "Short, and honest about where each one wins. The full comparison — including the rows where Chara loses — is on each app's own page.",
      items: {
        chara: {
          tag: "For the group that keeps going",
          body: "Chara is the one we make, so read this with that in mind. It is free with no cap and no ads, it reads a receipt line by line, it handles 159 currencies and it posts the rent by itself every month. You can run it on your own server. What it lacks is exactly what Splitwise has: a browser version, years of polish, and everyone already on it. If your group needs a web app today, it is not the right pick yet.",
          link: "Chara vs Splitwise →",
        },
        tricount: {
          tag: "For the trip",
          body: "Tricount is built around one-off trips. Nobody needs an account to join, everyone throws in what they paid, and at the end it says who transfers what. For a ski weekend with people you may never split with again, that no-account flow beats Chara. It falls short on the long haul: no recurring bills, no receipt scanning, and it stops being useful once the trip is over.",
          link: "Chara vs Tricount →",
        },
        "settle-up": {
          tag: "For the basics, on Android",
          body: "Settle Up has covered the fundamentals for years, especially on Android, and it has had a web version for as long — which Chara still has not shipped. The trade is the usual one: ads on the free tier, and the nicer features behind premium. If you are fine with ads and only need the basics, it is a reasonable choice.",
          link: "Chara vs Settle Up →",
        },
        splid: {
          tag: "For the weekend away",
          body: "Splid does the trip case with almost no friction: no accounts, a shared code, a tidy settlement at the end. It asks less of six people at a table than Chara does, and that is a real advantage. It is not built for a flat that is still splitting things eighteen months from now.",
          link: "Chara vs Splid →",
        },
        steven: {
          tag: "For Sweden, in kronor",
          body: "If you split bills in Sweden you have probably used Steven. It is simple enough that nobody needs it explained, and it speaks Swish. If your group already has it and only splits round numbers in kronor, switching buys you little. It has no receipt scanning, one currency in practice, and no recurring bills.",
          link: "Chara vs Steven →",
        },
      },
    },
    charaCase: {
      eyebrow: "Our case",
      title: "Why we built another one.",
      body1:
        "We used Splitwise for nine years. When the cap arrived the obvious answer was to pay, and we didn't want to — not on principle, but because splitting a dinner is not a subscription. So Chara is the version we wanted: every feature on the one free tier, no ads, and the whole thing open source under AGPL so it cannot quietly change later.",
      body2:
        "The honest part: Chara is new. There is no web app yet, the phone apps have rough edges, and you will be the one who suggests it. What you get in return is the receipt reading itself, the rent posting itself, and a group that costs nothing however much it is used.",
      switchLink: "How the switch works →",
      selfHostLink: "Run it yourself →",
    },
    faq: {
      titleA: "Questions,",
      titleB: "answered.",
      items: [
        {
          q: "Is there a completely free Splitwise alternative?",
          a: "Yes. Chara has no expense cap, no ads and no Pro tier — splitting, settling, receipts, currencies and recurring bills all sit on the one free tier. The only thing that costs money is extended AI use on Chara Cloud, and self-hosting removes even that. Tricount and Splid are also free for the trip case, with fewer features.",
        },
        {
          q: "What is the Splitwise daily limit?",
          a: "The free tier lets you add a handful of expenses per day; after that you are locked out until tomorrow, or asked to upgrade. Splitwise has changed the details more than once, so we don't print a number here.",
          more: { href: "/splitwise-daily-limit", label: "The daily limit, explained →" },
        },
        {
          q: "Can I export my Splitwise data?",
          a: "Splitwise can export a group's history as a spreadsheet, and it is worth keeping one as a record. Chara does not read that file. To move, you screenshot the balances screen instead: Chara reads who owes whom and sets the group up to match. Balances and people come over; the expense history stays in Splitwise.",
          more: { href: "/switch-from-splitwise", label: "How the switch works →" },
        },
        {
          q: "Which alternative is best for a trip?",
          a: "Tricount or Splid. Neither needs an account to join, which matters when you are getting six people onto the same ledger before the first round arrives. Chara is built the other way round — with accounts, so a balance stays attached to a person for years. Better for a flat, worse for a weekend.",
        },
        {
          q: "Is Chara open source?",
          a: "Yes, all of it, under the AGPL-3.0 licence. The backend, the apps and this website live in one repository on GitHub. You can read it, run it on your own machine in about ten minutes, and if we ever let you down you take your data and your server and go.",
        },
        {
          q: "Do I lose my history if I switch?",
          a: "No. Nothing in Splitwise is deleted when you import into Chara — Chara never touches your Splitwise account at all. Keep the old app as an archive for as long as you like. What moves is the current balance per person, which is the part that matters for the next expense.",
        },
      ],
    },
    cta: {
      eyebrow: "Try it",
      title: "Ten seconds to try.",
      body: "Free, uncapped, ad-free. Your balances come with you, and if it isn't better for your group, you have lost nothing.",
    },
  },
  sv: {
    meta: {
      title: "Alternativ till Splitwise, ärligt jämförda (2026)",
      description:
        "Fem alternativ till Splitwise — Chara, Tricount, Settle Up, Splid, Steven — vem varje passar, vad som förblir gratis och hur du tar med saldona.",
    },
    eyebrow: "Alternativ · 2026",
    h1: "Alternativ till Splitwise, ärligt jämförda.",
    lede: "Folk söker inte på det här för att Splitwise är dåligt. Det är det inte. De söker för att gratisnivån ändrades: nu finns ett tak för hur många utlägg du får lägga in per dag, och kvittoskanning, valutaomräkning och återkommande räkningar flyttade in bakom Splitwise Pro. Vill du hellre slippa betala för sådant som brukade vara gratis är det här vad som finns — inklusive var varje app slår den vi själva gör.",
    criteria: {
      eyebrow: "Innan du byter",
      title: "Fyra saker att kolla.",
      items: [
        {
          h: "Förblir gratisnivån gratis?",
          b: "Leta efter ordet ”gräns” på prissidan. En app som är gratis tills du använder den är inte gratis. Titta efter ett tak på poster, på grupper, på medlemmar, eller en funktionslista som tunnas ut efter första skärmen.",
        },
        {
          h: "Får du ut din historik?",
          b: "Vad du än väljer kommer du en dag vilja lämna det. Kolla om det finns en export — ett kalkylark, en fil, vad som helst en människa kan läsa. Är enda vägen ut att skriva om allt är det en kostnad du betalar senare.",
        },
        {
          h: "Klarar den din valuta?",
          b: "Reser ditt gäng någonsin räcker inte en valuta. Kolla om omräkning ingår eller kostar extra, och om kursen är aktuell eller något du knappar in för hand.",
        },
        {
          h: "Är den annonsfri?",
          b: "Annonser mellan posterna är så de flesta gratis delningsappar betalar för sig. Det är ett rimligt byte om du vet att du gör det. Se bara till att du vet.",
        },
      ],
    },
    apps: {
      eyebrow: "Alternativen",
      title: "Fem appar, och vem varje passar.",
      intro:
        "Kort, och ärligt om var varje app vinner. Hela jämförelsen — inklusive raderna där Chara förlorar — finns på varje apps egen sida.",
      items: {
        chara: {
          tag: "För gänget som fortsätter",
          body: "Chara är den vi gör, så läs det här med det i åtanke. Den är gratis utan tak och utan annonser, läser ett kvitto rad för rad, hanterar 159 valutor och lägger upp hyran själv varje månad. Du kan köra den på din egen server. Det som saknas är precis det Splitwise har: en webbversion, år av polering, och att alla redan är där. Behöver ditt gäng en webbapp i dag är den inte rätt val än.",
          link: "Chara vs Splitwise →",
        },
        tricount: {
          tag: "För resan",
          body: "Tricount är byggd kring enstaka resor. Ingen behöver konto för att gå med, alla slänger in vad de betalat, och på slutet säger den vem som för över vad. För en skidhelg med folk du kanske aldrig delar med igen slår det kontofria flödet Chara. På längre sikt räcker den inte: inga återkommande räkningar, ingen kvittoskanning, och den slutar vara till nytta när resan är över.",
          link: "Chara vs Tricount →",
        },
        "settle-up": {
          tag: "För grunderna, på Android",
          body: "Settle Up har täckt grunderna i åratal, särskilt på Android, och har haft en webbversion lika länge — vilket Chara fortfarande inte levererat. Bytet är det vanliga: annonser på gratisnivån, och de trevligare funktionerna bakom premium. Står du ut med annonser och bara behöver grunderna är den ett rimligt val.",
          link: "Chara vs Settle Up →",
        },
        splid: {
          tag: "För helgresan",
          body: "Splid löser resefallet nästan utan friktion: inga konton, en delad kod, en prydlig avräkning på slutet. Den kräver mindre av sex personer runt ett bord än Chara gör, och det är en verklig fördel. Den är inte byggd för en lägenhet som fortfarande delar saker om arton månader.",
          link: "Chara vs Splid →",
        },
        steven: {
          tag: "För Sverige, i kronor",
          body: "Delar du notan i Sverige har du förmodligen använt Steven. Den är så enkel att ingen behöver få den förklarad, och den talar Swish. Har ditt gäng den redan och bara delar jämna summor i kronor tjänar du lite på att byta. Den har ingen kvittoskanning, en valuta i praktiken, och inga återkommande räkningar.",
          link: "Chara vs Steven →",
        },
      },
    },
    charaCase: {
      eyebrow: "Vår sak",
      title: "Därför byggde vi ännu en.",
      body1:
        "Vi använde Splitwise i nio år. När taket kom var det självklara svaret att betala, och det ville vi inte — inte av princip, utan för att en delad middag inte är ett abonnemang. Så Chara är versionen vi ville ha: varje funktion på den enda gratisnivån, inga annonser, och alltihop öppen källkod under AGPL så att det inte kan ändras i tysthet senare.",
      body2:
        "Det ärliga: Chara är ny. Det finns ingen webbapp än, mobilapparna har vassa kanter, och du blir den som föreslår den. Det du får i utbyte är att kvittot läser sig självt, att hyran lägger upp sig själv, och ett gäng som inte kostar något hur mycket det än används.",
      switchLink: "Så går bytet till →",
      selfHostLink: "Kör den själv →",
    },
    faq: {
      titleA: "Frågor,",
      titleB: "besvarade.",
      items: [
        {
          q: "Finns det ett helt gratis alternativ till Splitwise?",
          a: "Ja. Chara har inget utläggstak, inga annonser och ingen Pro-nivå — delning, reglering, kvitton, valutor och återkommande räkningar ligger alla på den enda gratisnivån. Det enda som kostar är utökad AI-användning i Chara Cloud, och kör du egen server försvinner även det. Tricount och Splid är också gratis för resefallet, med färre funktioner.",
        },
        {
          q: "Vad är Splitwise dagsgräns?",
          a: "Gratisnivån låter dig lägga in en handfull utlägg per dag; sedan är du utelåst till i morgon, eller ombedd att uppgradera. Splitwise har ändrat detaljerna mer än en gång, så vi trycker ingen siffra här.",
          more: { href: "/splitwise-daily-limit", label: "Dagsgränsen, förklarad →" },
        },
        {
          q: "Kan jag exportera min Splitwise-data?",
          a: "Splitwise kan exportera en grupps historik som kalkylark, och det är värt att spara ett som arkiv. Chara läser inte den filen. För att flytta skärmdumpar du saldoskärmen i stället: Chara läser vem som är skyldig vem och sätter upp gruppen så att den stämmer. Saldon och personer följer med; utläggshistoriken stannar i Splitwise.",
          more: { href: "/switch-from-splitwise", label: "Så går bytet till →" },
        },
        {
          q: "Vilket alternativ är bäst för en resa?",
          a: "Tricount eller Splid. Ingen av dem kräver konto för att gå med, vilket spelar roll när sex personer ska in i samma bok innan första rundan kommer. Chara är byggd tvärtom — med konton, så att ett saldo hänger kvar på en person i åratal. Bättre för en lägenhet, sämre för en helg.",
        },
        {
          q: "Är Chara öppen källkod?",
          a: "Ja, alltihop, under licensen AGPL-3.0. Backend, apparna och den här webbplatsen ligger i ett och samma repo på GitHub. Du kan läsa koden, köra den på din egen maskin på ungefär tio minuter, och sviker vi dig tar du din data och din server och går.",
        },
        {
          q: "Förlorar jag min historik om jag byter?",
          a: "Nej. Ingenting i Splitwise raderas när du importerar till Chara — Chara rör över huvud taget inte ditt Splitwise-konto. Behåll den gamla appen som arkiv så länge du vill. Det som flyttar är det aktuella saldot per person, vilket är den del som spelar roll för nästa utlägg.",
        },
      ],
    },
    cta: {
      eyebrow: "Prova",
      title: "Tio sekunder att prova.",
      body: "Gratis, utan tak, utan annonser. Saldona följer med, och är den inte bättre för ditt gäng har du inte förlorat något.",
    },
  },
};
