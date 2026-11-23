/**
 * Shared preview reading records for the COWL-DOK Ordo and its print view.
 * All external examples are Scripture references, not approved full texts.
 * Do not import copyrighted texts without confirmed publication rights.
 */

export type ReadingLanguage = "en" | "tl";

/**
 * Approved reading records must be supplied by an authorized COWL editor,
 * with independent English/Tagalog versions and publication rights.
 * No reading text is fabricated or auto-translated in this design preview.
 */
export type ApprovedReadingText = {
  reference: string;
  text: string;
};
export type ApprovedReadingEdition = {
  firstReading?: ApprovedReadingText;
  responsorialPsalm?: ApprovedReadingText;
  secondReading?: ApprovedReadingText;
  gospel?: ApprovedReadingText;
  source: string;
  permissionNotice: string;
};
export type ApprovedReadingRecord = Partial<Record<ReadingLanguage, ApprovedReadingEdition>>;

// Empty until COWL approves both the calendar and publication permissions.
export const APPROVED_READINGS: Record<string, ApprovedReadingRecord> = {};
export type SourcedReadingReferences = {
  first: string;
  psalm: string;
  gospel: string;
  second?: string;
  sourceName: string;
  sourceUrl: string;
};

/**
 * Small, attributed examples transcribed from dated public source pages.
 * These are Scripture references only, not licensed reading texts.
 * They are neither automatically imported nor liturgically approved by COWL.
 */
export const SOURCED_READING_EXAMPLES: Record<string, Partial<Record<ReadingLanguage, SourcedReadingReferences>>> = {
  "2026-11-19": {
    en: {
      first: "Apocalypse 5:1–10",
      psalm: "Psalm 149:1–6, 9",
      gospel: "Luke 19:41–44",
      sourceName: "Universalis — Philippines, 19 November 2026",
      sourceUrl: "https://universalis.com/philippines/20261119/mass.1.htm",
    },
    tl: {
      first: "Pahayag 5, 1–10",
      psalm: "Salmo 149, 1–2. 3–4. 5 at 6a at 9a",
      gospel: "Lucas 19, 41–44",
      sourceName: "Awit at Papuri — 19 Nobyembre 2026",
      sourceUrl: "https://www.awitatpapuri.com/2026/11/19/huwebes-nobyembre-19-2026/",
    },
  },
  "2026-11-20": {
    en: {
      first: "Apocalypse 10:8–11",
      psalm: "Psalm 118(119):14, 24, 72, 103, 111, 131",
      gospel: "Luke 19:45–48",
      sourceName: "Universalis — Philippines, 20 November 2026",
      sourceUrl: "https://universalis.com/philippines/20261120/mass.1.htm",
    },
    tl: {
      first: "Pahayag 10, 8–11",
      psalm: "Salmo 118, 14. 24. 72. 103. 111. 131",
      gospel: "Lucas 19, 45–48",
      sourceName: "Awit at Papuri — 20 Nobyembre 2026",
      sourceUrl: "https://www.awitatpapuri.com/2026/11/20/biyernes-nobyembre-20-2026/",
    },
  },
};


export const READING_LABELS: Record<
  ReadingLanguage,
  {
    heading: string;
    description: string;
    first: string;
    psalm: string;
    second: string;
    gospel: string;
    unavailable: string;
    explanation: string;
    source: string;
    preview: string;
    link: string;
  }
> = {
  en: {
    heading: "Mass readings",
    description: "Choose the language of the readings. The liturgical day and parish stay the same.",
    first: "First Reading",
    psalm: "Responsorial Psalm",
    second: "Second Reading",
    gospel: "Gospel",
    unavailable: "English readings are not yet available",
    explanation: "Approved English Scripture texts and references will appear here when COWL publishes them. This preview does not supply or translate liturgical readings.",
    source: "Publication source",
    preview: "Awaiting approved reading text",
    link: "Consult an external Philippine calendar reference",
  },
  tl: {
    heading: "Mga Pagbasa sa Misa",
    description: "Piliin ang wika ng mga pagbasa. Hindi magbabago ang napiling araw at parokya.",
    first: "Unang Pagbasa",
    psalm: "Salmong Tugunan",
    second: "Ikalawang Pagbasa",
    gospel: "Mabuting Balita",
    unavailable: "Wala pang nakalathalang mga pagbasa sa Tagalog",
    explanation: "Ilalagay dito ang mga inaprubahang teksto at sanggunian kapag pinahintulutan na ng COWL ang paglalathala. Walang awtomatikong pagsasalin ng mga pagbasa.",
    source: "Pinagmulan ng teksto",
    preview: "Naghihintay ng inaprubahang teksto",
    link: "Bisitahin ang panlabas na sanggunian para sa mga pagbasa sa Tagalog",
  },
};
