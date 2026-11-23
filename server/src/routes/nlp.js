const express = require('express');
const { evaluateSentiment } = require('../nlp/evaluate');
const { analyzeSentiment } = require('../nlp/sentiment');

const router = express.Router();

// CO2 evaluation: metrics of the sentiment classifier on the labelled sample set
router.get('/sentiment-eval', (req, res) => res.json(evaluateSentiment()));

// Try the sentiment analyser on any text
router.post('/sentiment', (req, res) => {
  const text = String(req.body.text || '').slice(0, 20000);
  if (!text.trim()) return res.status(400).json({ error: 'text is required' });
  res.json(analyzeSentiment(text));
});

module.exports = router;
