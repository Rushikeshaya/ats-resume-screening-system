#!/usr/bin/env node
/**
 * Dataset-scale evaluation of the ATS NLP pipeline on the real Kaggle "Resume Dataset" (Resume.csv),
 * so the rubric criteria are backed by numbers from a real corpus, not only by demo uploads.
 *
 *   node server/scripts/evaluate-dataset.js path/to/Resume.csv
 *        [--per-category 40] [--topics 6] [--jd samples/job_description_it.txt] [--jd-category INFORMATION-TECHNOLOGY]
 *        [--sentiment labelled.csv] [--out docs/DATASET_RESULTS.md]
 *
 * Sections written to the report (and the console):
 *   CO1  corpus statistics + effect of cleaning / stop-words / TF-IDF
 *   CO2  (a) category classification with TF-IDF nearest-centroid (train/test split, accuracy, macro-F1)
 *        (b) ranking quality of the ATS score for a job description (precision@10, ROC-AUC; relevance = category)
 *        (c) information-extraction fill rates
 *        (d) sentiment on a real labelled CSV (optional, e.g. Rotten Tomatoes / SST-2 from Hugging Face)
 *   CO3  LDA topics on resume chunks and their purity against the true category
 * Everything is deterministic (seeded sampling and LDA).
 */
const fs = require('fs');
const path = require('path');
const { parseCsv, loadResumes, seededShuffle } = require('./prepare-dataset');
const { cleanText, tokenize, topicTokens } = require('../src/nlp/preprocess');
const { STOP } = require('../src/nlp/stopwords');
const { TfidfVectorizer, cosine } = require('../src/nlp/tfidf');
const { scoreAll } = require('../src/nlp/scoring');
const { extractInfo } = require('../src/nlp/extract');
const { topicModelCorpus } = require('../src/nlp/lda');
const { evaluateSentiment } = require('../src/nlp/evaluate');

const r3 = (n) => Math.round(n * 1000) / 1000;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/** Stratified sample: up to n resumes per category, deterministic. */
function stratifiedSample(resumes, perCategory) {
  const by = {};
  for (const r of resumes) (by[r.category] ||= []).push(r);
  return Object.keys(by).sort().flatMap((c) => seededShuffle(by[c]).slice(0, perCategory));
}

function prep(r) {
  const clean = cleanText(r.text);
  return { ...r, clean, tokens: tokenize(clean), raw: r.text };
}

// ---------- CO1 ----------
function corpusStats(docs) {
  const rawVocab = new Set(), cleanVocab = new Set(), noStopVocab = new Set();
  let rawTok = 0, cleanTok = 0, topicTok = 0;
  for (const d of docs) {
    const raw = d.raw.split(/\s+/).filter(Boolean);
    rawTok += raw.length;
    raw.forEach((w) => rawVocab.add(w));
    cleanTok += d.tokens.length;
    d.tokens.forEach((w) => { cleanVocab.add(w); if (!STOP.has(w)) noStopVocab.add(w); });
    topicTok += topicTokens(d.clean).length;
  }
  const v = new TfidfVectorizer().fit(docs.map((d) => d.tokens));
  const nnz = mean(docs.map((d) => v.transform(d.tokens).size));
  return {
    documents: docs.length,
    avgRawWords: Math.round(rawTok / docs.length),
    avgCleanTokens: Math.round(cleanTok / docs.length),
    avgTopicTokens: Math.round(topicTok / docs.length),
    rawVocab: rawVocab.size, cleanVocab: cleanVocab.size, noStopVocab: noStopVocab.size,
    tfidfFeatures: v.vocab.size,
    avgNonZeroPerDoc: Math.round(nnz),
    sparsity: r3(1 - nnz / v.vocab.size)
  };
}

// ---------- CO2 (a) classification ----------
function classifyCentroid(docs, { testShare = 0.2 } = {}) {
  const shuffled = seededShuffle(docs, 7);
  const nTest = Math.round(docs.length * testShare);
  const test = shuffled.slice(0, nTest), train = shuffled.slice(nTest);
  const v = new TfidfVectorizer({ maxFeatures: 20000 }).fit(train.map((d) => d.tokens));
  const sums = {};
  for (const d of train) {
    const c = (sums[d.category] ||= new Map());
    for (const [t, w] of v.transform(d.tokens)) c.set(t, (c.get(t) || 0) + w);
  }
  const centroids = Object.entries(sums).map(([cat, m]) => {
    const n = Math.sqrt([...m.values()].reduce((a, w) => a + w * w, 0)) || 1;
    return [cat, new Map([...m].map(([t, w]) => [t, w / n]))];
  });
  const labels = centroids.map(([c]) => c).sort();
  const conf = Object.fromEntries(labels.map((a) => [a, Object.fromEntries(labels.map((b) => [b, 0]))]));
  let ok = 0;
  for (const d of test) {
    const vec = v.transform(d.tokens);
    let best = labels[0], bs = -1;
    for (const [cat, cen] of centroids) { const s = cosine(vec, cen); if (s > bs) { bs = s; best = cat; } }
    if (conf[d.category]) conf[d.category][best]++;
    if (best === d.category) ok++;
  }
  const perClass = labels.map((l) => {
    const tp = conf[l][l];
    const fp = labels.reduce((a, o) => a + (o === l ? 0 : conf[o][l]), 0);
    const fn = labels.reduce((a, o) => a + (o === l ? 0 : conf[l][o]), 0);
    const p = tp + fp ? tp / (tp + fp) : 0, rc = tp + fn ? tp / (tp + fn) : 0;
    return { label: l, precision: r3(p), recall: r3(rc), f1: r3(p + rc ? (2 * p * rc) / (p + rc) : 0), support: tp + fn };
  });
  const counts = {};
  train.forEach((d) => (counts[d.category] = (counts[d.category] || 0) + 1));
  const majority = Math.max(...Object.values(counts)) / train.length;
  return { train: train.length, test: test.length, accuracy: r3(ok / test.length), macroF1: r3(mean(perClass.map((c) => c.f1))), majorityBaseline: r3(majority), perClass };
}

// ---------- CO2 (b) ranking ----------
function rocAuc(scores, relevant) {
  const pos = [], neg = [];
  scores.forEach((s, i) => (relevant[i] ? pos : neg).push(s));
  if (!pos.length || !neg.length) return null;
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}
function rankingEval(docs, jdText, category, k = 10) {
  const jdClean = cleanText(jdText);
  const jd = { clean: jdClean, tokens: tokenize(jdClean) };
  const { scored } = scoreAll(jd, docs);
  const relevant = docs.map((d) => d.category.toLowerCase() === category.toLowerCase());
  const measure = (vals) => {
    const order = vals.map((v, i) => i).sort((a, b) => vals[b] - vals[a]);
    const kk = Math.min(k, order.length);
    return { [`precision@${k}`]: r3(order.slice(0, kk).filter((i) => relevant[i]).length / kk), rocAuc: r3(rocAuc(vals, relevant) ?? 0) };
  };
  return {
    category, pool: docs.length, relevant: relevant.filter(Boolean).length,
    randomPrecision: r3(relevant.filter(Boolean).length / docs.length),
    tfidfSimilarityOnly: measure(scored.map((s) => s.components.similarity)),
    fullAtsScore: measure(scored.map((s) => s.atsScore))
  };
}

// ---------- CO2 (c) extraction ----------
function extractionFill(docs) {
  const keys = {};
  for (const d of docs) {
    const info = extractInfo(d.raw);
    for (const [k, v] of Object.entries(info)) {
      if (k === 'sectionsFound') {
        for (const [s, found] of Object.entries(v)) keys[`section:${s}`] = (keys[`section:${s}`] || 0) + (found ? 1 : 0);
        continue;
      }
      const filled = Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? Object.values(v).some(Boolean) : Boolean(v);
      keys[k] = (keys[k] || 0) + (filled ? 1 : 0);
    }
  }
  return Object.entries(keys).map(([field, n]) => ({ field, filled: n, rate: r3(n / docs.length) }));
}

// ---------- CO2 (d) sentiment on a real labelled CSV ----------
function loadSentimentCsv(file, max = 2000) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const header = rows.shift().map((h) => h.trim().toLowerCase());
  const iText = header.findIndex((h) => ['text', 'sentence', 'review', 'content', 'phrase'].includes(h));
  const iLab = header.findIndex((h) => ['label', 'sentiment', 'polarity'].includes(h));
  if (iText < 0 || iLab < 0) throw new Error(`Need a text column and a label column; found: ${header.join(', ')}`);
  const raw = rows.filter((x) => x[iText] && x[iLab] !== undefined);
  const vals = new Set(raw.map((x) => x[iLab].trim().toLowerCase()));
  const numeric = [...vals].every((v) => /^\d+$/.test(v));
  const maxN = numeric ? Math.max(...[...vals].map(Number)) : 0;
  const map = (v) => {
    v = v.trim().toLowerCase();
    if (/^(pos|positive)$/.test(v)) return 'positive';
    if (/^(neg|negative)$/.test(v)) return 'negative';
    if (/^(neu|neutral)$/.test(v)) return 'neutral';
    if (numeric) return maxN <= 1 ? (v === '1' ? 'positive' : 'negative') : v === '0' ? 'negative' : v === '1' ? 'neutral' : 'positive';
    return null;
  };
  const data = raw.map((x) => ({ text: x[iText].trim(), label: map(x[iLab]) })).filter((x) => x.label);
  return seededShuffle(data).slice(0, max);
}

// ---------- CO3 ----------
function topicEval(docs, K) {
  const tm = topicModelCorpus(docs.map((d) => ({ key: d.id, tokens: topicTokens(d.clean) })), { K, iters: 150 });
  if (!tm.ok) return { ok: false, reason: tm.reason };
  const dist = Array.from({ length: K }, () => ({}));
  docs.forEach((d, i) => {
    const mix = tm.mixes[i];
    const k = mix.indexOf(Math.max(...mix));
    dist[k][d.category] = (dist[k][d.category] || 0) + 1;
  });
  const purity = dist.reduce((a, m) => a + Math.max(0, ...Object.values(m)), 0) / docs.length;
  return {
    ok: true, K, chunks: tm.chunks, vocabSize: tm.vocabSize, purity: r3(purity),
    topics: tm.topics.map((t, k) => ({
      id: k, words: t.words.slice(0, 8).map((w) => w.word).join(', '),
      topCategories: Object.entries(dist[k]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${c} (${n})`).join(', ')
    }))
  };
}

// ---------- report ----------
const table = (head, rows) => `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}`;

function buildReport(res) {
  const L = [];
  L.push('# Dataset evaluation results (generated)', '',
    `Dataset: ${res.source} | resumes loaded: ${res.total} | categories: ${res.categories} | evaluation sample: ${res.sample} (${res.perCategory} per category, seeded)`, '');
  const c1 = res.co1;
  L.push('## CO1 - Preprocessing and vectorization', '',
    table(['Measure', 'Value'], [
      ['Documents', c1.documents], ['Avg words per resume (raw)', c1.avgRawWords], ['Avg tokens after cleaning', c1.avgCleanTokens],
      ['Avg tokens after stop-word / noise removal (topic tokens)', c1.avgTopicTokens],
      ['Vocabulary, raw whitespace tokens', c1.rawVocab], ['Vocabulary after cleaning', c1.cleanVocab], ['Vocabulary after stop-word removal', c1.noStopVocab],
      ['TF-IDF features (unigram+bigram, capped)', c1.tfidfFeatures], ['Avg non-zero features per resume', c1.avgNonZeroPerDoc], ['Sparsity of TF-IDF matrix', c1.sparsity]]), '');
  const a = res.classification;
  L.push('## CO2 - Evaluation', '', `### (a) Resume category classification (TF-IDF nearest centroid, ${a.train} train / ${a.test} test)`, '',
    `Accuracy **${a.accuracy}**, macro-F1 **${a.macroF1}**, majority-class baseline ${a.majorityBaseline}.`, '',
    table(['Category', 'Precision', 'Recall', 'F1', 'Test support'], a.perClass.map((c) => [c.label, c.precision, c.recall, c.f1, c.support])), '');
  if (res.ranking) {
    const k = res.ranking, pk = Object.keys(k.fullAtsScore)[0];
    L.push(`### (b) Ranking quality for a job description (relevant = category ${k.category}; ${k.relevant} of ${k.pool} resumes)`, '',
      table(['Ranker', pk, 'ROC-AUC'], [['Random (expected)', k.randomPrecision, '0.5'], ['TF-IDF similarity only', k.tfidfSimilarityOnly[pk], k.tfidfSimilarityOnly.rocAuc], ['Full ATS score', k.fullAtsScore[pk], k.fullAtsScore.rocAuc]]),
      '', 'Category is only a proxy for relevance (a resume in another category can still fit the job), so treat these as indicative.', '');
  }
  L.push('### (c) Information extraction fill rate (share of resumes where the field was found; no ground truth available)', '',
    table(['Field', 'Found', 'Rate'], res.extraction.map((e) => [e.field, e.filled, e.rate])), '');
  if (res.sentiment) {
    const s = res.sentiment;
    L.push(`### (d) Sentiment on a real labelled set (${res.sentimentFile}, ${s.samples} samples)`, '',
      `Accuracy **${s.accuracy}**, macro-F1 **${s.macroF1}**.`, '',
      table(['Class', 'Precision', 'Recall', 'F1', 'Support'], s.perClass.map((c) => [c.label, c.precision, c.recall, c.f1, c.support])), '');
  }
  if (res.topics.ok) {
    L.push(`## CO3 - Topic modelling (LDA, K=${res.topics.K}, ${res.topics.chunks} chunks, vocab ${res.topics.vocabSize})`, '',
      `Topic purity against true category: **${res.topics.purity}** (share of resumes whose dominant topic's majority category matches theirs).`, '',
      table(['Topic', 'Top words', 'Dominant categories'], res.topics.topics.map((t) => [t.id, t.words, t.topCategories])), '');
  } else L.push('## CO3 - Topic modelling', '', res.topics.reason, '');
  return L.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const csv = args.find((a) => !a.startsWith('--'));
  const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
  if (!csv) { console.error('Usage: node server/scripts/evaluate-dataset.js <Resume.csv> [--per-category 40] [--topics 6] [--jd file] [--jd-category NAME] [--sentiment labelled.csv] [--out file]'); process.exit(1); }
  const perCategory = Math.max(5, Number(opt('per-category', 40)));
  const K = Math.max(2, Math.min(24, Number(opt('topics', 6))));
  const jdPath = path.resolve(opt('jd', path.join(__dirname, '../../samples/job_description_it.txt')));
  const jdCategory = opt('jd-category', 'INFORMATION-TECHNOLOGY');
  const out = path.resolve(opt('out', path.join(__dirname, '../../docs/DATASET_RESULTS.md')));

  const all = loadResumes(csv);
  const docs = stratifiedSample(all, perCategory).map(prep);
  const categories = new Set(all.map((r) => r.category)).size;
  console.log(`Loaded ${all.length} resumes (${categories} categories); evaluating on ${docs.length}`);

  const res = {
    source: 'Kaggle Resume Dataset (snehaanbhawal/resume-dataset)', total: all.length, categories, sample: docs.length, perCategory,
    co1: corpusStats(docs),
    classification: classifyCentroid(docs),
    ranking: fs.existsSync(jdPath) && docs.some((d) => d.category.toLowerCase() === jdCategory.toLowerCase()) ? rankingEval(docs, fs.readFileSync(jdPath, 'utf8'), jdCategory) : null,
    extraction: extractionFill(docs),
    topics: topicEval(docs, K)
  };
  const sentFile = opt('sentiment', null);
  if (sentFile) { res.sentiment = evaluateSentiment(loadSentimentCsv(sentFile)); res.sentimentFile = path.basename(sentFile); }

  const md = buildReport(res);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, md + '\n');
  console.log(md);
  console.log(`\nReport written to ${out}`);
}

if (require.main === module) main();
module.exports = { stratifiedSample, prep, corpusStats, classifyCentroid, rankingEval, extractionFill, loadSentimentCsv, topicEval, rocAuc, buildReport };
