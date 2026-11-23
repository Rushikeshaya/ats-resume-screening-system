import { useState } from 'react';
import { api } from '../api.js';

const TABS = ['Score', 'Extraction', 'Sentiment', 'Topics', 'AI feedback', 'Text'];

function Row({ label, value }) {
  return (
    <tr>
      <th>{label}</th>
      <td>{value === null || value === undefined || value === '' ? '—' : value}</td>
    </tr>
  );
}

function ScoreTab({ c }) {
  const parts = [
    ['TF-IDF similarity to job description', c.components.similarity, 50],
    ['Required-skill coverage', c.components.skills, 35],
    ['Project / experience / education evidence', c.components.evidence, 10],
    ['Section structure', c.components.structure, 5]
  ];
  return (
    <>
      <p><b>{c.atsScore.toFixed(2)} / 100</b> — {c.matchLevel} (cosine similarity {c.similarity})</p>
      <table>
        <tbody>
          {parts.map(([label, value, max]) => (
            <tr key={label}>
              <th>{label}</th>
              <td style={{ width: '40%' }}><div className="bar"><div style={{ width: `${(value / max) * 100}%` }} /></div></td>
              <td>{value.toFixed(2)} / {max}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small"><b>Matched required skills:</b> {c.matchedSkills.join(', ') || 'none'}</p>
      <p className="small"><b>Missing required skills:</b> {c.missingSkills.join(', ') || 'none'}</p>
      <p className="small"><b>All detected skills:</b> {c.resumeSkills.join(', ') || 'none'}</p>
      <p className="small"><b>Terms driving the similarity:</b> {c.sharedTerms.join(', ') || 'none'}</p>
    </>
  );
}

function ExtractionTab({ c }) {
  const i = c.info || {};
  return (
    <table>
      <tbody>
        <Row label="Name" value={i.name} />
        <Row label="Email" value={i.email} />
        <Row label="Phone" value={i.phone} />
        <Row label="LinkedIn" value={i.linkedin} />
        <Row label="GitHub" value={i.github} />
        <Row label="Degrees" value={i.education?.degrees?.join(', ')} />
        <Row label="CGPA" value={i.education?.cgpa} />
        <Row label="Experience (from date ranges, years)" value={i.experience?.fromDateRanges} />
        <Row label="Experience stated in text (years)" value={i.experience?.stated} />
        <Row label="Sections found" value={Object.entries(i.sectionsFound || {}).filter(([, v]) => v).map(([k]) => k).join(', ')} />
        <Row label="Certifications" value={i.certifications?.join(' | ')} />
        <Row label="Project lines" value={i.projectLines?.join(' | ')} />
        <Row label="Language / script" value={`${c.language?.code} / ${c.language?.script}${c.language?.translated ? ' (translated to English)' : ''}`} />
        <Row label="Language note" value={c.language?.note} />
      </tbody>
    </table>
  );
}

function SentimentTab({ c }) {
  const s = c.sentiment;
  return (
    <>
      <p><b>{s.label}</b> tone (compound {s.compound}) across {s.sentenceCount} statements</p>
      <div className="metrics">
        <div><strong>{s.counts.positive}</strong><span>positive</span></div>
        <div><strong>{s.counts.neutral}</strong><span>neutral</span></div>
        <div><strong>{s.counts.negative}</strong><span>negative</span></div>
        <div><strong>{s.style.actionVerbsPer100Words}</strong><span>action verbs / 100 words</span></div>
        <div><strong>{s.style.quantifiedStatements}</strong><span>quantified statements</span></div>
      </div>
      {s.mostPositive.length > 0 && (
        <>
          <h4>Most positive statements</h4>
          <ul className="small">{s.mostPositive.map((x) => <li key={x.text}>{x.text} ({x.compound})</li>)}</ul>
        </>
      )}
      {s.mostNegative.length > 0 && (
        <>
          <h4>Most negative statements</h4>
          <ul className="small">{s.mostNegative.map((x) => <li key={x.text}>{x.text} ({x.compound})</li>)}</ul>
        </>
      )}
      <p className="muted small">Tone is shown for information only and is not part of the ATS score.</p>
    </>
  );
}

function TopicsTab({ c, topicModel }) {
  if (!c.topicMix || !topicModel?.topics?.length) return <p className="muted">Topic model not available for this screening.</p>;
  return (
    <>
      <p className="small">Topic similarity to the job description: <b>{c.topicSimilarity}</b></p>
      <table>
        <thead><tr><th>Topic</th><th>Top words</th><th>Share of this resume</th></tr></thead>
        <tbody>
          {topicModel.topics.map((t, idx) => (
            <tr key={t.id}>
              <td>Topic {t.id + 1}</td>
              <td className="small">{t.words.slice(0, 5).map((w) => w.word).join(', ')}</td>
              <td style={{ width: '35%' }}>
                <div className="bar"><div style={{ width: `${c.topicMix[idx] * 100}%` }} /></div>
                <span className="small">{(c.topicMix[idx] * 100).toFixed(1)}%</span>
                {topicModel.jdMix && <span className="small muted"> · JD {(topicModel.jdMix[idx] * 100).toFixed(1)}%</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function FeedbackTab({ screening, c, onFeedback }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function generate() {
    setBusy(true);
    setError('');
    try {
      onFeedback(await api.feedback(screening._id, c._id));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const r = c.aiFeedback;
  const fb = r?.feedback;
  return (
    <>
      <button className="primary" onClick={generate} disabled={busy}>
        {busy ? 'Generating…' : r ? 'Regenerate feedback' : 'Generate AI feedback'}
      </button>
      {error && <p className="error">{error}</p>}
      {r && (
        <p className="muted small">
          Source:{' '}
          {r.source === 'slm' && `small language model (${r.model})`}
          {r.source === 'llm' && `LLM (${r.model})`}
          {r.source === 'rule-based-fallback' && 'rule-based fallback (model not configured or call failed)'}
        </p>
      )}
      {fb && (
        <div className="stack">
          <p><b>{fb.fit_level}</b> fit — {fb.summary}</p>
          <h4>Strengths</h4>
          <ul>{fb.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
          <h4>Gaps</h4>
          <ul>{fb.gaps.map((g) => <li key={g.skill}><b>{g.skill}</b>: {g.suggestion}</li>)}</ul>
          {fb.resume_improvements.length > 0 && (
            <>
              <h4>Suggested rewrites</h4>
              <ul>{fb.resume_improvements.map((x) => <li key={x.before}><i>{x.before}</i> → {x.after}</li>)}</ul>
            </>
          )}
          <h4>Interview questions</h4>
          <ol>{fb.interview_questions.map((q) => <li key={q}>{q}</li>)}</ol>
          {fb.flags.length > 0 && <ul className="small muted">{fb.flags.map((f) => <li key={f}>{f}</li>)}</ul>}
        </div>
      )}
    </>
  );
}

export default function CandidatePanel({ screening, candidate: c, onFeedback }) {
  const [tab, setTab] = useState('Score');
  return (
    <div className="card glass-panel">
      <h2>{c.fileName} <span className="muted small">(rank {c.rank})</span></h2>
      <nav className="tabs sub">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
        ))}
      </nav>
      {tab === 'Score' && <ScoreTab c={c} />}
      {tab === 'Extraction' && <ExtractionTab c={c} />}
      {tab === 'Sentiment' && <SentimentTab c={c} />}
      {tab === 'Topics' && <TopicsTab c={c} topicModel={screening.topicModel} />}
      {tab === 'AI feedback' && <FeedbackTab screening={screening} c={c} onFeedback={onFeedback} />}
      {tab === 'Text' && <pre className="text ats-resume-sheet">{c.textPreview}</pre>}
    </div>
  );
}
