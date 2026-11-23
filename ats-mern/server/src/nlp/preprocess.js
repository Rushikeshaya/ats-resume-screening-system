const { STOP, RESUME_NOISE } = require('./stopwords');

/**
 * CO1 - text cleaning.
 * lower-case -> remove e-mails -> remove URLs -> strip punctuation (keep + # . for C++, C#, Node.js)
 * -> collapse whitespace.
 */
function cleanText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\S+@\S+/g, ' ')
    .replace(/https?:\/\/\S+|www\.\S+/g, ' ')
    .replace(/[^a-z0-9+#.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split cleaned text into tokens; trailing/leading dots (sentence ends) are removed. */
function tokenize(clean) {
  return String(clean || '')
    .split(' ')
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => t.length > 1);
}

function removeStopwords(tokens) {
  return tokens.filter((t) => !STOP.has(t));
}

/**
 * Tokens used by the topic model: alphabetic, length > 2, no stop-words, no resume boiler-plate.
 * Stemming is deliberately NOT applied so that technical terms (pandas, numpy, express) stay intact.
 */
function topicTokens(clean) {
  return tokenize(clean).filter(
    (t) => /^[a-z][a-z+#.]*$/.test(t) && t.length > 2 && !STOP.has(t) && !RESUME_NOISE.has(t)
  );
}

module.exports = { cleanText, tokenize, removeStopwords, topicTokens };
