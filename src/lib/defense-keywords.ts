// Canonical topic for "Інші" (otherMode) search: defense/military-tech
// vacancies with a reservation, independent of any CV's own tech stack.
// Used both as SearchConfig.keywords for the managed DJINNI/DOU configs and
// to build the web-search query for the OTHER source.
export const DEFENSE_KEYWORDS_LIST = [
  "оборонна промисловість",
  "ВПК",
  "військово-промисловий комплекс",
  "дрони",
  "БПЛА",
  "безпілотники",
  "озброєння",
  "боєприпаси",
  "радіоелектронна боротьба",
  "РЕБ",
  "антидрон",
  "оборонні технології",
  "defense tech",
  "military tech",
  "defense industry",
  "drones",
  "UAV",
  "unmanned systems",
  "weapons systems",
  "electronic warfare",
  "radar systems",
  "defense contractor",
];

export const DEFENSE_KEYWORDS = DEFENSE_KEYWORDS_LIST.join(", ");

// Vacancies discovered by the OTHER web-search leg must have an estimated
// publish date within this many days of the scan run, or an undeterminable
// date is treated as too old to trust.
export const OTHER_MAX_VACANCY_AGE_DAYS = 14;

// Global cap (not per-CV) on new OTHER-source vacancies created per day,
// across the whole app — protects the Claude API budget.
export const OTHER_DAILY_VACANCY_CAP = 100;
