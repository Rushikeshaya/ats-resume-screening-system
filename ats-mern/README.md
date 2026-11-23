# ATS Resume Screening System (MERN + NLP)

An Applicant Tracking System (ATS) style web application. A recruiter pastes a job description and uploads resumes (PDF/TXT); the app extracts and cleans the text, vectorizes it with TF-IDF, scores and ranks every candidate out of 100, extracts structured information, analyses the tone, discovers topics with LDA, handles non-English resumes with AWS AI services, and produces LLM-written feedback.

Built for the **NLP Lab (Course 2311217L)** mini project. Stack: **Express, React, Node.js** with screening history saved in a **JSON file** (no database to install).

## Objectives

1. Convert unstructured resume files into clean, vectorized text (CO1).
2. Score resumes against a job description with an explainable model, extract information and analyse sentiment, and evaluate the classifier (CO2).
3. Discover topics in the corpus and support multilingual resumes with cloud AI services (CO3).
4. Use a Generative AI / LLM with prompt engineering to give actionable feedback and interview questions (CO4).

## Architecture

```
React (Vite)  ──/api──►  Express server  ──►  JSON file (server/data/screenings.json)
 - upload form             routes/            
 - ranking + charts        services/pipeline.js ──► nlp/ (CO1-CO3, written from scratch)
 - candidate tabs                              ├─ preprocess.js   cleaning, tokenizing
 - evaluation page                             ├─ tfidf.js        TF-IDF + cosine
                                               ├─ skills.js       skill dictionary
                                               ├─ extract.js      information extraction
                                               ├─ sentiment.js    lexicon + rules sentiment
                                               ├─ lda.js          topic model (Gibbs sampling)
                                               ├─ multilingual.js script detection + AWS Comprehend/Translate
                                               └─ scoring.js      explainable 100-point score
                              services/llm.js ──► Small Language Model on Ollama (CO4), optional hosted LLM,
                                                  rule-based fallback; answers are grounded in code
```

## NLP pipeline

| Step | What happens | File |
|---|---|---|
| 1. Text extraction | `pdf-parse` reads selectable text from PDFs (TXT also accepted) | `services/pipeline.js` |
| 2. Language handling | Unicode-script detection; with `USE_AWS=true`, Amazon Comprehend detects the language and Amazon Translate converts to English | `nlp/multilingual.js` |
| 3. Cleaning | lower-case, remove e-mails and URLs, strip punctuation (keeping `c++`, `c#`, `node.js`) | `nlp/preprocess.js` |
| 4. Vectorization | TF-IDF with unigrams + bigrams, sublinear tf, smooth idf, L2 normalisation | `nlp/tfidf.js` |
| 5. Matching | cosine similarity between job description and resume vectors | `nlp/tfidf.js` |
| 6. Skills | dictionary of 40+ skills with aliases (word-boundary regexes) | `nlp/skills.js` |
| 7. Information extraction | name, e-mail, phone, links, degrees, CGPA, experience, sections | `nlp/extract.js` |
| 8. Sentiment | lexicon with negation and intensifiers, compound score, action-verb density | `nlp/sentiment.js` |
| 9. Topic modelling | LDA by collapsed Gibbs sampling on chunks of the JD and all resumes | `nlp/lda.js` |
| 10. LLM feedback | structured JSON feedback via prompt-engineered call | `services/llm.js` |

## Scoring (out of 100)

| Component | Points |
|---|---:|
| TF-IDF similarity to the job description | 50 |
| Required-skill coverage | 35 |
| Evidence: projects 4 + experience 3 + education 3 | 10 |
| Structure: share of Projects / Experience / Education / Skills headings present | 5 |

Labels: 80+ High, 60-79.99 Good, 40-59.99 Moderate, below 40 Low. Sentiment, topics and LLM output are **not** part of the score.

## Run locally (Windows / macOS / Linux)

Requirements: Node.js 18+. No database is needed; history is stored in `server/data/screenings.json`, created automatically.

```bash
npm run install:all                 # installs server and client dependencies
cp server/.env.example server/.env  # Windows: copy server\.env.example server\.env
# edit server/.env (optional: LLM settings, AWS settings, DATA_FILE)

npm run dev:server                  # terminal 1 -> http://localhost:5000
npm run dev:client                  # terminal 2 -> http://localhost:5173
```

Try it with the files in `samples/` (one job description and three resumes, one in Marathi).

### Real dataset (Kaggle Resume Dataset)

The project is demonstrated on the Kaggle *Resume Dataset* (2,484 livecareer.com resumes, 24 categories): https://www.kaggle.com/datasets/snehaanbhawal/resume-dataset

```bash
# download Resume.csv from Kaggle, then:
node server/scripts/prepare-dataset.js path/to/Resume.csv --category INFORMATION-TECHNOLOGY --count 15
# upload samples/dataset/*.txt with samples/job_description_it.txt in the app
```

The script prints dataset statistics and writes `samples/dataset/DATASET_SUMMARY.md`. It also restores line breaks: Kaggle's `Resume_str` is flattened (runs of spaces instead of newlines), and without this step section and name detection find nothing. The dataset is not committed to this repository.

**Dataset-scale evaluation (rubric evidence).** Run the pipeline over a stratified sample of the whole corpus and generate `docs/DATASET_RESULTS.md`:

```bash
node server/scripts/evaluate-dataset.js path/to/Resume.csv --per-category 40 --topics 6
# optional: evaluate the sentiment module on a real labelled set (CSV with text + label columns)
node server/scripts/evaluate-dataset.js path/to/Resume.csv --sentiment path/to/rotten_tomatoes.csv
```

It reports corpus/vectorization statistics (CO1), category-classification accuracy and macro-F1, ranking precision@10 and ROC-AUC of the ATS score for a job description, extraction fill rates and sentiment metrics on the labelled set (CO2), and LDA topics with purity against the true category (CO3). A real sentiment set can be exported from Hugging Face, e.g. `cornell-movie-review-data/rotten_tomatoes` (columns `text`, `label`).

Production: `npm run build` then `npm start`; Express serves the built React app from `client/dist`. See `docs/DEPLOYMENT.md`.

### Tests

```bash
npm test
```

Runs unit/integration tests for the NLP modules, the pipeline and the JSON history store (no database or network needed).

## Configuration

| Variable | Purpose |
|---|---|
| `DATA_FILE` | Optional path of the history JSON file (default `server/data/screenings.json`) |
| `MAX_SCREENINGS` | Optional cap on saved screenings (default 200, oldest dropped) |
| `LLM_PROVIDER` | `slm` (small model via Ollama, default in `.env.example`), `anthropic`, or `fallback` |
| `SLM_URL`, `SLM_MODEL`, `SLM_API_KEY`, `SLM_TIMEOUT_MS` | Small language model server (see `docs/SLM.md`) |
| `ANTHROPIC_API_KEY`, `LLM_MODEL` | Optional hosted LLM instead of the SLM |
| `USE_AWS`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Enables Comprehend + Translate |

Never commit `server/.env`; it is in `.gitignore`.

## REST API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | status of API, storage, LLM, AWS |
| POST | `/api/screenings` | multipart: `jobDescription`, `title`, `topicCount`, `resumes[]` |
| GET | `/api/screenings` | list saved screenings |
| GET / DELETE | `/api/screenings/:id` | open / delete one screening |
| GET | `/api/screenings/:id/export.csv` | ranking as CSV |
| POST | `/api/screenings/:id/candidates/:cid/feedback` | LLM feedback for one candidate |
| GET | `/api/nlp/sentiment-eval` | sentiment evaluation metrics |
| POST | `/api/nlp/sentiment` | sentiment of any text |

## History storage (JSON)

`server/src/store/screeningStore.js` keeps every screening (with its candidates and any LLM feedback) in one JSON file. It loads the file once into memory, serves reads from memory, and saves each change atomically (temp file + rename) through a write queue. A corrupt file is renamed to `*.corrupt-<time>` instead of being overwritten. The file is git-ignored because it contains resume text.

## Limitations

- JSON-file history suits a demo or single user; it is not for concurrent multi-server use. On hosts with an ephemeral disk (e.g. Render free tier) history is lost on redeploy unless a persistent disk is attached.

- Only selectable-text PDFs are read; scanned PDFs need OCR (not included).
- Skill detection uses a fixed dictionary and TF-IDF measures word overlap, not meaning, so synonyms are missed and TF-IDF similarity is naturally low for long resumes versus short job descriptions.
- Section detection relies on English headings; a non-English resume is only scored properly after translation (AWS).
- The built-in sentiment evaluation set is small and hand-labelled by the developer; run `evaluate-dataset.js --sentiment` on a real labelled set (movie reviews are a different domain from resumes) for stronger numbers.
- Dataset relevance uses the resume's category as a proxy label; it is not a human hiring judgement.
- The score is an educational aid and has not been validated as a hiring predictor. A human must review the original resumes.
- Resumes contain personal data; do not deploy publicly without consent, access control and a retention policy.
