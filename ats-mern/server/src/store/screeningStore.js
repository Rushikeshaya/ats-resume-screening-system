/**
 * JSON-file storage for screening history (replaces MongoDB).
 *
 * - All screenings live in one JSON file: server/data/screenings.json (override with DATA_FILE).
 * - Reads are served from an in-memory cache that is loaded once from disk.
 * - Writes are serialised through a promise queue and saved atomically
 *   (write to a temp file, then rename) so a crash cannot leave a half-written file.
 * - Ids are UUIDs. The field is still called `_id`, so the React client needs no changes.
 */
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const MAX_SCREENINGS = Number(process.env.MAX_SCREENINGS) || 200; // oldest are dropped beyond this

let cache = null; // array of screenings, newest first
let queue = Promise.resolve();

const filePath = () => path.resolve(process.env.DATA_FILE || path.join(__dirname, '../../data/screenings.json'));

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function load() {
  if (cache) return cache;
  const file = filePath();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    cache = Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // Corrupt file: keep a copy instead of silently overwriting it.
      try {
        fs.renameSync(file, `${file}.corrupt-${Date.now()}`);
        console.error(`Could not parse ${file}; moved it aside and starting empty.`);
      } catch (_) { /* ignore */ }
    }
    cache = [];
  }
  return cache;
}

function persist() {
  const file = filePath();
  const data = JSON.stringify(cache);
  queue = queue
    .then(async () => {
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, data);
      await fs.promises.rename(tmp, file);
    })
    .catch((err) => console.error('Failed to save screenings.json:', err.message));
  return queue;
}

/** Call once at startup: loads the file (creating it if missing). */
async function init() {
  load();
  if (!fs.existsSync(filePath())) await persist();
  return { file: filePath(), count: cache.length };
}

async function create(data) {
  load();
  const now = new Date().toISOString();
  const doc = {
    _id: randomUUID(),
    title: String(data.title || '').trim().slice(0, 120) || 'Untitled screening',
    jobDescription: String(data.jobDescription).slice(0, 20000),
    requiredSkills: data.requiredSkills || [],
    coverage: data.coverage || [],
    topicModel: data.topicModel ?? null,
    failed: data.failed || [],
    candidates: (data.candidates || []).map((c) => ({ ...c, _id: randomUUID() })),
    createdAt: now,
    updatedAt: now
  };
  cache.unshift(doc);
  if (cache.length > MAX_SCREENINGS) cache.length = MAX_SCREENINGS;
  await persist();
  return clone(doc);
}

/** Summaries for the history list, newest first. */
function list(limit = 50) {
  return load()
    .slice(0, limit)
    .map((d) => ({
      _id: d._id,
      title: d.title,
      createdAt: d.createdAt,
      resumes: d.candidates.length,
      topScore: d.candidates.length ? Math.max(...d.candidates.map((c) => c.atsScore)) : 0,
      requiredSkills: d.requiredSkills.length
    }));
}

function get(id) {
  const doc = load().find((d) => d._id === id);
  return doc ? clone(doc) : null;
}

async function remove(id) {
  load();
  const idx = cache.findIndex((d) => d._id === id);
  if (idx === -1) return false;
  cache.splice(idx, 1);
  await persist();
  return true;
}

/** Attach LLM feedback to one candidate. Returns false if the screening or candidate is missing. */
async function setFeedback(id, cid, feedback) {
  const doc = load().find((d) => d._id === id);
  const cand = doc && doc.candidates.find((c) => c._id === cid);
  if (!cand) return false;
  cand.aiFeedback = clone(feedback);
  doc.updatedAt = new Date().toISOString();
  await persist();
  return true;
}

/** Test helper: forget the in-memory cache so the next call re-reads the file. */
function _reset() {
  cache = null;
}

module.exports = { init, create, list, get, remove, setFeedback, flush: () => queue, _reset };
