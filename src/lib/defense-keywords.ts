// Canonical topic for "Інші" (otherMode) search: defense/military-tech
// vacancies with a reservation, independent of any CV's own tech stack.
// Used both as SearchConfig.keywords for the managed DJINNI/DOU configs and
// to build the web-search query for the OTHER source.
//
// Deliberately specific/technical terms only — broad company-level
// descriptors ("оборонна промисловість", "ВПК", "defense industry",
// "defense tech", "defense contractor") were tried and dropped: Djinni's
// `all_keywords` + `editorial=reservation` combo matched them against ANY
// role at a reservation-eligible defense company, surfacing recruiters,
// sales managers, and marketing designers alongside actual engineering
// roles. Terms naming an actual technical domain (drones/UAV, embedded,
// electronic warfare) stayed precise in testing.
export const DEFENSE_KEYWORDS_LIST = [
  "дрони",
  "БПЛА",
  "безпілотники",
  "антидрон",
  "радіоелектронна боротьба",
  "РЕБ",
  "озброєння",
  "боєприпаси",
  "embedded",
  "drones",
  "UAV",
  "unmanned systems",
  "electronic warfare",
  "weapons systems",
  "radar systems",
];

export const DEFENSE_KEYWORDS = DEFENSE_KEYWORDS_LIST.join(", ");

// Vacancies discovered by the OTHER web-search leg must have an estimated
// publish date within this many days of the scan run, or an undeterminable
// date is treated as too old to trust.
export const OTHER_MAX_VACANCY_AGE_DAYS = 14;

// Global cap (not per-CV) on new OTHER-source vacancies created per day,
// across the whole app — protects the Claude API budget.
export const OTHER_DAILY_VACANCY_CAP = 100;
