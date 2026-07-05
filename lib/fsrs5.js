/**
 * Algoritmo FSRS-5 (Free Spaced Repetition Scheduler v5).
 * Ref: https://github.com/open-spaced-repetition/fsrs5
 */

const W = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102,
  0.5316, 1.0651, 0.0589, 1.5330,  0.1544,
  1.0070, 1.9395, 0.1100, 0.2900,  2.2700,
  0.1500, 2.9898, 0.5100, 0.3400,
];
const REQUEST_RETENTION = 0.9;
const MAX_INTERVAL = 36500; // días

const r3 = (n) => Math.round(n * 1000) / 1000;

/** R(t) — Retenibildad actual. */
export function calculateRetrieval(stability, daysSince) {
  return Math.pow(1 + daysSince / (9 * stability), -1);
}

/** IRE — Intervalo en días. */
export function calculateInterval(stability) {
  const raw = 9 * stability * (1 / REQUEST_RETENTION - 1);
  return Math.min(MAX_INTERVAL, Math.max(1, Math.round(raw)));
}

/**
 * Actualiza D, S, R tras una respuesta.
 * @param {number} rating - 1=Again 2=Hard 3=Good 4=Easy
 * @returns {{ difficulty, stability, retrievability, next_review, ire_days }}
 */
export function updateFSRS(currentD, currentS, currentR, rating, totalReviews) {
  const newD = Math.min(10, Math.max(1, currentD - W[6] * (rating - 3)));

  let newS;
  if (totalReviews === 0) {
    newS = W[rating - 1];
  } else if (rating < 3) {
    newS =
      W[11] *
      Math.pow(newD, -W[12]) *
      (Math.pow(currentS + 1, W[13]) - 1) *
      Math.exp(W[14] * (1 - currentR));
  } else {
    newS =
      currentS *
      (1 +
        Math.exp(W[8]) *
          (11 - newD) *
          Math.pow(currentS, -W[9]) *
          (Math.exp(W[10] * (1 - currentR)) - 1));
  }
  newS = Math.max(0.1, newS);

  const ire_days = calculateInterval(newS);
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + ire_days);

  return {
    difficulty:     r3(newD),
    stability:      r3(newS),
    retrievability: r3(calculateRetrieval(newS, 0)),
    next_review:    nextDate.toISOString().split('T')[0],
    ire_days,
  };
}

/** Rating inferido desde SST score. */
export function ratingFromSST(sst) {
  if (sst >= 0.71) return 3; // Good
  if (sst >= 0.41) return 2; // Hard
  return 1;                   // Again
}
