/**
 * Skill dictionary (canonical name -> aliases that appear in *cleaned* text).
 * Cleaning replaces '-' and '/' with spaces, so "scikit-learn" becomes "scikit learn".
 */
const SKILL_ALIASES = {
  Python: ['python'],
  Java: ['java'],
  'C++': ['c++'],
  C: ['c'],
  'C#': ['c#'],
  SQL: ['sql'],
  HTML: ['html', 'html5'],
  CSS: ['css', 'css3'],
  JavaScript: ['javascript', 'js', 'es6'],
  TypeScript: ['typescript'],
  React: ['react', 'reactjs', 'react.js'],
  'Node.js': ['node.js', 'nodejs', 'node js'],
  'Express.js': ['express.js', 'expressjs', 'express js', 'express'],
  MongoDB: ['mongodb', 'mongo db', 'mongoose'],
  MERN: ['mern'],
  'REST API': ['rest api', 'rest apis', 'restful', 'restful api', 'restful apis'],
  'Machine Learning': ['machine learning', 'ml'],
  'Deep Learning': ['deep learning'],
  'Data Analysis': ['data analysis', 'data analytics'],
  Pandas: ['pandas'],
  NumPy: ['numpy'],
  Matplotlib: ['matplotlib'],
  'Scikit-learn': ['scikit learn', 'scikit-learn', 'sklearn'],
  TensorFlow: ['tensorflow'],
  PyTorch: ['pytorch'],
  NLP: ['nlp', 'natural language processing'],
  'Computer Vision': ['computer vision', 'opencv'],
  'Generative AI': ['generative ai', 'genai', 'gen ai', 'llm', 'llms', 'large language model', 'large language models'],
  'Prompt Engineering': ['prompt engineering'],
  Git: ['git'],
  GitHub: ['github'],
  Docker: ['docker'],
  Kubernetes: ['kubernetes', 'k8s'],
  MySQL: ['mysql'],
  PostgreSQL: ['postgresql', 'postgres'],
  Flask: ['flask'],
  Django: ['django'],
  FastAPI: ['fastapi'],
  AWS: ['aws', 'amazon web services'],
  Azure: ['azure'],
  Linux: ['linux'],
  Communication: ['communication', 'communication skills'],
  'Problem Solving': ['problem solving', 'problem solver'],
  Leadership: ['leadership']
};

const SKILLS = Object.keys(SKILL_ALIASES);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// (?<![a-z0-9]) and (?![a-z0-9+#]) stop "c" matching inside "c++", "css", "react" etc.
const SKILL_PATTERNS = Object.fromEntries(
  SKILLS.map((skill) => [
    skill,
    new RegExp(`(?<![a-z0-9])(?:${SKILL_ALIASES[skill].map(esc).join('|')})(?![a-z0-9+#])`)
  ])
);

/** Return canonical skills found in already-cleaned text. */
function extractSkills(cleanText) {
  const t = String(cleanText || '');
  return SKILLS.filter((s) => SKILL_PATTERNS[s].test(t));
}

module.exports = { SKILLS, SKILL_ALIASES, extractSkills };
