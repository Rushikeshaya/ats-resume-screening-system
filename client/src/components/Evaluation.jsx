import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Evaluation() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.sentimentEval().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Running evaluation…</p>;

  return (
    <div className="card glass-panel">
      <h2>Sentiment classifier evaluation (CO2)</h2>
      <p className="muted small">
        Lexicon + rules classifier scored on {data.samples} hand-labelled sentences. The set is small and written by the
        developer, so treat the numbers as a demonstration of the evaluation method, not a benchmark.
      </p>
      <div className="metrics">
        <div><strong>{(data.accuracy * 100).toFixed(1)}%</strong><span>Accuracy</span></div>
        <div><strong>{data.macroF1.toFixed(3)}</strong><span>Macro F1</span></div>
      </div>

      <h3>Per-class metrics</h3>
      <table>
        <thead><tr><th>Class</th><th>Precision</th><th>Recall</th><th>F1</th><th>Support</th></tr></thead>
        <tbody>
          {data.perClass.map((c) => (
            <tr key={c.label}><td>{c.label}</td><td>{c.precision}</td><td>{c.recall}</td><td>{c.f1}</td><td>{c.support}</td></tr>
          ))}
        </tbody>
      </table>

      <h3>Confusion matrix (rows = actual, columns = predicted)</h3>
      <table>
        <thead><tr><th /> {data.labels.map((l) => <th key={l}>{l}</th>)}</tr></thead>
        <tbody>
          {data.labels.map((a) => (
            <tr key={a}><th>{a}</th>{data.labels.map((p) => <td key={p}>{data.confusion[a][p]}</td>)}</tr>
          ))}
        </tbody>
      </table>

      {data.errors.length > 0 && (
        <>
          <h3>Misclassified</h3>
          <ul className="small">
            {data.errors.map((e) => (
              <li key={e.text}>&ldquo;{e.text}&rdquo; — expected {e.expected}, predicted {e.predicted}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
