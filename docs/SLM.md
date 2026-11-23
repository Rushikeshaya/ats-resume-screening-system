# Using a Small Language Model (SLM) instead of an LLM

CO4 feedback can now run on a small open model served by **Ollama**. Select it with `LLM_PROVIDER=slm`. The Anthropic LLM path is still there as an option, and the app falls back to rule-based feedback if the model is unreachable.

## Why an SLM (viva answer)

| | SLM (1-4 B parameters) | Hosted LLM |
|---|---|---|
| Privacy | Resume text stays on your own server | Text is sent to a third party |
| Cost | No per-request fee; you pay for the machine | Per-token fee and an API key |
| Latency | Fast on a GPU, slow on a small CPU | Fast, network dependent |
| Quality | Weaker reasoning, more hallucination, shorter context | Stronger |
| Control | Pick, pin and version the model | Provider can change the model |

Because small models make more mistakes, `services/llm.js` adds three safeguards: a shorter prompt, output structure enforced by a JSON Schema, and a code check that deletes gaps not in the missing-skill list and rewrites whose "before" text is not in the resume.

## Which model

Pull any of these with Ollama and set `SLM_MODEL`:

| Model tag | Approx. size (4-bit) | Notes |
|---|---|---|
| `qwen2.5:1.5b` | ~1 GB | Fastest; use on a small CPU-only server |
| `qwen2.5:3b` (default) | ~2 GB | Good balance for JSON output |
| `llama3.2:3b` | ~2 GB | Alternative |
| `phi3.5` | ~2.2 GB | Alternative |

Check the exact tags and sizes on ollama.com/library; they change. Test two models on your sample resumes and keep the one whose JSON and advice are better. Note the model name and why in your README.

## Run it locally (development)

1. Install Ollama from ollama.com.
2. `ollama pull qwen2.5:3b`
3. In `server/.env`: `LLM_PROVIDER=slm`, `SLM_URL=http://localhost:11434`, `SLM_MODEL=qwen2.5:3b`
4. Start the app, upload resumes, open a candidate, **AI feedback** tab. The badge at the top should say `LLM slm`, and the result line should say "small language model".

## Deploy it

The SLM needs RAM (about 2-4 GB for the models above), so it **cannot run inside a free Render web service (512 MB)**. Run it as a separate service and let the Node app call it through `SLM_URL`.

### Option A (recommended): one small VM with everything

Use an AWS EC2 instance (you will already have an AWS account for the lab) or any VPS with at least 4 GB RAM (8 GB is more comfortable for the 3B model).

1. Install Docker, copy the project to the VM.
2. Start the model server: `docker compose -f docker-compose.slm.yml up -d` (set `SLM_MODEL` first if not using the default).
3. Check it: `curl http://localhost:11434/api/tags` lists the model.
4. Run the Node app on the same VM (`npm run install:all && npm run build && npm start`, with `server/.env` pointing to `SLM_URL=http://localhost:11434`) behind a process manager such as `pm2`, and open the VM's web port in the firewall / security group.
5. Because Ollama listens only on `127.0.0.1`, it is not exposed to the internet.

### Option B: app on Render, SLM on a VM

1. Run the compose file on the VM as above, but put a reverse proxy with a bearer token in front of port 11434 (Ollama has no login of its own), for example Caddy:
   ```
   slm.yourdomain.com {
     @noauth not header Authorization "Bearer {env.SLM_API_KEY}"
     respond @noauth 401
     reverse_proxy localhost:11434
   }
   ```
   (This needs a domain name for automatic HTTPS. This snippet has not been tested in this project; test it before the exam.)
2. In Render set `LLM_PROVIDER=slm`, `SLM_URL=https://slm.yourdomain.com`, `SLM_API_KEY=<same token>`, `SLM_MODEL=qwen2.5:3b`.

### Option C: Hugging Face Spaces (Docker, free CPU)
Possible, but untested here: you must build a Docker Space that runs Ollama on port 7860 with the model baked in, and free Spaces sleep when idle. Choose A unless you have time to experiment.

## Speed expectations

On a small CPU-only machine a 3B model can take tens of seconds to over a minute per feedback (about 400 tokens of output); `qwen2.5:1.5b` is roughly twice as fast. The first request after idle also loads the model. `SLM_TIMEOUT_MS` (default 180000) controls how long the server waits before using the rule-based fallback. Measure the actual time on your VM and mention it as a limitation or improvement (GPU, quantisation, caching).

## Troubleshooting
- Badge says `LLM fallback`: `LLM_PROVIDER`/`SLM_URL` are not set in `server/.env`.
- Result says "SLM call failed ... timed out": model still loading or the machine is too slow; try `qwen2.5:1.5b` or raise `SLM_TIMEOUT_MS`.
- Result says "returned 404": the model is not pulled; run `ollama pull <SLM_MODEL>` (or `docker compose ... up` again).
- Many items removed with the "not grounded" flag: the model is too small for the task; try the 3B model.
- The structured-output `format` option needs a reasonably recent Ollama version; update Ollama if you see errors about `format`.
