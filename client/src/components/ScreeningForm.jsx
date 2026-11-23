import { useState } from 'react';
import { api } from '../api.js';

const DEFAULT_JD = `We are looking for a Python Developer Intern.

Required skills:
Python, SQL, Pandas, NumPy, Git, problem solving.

Responsibilities:
Develop Python applications, work with data, write clean code,
debug issues, and collaborate with the development team.

Preferred:
Machine Learning, Scikit-learn, Flask, communication skills.

Education:
Bachelor's degree in Computer Science, Information Technology,
or Engineering.`;

export default function ScreeningForm({ onDone }) {
  const [title, setTitle] = useState('Python Intern screening');
  const [jd, setJd] = useState(DEFAULT_JD);
  const [files, setFiles] = useState([]);
  const [topicCount, setTopicCount] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failed, setFailed] = useState([]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setFailed([]);
    if (jd.trim().length < 30) return setError('Please enter a job description (at least 30 characters).');
    if (files.length === 0) return setError('Please choose at least one PDF or TXT resume.');

    const fd = new FormData();
    fd.append('title', title);
    fd.append('jobDescription', jd);
    fd.append('topicCount', String(topicCount));
    files.forEach((f) => fd.append('resumes', f));

    setBusy(true);
    try {
      const result = await api.createScreening(fd);
      setFailed(result.failed || []);
      onDone(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card glass-panel" onSubmit={submit}>
      <h2>1. Job description</h2>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      </label>
      <label>
        Paste the complete job description
        <textarea rows={11} value={jd} onChange={(e) => setJd(e.target.value)} />
      </label>

      <h2>2. Upload resumes</h2>
      <label>
        PDF (selectable text) or TXT files, up to 20 files, 5 MB each
        <input type="file" accept=".pdf,.txt,application/pdf,text/plain" multiple onChange={(e) => setFiles([...e.target.files])} />
      </label>
      {files.length > 0 && <p className="muted small">{files.length} file(s): {files.map((f) => f.name).join(', ')}</p>}

      <label className="inline">
        Number of topics for topic modelling
        <select value={topicCount} onChange={(e) => setTopicCount(Number(e.target.value))}>
          {[2, 3, 4, 5, 6, 8].map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </label>

      {error && <p className="error">{error}</p>}
      {failed.length > 0 && (
        <ul className="error small">
          {failed.map((f) => (
            <li key={f.file}>{f.file}: {f.reason}</li>
          ))}
        </ul>
      )}

      <button className="primary" disabled={busy}>
        {busy ? 'Analysing resumes…' : 'Screen and rank resumes'}
      </button>
    </form>
  );
}
