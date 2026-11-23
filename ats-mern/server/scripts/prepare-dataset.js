#!/usr/bin/env node
/**
 * Prepare the Kaggle "Resume Dataset" (Snehaan Bhawal, resumes scraped from livecareer.com;
 * 2,484 resumes, 24 job categories) for the ATS app.
 *
 *   1. Download Resume.csv from https://www.kaggle.com/datasets/snehaanbhawal/resume-dataset
 *      (a Hugging Face mirror also exists, e.g. huggingface.co/datasets/pallavi176/resume_dataset).
 *   2. Run:  node server/scripts/prepare-dataset.js path/to/Resume.csv [--category INFORMATION-TECHNOLOGY] [--count 15]
 *   3. Upload the generated .txt files from samples/dataset/ in the app (max 20 per screening).
 *
 * Also prints dataset statistics and writes samples/dataset/DATASET_SUMMARY.md for your submission.
 * Columns used: ID, Resume_str (plain text), Category. Resume_html is ignored.
 */
const fs = require('fs');
const path = require('path');

/** Minimal RFC-4180 CSV parser (handles quoted fields with commas, quotes and newlines). */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * Kaggle's Resume_str is flattened: line breaks were replaced by runs of spaces, so heading-based section detection
 * and name extraction would find nothing. Runs of 2+ spaces are turned back into line breaks (text that already has
 * line breaks is left alone).
 */
function restoreLines(text) {
  return /[\r\n]/.test(text) ? text : text.replace(/[ \t\u00a0]{2,}/g, '\n');
}

function loadResumes(csvPath) {
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, ''));
  const header = rows.shift().map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  const iId = col('id'), iStr = [col('resume_str'), col('resume'), col('text')].find((i) => i >= 0) ?? -1, iCat = col('category');
  if (iStr < 0 || iCat < 0) throw new Error(`CSV must have Resume_str and Category columns; found: ${header.join(', ')}`);
  return rows
    .filter((r) => r[iStr] && r[iStr].trim())
    .map((r, n) => ({ id: iId >= 0 && r[iId] ? r[iId].trim() : String(n + 1), text: restoreLines(r[iStr].trim()), category: r[iCat].trim() }));
}

function stats(resumes) {
  const byCat = {};
  let words = 0;
  for (const r of resumes) {
    byCat[r.category] = (byCat[r.category] || 0) + 1;
    words += r.text.split(/\s+/).length;
  }
  return { total: resumes.length, categories: byCat, avgWords: Math.round(words / Math.max(1, resumes.length)) };
}

// small deterministic shuffle so the same sample is picked each run
function seededShuffle(arr, seed = 42) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function main() {
  const args = process.argv.slice(2);
  const csvPath = args.find((a) => !a.startsWith('--'));
  const opt = (name, def) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : def;
  };
  if (!csvPath) {
    console.error('Usage: node server/scripts/prepare-dataset.js <Resume.csv> [--category NAME] [--count N] [--out DIR]');
    process.exit(1);
  }
  const category = opt('category', 'INFORMATION-TECHNOLOGY');
  const count = Math.max(1, Math.min(20, Number(opt('count', 15))));
  const outDir = path.resolve(opt('out', path.join(__dirname, '../../samples/dataset')));

  const resumes = loadResumes(csvPath);
  const st = stats(resumes);
  console.log(`Loaded ${st.total} resumes, ${Object.keys(st.categories).length} categories, avg ${st.avgWords} words`);

  const pool = resumes.filter((r) => r.category.toLowerCase() === category.toLowerCase());
  if (pool.length === 0) {
    console.error(`No resumes in category "${category}". Available: ${Object.keys(st.categories).join(', ')}`);
    process.exit(1);
  }
  const picked = seededShuffle(pool).slice(0, count);

  fs.mkdirSync(outDir, { recursive: true });
  for (const r of picked) fs.writeFileSync(path.join(outDir, `${r.category.toLowerCase()}_${r.id}.txt`), r.text + '\n');

  const rowsMd = Object.entries(st.categories).sort((a, b) => b[1] - a[1]).map(([c, n]) => `| ${c} | ${n} |`).join('\n');
  fs.writeFileSync(
    path.join(outDir, 'DATASET_SUMMARY.md'),
    `# Dataset summary (generated)\n\n- Source: Kaggle "Resume Dataset" by Snehaan Bhawal (resumes scraped from livecareer.com)\n- Records: ${st.total}\n- Categories: ${Object.keys(st.categories).length}\n- Average length: ${st.avgWords} words\n- Sample used in the demo: ${picked.length} resumes from category ${category}\n\n| Category | Resumes |\n|---|---:|\n${rowsMd}\n`
  );
  console.log(`Wrote ${picked.length} resumes to ${outDir}`);
  console.log('Next: upload them in the app together with a job description (e.g. samples/job_description_it.txt).');
}

if (require.main === module) main();
module.exports = { parseCsv, loadResumes, stats, seededShuffle, restoreLines };
