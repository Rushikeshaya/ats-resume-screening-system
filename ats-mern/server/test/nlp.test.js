const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { cleanText, tokenize, topicTokens } = require('../src/nlp/preprocess');
const { extractSkills } = require('../src/nlp/skills');
const { TfidfVectorizer, cosine } = require('../src/nlp/tfidf');
const { extractInfo, detectSections } = require('../src/nlp/extract');
const { analyzeSentiment, classify } = require('../src/nlp/sentiment');
const { evaluateSentiment } = require('../src/nlp/evaluate');
const { runLDA, topicModelCorpus } = require('../src/nlp/lda');
const { detectScript } = require('../src/nlp/multilingual');
const { runPipeline } = require('../src/services/pipeline');
const { normalise, parseJson, ruleBasedFeedback } = require('../src/services/llm');

const sample = (f) => fs.readFileSync(path.join(__dirname, '../../samples', f));

test('cleanText removes emails/urls/punctuation but keeps c++ and node.js', () => {
  const c = cleanText('Mail me: A.B@x.com, see https://x.io. Skills: C++, Node.js & C#!');
  assert.ok(!c.includes('@') && !c.includes('http'));
  assert.ok(c.includes('c++') && c.includes('node.js') && c.includes('c#'));
});

test('skill matcher: C does not match inside C++ / CSS, aliases work', () => {
  assert.deepEqual(extractSkills(cleanText('Experienced in C++ and CSS')), ['C++', 'CSS']);
  assert.ok(extractSkills(cleanText('Used scikit-learn and Node.js with problem-solving')).includes('Scikit-learn'));
  assert.ok(extractSkills(cleanText('problem-solving')).includes('Problem Solving'));
  assert.ok(extractSkills(cleanText('I know C.')).includes('C'));
});

test('tf-idf: identical docs -> 1, disjoint docs -> 0, vectors are unit length', () => {
  const a = tokenize(cleanText('python pandas numpy data analysis'));
  const b = tokenize(cleanText('welding lathe machining workshop'));
  const v = new TfidfVectorizer().fit([a, b]);
  assert.ok(Math.abs(cosine(v.transform(a), v.transform(a)) - 1) < 1e-9);
  assert.equal(cosine(v.transform(a), v.transform(b)), 0);
});

test('information extraction on the strong sample', () => {
  const info = extractInfo(sample('resume_strong.txt').toString());
  assert.equal(info.name, 'Ananya Deshmukh');
  assert.equal(info.email, 'ananya.deshmukh@example.com');
  assert.ok(info.phone.includes('98765'));
  assert.equal(info.education.cgpa, 8.7);
  assert.equal(info.experience.fromDateRanges, 0.3); // Jun-Aug 2024 = 3 months
  assert.deepEqual(Object.values(info.sectionsFound), [true, true, true, true]);
});

test('section detection needs real headings, not keywords inside sentences', () => {
  const s = detectSections('Alex Kim\nI enjoy projects and education policy and skills building');
  assert.deepEqual(Object.values(s), [false, false, false, false]);
});

test('sentiment: negation, booster and labels', () => {
  assert.equal(classify('The work was good'), 'positive');
  assert.equal(classify('The work was not good'), 'negative');
  assert.ok(analyzeSentiment('Very strong delivery.').compound > analyzeSentiment('Strong delivery.').compound);
  assert.equal(classify('The meeting is on Monday'), 'neutral');
});

test('sentiment evaluation runs and reports sensible metrics', () => {
  const r = evaluateSentiment();
  assert.equal(r.samples, 30);
  assert.ok(r.accuracy >= 0.8, `accuracy was ${r.accuracy}`);
  assert.equal(r.perClass.length, 3);
});

test('LDA separates two clearly different vocabularies', () => {
  const ml = 'model training dataset neural network gradient accuracy'.split(' ');
  const cook = 'recipe flour oven bake sugar butter dough'.split(' ');
  const docs = [];
  for (let i = 0; i < 20; i++) docs.push(i % 2 ? [...ml, ...ml] : [...cook, ...cook]);
  const { topics, nd } = runLDA(docs, { K: 2, iters: 150 });
  assert.ok(ml.includes(topics[0].words[0].word) !== ml.includes(topics[1].words[0].word), 'topics differ');
  const mlTopic = ml.includes(topics[0].words[0].word) ? 0 : 1;
  // every ML doc must be dominated by the ML topic
  docs.forEach((d, i) => {
    const dominant = nd[i][0] >= nd[i][1] ? 0 : 1;
    assert.equal(dominant === mlTopic, i % 2 === 1);
  });
});

test('topicModelCorpus refuses tiny inputs instead of returning noise', () => {
  const r = topicModelCorpus([{ key: 'a', tokens: ['python', 'sql'] }], { K: 4 });
  assert.equal(r.ok, false);
});

test('script detection recognises Devanagari', () => {
  assert.equal(detectScript('सागर जाधव शिक्षण').script, 'Devanagari');
  assert.equal(detectScript('plain english text').script, 'Latin');
});

test('end-to-end pipeline ranks the strong resume above the weak one', async () => {
  const files = ['resume_weak.txt', 'resume_strong.txt', 'resume_marathi.txt'].map((f) => ({
    originalname: f,
    mimetype: 'text/plain',
    buffer: sample(f)
  }));
  const out = await runPipeline({ jobDescription: sample('job_description.txt').toString(), files, topicCount: 3 });
  assert.equal(out.candidates.length, 3);
  assert.equal(out.candidates[0].fileName, 'resume_strong.txt');
  assert.equal(out.candidates.at(-1).fileName.startsWith('resume_'), true);
  for (const c of out.candidates) {
    assert.ok(c.atsScore >= 0 && c.atsScore <= 100);
    const sum = c.components.similarity + c.components.skills + c.components.evidence + c.components.structure;
    assert.ok(Math.abs(sum - c.atsScore) < 0.05, 'components add up to the total');
  }
  assert.ok(out.requiredSkills.includes('Python') && out.requiredSkills.includes('SQL'));
  const marathi = out.candidates.find((c) => c.fileName === 'resume_marathi.txt');
  assert.equal(marathi.language.script, 'Devanagari');
  assert.ok(marathi.language.note, 'warns that translation needs AWS');
});

test('LLM helpers: JSON parsing, normalisation and fallback', () => {
  const parsed = parseJson('Here you go: {"summary":"ok","fit_level":"weird","strengths":["a","b","c","d"]}');
  const n = normalise(parsed);
  assert.equal(n.fit_level, 'moderate');
  assert.equal(n.strengths.length, 3);
  const fb = ruleBasedFeedback({ atsScore: 80, matchLevel: 'High Match', matchedSkills: ['Python'], missingSkills: ['SQL'] }, ['Python', 'SQL']);
  assert.equal(fb.fit_level, 'strong');
});

// ---- real-dataset tooling (no dataset needed: tiny inline fixtures) ----
const { restoreLines } = require('../scripts/prepare-dataset');
const ds = require('../scripts/evaluate-dataset');

test('restoreLines rebuilds headings from Kaggle-style flattened text', () => {
  const flat = 'JANE DOE  Summary  Backend developer.  Skills  Python, SQL  Education  BSc Computer Science  Experience  2019 to 2023 Engineer';
  const s = detectSections(restoreLines(flat));
  assert.equal(s.Skills, true);
  assert.equal(s.Education, true);
  assert.equal(s.Experience, true);
  assert.equal(restoreLines('line one\nline two'), 'line one\nline two');
  assert.equal(detectSections(flat).Skills, false); // proves the restore step is needed
});

test('rocAuc: perfect, inverted and tied rankings', () => {
  assert.equal(ds.rocAuc([3, 2, 1, 0], [true, true, false, false]), 1);
  assert.equal(ds.rocAuc([0, 1, 2, 3], [true, true, false, false]), 0);
  assert.equal(ds.rocAuc([1, 1, 1, 1], [true, false, true, false]), 0.5);
});

test('category classifier and topic evaluation run on a small two-category corpus', () => {
  const mk = (cat, words, n) => Array.from({ length: n }, (_, i) =>
    ds.prep({ id: `${cat}${i}`, category: cat, text: Array.from({ length: 120 }, (_, j) => words[(i + j) % words.length]).join(' ') }));
  const docs = [...mk('IT', ['python', 'linux', 'network', 'server', 'cloud', 'database'], 12), ...mk('CHEF', ['kitchen', 'menu', 'culinary', 'recipe', 'sauce', 'catering'], 12)];
  const c = ds.classifyCentroid(docs);
  assert.ok(c.accuracy >= 0.9);
  const t = ds.topicEval(docs, 2);
  assert.ok(t.ok && t.purity >= 0.9);
});

test('macro-F1 ignores classes with no support (binary sentiment sets)', () => {
  const m = evaluateSentiment([{ text: 'excellent great work', label: 'positive' }, { text: 'terrible awful failure', label: 'negative' }]);
  assert.equal(m.macroF1, 1);
});
