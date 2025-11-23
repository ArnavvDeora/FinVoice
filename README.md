# FinVoice — README

A local full-stack project (backend Flask + Google STT + ElevenLabs TTS; frontend React + Vite + Supabase). This README explains how to set up, run, and deploy the project on your machine. It reflects your current development workflow (two terminal windows).

---

## Table of contents

* Quick start
* Prerequisites
* Environment variables / secrets
* Project structure & important files
* Running (development)
* Building (frontend)
* Git & .gitignore notes
* Troubleshooting
* Production / deployment notes

---

## Quick start (exact commands you use)

Open **two terminals**.

### Terminal 1 — Backend

```powershell
cd D:\ai-voicebot-2\ai-voice-banking\backend
.\venv\Scripts\activate
pip install -r requirements.txt
python tts_server.py
```

### Terminal 2 — Frontend

```powershell
cd D:\ai-voicebot-2\ai-voice-banking\frontend
.\venv\Scripts\activate      # (optional if you have a frontend venv)
npm install                   # only first time
npm run dev
```

> Your backend exposes a WebSocket at `ws://localhost:5000/stream` (this is used by the frontend).

---

## Prerequisites

* Python 3.10+ (same major version you develop with; Google client warns when using older unsupported versions)
* Node.js (v16+ recommended) and npm
* A Git client (for repo management)
* Google Cloud service account key for Speech-to-Text (JSON file)
* ElevenLabs API key + voice id
* (Optional) Supabase account & keys if you want the database features working
* (Optional) OpenAI API key for the assistant logic

---

## Environment variables / secrets

Create `.env` files (not committed to Git). Example entries required by code:

### backend/.env

```
ELEVEN_API_KEY=your_elevenlabs_api_key
ELEVEN_VOICE_ID=your_voice_id
# The Google key is supplied as a JSON file; the code uses GOOGLE_APPLICATION_CREDENTIALS to point to it
# Put the JSON file in backend/ and set the variable below (or set it in your system envs)
GOOGLE_APPLICATION_CREDENTIALS=stt_key.json
```

> The backend code currently sets `GOOGLE_KEY = "stt_key.json"` and then assigns `os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = GOOGLE_KEY`. You can either set the system env as above or place `stt_key.json` inside `backend/`.

### frontend (Vite) — `.env` or `.env.local`

```
VITE_OPENAI_KEY=your_openai_key
VITE_SUPABASE_URL=https://your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

> The frontend also falls back to `import.meta.env.VITE_OPENAI_KEY` in `src/App.jsx`.

---

## Project structure (important files)

```
ai-voice-banking/
├─ backend/
│  ├─ tts_server.py        # main Flask + websockets + Google STT + ElevenLabs TTS
│  ├─ requirements.txt
│  └─ stt_key.json         # your Google service key (keep private)
├─ frontend/
│  ├─ src/App.jsx          # main React app and websocket client
│  ├─ package.json
│  └─ node_modules/
└─ .gitignore
```

**Local file references (for quick inspection):**

* Backend Websocket server: `file:///D:/ai-voicebot-2/ai-voice-banking/backend/tts_server.py`
* Frontend main app: `file:///D:/ai-voicebot-2/ai-voice-banking/frontend/src/App.jsx`

---

## How it works (workflow summary)

1. Frontend opens a WebSocket to `ws://localhost:5000/stream`.
2. When the user speaks, the frontend captures microphone audio at 16 kHz, encodes it to base64, and sends chunks as `{ type: 'audio_input', data: <base64> }`.
3. Backend receives chunks and feeds them into a Google STT streaming recognizer (runs in a separate thread). Final transcriptions are sent back to the client as `{ type: 'transcription', text: <transcript> }`.
4. The frontend passes the transcribed text to an assistant (OpenAI) via REST (inside `getAIResponse`). The assistant returns structured intent JSON.
5. If the assistant wants to speak back, the frontend sends `{ type: 'tts_request', text: '...' }` to the websocket; backend uses ElevenLabs to stream audio chunks back as base64 `{ type:'audio_chunk', data: <base64> }` and `{ type:'audio_end' }` when done.
6. Frontend collects base64 chunks and plays them as a single WAV blob.

---

## Development notes & tips

* **Line endings warning**: If Git prints `LF will be replaced by CRLF`, it's harmless on Windows. Make sure `venv/` is in `.gitignore` so you don't accidentally commit your virtual environment.

* **Remove already-tracked venv** (if accidentally added):

```powershell
git rm -r --cached backend/venv
git rm -r --cached frontend/venv
git add .gitignore
git commit -m "Remove venv from repo"
git push
```

* **CORS**: `CORS(app)` is enabled in the Flask backend. If you serve the frontend from a different host in the future, update CORS settings accordingly.

* **Google STT**: Keep the `stt_key.json` secret. The code currently sets `os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "stt_key.json"` — ensure the file is present in `backend/` or change the code to read from a secure path.

* **Audio sample rate**: The frontend uses an `AudioContext` configured for `16000` Hz and the backend expects `sample_rate_hertz=16000`. Keep these consistent.

* **Supabase**: The frontend expects tables like `bank_accounts`, `bank_transactions`, and `bank_recipients`. If you don’t have Supabase set up, the app will show onboarding and limited features.

---

## Troubleshooting

* **WebSocket failed to connect**: Ensure backend is running and listening on port 5000, and that the firewall allows local connections. The `serverStatus` indicator in the UI helps debug if WS is connected or not.

* **No transcription appears**: Check that Google STT service account has `Speech-to-Text` enabled and that `stt_key.json` is correct. Monitor backend logs for thread exceptions.

* **TTS audio not playing**: Confirm frontend receives `audio_chunk` messages and that `audioChunksRef` accumulates data. If ElevenLabs responds with a streaming error, check `ELEVEN_API_KEY` and `ELEVEN_VOICE_ID`.

* **OpenAI errors**: The frontend uses `VITE_OPENAI_KEY`. If the assistant returns non-JSON text, `getAIResponse` tries to extract the first JSON object. Keep prompts conservative and test with simple messages first.

---
