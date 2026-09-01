/**
 * /splitwise-daily-limit — the explainer someone reads mid-decision.
 *
 * No expense count and no price appear anywhere in this bundle on purpose:
 * both have changed since the cap was introduced and cannot be verified on
 * the day a reader lands here. Splitwise's own pricing page is named as the
 * source instead. Keep it that way.
 */
const en = {
  meta: {
    title: "Why does Splitwise limit how many expenses you can add?",
    description:
      "Splitwise caps how many expenses free users add per day; Pro removes it. Why the limit exists, and your three options: live with it, pay, or move.",
  },
  hero: {
    eyebrow: "Explainer",
    title: "Why does Splitwise limit how many expenses you can add?",
    answer:
      "Because the free tier is how Splitwise gets you in, and Pro is how it gets paid. Free accounts get a handful of expense entries a day; add one more and you are told to come back tomorrow, or upgrade. The limit is not a bug and it is not your phone. It is the paywall.",
  },
  shape: {
    title: "The shape of it.",
    items: [
      {
        h: "A daily cap on entries.",
        b: "Free accounts can add a small number of expenses per day. The exact number has changed since the cap was introduced, so we will not print one — Splitwise's own pricing page has today's figure. Hit it, and the add button waits until tomorrow.",
      },
      {
        h: "Ads and a countdown in between.",
        b: "Between entries the free tier shows banner ads, and a short countdown before an expense saves. It is designed to be slightly slower than paying.",
      },
      {
        h: "Pro removes it, and unbundles the rest.",
        b: "The paid tier lifts the cap and unlocks receipt scanning, currency conversion and recurring expenses. That is the deal: the things a group uses on a trip are the things behind the subscription.",
      },
    ],
    checkNote:
      "We do not quote or link to Splitwise's prices because they change and we cannot vouch for them on the day you read this. Their pricing page is the source.",
  },
  fair: {
    title: "In fairness to Splitwise.",
    body: "A product with servers, sync and push notifications costs money to run, and Splitwise ran it free and uncapped for over a decade before the limit arrived. Charging somewhere is not a betrayal. Charging by making the core action — adding an expense — deliberately slow is what people object to, because it turns a tool into a toll booth on the one thing the tool is for.",
  },
  options: {
    title: "What to do about it.",
    items: [
      {
        h: "Live with it.",
        b: "If your group adds a couple of things a week, you may never hit it. Enter the big ones, let the coffees slide, and settle up at the end. Plenty of groups are fine here.",
      },
      {
        h: "Pay for Pro.",
        b: "If you use Splitwise every day and everyone you split with is already on it, the subscription buys back the cap plus the receipt and currency features. Check the current price on their pricing page and decide whether it is worth it per year.",
      },
      {
        h: "Move.",
        b: "Chara has no cap, no ads and no Pro tier. Receipt scanning, 159 currencies, recurring bills and minimal-transfer settlement are all in the free app. Screenshot your Splitwise balances screen and Chara rebuilds the group to match, so nobody re-types history. It is new, it has a smaller user base and no web app yet — we say so on the comparison.",
      },
    ],
    linkAlternatives: "Splitwise alternatives, compared →",
    linkVersus: "Chara vs Splitwise, row by row →",
  },
  faq: {
    title: "Questions.",
    items: [
      {
        q: "How many expenses can I add on Splitwise for free?",
        a: "A handful per day, then it stops until tomorrow. The number has moved since the cap was introduced and we would rather not print a figure that is wrong by the time you read it — Splitwise's pricing page has the current one.",
      },
      {
        q: "Does Splitwise Pro remove the daily limit?",
        a: "Yes. Lifting the cap is the main thing Pro sells, alongside receipt scanning, currency conversion and recurring expenses. It is a subscription; the price is on their pricing page.",
      },
      {
        q: "Can I keep my Splitwise history if I switch?",
        a: "Your balances, yes: screenshot the balances screen and Chara reads who owes whom and rebuilds the group. The itemised history stays in Splitwise — Chara imports where you stand, not every line from the last two years.",
      },
      {
        q: "Does Chara have a daily limit?",
        a: "No, and there is no Pro tier to move one into. The app is free and uncapped; the only thing that costs money is extended AI usage on Chara Cloud, and self-hosters skip even that with their own key. Chara is AGPL open source, so none of this can quietly change.",
      },
    ],
  },
  cta: {
    eyebrow: "No cap",
    title: "Add the tenth expense.",
    body: "Free, uncapped, ad-free. Your balances come with you.",
  },
};

const sv: typeof en = {
  meta: {
    title: "Varför begränsar Splitwise hur många utlägg du får lägga in?",
    description:
      "Splitwise har ett tak för hur många utlägg gratisanvändare får lägga in per dag. Varför taket finns, och dina tre val: leva med det, betala eller byta.",
  },
  hero: {
    eyebrow: "Förklaring",
    title: "Varför begränsar Splitwise hur många utlägg du får lägga in?",
    answer:
      "För att gratisnivån är hur Splitwise får in dig, och Pro är hur de får betalt. Gratiskonton får lägga in en handfull utlägg per dag; lägg in ett till och du får komma tillbaka imorgon, eller uppgradera. Gränsen är ingen bugg och det är inte din telefon. Det är betalväggen.",
  },
  shape: {
    title: "Så ser den ut.",
    items: [
      {
        h: "Ett dagligt tak på inmatningar.",
        b: "Gratiskonton får lägga in ett litet antal utlägg per dag. Den exakta siffran har ändrats sedan taket infördes, så vi skriver inte ut någon — Splitwises egen prissida har dagens värde. Slår du i det väntar plus-knappen till imorgon.",
      },
      {
        h: "Annonser och en nedräkning däremellan.",
        b: "Mellan inmatningarna visar gratisnivån bannerannonser och en kort nedräkning innan ett utlägg sparas. Den är gjord för att vara lite långsammare än att betala.",
      },
      {
        h: "Pro tar bort det, och delar upp resten.",
        b: "Betalnivån lyfter taket och låser upp kvittoskanning, valutaomräkning och återkommande utlägg. Det är affären: det en grupp använder på en resa är det som ligger bakom abonnemanget.",
      },
    ],
    checkNote:
      "Vi citerar eller länkar inte till Splitwises priser eftersom de ändras och vi inte kan gå i god för dem den dag du läser det här. Deras prissida är källan.",
  },
  fair: {
    title: "I rättvisans namn.",
    body: "En produkt med servrar, synk och pushnotiser kostar pengar att driva, och Splitwise körde den gratis och utan tak i över ett decennium innan gränsen kom. Att ta betalt någonstans är inget svek. Att ta betalt genom att göra kärnhandlingen — att lägga in ett utlägg — avsiktligt långsam är det folk stör sig på, för det gör ett verktyg till en tullstation på just det verktyget är till för.",
  },
  options: {
    title: "Vad du kan göra.",
    items: [
      {
        h: "Leva med den.",
        b: "Lägger gruppen in ett par saker i veckan slår du kanske aldrig i taket. Lägg in de stora, låt kafferna passera och gör upp i slutet. Många grupper klarar sig fint här.",
      },
      {
        h: "Betala för Pro.",
        b: "Använder du Splitwise varje dag och alla du delar med redan finns där, köper abonnemanget tillbaka taket plus kvitto- och valutafunktionerna. Kolla aktuellt pris på deras prissida och avgör om det är värt det per år.",
      },
      {
        h: "Byta.",
        b: "Chara har inget tak, inga annonser och ingen Pro-nivå. Kvittoskanning, 159 valutor, återkommande räkningar och reglering med minsta antal överföringar ingår i gratisappen. Skärmdumpa saldoskärmen i Splitwise så bygger Chara upp gruppen så den stämmer, så ingen skriver om historiken. Den är ny, har färre användare och ingen webbapp än — det står i jämförelsen.",
      },
    ],
    linkAlternatives: "Splitwise-alternativ, jämförda →",
    linkVersus: "Chara mot Splitwise, rad för rad →",
  },
  faq: {
    title: "Frågor.",
    items: [
      {
        q: "Hur många utlägg kan jag lägga in gratis i Splitwise?",
        a: "En handfull per dag, sen stannar det till imorgon. Siffran har flyttat sig sedan taket infördes och vi vill hellre inte trycka en som är fel när du läser det här — Splitwises prissida har den aktuella.",
      },
      {
        q: "Tar Splitwise Pro bort dagsgränsen?",
        a: "Ja. Att lyfta taket är det huvudsakliga Pro säljer, tillsammans med kvittoskanning, valutaomräkning och återkommande utlägg. Det är ett abonnemang; priset står på deras prissida.",
      },
      {
        q: "Kan jag behålla min Splitwise-historik om jag byter?",
        a: "Saldona, ja: skärmdumpa saldoskärmen så läser Chara vem som är skyldig vem och bygger upp gruppen. Den specificerade historiken stannar i Splitwise — Chara importerar var ni står, inte varje rad från de senaste två åren.",
      },
      {
        q: "Har Chara någon dagsgräns?",
        a: "Nej, och det finns ingen Pro-nivå att flytta in en i. Appen är gratis och utan tak; det enda som kostar är utökad AI-användning i Chara Cloud, och kör du egen server slipper du även det med din egen nyckel. Chara är öppen källkod under AGPL, så inget av det här kan ändras i tysthet.",
      },
    ],
  },
  cta: {
    eyebrow: "Inget tak",
    title: "Lägg in det tionde utlägget.",
    body: "Gratis, utan tak, utan annonser. Saldona följer med.",
  },
};

export const splitwiseDailyLimit = { en, sv };
