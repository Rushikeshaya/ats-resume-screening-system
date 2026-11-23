/**
 * CO3 - Topic modelling: Latent Dirichlet Allocation with collapsed Gibbs sampling, written from scratch.
 *
 * Generative story: every topic k is a distribution over words (phi_k); every document d is a mixture of
 * topics (theta_d). Gibbs sampling re-assigns each word occurrence to a topic with probability
 *     p(z = k | rest)  proportional to  (n_dk + alpha) * (n_kw + beta) / (n_k + V * beta)
 * where n_dk = words of doc d in topic k, n_kw = times word w is in topic k, n_k = total words in topic k.
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function runLDA(docs, { K = 4, iters = 200, alpha = 0.5, beta = 0.01, seed = 7, topWords = 8 } = {}) {
  const rand = mulberry32(seed);
  const vocab = new Map();
  const words = [];
  const docIds = docs.map((d) =>
    d.map((w) => {
      if (!vocab.has(w)) {
        vocab.set(w, words.length);
        words.push(w);
      }
      return vocab.get(w);
    })
  );
  const V = words.length;
  const nw = Array.from({ length: V }, () => new Float64Array(K));
  const nd = docIds.map(() => new Float64Array(K));
  const nk = new Float64Array(K);

  const z = docIds.map((d, di) =>
    d.map((w) => {
      const k = Math.floor(rand() * K);
      nw[w][k]++;
      nd[di][k]++;
      nk[k]++;
      return k;
    })
  );

  const p = new Float64Array(K);
  for (let it = 0; it < iters; it++) {
    for (let di = 0; di < docIds.length; di++) {
      const d = docIds[di];
      for (let i = 0; i < d.length; i++) {
        const w = d[i];
        const old = z[di][i];
        nw[w][old]--;
        nd[di][old]--;
        nk[old]--;
        let sum = 0;
        for (let t = 0; t < K; t++) {
          p[t] = ((nd[di][t] + alpha) * (nw[w][t] + beta)) / (nk[t] + V * beta);
          sum += p[t];
        }
        let r = rand() * sum;
        let t = 0;
        for (; t < K - 1; t++) {
          r -= p[t];
          if (r <= 0) break;
        }
        z[di][i] = t;
        nw[w][t]++;
        nd[di][t]++;
        nk[t]++;
      }
    }
  }

  const topics = [];
  for (let k = 0; k < K; k++) {
    const scored = words
      .map((word, w) => ({ word, weight: (nw[w][k] + beta) / (nk[k] + V * beta) }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, topWords)
      .map((x) => ({ word: x.word, weight: Math.round(x.weight * 1000) / 1000 }));
    topics.push({ id: k, label: scored.slice(0, 3).map((x) => x.word).join(' / '), words: scored });
  }

  return { topics, nd: nd.map((a) => Array.from(a)), vocabSize: V };
}

/** Normalise a count vector to a probability mixture. */
function mixOf(counts, alpha = 0.5) {
  const total = counts.reduce((a, b) => a + b, 0) + counts.length * alpha;
  return counts.map((c) => Math.round(((c + alpha) / total) * 1000) / 1000);
}

function cosineArr(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Split a token list into pseudo-documents ("chunks") of roughly `size` tokens. */
function chunkTokens(tokens, size = 25) {
  const chunks = [];
  for (let i = 0; i < tokens.length; i += size) chunks.push(tokens.slice(i, i + size));
  return chunks.filter((c) => c.length >= 5);
}

/**
 * Corpus-level topic model: the job description and every resume are cut into chunks, one LDA is trained on all
 * chunks, then chunk-level topic counts are summed back per owner. Returns each owner's topic mixture.
 * owners = [{ key, tokens }]
 */
function topicModelCorpus(owners, { K = 4, iters = 200 } = {}) {
  const docs = [];
  const ownerOfDoc = [];
  owners.forEach((o, idx) => {
    for (const c of chunkTokens(o.tokens)) {
      docs.push(c);
      ownerOfDoc.push(idx);
    }
  });
  const totalTokens = docs.reduce((a, d) => a + d.length, 0);
  if (docs.length < K * 2 || totalTokens < K * 20) {
    return { ok: false, reason: 'Not enough text to learn stable topics. Upload longer resumes or reduce the topic count.' };
  }
  const { topics, nd, vocabSize } = runLDA(docs, { K, iters });
  const perOwner = owners.map(() => new Array(K).fill(0));
  nd.forEach((counts, di) => counts.forEach((c, k) => (perOwner[ownerOfDoc[di]][k] += c)));
  return { ok: true, K, topics, vocabSize, chunks: docs.length, mixes: perOwner.map((c) => mixOf(c)) };
}

module.exports = { runLDA, topicModelCorpus, mixOf, cosineArr, chunkTokens };
