/* noema-lite — the learner's calendar day (one place for every "today": streaks, daily XP, due cards and playbooks, daily
   caps, backups). A day is the LOCAL date of the device as "YYYY-MM-DD", never the UTC date: in Athens (UTC+2/+3) the UTC
   date changes at 02:00/03:00, so a study session after midnight counted for the day before and a card due "tomorrow" came
   back a day late or early. Keys sort and compare as strings ("2026-11-07" < "2026-11-08").
     NoemaDay.key(date?)       → "YYYY-MM-DD" of that moment (now) in the device's time zone
     NoemaDay.add(key, n)      → the key n calendar days after key (n < 0: before), through local noon, so DST never skips a day
     NoemaDay.between(a, b)    → whole calendar days from key a to key b (b later → positive) */
(function (root) {
  const pad = n => String(n).padStart(2, '0');
  const key = (d = new Date()) => { const x = d instanceof Date ? d : new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
  const noon = k => { const [y, m, d] = String(k).split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const add = (k, n) => { const d = noon(k); d.setDate(d.getDate() + n); return key(d); };
  const between = (a, b) => Math.round((Date.UTC(...ymd(b)) - Date.UTC(...ymd(a))) / 864e5);
  const ymd = k => { const [y, m, d] = String(k).split('-').map(Number); return [y, m - 1, d]; };
  root.NoemaDay = Object.freeze({ key, add, between });
})(typeof window !== 'undefined' ? window : globalThis);
