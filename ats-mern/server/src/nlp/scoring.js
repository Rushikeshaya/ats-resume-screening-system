const { TfidfVectorizer, cosine, sharedTerms } = require('./tfidf');
const { extractSkills } = require('./skills');
const { detectSections } = require('./extract');

/**
 * Explainable ATS score out of 100 (same weights as the original Colab notebook):
 *   TF-IDF similarity to the job description ........ 50
 *   required-skill coverage ......................... 35
 *   evidence (projects 4 + experience 3 + education 3) 10
 *   resume structure (share of 4 key sections) ...... 5
 */
const WEIGHTS = { similarity: 50, skills: 35, evidence: 10, structure: 5 };

function matchLabel(score) {
  if (score >= 80) return 'High Match';
  if (score >= 60) return 'Good Match';
  if (score >= 40) return 'Moderate Match';
  return 'Low Match';
}

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * jd = { clean, tokens }, candidates = [{ clean, tokens, raw }]
 * returns { requiredSkills, scored: [...], coverage: [...] } (scored is in the same order as candidates)
 */
function scoreAll(jd, candidates) {
  const requiredSkills = extractSkills(jd.clean);
  const vectorizer = new TfidfVectorizer({ ngramRange: [1, 2], maxFeatures: 20000, sublinear: true });
  vectorizer.fit([jd.tokens, ...candidates.map((c) => c.tokens)]);
  const jdVec = vectorizer.transform(jd.tokens);

  const skillSets = candidates.map((c) => extractSkills(c.clean));

  const scored = candidates.map((c, i) => {
    const vec = vectorizer.transform(c.tokens);
    const similarity = cosine(jdVec, vec);
    const resumeSkills = skillSets[i];
    const matched = requiredSkills.filter((s) => resumeSkills.includes(s));
    const missing = requiredSkills.filter((s) => !matched.includes(s));
    const coverage = requiredSkills.length ? matched.length / requiredSkills.length : 0;

    const sections = detectSections(c.raw);
    const evidencePoints = (sections.Projects ? 4 : 0) + (sections.Experience ? 3 : 0) + (sections.Education ? 3 : 0);
    const structurePoints = (Object.values(sections).filter(Boolean).length / Object.keys(sections).length) * WEIGHTS.structure;

    const components = {
      similarity: round(similarity * WEIGHTS.similarity),
      skills: round(coverage * WEIGHTS.skills),
      evidence: round(evidencePoints),
      structure: round(structurePoints)
    };
    const total = Math.max(0, Math.min(100, components.similarity + components.skills + components.evidence + components.structure));

    return {
      atsScore: round(total),
      matchLevel: matchLabel(total),
      similarity: round(similarity, 4),
      components,
      matchedSkills: matched,
      missingSkills: missing,
      resumeSkills,
      sharedTerms: sharedTerms(jdVec, vec, 8),
      sections
    };
  });

  const coverage = requiredSkills
    .map((skill) => ({ skill, count: skillSets.filter((s) => s.includes(skill)).length }))
    .sort((a, b) => b.count - a.count);

  return { requiredSkills, scored, coverage, vocabSize: vectorizer.vocab.size };
}

module.exports = { scoreAll, matchLabel, WEIGHTS };
