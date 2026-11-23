import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function History({ onOpen }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  const load = () =>
    api.listScreenings().then(setItems).catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  async function open(id) {
    try {
      onOpen(await api.getScreening(id));
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(id) {
    if (!window.confirm('Delete this screening and its resume text?')) return;
    try {
      await api.deleteScreening(id);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (!items) return <p className="muted">Loading…</p>;
  if (items.length === 0) return <p className="muted">No saved screenings yet.</p>;

  return (
    <div className="card glass-panel">
      <h2>Saved screenings</h2>
      <table>
        <thead>
          <tr><th>Title</th><th>Date</th><th>Resumes</th><th>Top score</th><th /></tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s._id}>
              <td>{s.title}</td>
              <td>{new Date(s.createdAt).toLocaleString()}</td>
              <td>{s.resumes}</td>
              <td>{s.topScore}</td>
              <td className="actions">
                <button onClick={() => open(s._id)}>Open</button>
                <button className="danger" onClick={() => remove(s._id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
