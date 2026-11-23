/**
 * CO2 - "Evaluate solutions": accuracy, per-class precision / recall / F1 and a confusion matrix
 * for the sentiment classifier on a small hand-labelled set (data/sentiment_eval.json).
 * The set is intentionally small and written by the developer, so results show the method works end to end;
 * they are not a benchmark. Replace it with a larger labelled dataset to report stronger numbers.
 */
const { classify } = require('./sentiment');
const dataset = require('./data/sentiment_eval.json');

const LABELS = ['positive', 'neutral', 'negative'];
const r = (n) => Math.round(n * 1000) / 1000;

function evaluateSentiment(data = dataset) {
  const confusion = Object.fromEntries(LABELS.map((a) => [a, Object.fromEntries(LABELS.map((b) => [b, 0]))]));
  const errors = [];
  let correct = 0;
  for (const item of data) {
    const text = item.text;
    const label = String(item.label || '').trim().toLowerCase();
    const pred = String(classify(text)).trim().toLowerCase();

    if (!LABELS.includes(label)) {
        throw new Error(`Invalid actual sentiment label: ${label}`);
    }

    if (!LABELS.includes(pred)) {
        throw new Error(`Invalid predicted sentiment label: ${pred}`);
    }

    confusion[label][pred] += 1;
    if (pred === label) correct += 1;
    else errors.push({ text, expected: label, predicted: pred });
  }
  const perClass = LABELS.map((l) => {
    const tp = confusion[l][l];
    const fp = LABELS.reduce((a, o) => a + (o === l ? 0 : confusion[o][l]), 0);
    const fn = LABELS.reduce((a, o) => a + (o === l ? 0 : confusion[l][o]), 0);
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    return { label: l, precision: r(precision), recall: r(recall), f1: r(f1), support: tp + fn };
  });
  return {
    samples: data.length,
    accuracy: r(correct / data.length),
    macroF1: r(perClass.filter((c) => c.support > 0).reduce((a, c) => a + c.f1, 0) / Math.max(1, perClass.filter((c) => c.support > 0).length)),
    perClass,
    labels: LABELS,
    confusion,
    errors
  };
}

module.exports = { evaluateSentiment };
