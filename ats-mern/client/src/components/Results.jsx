import { useState } from 'react';
import { api } from '../api.js';
import CandidatePanel from './CandidatePanel.jsx';

export default function Results({ screening, onChange }) {
  const [selectedId, setSelectedId] = useState(screening.candidates[0]?._id);
  const { candidates, requiredSkills, coverage, topicModel } = screening;
  const selected = candidates.find((c) => c._id === selectedId) || candidates[0];

  const avg = candidates.reduce((a, c) => a + c.atsScore, 0) / candidates.length;

  function updateCandidate(cid, patch) {
    onChange({
      ...screening,
      candidates: screening.candidates.map((c) => (c._id === cid ? { ...c, ...patch } : c))
    });
  }

  return (
    <div className="stack">
      <div className="card glass-panel">
        <h2>{screening.title}</h2>
        <div className="metrics">
          <div><strong>{candidates.length}</strong><span>Resumes screened</span></div>
          <div><strong>{candidates[0].atsScore.toFixed(2)}</strong><span>Highest score</span></div>
          <div><strong>{avg.toFixed(2)}</strong><span>Average score</span></div>
          <div><strong>{requiredSkills.length}</strong><span>Required skills found</span></div>
        </div>
        <p className="small">
          <b>Required skills detected:</b> {requiredSkills.length ? requiredSkills.join(', ') : 'none from the built-in dictionary'}
        </p>
        {screening.failed?.length > 0 && (
          <ul className="error small">
            {screening.failed.map((f) => <li key={f.file}>{f.file}: {f.reason}</li>)}
          </ul>
        )}
      </div>

      <div className="card glass-panel">
        <div className="row">
          <h2>Candidate ranking</h2>
          <a className="button" href={api.csvUrl(screening._id)}>Download CSV</a>
        </div>
        <table className="clickable">
          <thead>
            <tr><th>Rank</th><th>Resume</th><th style={{ width: '30%' }}>ATS score</th><th>Match</th><th>Matched</th><th>Missing</th></tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c._id} className={c._id === selected._id ? 'selected' : ''} onClick={() => setSelectedId(c._id)}>
                <td>{c.rank}</td>
                <td>{c.fileName}</td>
                <td>
                  <div className="bar"><div style={{ width: `${c.atsScore}%` }} /></div>
                  <span className="small">{c.atsScore.toFixed(2)} / 100</span>
                </td>
                <td>{c.matchLevel}</td>
                <td className="small">{c.matchedSkills.join(', ') || '—'}</td>
                <td className="small">{c.missingSkills.join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid2">
        <div className="card glass-panel">
          <h2>Skill coverage across resumes</h2>
          {coverage.length === 0 ? (
            <p className="muted">No required skills to summarise.</p>
          ) : (
            <table>
              <thead><tr><th>Skill</th><th>Resumes containing it</th></tr></thead>
              <tbody>
                {coverage.map((c) => (
                  <tr key={c.skill}><td>{c.skill}</td><td>{c.count} / {candidates.length}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card glass-panel">
          <h2>Topics found (LDA)</h2>
          {topicModel?.topics?.length ? (
            <ul className="topics">
              {topicModel.topics.map((t) => (
                <li key={t.id}>
                  <b>Topic {t.id + 1}</b>: {t.words.slice(0, 6).map((w) => w.word).join(', ')}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{topicModel?.note || 'Topic model not available.'}</p>
          )}
        </div>
      </div>

      <CandidatePanel
        key={selected._id}
        screening={screening}
        candidate={selected}
        onFeedback={(fb) => updateCandidate(selected._id, { aiFeedback: fb })}
      />
    </div>
  );
}
