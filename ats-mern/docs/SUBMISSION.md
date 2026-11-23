# Project submission details

| Field | Value |
|---|---|
| Project title | ATS Resume Screening System (MERN + NLP) |
| Student name | Rushikesh Ganpatrao Hande |
| PRN | 202401110056 |
| Branch | AIML (A3) |
| Assigned problem statement | ATS Resume Screening System — **confirm this matches your assigned statement exactly** (changing it is not permitted) |
| GitHub repository link | _to be filled_ |
| Deployed project link | _to be filled_ |
| Project poster | _to be filled_ (one page: problem, objectives, methodology, architecture, results) |
| AWS certificate | _to be filled_ (PDF in the shared folder) |
| Shared folder link | _to be filled_ |

## Dataset details (deliverable 7)

**Dataset used:** *Resume Dataset* by Snehaan Bhawal (Kaggle, 2021) - https://www.kaggle.com/datasets/snehaanbhawal/resume-dataset
(a Hugging Face mirror also exists, e.g. `pallavi176/resume_dataset`).

- **Source / collection:** resume examples scraped from livecareer.com by the dataset author.
- **Size:** 2,484 resumes in 24 job categories (for example INFORMATION-TECHNOLOGY, HR, TEACHER, FINANCE, CHEF, ENGINEERING).
- **Format and fields:** `Resume.csv` with `ID`, `Resume_str` (plain text), `Resume_html` (original HTML), `Category` (job category).
- **Licence:** check the licence shown on the Kaggle dataset page and write it here before submitting. Do not assume one.
- **How it is used here:** `server/scripts/prepare-dataset.js` reads `Resume.csv`, prints dataset statistics, and writes up to 20 resumes of one category as `.txt` files into `samples/dataset/`, which are uploaded through the app with the job description `samples/job_description_it.txt`. The `samples/dataset/` folder is git-ignored; the dataset itself is not stored in the repository.
- **Preprocessing:** only `Resume_str` is used (HTML ignored); empty rows removed; flattened text restored to lines (runs of 2+ spaces become line breaks) so headings can be detected; then the app pipeline: language detection / optional translation, lower-casing, e-mail and URL removal, punctuation stripping (keeping `+`, `#`, `.`), tokenization, stop-word removal, unigram + bigram TF-IDF.
- **Evaluation on the dataset:** `server/scripts/evaluate-dataset.js` writes `docs/DATASET_RESULTS.md` (stratified sample, classification accuracy / macro-F1, ranking precision@10 and ROC-AUC, extraction fill rates, LDA topic purity). Paste its numbers into the poster.
- **Other data in the repository:** `samples/` holds 3 small synthetic resumes (one in Marathi, to demonstrate the multilingual step) and `server/src/nlp/data/sentiment_eval.json` holds 30 hand-labelled sentences used to evaluate the sentiment classifier.

## Output screenshots checklist
- Upload form with job description and files
- Ranking table with score bars
- Score tab (component breakdown) and Extraction tab
- Sentiment tab and Model evaluation page
- Topics tab
- Marathi resume result (language note or translation)
- AI feedback tab
- `/api/health` on the deployed link
