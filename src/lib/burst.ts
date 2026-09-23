/**
 * Folds a burst of Realtime events into one reload. One check-in can change
 * everyone's rank (~100 row updates); without this every open screen would
 * reload once per row. The first event schedules a reload 1.5–2.5 s later
 * (jittered so 100 phones don't all hit the database in the same instant);
 * events in the meantime ride along with it.
 */
export function batched(fn: () => void, ms = 1500) {
  let t: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    if (t) return;
    t = setTimeout(() => { t = null; fn(); }, ms + Math.random() * 1000);
  };
  run.cancel = () => { if (t) clearTimeout(t); t = null; };
  return run;
}
