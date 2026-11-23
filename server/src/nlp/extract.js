/**
 * CO2 - Information extraction (rule-based: regular expressions + section parsing).
 * Works on the RAW text (case and layout matter here), not on the cleaned text.
 */

const SECTION_HEADINGS = {
  Summary: /\b(summary|objective|profile|about me)\b/,
  Education: /\b(education|qualifications?|academic)\b/,
  Experience: /\b(work experience|experience|internships?|employment)\b/,
  Projects: /\bprojects?\b/,
  Skills: /\b(technical skills|skills|technologies)\b/,
  Certifications: /\b(certifications?|courses|licen[cs]es)\b/,
  Achievements: /\b(achievements?|awards?|honou?rs|accomplishments)\b/
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** A heading is a short line (<= 4 words) that contains a section keyword. */
function headingOf(line) {
  const words = line.replace(/[^A-Za-z ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 4) return null;
  const low = words.join(' ').toLowerCase();
  for (const [name, re] of Object.entries(SECTION_HEADINGS)) if (re.test(low)) return name;
  return null;
}

/** Split the resume into {sectionName: text}. Text before the first heading goes to "Header". */
function splitSections(raw) {
  const sections = { Header: [] };
  let current = 'Header';
  for (const line of String(raw || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const h = headingOf(trimmed);
    if (h) {
      current = h;
      sections[current] = sections[current] || [];
    } else {
      sections[current].push(trimmed);
    }
  }
  return Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.join('\n')]));
}

function detectSections(raw) {
  const s = splitSections(raw);
  const has = (k) => Boolean(s[k] !== undefined && (s[k].length > 0 || headingExists(raw, k)));
  return {
    Projects: has('Projects'),
    Experience: has('Experience'),
    Education: has('Education'),
    Skills: has('Skills')
  };
}

function headingExists(raw, name) {
  return String(raw || '')
    .split(/\r?\n/)
    .some((l) => headingOf(l.trim()) === name);
}

function extractName(raw) {
  const lines = String(raw || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 6);
  for (const line of lines) {
    if (/[@\d]/.test(line) || headingOf(line)) continue;
    if (/resume|curriculum|vitae/i.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-Za-z][A-Za-z.'-]*$/.test(w))) return line;
  }
  return null;
}

function extractContacts(raw) {
  const text = String(raw || '');
  const email = (text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [null])[0];
  const phone =
    (text.match(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/) || text.match(/\+\d{1,3}[\s-]?\d{6,12}/) || [null])[0];
  const linkedin = (text.match(/linkedin\.com\/in\/[\w-]+/i) || [null])[0];
  const github = (text.match(/github\.com\/[\w-]+/i) || [null])[0];
  return { email, phone: phone ? phone.trim() : null, linkedin, github };
}

function extractEducation(raw) {
  const sections = splitSections(raw);
  const text = sections.Education || String(raw || '');
  const degreeRe =
    /\b(b\.?\s?tech|b\.?\s?e\.?|bachelor(?:'s)? of [a-z ]{3,40}|m\.?\s?tech|master(?:'s)? of [a-z ]{3,40}|mca|bca|b\.?\s?sc|m\.?\s?sc|mba|ph\.?\s?d|diploma)\b/gi;
  const degrees = [...new Set((text.match(degreeRe) || []).map((d) => d.trim()))].slice(0, 4);
  const cg = text.match(/(?:cgpa|gpa)\s*[:\-]?\s*(\d(?:\.\d{1,2})?)/i);
  const pct = text.match(/(\d{2}(?:\.\d{1,2})?)\s*%/);
  return { degrees, cgpa: cg ? Number(cg[1]) : null, percentage: pct ? Number(pct[1]) : null };
}

/** Sum month ranges such as "Jun 2023 - Aug 2023" or "Jan 2024 - Present" inside the Experience section. */
function experienceYears(raw, now = new Date()) {
  const sections = splitSections(raw);
  const text = sections.Experience || '';
  const m = MONTHS.join('|');
  const re = new RegExp(
    `\\b(${m})[a-z]*\\.?\\s*,?\\s*(\\d{4})\\s*(?:-|–|—|to)\\s*(?:(${m})[a-z]*\\.?\\s*,?\\s*(\\d{4})|(present|current|ongoing|till date))`,
    'gi'
  );
  let months = 0;
  let match;
  while ((match = re.exec(text))) {
    const start = Number(match[2]) * 12 + MONTHS.indexOf(match[1].toLowerCase().slice(0, 3));
    const end = match[5]
      ? now.getFullYear() * 12 + now.getMonth()
      : Number(match[4]) * 12 + MONTHS.indexOf(match[3].toLowerCase().slice(0, 3));
    const span = end - start + 1;
    if (span > 0 && span <= 120) months += span;
  }
  const stated = String(raw || '').match(/(\d+(?:\.\d+)?)\+?\s*years?\s+(?:of\s+)?experience/i);
  const fromRanges = Math.round((months / 12) * 10) / 10;
  return { fromDateRanges: fromRanges, stated: stated ? Number(stated[1]) : null };
}

function firstLines(text, n) {
  return String(text || '').split('\n').filter(Boolean).slice(0, n);
}

function extractInfo(raw) {
  const sections = splitSections(raw);
  return {
    name: extractName(raw),
    ...extractContacts(raw),
    education: extractEducation(raw),
    experience: experienceYears(raw),
    certifications: firstLines(sections.Certifications, 6),
    projectLines: firstLines(sections.Projects, 6),
    sectionsFound: detectSections(raw)
  };
}

module.exports = { extractInfo, detectSections, splitSections, extractName, extractContacts, extractEducation, experienceYears };
