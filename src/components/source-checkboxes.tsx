"use client";

import { useState } from "react";

// Plain uncontrolled checkboxes here would revert to their defaultChecked
// value whenever ANY server action on the page triggers a revalidation —
// Next.js re-renders the Server Component tree around them, which resets
// uncontrolled form elements. Client Component state survives that, so
// controlling these locally keeps a check the user just made from silently
// disappearing before they click "Додати".
export function SourceCheckboxes() {
  const [djinni, setDjinni] = useState(true);
  const [dou, setDou] = useState(false);

  return (
    <>
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          name="sources"
          value="DJINNI"
          checked={djinni}
          onChange={(e) => setDjinni(e.target.checked)}
        />
        Djinni
      </label>
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          name="sources"
          value="DOU"
          checked={dou}
          onChange={(e) => setDou(e.target.checked)}
        />
        DOU (експериментально)
      </label>
    </>
  );
}

// Same reset-on-revalidation problem as the source checkboxes above.
export function ReservationCheckbox() {
  const [checked, setChecked] = useState(false);

  return (
    <label className="flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400">
      <input
        type="checkbox"
        name="requireReservation"
        value="true"
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
      />
      Лише вакансії з бронюванням від мобілізації (Djinni: перевірена
      добірка; DOU: пошук також враховує слово &laquo;бронювання&raquo;)
    </label>
  );
}
