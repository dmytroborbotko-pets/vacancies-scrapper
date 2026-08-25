export interface FetchedVacancy {
  source: "DJINNI" | "DOU";
  sourceUrl: string;
  title: string;
  company: string | null;
  rawText: string;
}
