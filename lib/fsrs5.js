/**
 * Algoritmo FSRS-5 (Free Spaced Repetition Scheduler v5) — implementación canónica.
 * Ref: https://github.com/open-spaced-repetition (py-fsrs / fsrs-rs)
 *
 * Modelo de memoria con tres variables por ítem y estudiante:
 *   D — Dificultad     (1 = muy fácil … 10 = muy difícil)
 *   S — Estabilidad    (días para que la retención caiga a ~90 %)
 *   R — Retenibilidad  (probabilidad de recuerdo en un instante dado, [0,1])
 *
 * Curva de olvido de FSRS-5:  R(t) = (1 + FACTOR · t/S) ^ DECAY   con DECAY = −0.5
 */

// Parámetros por defecto de FSRS-5 (19 pesos, w0..w18).
const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949,
  0.5345,  1.4604,  0.0046, 1.54575,  0.1192,
  1.01925, 1.9395,  0.11,   0.29605,  2.2698,
  0.2315,  2.9898,  0.51655, 0.6621,
];

// Retención objetivo con la que se agenda el próximo repaso.
export const REQUEST_RETENTION = 0.9;

const MAX_INTERVAL = 36500;                    // días (≈100 años)
const DECAY  = -0.5;                           // exponente de la curva de olvido de FSRS-5
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;   // = 19/81 ≈ 0.2345679
const S_MIN  = 0.01;                           // estabilidad mínima
const D_MIN  = 1, D_MAX = 10;                  // rango de dificultad

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r4    = (n) => Math.round(n * 10000) / 10000;

/** R(t) — Retenibilidad: probabilidad de recuerdo tras `daysSince` días. */
export function calculateRetrieval(stability, daysSince) {
  const s = Math.max(S_MIN, stability ?? S_MIN);
  return Math.pow(1 + FACTOR * (Math.max(0, daysSince) / s), DECAY);
}

/** IRE — Intervalo (días) para alcanzar la retención objetivo. */
export function calculateInterval(stability, requestRetention = REQUEST_RETENTION) {
  const raw = (stability / FACTOR) * (Math.pow(requestRetention, 1 / DECAY) - 1);
  return clamp(Math.round(raw), 1, MAX_INTERVAL);
}

// ── Dificultad ───────────────────────────────────────────────
/** D₀(G) — Dificultad inicial según el primer rating. */
function initialDifficulty(rating) {
  return clamp(W[4] - Math.exp(W[5] * (rating - 1)) + 1, D_MIN, D_MAX);
}
/** Amortiguación lineal: los cambios de D pesan menos cuando D ya es alta. */
function linearDamping(deltaD, oldD) {
  return (deltaD * (10 - oldD)) / 9;
}
/** Nueva dificultad: cambio por rating amortiguado + reversión a la media hacia D₀(Easy). */
function nextDifficulty(currentD, rating) {
  const deltaD = -W[6] * (rating - 3);
  const damped = currentD + linearDamping(deltaD, currentD);
  return clamp(W[7] * initialDifficulty(4) + (1 - W[7]) * damped, D_MIN, D_MAX);
}

// ── Estabilidad ──────────────────────────────────────────────
/** Estabilidad tras un recuerdo exitoso (Hard/Good/Easy). */
function recallStability(d, s, r, rating) {
  const hardPenalty = rating === 2 ? W[15] : 1; // Hard crece menos
  const easyBonus   = rating === 4 ? W[16] : 1; // Easy crece más
  return (
    s *
    (1 +
      Math.exp(W[8]) *
        (11 - d) *
        Math.pow(s, -W[9]) *
        (Math.exp(W[10] * (1 - r)) - 1) *
        hardPenalty *
        easyBonus)
  );
}
/** Estabilidad tras un olvido (Again). */
function forgetStability(d, s, r) {
  return (
    W[11] *
    Math.pow(d, -W[12]) *
    (Math.pow(s + 1, W[13]) - 1) *
    Math.exp(W[14] * (1 - r))
  );
}

/**
 * Actualiza D, S, R tras una respuesta.
 * @param {number|null} currentD    dificultad previa (se ignora en el 1er repaso)
 * @param {number|null} currentS    estabilidad previa (se ignora en el 1er repaso)
 * @param {number} currentR         retenibilidad al momento del repaso [0,1]
 * @param {number} rating           1=Again 2=Hard 3=Good 4=Easy
 * @param {number} totalReviews     repasos previos (0 ⇒ primer repaso)
 * @returns {{ difficulty, stability, retrievability, next_review, ire_days }}
 */
export function updateFSRS(currentD, currentS, currentR, rating, totalReviews) {
  const g = clamp(Math.round(rating) || 1, 1, 4);
  let newD, newS;

  if (!totalReviews || totalReviews <= 0) {
    // Primer repaso: se fijan los valores iniciales del modelo.
    newD = initialDifficulty(g);
    newS = W[g - 1];
  } else {
    const d = clamp(Number(currentD) || initialDifficulty(3), D_MIN, D_MAX);
    const s = Math.max(S_MIN, Number(currentS) || W[2]);
    const r = clamp(Number(currentR), 0, 1);
    newD = nextDifficulty(d, g);
    newS = g === 1 ? forgetStability(d, s, r) : recallStability(d, s, r, g);
  }

  newD = clamp(newD, D_MIN, D_MAX);
  newS = Math.max(S_MIN, newS);

  const ire_days = calculateInterval(newS);
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + ire_days);

  return {
    difficulty:     r4(newD),
    stability:      r4(newS),
    retrievability: r4(calculateRetrieval(newS, 0)), // = 1 justo tras el repaso
    next_review:    nextDate.toISOString().split('T')[0],
    ire_days,
  };
}

/**
 * Rating FSRS inferido desde el score de corrección [0,1] (juez LLM / SST).
 * 4 (Easy) no se infiere automáticamente: se reserva para dominio evidente.
 */
export function ratingFromSST(sst) {
  if (sst >= 0.71) return 3; // Good
  if (sst >= 0.41) return 2; // Hard
  return 1;                   // Again
}
