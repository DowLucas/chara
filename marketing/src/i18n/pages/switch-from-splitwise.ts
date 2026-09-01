/**
 * /switch-from-splitwise — the migration page for "export splitwise data",
 * "switch from splitwise", "leave splitwise".
 *
 * The three `howTo.steps` mirror the app's own importer (capture → match
 * people → review) and are the array the HowTo JSON-LD is built from.
 */
export const switchFromSplitwise = {
  en: {
    meta: {
      title: "Switch from Splitwise: bring your balances to Chara",
      description:
        "No export, no CSV. Screenshot your Splitwise balances; Chara reads who owes whom and rebuilds the group. Balances and people come over, the history stays.",
    },
    eyebrow: "Switching · from Splitwise",
    h1: "Move your Splitwise balances to Chara.",
    lede: "Chara does not connect to Splitwise. There is no login, no API, and no export file to hunt for. You screenshot the balances screen in Splitwise, Chara's importer reads who owes whom off the image, and it sets the group up to match. It is not an official integration and it does not need to be — the balances are the part that matters, and they are on one screen.",
    howTo: {
      eyebrow: "Three steps",
      title: "How the switch works.",
      steps: [
        {
          h: "Screenshot the balances in Splitwise.",
          b: "Open the group in Splitwise. The balances sit at the top — who owes you, who you owe. Take a screenshot. If the group is long, scroll and take another; Chara accepts several at once. That is everything you need from Splitwise. Nothing there changes, and you do not have to tell anyone yet.",
        },
        {
          h: "Chara reads who owes whom.",
          b: "Make the group in Chara, in the same currency as the Splitwise group, and choose Import from another app, then Splitwise. Add the screenshots. Chara reads the names, the amounts and which way each balance runs, and lists what it found. Match each name to someone already in the group, or add them as a new member right there.",
        },
        {
          h: "Check it, then import.",
          b: "Every balance is shown before anything is saved. Fix a misread digit, drop a line you do not want, then import. Chara creates one opening balance per person and the group is live. The next expense goes in here — and the opening balances can be edited or settled later like anything else.",
        },
      ],
    },
    whatMoves: {
      eyebrow: "Straight answer",
      title: "What comes over, and what doesn't.",
      comes: {
        title: "Comes over",
        items: [
          "The current balance for every person — who owes, who is owed, and how much.",
          "The people. Names Chara reads become members; names it already knows are matched to them.",
          "The direction of every debt, so the first settle-up in Chara is right.",
        ],
      },
      stays: {
        title: "Stays in Splitwise",
        items: [
          "The expense history — every dinner, every rent payment, every comment.",
          "Receipts, notes and categories attached to those expenses.",
          "Past settlements. Chara starts from today's balance, not from the story of how you got there.",
          "Balances in a different currency than your Chara group. Create the group in the same currency first.",
        ],
      },
      note: "Your Splitwise account is untouched. Keep it as an archive for as long as you like; if you want the history in a file, Splitwise can export a group as a spreadsheet. The same importer reads Tricount, Settle Up, Splid and Steven.",
    },
    faq: {
      titleA: "Questions,",
      titleB: "answered.",
      items: [
        {
          q: "Does Chara connect to my Splitwise account?",
          a: "No. Chara never asks for your Splitwise login and never talks to Splitwise. It reads a screenshot you took, and that is the whole connection. If Splitwise changes its layout tomorrow, the worst case is that you check a number in the review step.",
        },
        {
          q: "Does everyone have to switch at once?",
          a: "No. The balances come over whether or not the others have installed Chara. People Chara does not know yet are added by name, show up in every balance, and get their own view when they join from an invite link or QR code. Until then, you carry the group.",
        },
        {
          q: "What if it misreads a number?",
          a: "You see every balance before it is saved, and you can correct it there. If something slips through, an opening balance can be edited or settled afterwards like any other entry. Nothing is final on import.",
        },
        {
          q: "Can I import the full Splitwise history?",
          a: "No. Chara reads balances, not history — the individual expenses stay in Splitwise. If you want them in a file, export the group as a spreadsheet from Splitwise before you archive it.",
        },
      ],
    },
    cta: {
      eyebrow: "Take it",
      title: "Bring the group. Leave the cap.",
      body: "Free, uncapped, ad-free. Your Splitwise account stays exactly as it is.",
      backLink: "All Splitwise alternatives →",
    },
  },
  sv: {
    meta: {
      title: "Byt från Splitwise: ta med dig saldona till Chara",
      description:
        "Ingen exportfil. Skärmdumpa Splitwise-saldona så läser Chara vem som är skyldig vem och bygger gruppen. Saldon och personer följer med, inte historiken.",
    },
    eyebrow: "Byta app · från Splitwise",
    h1: "Flytta dina Splitwise-saldon till Chara.",
    lede: "Chara kopplar inte upp sig mot Splitwise. Det finns ingen inloggning, inget API och ingen exportfil att leta efter. Du skärmdumpar saldoskärmen i Splitwise, Charas importör läser vem som är skyldig vem från bilden, och sätter upp gruppen så att den stämmer. Det är ingen officiell integration och behöver inte vara det — saldona är den del som spelar roll, och de ryms på en skärm.",
    howTo: {
      eyebrow: "Tre steg",
      title: "Så går bytet till.",
      steps: [
        {
          h: "Skärmdumpa saldona i Splitwise.",
          b: "Öppna gruppen i Splitwise. Saldona ligger högst upp — vem som är skyldig dig, vem du är skyldig. Ta en skärmdump. Är gruppen lång, skrolla och ta en till; Chara tar emot flera på en gång. Det är allt du behöver från Splitwise. Ingenting där ändras, och du behöver inte säga något till någon än.",
        },
        {
          h: "Chara läser vem som är skyldig vem.",
          b: "Skapa gruppen i Chara, i samma valuta som Splitwise-gruppen, och välj Importera från en annan app, sedan Splitwise. Lägg till skärmdumparna. Chara läser namnen, beloppen och åt vilket håll varje saldo går, och listar vad den hittat. Para ihop varje namn med någon som redan är med i gruppen, eller lägg till dem som ny medlem på plats.",
        },
        {
          h: "Kontrollera, importera sen.",
          b: "Varje saldo visas innan något sparas. Rätta en felläst siffra, ta bort en rad du inte vill ha, importera sedan. Chara skapar ett ingående saldo per person och gruppen är igång. Nästa utlägg hamnar här — och de ingående saldona kan ändras eller regleras senare som vad som helst annat.",
        },
      ],
    },
    whatMoves: {
      eyebrow: "Rakt svar",
      title: "Vad som följer med, och vad som inte gör det.",
      comes: {
        title: "Följer med",
        items: [
          "Det aktuella saldot för varje person — vem som är skyldig, vem som har att fordra, och hur mycket.",
          "Personerna. Namn Chara läser blir medlemmar; namn den redan känner till paras ihop med dem.",
          "Riktningen på varje skuld, så att första regleringen i Chara blir rätt.",
        ],
      },
      stays: {
        title: "Stannar i Splitwise",
        items: [
          "Utläggshistoriken — varje middag, varje hyra, varje kommentar.",
          "Kvitton, anteckningar och kategorier som hör till de utläggen.",
          "Tidigare regleringar. Chara utgår från dagens saldo, inte från berättelsen om hur ni hamnade där.",
          "Saldon i en annan valuta än din Chara-grupp. Skapa gruppen i samma valuta först.",
        ],
      },
      note: "Ditt Splitwise-konto rörs inte. Behåll det som arkiv så länge du vill; vill du ha historiken i en fil kan Splitwise exportera en grupp som kalkylark. Samma importör läser Tricount, Settle Up, Splid och Steven.",
    },
    faq: {
      titleA: "Frågor,",
      titleB: "besvarade.",
      items: [
        {
          q: "Kopplar Chara upp sig mot mitt Splitwise-konto?",
          a: "Nej. Chara ber aldrig om din Splitwise-inloggning och pratar aldrig med Splitwise. Den läser en skärmdump du tagit, och det är hela kopplingen. Ändrar Splitwise sin layout i morgon är det värsta som händer att du får kontrollera en siffra i granskningssteget.",
        },
        {
          q: "Måste alla byta samtidigt?",
          a: "Nej. Saldona följer med vare sig de andra installerat Chara eller inte. Personer Chara inte känner till än läggs till med namn, syns i varje saldo, och får sin egen vy när de går med via en inbjudningslänk eller QR-kod. Tills dess bär du gruppen.",
        },
        {
          q: "Om den läser fel på en siffra?",
          a: "Du ser varje saldo innan det sparas, och kan rätta det där. Slinker något igenom kan ett ingående saldo ändras eller regleras efteråt som vilken annan post som helst. Ingenting är slutgiltigt vid importen.",
        },
        {
          q: "Kan jag importera hela Splitwise-historiken?",
          a: "Nej. Chara läser saldon, inte historik — de enskilda utläggen stannar i Splitwise. Vill du ha dem i en fil, exportera gruppen som kalkylark från Splitwise innan du arkiverar den.",
        },
      ],
    },
    cta: {
      eyebrow: "Ta det",
      title: "Ta med gänget. Lämna taket.",
      body: "Gratis, utan tak, utan annonser. Ditt Splitwise-konto förblir precis som det är.",
      backLink: "Alla alternativ till Splitwise →",
    },
  },
};
