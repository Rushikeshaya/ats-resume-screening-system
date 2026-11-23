const express = require('express');

const router = express.Router();

router.get('/health', (req, res) =>
  res.json({
    status: 'ok',
    storage: 'json-file',
    saved: require('../store/screeningStore').list(1000).length,
    llm: require('../services/llm').provider(),
    aws: String(process.env.USE_AWS).toLowerCase() === 'true' ? 'enabled' : 'disabled'
  })
);

router.use('/screenings', require('./screenings'));
router.use('/nlp', require('./nlp'));

module.exports = router;
