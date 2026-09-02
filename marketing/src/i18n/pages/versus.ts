/** Shared chrome for every /vs/<competitor> page. The per-competitor copy
 *  lives in `src/lib/competitors.ts`, next to the verdict data it describes. */
export const versus = {
  en: {
    eyebrow: "Head to head",
    intro:
      "The whole picture, including the rows where we lose. Verdicts are checked against the current free tier of each app.",
    tableFeature: "",
    tableThem: "{{name}}",
    tableUs: "Chara",
    switchTitle: "Bring your balances over",
    switchBody:
      "Screenshot your balances screen in {{name}} and Chara reads who owes whom, then rebuilds the group to match. No export file, no CSV, no support ticket.",
    ctaTitle: "Try it. It costs nothing.",
    ctaBody: "Free, uncapped, ad-free. Open source if you would rather run it yourself.",
    alsoTitle: "Other comparisons",
    backToAll: "All alternatives →",
    asOf: "Verdicts current as of {{date}}",
  },
  sv: {
    eyebrow: "Jämförelse",
    intro:
      "Hela bilden, även raderna där vi förlorar. Omdömena är kontrollerade mot varje apps nuvarande gratisnivå.",
    tableFeature: "",
    tableThem: "{{name}}",
    tableUs: "Chara",
    switchTitle: "Ta med dig dina saldon",
    switchBody:
      "Skärmdumpa saldovyn i {{name}} så läser Chara av vem som är skyldig vem och bygger upp gruppen igen. Ingen exportfil, ingen CSV, inget supportärende.",
    ctaTitle: "Testa. Det kostar ingenting.",
    ctaBody: "Gratis, utan tak, utan reklam. Öppen källkod om du hellre kör den själv.",
    alsoTitle: "Fler jämförelser",
    backToAll: "Alla alternativ →",
    asOf: "Omdömen aktuella per {{date}}",
  },
};
