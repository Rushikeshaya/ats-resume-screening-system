const express = require('express');
const multer = require('multer');
const store = require('../store/screeningStore');
const { runPipeline } = require('../services/pipeline');
const { generateFeedback } = require('../services/llm');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || file.mimetype === 'text/plain' || /\.(pdf|txt)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only PDF or TXT resumes are accepted'), ok);
  }
});

const isId = (id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Create a screening: JD + resumes -> full NLP pipeline -> saved result
router.post(
  '/',
  upload.array('resumes', 20),
  wrap(async (req, res) => {
    const jobDescription = String(req.body.jobDescription || '').trim();
    if (jobDescription.length < 30) return res.status(400).json({ error: 'Please enter a job description (at least 30 characters).' });
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Please upload at least one resume (PDF or TXT).' });

    const result = await runPipeline({ jobDescription, files: req.files, topicCount: req.body.topicCount });
    if (result.candidates.length === 0) {
      return res.status(422).json({ error: 'No readable resumes were found.', failed: result.failed });
    }
    const doc = await store.create({
      title: req.body.title,
      jobDescription,
      requiredSkills: result.requiredSkills,
      coverage: result.coverage,
      topicModel: result.topicModel,
      failed: result.failed,
      candidates: result.candidates
    });
    res.status(201).json(doc);
  })
);

// List (summaries only)
router.get(
  '/',
  wrap(async (req, res) => {
    res.json(store.list(50));
  })
);

router.get(
  '/:id',
  wrap(async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const doc = store.get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  })
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const deleted = await store.remove(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  })
);

// CSV export of the ranking
router.get(
  '/:id/export.csv',
  wrap(async (req, res) => {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const doc = store.get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Rank', 'Resume', 'ATS Score', 'Match Level', 'Similarity pts', 'Skill pts', 'Evidence pts', 'Structure pts', 'Matched skills', 'Missing skills', 'Sentiment'];
    const rows = doc.candidates.map((c) =>
      [c.rank, c.fileName, c.atsScore, c.matchLevel, c.components.similarity, c.components.skills, c.components.evidence, c.components.structure, c.matchedSkills.join('; '), c.missingSkills.join('; '), c.sentiment?.label].map(esc).join(',')
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="ats_resume_ranking.csv"');
    res.send([header.map(esc).join(','), ...rows].join('\n'));
  })
);

// CO4: LLM feedback for one candidate
router.post(
  '/:id/candidates/:cid/feedback',
  wrap(async (req, res) => {
    if (!isId(req.params.id) || !isId(req.params.cid)) return res.status(400).json({ error: 'Invalid id' });
    const doc = store.get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const candidate = doc.candidates.find((c) => c._id === req.params.cid);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    const result = await generateFeedback({
      jobDescription: doc.jobDescription,
      candidate,
      requiredSkills: doc.requiredSkills
    });
    await store.setFeedback(doc._id, candidate._id, result);
    res.json(result);
  })
);

module.exports = router;
