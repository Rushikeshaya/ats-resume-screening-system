const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ats-')), 'screenings.json');
process.env.DATA_FILE = tmp;
const store = require('../src/store/screeningStore');

const sample = () => ({
  title: '  Backend intern  ',
  jobDescription: 'Node.js developer with SQL and Git experience.',
  requiredSkills: ['Node.js', 'SQL'],
  candidates: [
    { fileName: 'a.txt', atsScore: 70, matchedSkills: ['Node.js'], components: {} },
    { fileName: 'b.txt', atsScore: 40, matchedSkills: [], components: {} }
  ]
});

test('create writes a JSON file and assigns ids', async () => {
  await store.init();
  const doc = await store.create(sample());
  await store.flush();
  assert.equal(doc.title, 'Backend intern');
  assert.ok(doc._id && doc.candidates.every((c) => c._id));
  const onDisk = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  assert.equal(onDisk.length, 1);
  assert.equal(onDisk[0]._id, doc._id);
});

test('list returns newest-first summaries; get/delete work', async () => {
  const second = await store.create({ ...sample(), title: 'Second' });
  const items = store.list();
  assert.equal(items[0].title, 'Second');
  assert.equal(items[0].topScore, 70);
  assert.equal(items[0].resumes, 2);
  assert.equal(store.get(second._id).title, 'Second');
  assert.equal(store.get('nope'), null);
  assert.equal(await store.remove(second._id), true);
  assert.equal(await store.remove(second._id), false);
});

test('setFeedback persists and survives a reload from disk', async () => {
  const [first] = store.list();
  const doc = store.get(first._id);
  const ok = await store.setFeedback(doc._id, doc.candidates[0]._id, { summary: 'hi' });
  await store.flush();
  assert.equal(ok, true);
  assert.equal(await store.setFeedback(doc._id, 'missing', {}), false);
  store._reset();
  await store.init();
  assert.equal(store.get(doc._id).candidates[0].aiFeedback.summary, 'hi');
});

test('corrupt file is moved aside, not crashed on', async () => {
  fs.writeFileSync(tmp, '{ not json');
  store._reset();
  await store.init();
  assert.deepEqual(store.list(), []);
  assert.ok(fs.readdirSync(path.dirname(tmp)).some((f) => f.includes('corrupt')));
});
