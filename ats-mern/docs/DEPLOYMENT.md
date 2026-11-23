# Deployment guide (single service: Render)

The Express server also serves the built React app, so one web service is enough.

## 1. Storage
No database is needed. History is saved to `server/data/screenings.json`. On Render's free tier the disk is ephemeral, so saved history resets on each deploy or restart; attach a persistent disk and set `DATA_FILE` to a path on it (for example `/var/data/screenings.json`) if you need it to last.

## 2. GitHub
Push this folder to a **public** repository (faculty must be able to open it). Check that `server/.env` is not committed.

## 3. Render web service
- New > Web Service > connect the repository.
- **Build command:** `npm install --prefix client && npm run build --prefix client && npm install --prefix server`
- **Start command:** `npm start --prefix server`
- **Environment variables:** optionally `DATA_FILE`, `ANTHROPIC_API_KEY`, `LLM_MODEL`, `USE_AWS`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
- After deploy, open `https://<your-service>.onrender.com/api/health`; it should report `storage: json-file`.

Free instances sleep when idle; open the URL a minute before the demo.

## 4. Before the exam
- Upload the sample files from `samples/` through the deployed site and take the output screenshots.
- Keep a local copy running as a backup in case of network problems.
- Do not put API keys in the repository, the README or screenshots.
