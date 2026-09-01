/**
 * One record per app people compare Chara against.
 *
 * These pages exist because "splitwise alternative" and "chara vs tricount"
 * are the searches with real intent, and a single homepage section cannot rank
 * for five different queries. The data lives here rather than in a translation
 * catalogue so that the verdicts — the part that must never drift between
 * languages — are written once, and only the prose around them is translated.
 *
 * Honesty rule, inherited from the landing page's comparison table: every
 * competitor keeps at least one row it wins. A page that claims a clean sweep
 * reads as marketing and converts worse than one that concedes a point.
 *
 * `verdict` drives the glyph and colour, matching the landing table:
 *   good  — clear win        mixed — partial / paid-tier only
 *   bad   — not available    soon  — on the roadmap, not shipped
 */

export type Verdict = "good" | "mixed" | "bad" | "soon";

export type CompareRow = {
  /** The question a person actually asks, not a feature name. */
  k: { en: string; sv: string };
  /** What the competitor does, and our verdict on it. */
  them: { en: string; sv: string; verdict: Verdict };
  /** What Chara does, and our verdict on it. */
  us: { en: string; sv: string; verdict: Verdict };
};

export type Competitor = {
  /** URL segment: /vs/<slug>. */
  slug: string;
  /** Display name, used in copy and headings. */
  name: string;
  /** Name as it appears in the comparison column header. */
  columnName: { en: string; sv: string };
  /** Page <title>. Front-loads the query; stays under ~60 characters. */
  title: { en: string; sv: string };
  /** Meta description. Answers the query in one sentence. */
  description: { en: string; sv: string };
  /** H1. */
  h1: { en: string; sv: string };
  /** The opening paragraph — the honest summary, in two or three sentences. */
  lede: { en: string; sv: string };
  /** The one line a reader should remember. Rendered as a pull quote. */
  verdict: { en: string; sv: string };
  /** Where the competitor genuinely beats us. Never empty. */
  theyWin: { en: string; sv: string };
  rows: CompareRow[];
};

/** Verdicts were last rechecked against each app's free tier on this date. */
export const COMPARE_AS_OF = { en: "August 2026", sv: "augusti 2026" };

const CAP_ROW: CompareRow = {
  k: { en: "How many expenses a day", sv: "Hur många utgifter per dag" },
  them: {
    en: "A handful, then you're locked out until tomorrow",
    sv: "En handfull, sedan är du utelåst till imorgon",
    verdict: "bad",
  },
  us: { en: "Unlimited", sv: "Obegränsat", verdict: "good" },
};

const ADS_ROW: CompareRow = {
  k: { en: "Ads", sv: "Reklam" },
  them: {
    en: "Banners and countdowns between entries",
    sv: "Banners och nedräkningar mellan poster",
    verdict: "bad",
  },
  us: { en: "Never, on any tier", sv: "Aldrig, på någon nivå", verdict: "good" },
};

const RECEIPT_ROW: CompareRow = {
  k: { en: "Scan a receipt", sv: "Skanna ett kvitto" },
  them: { en: "Paid plan only", sv: "Endast betalplan", verdict: "mixed" },
  us: {
    en: "Yes — reads each line, splits per person",
    sv: "Ja — läser varje rad, delar per person",
    verdict: "good",
  },
};

const VOICE_ROW: CompareRow = {
  k: { en: "Describe the expense out loud", sv: "Beskriv utgiften med rösten" },
  them: { en: "No", sv: "Nej", verdict: "bad" },
  us: {
    en: "Yes — any language, several expenses in one sentence",
    sv: "Ja — vilket språk som helst, flera utgifter i en mening",
    verdict: "good",
  },
};

const SELFHOST_ROW: CompareRow = {
  k: { en: "Run it on your own server", sv: "Kör den på din egen server" },
  them: { en: "No", sv: "Nej", verdict: "bad" },
  us: {
    en: "Yes — one command, about ten minutes",
    sv: "Ja — ett kommando, cirka tio minuter",
    verdict: "good",
  },
};

const SOURCE_ROW: CompareRow = {
  k: { en: "Open source", sv: "Öppen källkod" },
  them: { en: "Closed", sv: "Stängd", verdict: "bad" },
  us: { en: "AGPL-3.0, all of it", sv: "AGPL-3.0, alltihop", verdict: "good" },
};

const BROWSER_ROW: CompareRow = {
  k: { en: "Use it in a browser", sv: "Använd den i en webbläsare" },
  them: { en: "Yes", sv: "Ja", verdict: "good" },
  us: {
    en: "Not yet — phone apps today",
    sv: "Inte än — mobilappar i dag",
    verdict: "soon",
  },
};

const NETWORK_ROW: CompareRow = {
  k: { en: "Your friends already have it", sv: "Dina vänner har den redan" },
  them: {
    en: "Almost certainly, and that matters",
    sv: "Nästan säkert, och det spelar roll",
    verdict: "good",
  },
  us: {
    en: "No — you'll be the one who suggests it",
    sv: "Nej — du blir den som föreslår den",
    verdict: "bad",
  },
};

export const COMPETITORS: Competitor[] = [
  {
    slug: "splitwise",
    name: "Splitwise",
    columnName: { en: "Splitwise (free)", sv: "Splitwise (gratis)" },
    title: {
      en: "Chara vs Splitwise: the free alternative with no daily cap",
      sv: "Chara vs Splitwise: gratisalternativet utan dagstak",
    },
    description: {
      en: "Splitwise caps how many expenses you add per day unless you pay. Chara is free and uncapped, scans receipts, and imports your balances from a screenshot.",
      sv: "Splitwise begränsar hur många utgifter du kan lägga till per dag om du inte betalar. Chara är gratis och utan tak, skannar kvitton gratis och importerar dina Splitwise-saldon från en skärmdump.",
    },
    h1: {
      en: "Chara vs Splitwise",
      sv: "Chara vs Splitwise",
    },
    lede: {
      en: "Splitwise has been doing this since 2011 and it shows: it is polished, and everyone you split with already has it. What changed is the free tier. There is now a cap on how many expenses you can add in a day, and receipt scanning, currency conversion and recurring bills all sit behind Splitwise Pro. Chara gives you those for nothing.",
      sv: "Splitwise har hållit på sedan 2011 och det märks: appen är genomarbetad och alla du delar med har den redan. Det som förändrats är gratisnivån. Nu finns ett tak för hur många utgifter du kan lägga till per dag, och kvittoskanning, valutaväxling och återkommande räkningar ligger bakom Splitwise Pro. Chara ger dig det gratis.",
    },
    verdict: {
      en: "If you hit the daily limit, or you resent paying to scan a receipt, Chara does that part for free. If your whole group is already on Splitwise and happy, that network is worth something and we will not pretend otherwise.",
      sv: "Om du slår i dagsgränsen, eller ogillar att betala för att skanna ett kvitto, gör Chara den delen gratis. Om hela ditt gäng redan sitter på Splitwise och trivs är det nätverket värt något, och det tänker vi inte låtsas om.",
    },
    theyWin: {
      en: "Splitwise wins on reach and maturity. Fifteen years of edge cases have been found and fixed, and the person you are splitting rent with has probably had an account since university.",
      sv: "Splitwise vinner på räckvidd och mognad. Femton år av gränsfall har hittats och lagats, och personen du delar hyra med har troligen haft ett konto sedan studietiden.",
    },
    rows: [
      CAP_ROW,
      {
        k: { en: "What it costs", sv: "Vad det kostar" },
        them: {
          en: "Free until the daily cap, then a monthly subscription",
          sv: "Gratis fram till dagstaket, sedan en månadsprenumeration",
          verdict: "mixed",
        },
        us: {
          en: "Free. Only extended AI use costs, and only on our cloud",
          sv: "Gratis. Bara utökad AI-användning kostar, och bara i vårt moln",
          verdict: "good",
        },
      },
      ADS_ROW,
      RECEIPT_ROW,
      VOICE_ROW,
      {
        k: { en: "Different currencies", sv: "Olika valutor" },
        them: { en: "Paid plan only", sv: "Endast betalplan", verdict: "mixed" },
        us: {
          en: "159 currencies, refreshed daily",
          sv: "159 valutor, uppdaterade dagligen",
          verdict: "good",
        },
      },
      {
        k: { en: "Rent and repeating bills", sv: "Hyra och återkommande räkningar" },
        them: { en: "Paid plan only", sv: "Endast betalplan", verdict: "mixed" },
        us: {
          en: "Set once, posts itself",
          sv: "Ställ in en gång, bokförs själv",
          verdict: "good",
        },
      },
      SELFHOST_ROW,
      SOURCE_ROW,
      BROWSER_ROW,
      NETWORK_ROW,
    ],
  },
  {
    slug: "tricount",
    name: "Tricount",
    columnName: { en: "Tricount (free)", sv: "Tricount (gratis)" },
    title: {
      en: "Chara vs Tricount: which bill splitter to pick",
      sv: "Chara vs Tricount: vilken delningsapp ska du välja",
    },
    description: {
      en: "Tricount is built for one-off trips and needs no accounts. Chara is for groups that keep going: receipt scanning, recurring bills, no ads. Compared honestly.",
      sv: "Tricount är byggt för enstaka resor och fungerar utan konton. Chara är byggt för grupper som fortsätter, med kvittoskanning, återkommande räkningar och ingen reklam. Här är den ärliga jämförelsen.",
    },
    h1: { en: "Chara vs Tricount", sv: "Chara vs Tricount" },
    lede: {
      en: "Tricount is the trip app. You start a tricount for the ski weekend, everyone throws in what they paid, and at the end it tells you who transfers what. That is a genuinely good shape for a holiday, and it asks almost nothing of the people joining. Chara is aimed at the groups that do not end: the flat, the couple, the people you eat with every other week.",
      sv: "Tricount är resappen. Du startar en tricount för skidhelgen, alla slänger in vad de betalat, och till slut säger den vem som ska föra över vad. Det är en riktigt bra form för en semester, och den kräver nästan ingenting av dem som går med. Chara siktar på grupperna som inte tar slut: lägenheten, paret, folket du äter med varannan vecka.",
    },
    verdict: {
      en: "For one holiday with people you may never split with again, Tricount's no-account flow is hard to beat. For a household ledger that runs for years, you want receipt scanning, recurring bills and a balance you can trust without re-reading the history.",
      sv: "För en semester med folk du kanske aldrig delar med igen är Tricounts kontofria flöde svårslaget. För en hushållsbok som rullar i åratal vill du ha kvittoskanning, återkommande räkningar och ett saldo du kan lita på utan att läsa om historiken.",
    },
    theyWin: {
      en: "Tricount wins on the cold start. Nobody has to make an account to join a trip, which removes the single biggest reason a group never adopts a split app at all.",
      sv: "Tricount vinner på kallstarten. Ingen behöver skapa konto för att gå med i en resa, vilket tar bort det största enskilda skälet till att en grupp aldrig börjar använda en delningsapp.",
    },
    rows: [
      {
        k: { en: "Join without an account", sv: "Gå med utan konto" },
        them: { en: "Yes — share a link and go", sv: "Ja — dela en länk och kör", verdict: "good" },
        us: {
          en: "No — everyone signs in, which is what keeps balances attached to a person",
          sv: "Nej — alla loggar in, vilket är det som håller saldon kopplade till en person",
          verdict: "bad",
        },
      },
      ADS_ROW,
      RECEIPT_ROW,
      VOICE_ROW,
      {
        k: { en: "Rent and repeating bills", sv: "Hyra och återkommande räkningar" },
        them: { en: "No", sv: "Nej", verdict: "bad" },
        us: {
          en: "Set once, posts itself",
          sv: "Ställ in en gång, bokförs själv",
          verdict: "good",
        },
      },
      {
        k: { en: "Settle in the fewest transfers", sv: "Gör upp med minsta antal överföringar" },
        them: { en: "Yes, per tricount", sv: "Ja, per tricount", verdict: "good" },
        us: { en: "Yes, across the whole group", sv: "Ja, för hela gruppen", verdict: "good" },
      },
      SELFHOST_ROW,
      SOURCE_ROW,
      BROWSER_ROW,
      NETWORK_ROW,
    ],
  },
  {
    slug: "settle-up",
    name: "Settle Up",
    columnName: { en: "Settle Up (free)", sv: "Settle Up (gratis)" },
    title: {
      en: "Chara vs Settle Up: a free, ad-free comparison",
      sv: "Chara vs Settle Up: en gratis och reklamfri jämförelse",
    },
    description: {
      en: "Settle Up is free but ad-supported, with premium for the rest. Chara is free with no ads at any tier, scans receipts, and can be self-hosted.",
      sv: "Settle Up är gratis men reklamfinansierat, med premium som låser upp resten. Chara är gratis utan reklam på någon nivå, skannar kvitton och kan köras på egen server. Den ärliga jämförelsen.",
    },
    h1: { en: "Chara vs Settle Up", sv: "Chara vs Settle Up" },
    lede: {
      en: "Settle Up covers the fundamentals well and has a long history on Android. The trade it asks is the usual one: the free tier carries ads, and the things that make a split app pleasant to live in sit behind premium. Chara makes a different trade — everything in the app is free, and only extended AI use on our hosted service costs anything.",
      sv: "Settle Up täcker grunderna bra och har en lång historia på Android. Bytet den ber om är det vanliga: gratisnivån har reklam, och det som gör en delningsapp trevlig att leva i ligger bakom premium. Chara gör ett annat byte — allt i appen är gratis, och bara utökad AI-användning i vår molntjänst kostar något.",
    },
    verdict: {
      en: "If you are happy with ads and only need the basics, Settle Up is a reasonable free option with years behind it. If ads between entries bother you, or you want the receipt to fill itself in, Chara does that at no cost.",
      sv: "Om du står ut med reklam och bara behöver grunderna är Settle Up ett rimligt gratisval med många år bakom sig. Om reklam mellan posterna stör dig, eller om du vill att kvittot fyller i sig självt, gör Chara det utan kostnad.",
    },
    theyWin: {
      en: "Settle Up wins on maturity and on being where people already are, especially on Android. It has also had a working web version for years, which we have not shipped yet.",
      sv: "Settle Up vinner på mognad och på att finnas där folk redan är, särskilt på Android. Den har dessutom haft en fungerande webbversion i åratal, vilket vi ännu inte levererat.",
    },
    rows: [
      ADS_ROW,
      {
        k: { en: "What the free tier holds back", sv: "Vad gratisnivån håller tillbaka" },
        them: {
          en: "Several features sit behind premium",
          sv: "Flera funktioner ligger bakom premium",
          verdict: "mixed",
        },
        us: {
          en: "Nothing in the app. There is no Pro tier",
          sv: "Ingenting i appen. Det finns ingen Pro-nivå",
          verdict: "good",
        },
      },
      RECEIPT_ROW,
      VOICE_ROW,
      {
        k: { en: "Different currencies", sv: "Olika valutor" },
        them: { en: "Yes", sv: "Ja", verdict: "good" },
        us: {
          en: "159 currencies, refreshed daily",
          sv: "159 valutor, uppdaterade dagligen",
          verdict: "good",
        },
      },
      SELFHOST_ROW,
      SOURCE_ROW,
      BROWSER_ROW,
      NETWORK_ROW,
    ],
  },
  {
    slug: "splid",
    name: "Splid",
    columnName: { en: "Splid (free)", sv: "Splid (gratis)" },
    title: {
      en: "Chara vs Splid: group expenses, compared honestly",
      sv: "Chara vs Splid: grupputgifter, ärligt jämfört",
    },
    description: {
      en: "Splid is a clean, no-account trip splitter. Chara is a long-running group ledger with receipt scanning, recurring bills and self-hosting. Where each one wins.",
      sv: "Splid är en ren resedelare utan konton. Chara är en långlivad gruppbok med kvittoskanning, återkommande räkningar och egen drift. Var och en vinner.",
    },
    h1: { en: "Chara vs Splid", sv: "Chara vs Splid" },
    lede: {
      en: "Splid does the trip case with very little friction: no accounts, a shared code, and a tidy settlement at the end. It is a good answer to a specific question. Chara answers a longer one — the group that is still splitting things eighteen months from now, where somebody needs to know today whether they are up or down without scrolling through history.",
      sv: "Splid löser resefallet med väldigt lite friktion: inga konton, en delad kod och en prydlig avräkning på slutet. Det är ett bra svar på en specifik fråga. Chara svarar på en längre — gruppen som fortfarande delar saker om arton månader, där någon behöver veta i dag om de ligger plus eller minus utan att skrolla genom historiken.",
    },
    verdict: {
      en: "Splid for the weekend away. Chara for the flat, the couple, and anything with a rent line in it.",
      sv: "Splid för helgresan. Chara för lägenheten, paret och allt som har en hyresrad i sig.",
    },
    theyWin: {
      en: "Splid wins on how little it asks. No sign-up is a real advantage when you are trying to get six people onto the same ledger before the first round arrives.",
      sv: "Splid vinner på hur lite den kräver. Ingen registrering är en verklig fördel när du försöker få sex personer i samma bok innan första rundan kommer.",
    },
    rows: [
      {
        k: { en: "Join without an account", sv: "Gå med utan konto" },
        them: { en: "Yes — share a code", sv: "Ja — dela en kod", verdict: "good" },
        us: {
          en: "No — everyone signs in, which is what keeps balances attached to a person",
          sv: "Nej — alla loggar in, vilket är det som håller saldon kopplade till en person",
          verdict: "bad",
        },
      },
      ADS_ROW,
      RECEIPT_ROW,
      VOICE_ROW,
      {
        k: { en: "Rent and repeating bills", sv: "Hyra och återkommande räkningar" },
        them: { en: "No", sv: "Nej", verdict: "bad" },
        us: {
          en: "Set once, posts itself",
          sv: "Ställ in en gång, bokförs själv",
          verdict: "good",
        },
      },
      SELFHOST_ROW,
      SOURCE_ROW,
      NETWORK_ROW,
    ],
  },
  {
    slug: "steven",
    name: "Steven",
    columnName: { en: "Steven", sv: "Steven" },
    title: {
      en: "Chara vs Steven: the Swedish bill splitter, compared",
      sv: "Chara vs Steven: den svenska delningsappen, jämförd",
    },
    description: {
      en: "Steven is the Swedish favourite for simple splits over Swish. Chara adds receipt scanning, 159 currencies and recurring bills, free and without ads.",
      sv: "Steven är den svenska favoriten för enkla delningar med Swish. Chara lägger till kvittoskanning, 159 valutor, återkommande räkningar och egen drift, och är gratis utan reklam.",
    },
    h1: { en: "Chara vs Steven", sv: "Chara vs Steven" },
    lede: {
      en: "If you split bills in Sweden, you have probably used Steven. It keeps things simple and it speaks Swish, which is most of what a Swedish group needs. Chara also settles over Swish, and adds the parts Steven never took on: reading a receipt line by line, handling a trip priced in three currencies, and posting the rent by itself every month.",
      sv: "Delar du notan i Sverige har du förmodligen använt Steven. Den håller det enkelt och talar Swish, vilket är det mesta en svensk grupp behöver. Chara gör också upp via Swish och lägger till det Steven aldrig tog sig an: att läsa ett kvitto rad för rad, hantera en resa prissatt i tre valutor och bokföra hyran själv varje månad.",
    },
    verdict: {
      en: "Steven if the group only ever splits a bill down the middle in kronor. Chara if the receipt matters, the trip was abroad, or the same bill turns up every month.",
      sv: "Steven om gruppen bara någonsin delar en nota mitt itu i kronor. Chara om kvittot spelar roll, resan gick utomlands, eller samma räkning dyker upp varje månad.",
    },
    theyWin: {
      en: "Steven wins on familiarity in Sweden and on being simple enough that nobody needs it explained. If your group already has it and only splits round numbers, switching buys you little.",
      sv: "Steven vinner på igenkänning i Sverige och på att vara så enkel att ingen behöver få den förklarad. Har din grupp den redan och bara delar jämna summor tjänar du lite på att byta.",
    },
    rows: [
      {
        k: { en: "Settle over Swish", sv: "Gör upp via Swish" },
        them: { en: "Yes", sv: "Ja", verdict: "good" },
        us: {
          en: "Yes — opens Swish with the amount filled in",
          sv: "Ja — öppnar Swish med beloppet ifyllt",
          verdict: "good",
        },
      },
      ADS_ROW,
      RECEIPT_ROW,
      VOICE_ROW,
      {
        k: { en: "Different currencies", sv: "Olika valutor" },
        them: { en: "Kronor, in practice", sv: "Kronor, i praktiken", verdict: "bad" },
        us: {
          en: "159 currencies, refreshed daily",
          sv: "159 valutor, uppdaterade dagligen",
          verdict: "good",
        },
      },
      {
        k: { en: "Rent and repeating bills", sv: "Hyra och återkommande räkningar" },
        them: { en: "No", sv: "Nej", verdict: "bad" },
        us: {
          en: "Set once, posts itself",
          sv: "Ställ in en gång, bokförs själv",
          verdict: "good",
        },
      },
      SELFHOST_ROW,
      SOURCE_ROW,
      {
        k: { en: "Your friends already have it", sv: "Dina vänner har den redan" },
        them: { en: "Common in Sweden", sv: "Vanlig i Sverige", verdict: "good" },
        us: {
          en: "No — you'll be the one who suggests it",
          sv: "Nej — du blir den som föreslår den",
          verdict: "bad",
        },
      },
    ],
  },
];

export function competitorBySlug(slug: string): Competitor | undefined {
  return COMPETITORS.find((c) => c.slug === slug);
}
