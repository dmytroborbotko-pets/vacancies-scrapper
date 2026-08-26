export interface FetchedVacancy {
  source: "DJINNI" | "DOU" | "OTHER";
  sourceUrl: string;
  title: string;
  company: string | null;
  rawText: string;
}
