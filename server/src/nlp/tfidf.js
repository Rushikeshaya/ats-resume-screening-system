const { STOP } = require('./stopwords');

function buildNgrams(tokens, [minN, maxN] = [1, 2]) {
  const out = [];
  for (let n = minN; n <= maxN; n++) {
    for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(' '));
  }
  return out;
}


class TfidfVectorizer {
  constructor({ ngramRange = [1, 2], maxFeatures = 20000, sublinear = true } = {}) {
    this.ngramRange = ngramRange;
    this.maxFeatures = maxFeatures;
    this.sublinear = sublinear;
    this.vocab = new Set();
    this.idf = new Map();
  }

  _terms(tokens) {
    return buildNgrams(tokens.filter((t) => !STOP.has(t)), this.ngramRange);
  }

  fit(tokenLists) {
    const n = tokenLists.length;
    const df = new Map();
    const total = new Map();
    for (const tokens of tokenLists) {
      const terms = this._terms(tokens);
      for (const t of terms) total.set(t, (total.get(t) || 0) + 1);
      for (const t of new Set(terms)) df.set(t, (df.get(t) || 0) + 1);
    }
    const keep = [...total.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, this.maxFeatures)
      .map(([t]) => t);
    this.vocab = new Set(keep);
    this.idf = new Map(keep.map((t) => [t, Math.log((1 + n) / (1 + df.get(t))) + 1]));
    return this;
  }

  transform(tokens) {
    const counts = new Map();
    for (const t of this._terms(tokens)) if (this.vocab.has(t)) counts.set(t, (counts.get(t) || 0) + 1);
    const vec = new Map();
    let norm = 0;
    for (const [t, c] of counts) {
      const w = (this.sublinear ? 1 + Math.log(c) : c) * this.idf.get(t);
      vec.set(t, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of vec) vec.set(t, w / norm);
    return vec;
  }
}

function cosine(a, b) {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, w] of small) if (large.has(t)) dot += w * large.get(t);
  return dot;
}

/** Terms that contribute most to the similarity of two vectors (explainability). */
function sharedTerms(a, b, k = 8) {
  const out = [];
  for (const [t, w] of a) if (b.has(t)) out.push([t, w * b.get(t)]);
  return out.sort((x, y) => y[1] - x[1]).slice(0, k).map(([t]) => t);
}

module.exports = { TfidfVectorizer, cosine, sharedTerms, buildNgrams };
