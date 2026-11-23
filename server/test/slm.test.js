const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const { generateFeedback, groundFeedback, provider, buildSlmPrompt } = require('../src/services/llm');

const candidate = {
  atsScore: 52,
  matchLevel: 'Moderate Match',
  matchedSkills: ['Python'],
  missingSkills: ['SQL', 'Git'],
  sharedTerms: ['python'],
  textPreview: 'Built a sales dashboard in Python and Pandas. Skills: Python, Excel.'
};

function fakeOllama(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => handler(req, JSON.parse(body || '{}'), res));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function withEnv(vars, fn) {
  const old = {};
  for (const k of Object.keys(vars)) old[k] = process.env[k];
  Object.assign(process.env, vars);
  return Promise.resolve(fn()).finally(() => {
    for (const k of Object.keys(vars)) old[k] === undefined ? delete process.env[k] : (process.env[k] = old[k]);
  });
}

test('provider selection', () => {
  const keep = { ...process.env };
  delete process.env.LLM_PROVIDER; delete process.env.SLM_URL; delete process.env.ANTHROPIC_API_KEY;
  assert.equal(provider(), 'fallback');
  process.env.SLM_URL = 'http://x';
  assert.equal(provider(), 'slm');
  process.env.LLM_PROVIDER = 'anthropic';
  assert.equal(provider(), 'anthropic');
  Object.keys(process.env).forEach((k) => !(k in keep) && delete process.env[k]);
  Object.assign(process.env, keep);
});

test('SLM client sends schema + auth and grounds the answer', async () => {
  let seen;
  const server = await fakeOllama((req, body, res) => {
    seen = { url: req.url, auth: req.headers.authorization, body };
    const reply = {
      summary: 'Good Python base, missing SQL and Git.',
      fit_level: 'moderate',
      strengths: ['Python dashboard project', 'Uses Pandas', 'Clear skills list'],
      gaps: [
        { skill: 'SQL', suggestion: 'Add a database project.' },
        { skill: 'Kubernetes', suggestion: 'Not a required skill, should be dropped.' }
      ],
      resume_improvements: [
        { before: 'Built a sales dashboard in Python and Pandas', after: 'Built a sales dashboard ... with a measurable result.' },
        { before: 'Led a team of 50 engineers', after: 'invented text, should be dropped' }
      ],
      interview_questions: ['q1', 'q2', 'q3', 'q4', 'q5'],
      flags: []
    };
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ message: { role: 'assistant', content: JSON.stringify(reply) } }));
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const out = await withEnv({ LLM_PROVIDER: 'slm', SLM_URL: url, SLM_MODEL: 'qwen2.5:3b', SLM_API_KEY: 'secret' }, () =>
      generateFeedback({ jobDescription: 'Python intern. SQL, Git.', candidate, requiredSkills: ['Python', 'SQL', 'Git'] })
    );
    assert.equal(out.source, 'slm');
    assert.equal(seen.url, '/api/chat');
    assert.equal(seen.auth, 'Bearer secret');
    assert.equal(seen.body.stream, false);
    assert.equal(seen.body.format.type, 'object'); // JSON schema is sent
    assert.deepEqual(out.feedback.gaps.map((g) => g.skill), ['SQL']);
    assert.equal(out.feedback.resume_improvements.length, 1);
    assert.ok(out.feedback.flags.some((f) => f.includes('removed')));
  } finally {
    server.close();
  }
});

test('SLM failure falls back to rule-based feedback instead of crashing', async () => {
  const out = await withEnv({ LLM_PROVIDER: 'slm', SLM_URL: 'http://127.0.0.1:1', SLM_TIMEOUT_MS: '2000' }, () =>
    generateFeedback({ jobDescription: 'x', candidate, requiredSkills: ['Python', 'SQL'] })
  );
  assert.equal(out.source, 'rule-based-fallback');
  assert.ok(out.feedback.flags[0].startsWith('SLM call failed'));
});

test('SLM prompt stays small enough for a 4k context', () => {
  const big = { ...candidate, textPreview: 'x'.repeat(20000) };
  const p = buildSlmPrompt({ jobDescription: 'y'.repeat(20000), candidate: big, requiredSkills: ['Python'] });
  assert.ok(p.length < 6000, `prompt was ${p.length} chars`);
});

test('groundFeedback keeps valid items untouched', () => {
  const fb = { gaps: [{ skill: 'git', suggestion: 's' }], resume_improvements: [], flags: [] };
  assert.equal(groundFeedback(fb, candidate).gaps.length, 1);
});
