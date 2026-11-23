/**
 * CO2 - Sentiment analysis (lexicon + rules, VADER-style, written from scratch).
 *   score(sentence) = sum of word valences, with
 *     - negation  ("not good" flips the next 3 words, x -0.74)
 *     - intensity ("very", "highly" scale the next word)
 *   compound = sum / sqrt(sum^2 + 15)   -> value in (-1, 1)
 * Label: compound >= 0.05 positive, <= -0.05 negative, else neutral.
 *
 * In an ATS context the score measures the *tone* of the resume or of recruiter/interview feedback text.
 * It is NOT a measure of a person's ability and is never used in the ATS score.
 */

const LEXICON = {
  // positive
  achieved: 2.5, improved: 2, led: 2, delivered: 2, optimized: 2, optimised: 2, increased: 2, successfully: 2.5,
  excellent: 3, strong: 2.5, passionate: 2.5, motivated: 2, innovative: 2.5, efficient: 2, award: 2.5, awarded: 2.5,
  winner: 2.5, won: 2, scalable: 1.5, collaborated: 1.5, enhanced: 2, accelerated: 2, mentored: 2, streamlined: 2,
  outstanding: 3, proficient: 2, skilled: 2, certified: 1.5, recognized: 2, recognised: 2, best: 2.5, great: 2.5,
  good: 2, love: 2.5, happy: 2.5, impressive: 3, reliable: 2, creative: 2, dedicated: 2.5, effective: 2,
  success: 2.5, successful: 2.5, growth: 1.5, leadership: 1.5, helpful: 2, amazing: 3, wonderful: 3, perfect: 3,
  well: 1.5, ahead: 1, prize: 2, praised: 2.5, confident: 2, quick: 1.5, fast: 1.5, thorough: 2,
  // negative
  failed: -2.5, failure: -2.5, poor: -2.5, weak: -2.5, bad: -2.5, lack: -2, lacking: -2, unable: -2,
  struggled: -2, terrible: -3, awful: -3, worst: -3, hate: -3, boring: -2, slow: -2, delay: -1.5, delayed: -2,
  confusing: -2, disappointing: -2.5, disappointed: -2.5, mistake: -2, mistakes: -2, error: -1.5, errors: -1.5,
  buggy: -2, unprofessional: -3, unprepared: -2, rude: -3, late: -1.5, never: -1.5, worse: -2.5, useless: -3,
  waste: -2.5, rejected: -1.5, unhappy: -2.5, annoying: -2.5, mediocre: -2, irrelevant: -2, broken: -2.5,
  crash: -2, crashed: -2, crashes: -2, repeatedly: -0.5
};

const NEGATORS = new Set(['not', 'no', 'never', 'without', 'hardly', 'cannot', 'neither', 'nor']);
const BOOSTERS = { very: 1.3, extremely: 1.5, highly: 1.4, really: 1.3, incredibly: 1.5, slightly: 0.7, somewhat: 0.8, fairly: 0.9 };

const ACTION_VERBS = new Set(
  `led built developed designed implemented deployed optimized optimised improved reduced increased automated created
   managed delivered achieved launched analyzed analysed trained integrated architected mentored collaborated
   researched engineered migrated tested debugged organized organised presented coordinated`.split(/\s+/)
);

function wordsOf(sentence) {
  return String(sentence || '').toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || [];
}

/** Raw valence sum and compound score for one sentence. */
function scoreSentence(sentence) {
  const words = wordsOf(sentence);
  let sum = 0;
  words.forEach((w, i) => {
    let v = LEXICON[w];
    if (v === undefined) return;
    const prev = words[i - 1];
    if (prev && BOOSTERS[prev]) v *= BOOSTERS[prev];
    for (let back = 1; back <= 3 && i - back >= 0; back++) {
      const p = words[i - back];
      if (NEGATORS.has(p) || p.endsWith("n't")) {
        v *= -0.74;
        break;
      }
    }
    sum += v;
  });
  const compound = sum === 0 ? 0 : sum / Math.sqrt(sum * sum + 15);
  return { sum, compound: Math.round(compound * 1000) / 1000 };
}

function labelOf(compound) {
  if (compound >= 0.05) return 'positive';
  if (compound <= -0.05) return 'negative';
  return 'neutral';
}

function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+|\n+|[•●▪◦]/)
    .map((s) => s.trim())
    .filter((s) => wordsOf(s).length >= 3);
}

/** Document-level analysis used by the app. */
function analyzeSentiment(text) {
  const sentences = splitSentences(text).map((s) => ({ text: s.slice(0, 220), ...scoreSentence(s) }));
  const counts = { positive: 0, neutral: 0, negative: 0 };
  sentences.forEach((s) => (counts[labelOf(s.compound)] += 1));
  const compound = sentences.length ? sentences.reduce((a, s) => a + s.compound, 0) / sentences.length : 0;

  const words = wordsOf(text);
  const actionVerbs = words.filter((w) => ACTION_VERBS.has(w)).length;
  const quantified = splitSentences(text).filter((s) => /\d+\s?(%|percent|x\b|k\b|\+)/i.test(s)).length;

  const ranked = [...sentences].sort((a, b) => b.compound - a.compound);
  return {
    compound: Math.round(compound * 1000) / 1000,
    label: labelOf(compound),
    counts,
    sentenceCount: sentences.length,
    style: {
      actionVerbs,
      actionVerbsPer100Words: words.length ? Math.round((actionVerbs / words.length) * 1000) / 10 : 0,
      quantifiedStatements: quantified
    },
    mostPositive: ranked.filter((s) => s.compound > 0).slice(0, 3),
    mostNegative: ranked.filter((s) => s.compound < 0).reverse().slice(0, 3)
  };
}

function classify(sentence) {
  return labelOf(scoreSentence(sentence).compound);
}

module.exports = { analyzeSentiment, scoreSentence, classify, labelOf, LEXICON };
