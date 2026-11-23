import { useEffect, useState } from 'react';
import { api } from './api.js';
import ScreeningForm from './components/ScreeningForm.jsx';
import Results from './components/Results.jsx';
import History from './components/History.jsx';
import Evaluation from './components/Evaluation.jsx';

const TABS = [
  ['new', 'New screening'],
  ['history', 'History'],
  ['eval', 'Model evaluation']
];

export default function App() {
  const [tab, setTab] = useState('new');
  const [screening, setScreening] = useState(null);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ status: 'offline' }));
  }, []);

  const open = (s) => {
    setScreening(s);
    setTab('result');
  };

  return (
    <div className="app-workspace">
    <div className="app">
      <header className="top">
        <div>
          <h1>ATS Resume Screening</h1>
          <p className="muted">MERN + NLP: TF-IDF matching, information extraction, sentiment, topic modelling, multilingual and LLM feedback</p>
        </div>
        {health && (
          <div className="badges">
            <span className={`badge ${health.status === 'ok' ? 'ok' : 'bad'}`}>API {health.status}</span>
            {health.storage && <span className="badge ok">Storage {health.storage}</span>}
          </div>
        )}
      </header>

      <nav className="tabs">
        {TABS.map(([key, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
        {screening && (
          <button className={tab === 'result' ? 'active' : ''} onClick={() => setTab('result')}>
            Current result
          </button>
        )}
      </nav>

      <main>
        {tab === 'new' && <ScreeningForm onDone={open} />}
        {tab === 'history' && <History onOpen={open} />}
        {tab === 'eval' && <Evaluation />}
        {tab === 'result' && screening && <Results screening={screening} onChange={setScreening} />}
      </main>

      <footer className="muted small">
        Scores are text-matching aids, not a measure of a person&apos;s ability. Review original resumes manually.
      </footer>
    </div>
    </div>
  );
}
