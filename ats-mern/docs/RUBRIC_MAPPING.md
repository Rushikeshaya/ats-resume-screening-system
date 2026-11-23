# Rubric mapping and viva preparation

The lab rubric is 30 marks across four course outcomes. This table shows where each is implemented and what to demonstrate.

| CO | Marks | What the rubric asks | Where it is implemented | What to show live |
|---|---:|---|---|---|
| CO1 | 7 | Text extraction, preprocessing, cleaning, vectorization | `services/pipeline.js` (extraction), `nlp/preprocess.js`, `nlp/tfidf.js` | Upload a PDF, open the **Text** tab, then **Score** tab (shared TF-IDF terms) |
| CO2 | 8 | Sentiment analysis and information extraction, with evaluation | `nlp/sentiment.js`, `nlp/extract.js`, `nlp/evaluate.js` | **Extraction** and **Sentiment** tabs; **Model evaluation** page (accuracy, F1, confusion matrix) |
| CO3 | 7 | Topic modelling or multilingual NLP with cloud AI services | `nlp/lda.js`, `nlp/multilingual.js` (AWS Comprehend + Translate) | **Topics** tab; upload `samples/resume_marathi.txt` with `USE_AWS=true` |
| CO4 | 8 | GenAI/LLM, prompt engineering, integration, working demo | `services/llm.js`, route `POST .../feedback`, **AI feedback** tab | Generate feedback, then open `llm.js` and walk through the prompt |

**Real-dataset evidence.** After running `node server/scripts/evaluate-dataset.js Resume.csv`, quote `docs/DATASET_RESULTS.md`: CO1 vocabulary reduction and TF-IDF sparsity; CO2 category accuracy/macro-F1 vs the majority baseline, ranking precision@10 / ROC-AUC (TF-IDF only vs full ATS score) and sentiment on a real labelled set; CO3 topic purity against category. Be ready to say that category is a proxy label and extraction has no ground truth.

Deliverables checklist (from the exam sheet): title, GitHub link, README in repo root (done), deployed link, one-page poster, output screenshots, dataset details, AWS certificate PDF. See `docs/SUBMISSION.md`.

## Viva questions you should be able to answer

Answer these in your own words; the examiner will test individual understanding, not the demo.

**CO1**
- Why lower-case and remove punctuation, but keep `+`, `#` and `.`? (C++, C#, Node.js would be destroyed otherwise.)
- Write the TF-IDF formula used. Why sublinear tf (`1 + ln tf`) and smooth idf (`ln((1+N)/(1+df)) + 1`)? Why L2 normalise? (cosine becomes a dot product)
- Why unigrams and bigrams? (captures phrases like "machine learning")
- Why is the similarity score low even for a good resume? (long resume vs short JD, sparse overlap; hence the other score components)
- Why was stemming not used? (it would damage terms like pandas/numpy; trade-off: fewer merged word forms)

**CO2**
- How does the sentiment classifier work? Explain negation, intensifiers and the compound formula `s / sqrt(s² + 15)`.
- Define precision, recall, F1 and read the confusion matrix. Why is a 100% result on 30 sentences written by the developer not strong evidence? (small, same author, lexicon built with those words in mind; a held-out labelled dataset is needed)
- Why is information extraction rule-based here? What would an ML approach (NER with spaCy or AWS Comprehend) add and cost?
- Why is sentiment not part of the ATS score? (tone is not competence; fairness)

**CO3**
- Explain LDA: topics as word distributions, documents as topic mixtures, Dirichlet priors alpha and beta.
- Explain the Gibbs sampling update `p(z=k) ∝ (n_dk + α)(n_kw + β)/(n_k + Vβ)`.
- Why split resumes into chunks before LDA? (a handful of whole documents is too little data)
- What do Comprehend and Translate do here, and what happens when AWS is off? Which parts break for a Marathi resume without translation? (section headings, skill words in Devanagari)

**CO4**
- List the prompt-engineering techniques used (role, grounding, delimiters, few-shot, JSON schema, low temperature, injection defence, fairness guard-rails).
- What is prompt injection in a resume-screening setting and how is it handled? Does the LLM influence the score? (no)
- Why validate and normalise the JSON in code? What happens with no API key or on a timeout? (rule-based fallback)

**General (from the HoD notice)**
- Justify the stack: React for the interactive UI, Express for the REST API and pipeline, a JSON file for simple dependency-free history of nested analysis documents (swappable for a database later), Node for one language across the stack.
- Challenges and fixes: for example the original dictionary matched `C` inside `C++` (fixed with a lookahead), and section detection by keyword matched words anywhere in the text (now requires a heading line).
- Limitations and improvements: OCR for scanned PDFs, embeddings (sentence transformers) instead of TF-IDF, a larger labelled sentiment set, skill ontology, authentication and consent for personal data.
- State **your own contribution** clearly. If this is a group project, be ready to explain the modules you wrote or modified, not only the whole system.
