const { cleanText, tokenize, topicTokens } = require('../nlp/preprocess');
const { extractInfo } = require('../nlp/extract');
const { analyzeSentiment } = require('../nlp/sentiment');
const { scoreAll } = require('../nlp/scoring');
const { topicModelCorpus, cosineArr } = require('../nlp/lda');
const { normalizeToEnglish } = require('../nlp/multilingual');

/** CO1 - text extraction from an uploaded file buffer (PDF with selectable text, or plain text). */
async function extractText(file) {
  const isPdf = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname);
  if (isPdf) {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(file.buffer);
    return (data.text || '').trim();
  }
  return file.buffer.toString('utf8').trim();
}

/**
 * Full NLP pipeline.
 *   extract -> (detect language / translate) -> clean -> tokenize -> TF-IDF + skills + score
 *   -> information extraction -> sentiment -> topic model
 */
async function runPipeline({ jobDescription, files, topicCount = 4 }) {
  const failed = [];
  const items = [];

  for (const file of files) {
    try {
      const rawOriginal = await extractText(file);
      if (!rawOriginal) {
        failed.push({ file: file.originalname, reason: 'No selectable text found (scanned PDF? OCR is not included).' });
        continue;
      }
      const lang = await normalizeToEnglish(rawOriginal);
      const clean = cleanText(lang.text);
      items.push({
        name: file.originalname,
        raw: lang.text,
        clean,
        tokens: tokenize(clean),
        language: { code: lang.language, script: lang.script, translated: lang.translated, provider: lang.provider, note: lang.note }
      });
    } catch (err) {
      failed.push({ file: file.originalname, reason: `Could not read file (${err.message}).` });
    }
  }
  if (items.length === 0) return { candidates: [], failed, requiredSkills: [], coverage: [], topicModel: null };

  const jdClean = cleanText(jobDescription);
  const jd = { clean: jdClean, tokens: tokenize(jdClean) };
  const { requiredSkills, scored, coverage, vocabSize } = scoreAll(jd, items);

  // CO3 topic model over JD + all resumes
  const K = Math.max(2, Math.min(8, Number(topicCount) || 4));
  const tm = topicModelCorpus(
    [{ key: 'jd', tokens: topicTokens(jdClean) }, ...items.map((i) => ({ key: i.name, tokens: topicTokens(i.clean) }))],
    { K }
  );

  const candidates = items.map((item, i) => {
    const s = scored[i];
    const topicMix = tm.ok ? tm.mixes[i + 1] : null;
    return {
      fileName: item.name,
      ...s,
      info: extractInfo(item.raw),
      sentiment: analyzeSentiment(item.raw),
      language: item.language,
      topicMix,
      topicSimilarity: tm.ok ? Math.round(cosineArr(tm.mixes[0], topicMix) * 1000) / 1000 : null,
      chars: item.raw.length,
      textPreview: item.raw.slice(0, 6000),
      aiFeedback: null
    };
  });

  candidates.sort((a, b) => b.atsScore - a.atsScore);
  candidates.forEach((c, idx) => (c.rank = idx + 1));

  return {
    candidates,
    failed,
    requiredSkills,
    coverage,
    vocabSize,
    topicModel: tm.ok
      ? { K: tm.K, topics: tm.topics, jdMix: tm.mixes[0], chunks: tm.chunks }
      : { K, topics: [], jdMix: null, chunks: 0, note: tm.reason }
  };
}

module.exports = { runPipeline, extractText };
