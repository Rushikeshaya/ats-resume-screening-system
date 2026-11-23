/**
 * CO3 - Multilingual NLP with cloud AI services.
 *   1. Script detection (offline, Unicode ranges) - always available.
 *   2. Amazon Comprehend  -> dominant-language detection   (when USE_AWS=true)
 *   3. Amazon Translate   -> translate non-English resumes to English before scoring (when USE_AWS=true)
 * If AWS is disabled or a call fails, the app keeps working and records why in `note`.
 */

const SCRIPTS = [
  { name: 'Devanagari', code: 'hi', re: /[ऀ-ॿ]/g },
  { name: 'Tamil', code: 'ta', re: /[஀-௿]/g },
  { name: 'Bengali', code: 'bn', re: /[ঀ-৿]/g },
  { name: 'Arabic', code: 'ar', re: /[؀-ۿ]/g },
  { name: 'CJK', code: 'zh', re: /[一-鿿]/g },
  { name: 'Latin', code: 'en', re: /[A-Za-z]/g }
];

function detectScript(text) {
  const sample = String(text || '').slice(0, 8000);
  const counts = SCRIPTS.map((s) => ({ ...s, n: (sample.match(s.re) || []).length }));
  const total = counts.reduce((a, c) => a + c.n, 0) || 1;
  const top = counts.sort((a, b) => b.n - a.n)[0];
  return { script: top.name, guessedLanguage: top.n ? top.code : 'unknown', share: Math.round((top.n / total) * 100) / 100 };
}

const awsOn = () => String(process.env.USE_AWS || '').toLowerCase() === 'true';

async function comprehendLanguage(text) {
  const { ComprehendClient, DetectDominantLanguageCommand } = require('@aws-sdk/client-comprehend');
  const client = new ComprehendClient({ region: process.env.AWS_REGION || 'ap-south-1' });
  const out = await client.send(new DetectDominantLanguageCommand({ Text: text.slice(0, 4500) }));
  const best = (out.Languages || []).sort((a, b) => b.Score - a.Score)[0];
  return best ? { code: best.LanguageCode, score: best.Score } : null;
}

function chunkByLines(text, max = 3000) {
  const chunks = [];
  let cur = '';
  for (const line of text.split('\n')) {
    if ((cur + '\n' + line).length > max && cur) {
      chunks.push(cur);
      cur = line.slice(0, max);
    } else {
      cur = cur ? cur + '\n' + line : line.slice(0, max);
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

async function translateToEnglish(text, sourceLang) {
  const { TranslateClient, TranslateTextCommand } = require('@aws-sdk/client-translate');
  const client = new TranslateClient({ region: process.env.AWS_REGION || 'ap-south-1' });
  const parts = [];
  for (const chunk of chunkByLines(text.slice(0, 30000))) {
    const out = await client.send(
      new TranslateTextCommand({ Text: chunk, SourceLanguageCode: sourceLang, TargetLanguageCode: 'en' })
    );
    parts.push(out.TranslatedText);
  }
  return parts.join('\n');
}

/**
 * Returns { text, language, script, translated, provider, note }.
 * `text` is what the rest of the pipeline analyses (English if translation succeeded).
 */
async function normalizeToEnglish(text) {
  const s = detectScript(text);
  const info = { text, language: s.guessedLanguage, script: s.script, translated: false, provider: 'script-heuristic', note: null };

  if (awsOn()) {
    try {
      const lang = await comprehendLanguage(text);
      if (lang && lang.score >= 0.8) {
        info.language = lang.code;
        info.provider = 'aws-comprehend';
      }
      if (info.language !== 'en' && info.language !== 'unknown') {
        info.text = await translateToEnglish(text, info.language);
        info.translated = true;
        info.provider = 'aws-comprehend+translate';
      }
    } catch (err) {
      info.note = `AWS call failed (${err.name || 'error'}); analysed original text.`;
    }
  } else if (s.script !== 'Latin') {
    info.note = 'Non-English script detected. Enable AWS Comprehend + Translate (USE_AWS=true) to translate before scoring.';
  }
  return info;
}

module.exports = { normalizeToEnglish, detectScript };
