import os
import json
import base64
import threading
import queue
from flask import Flask
from flask_sock import Sock
from flask_cors import CORS

from elevenlabs.client import ElevenLabs
from google.cloud import speech

# -----------------------------
# CONFIGURATION
# -----------------------------
GOOGLE_KEY = "stt_key.json"
# Update with your actual key
ELEVEN_API_KEY = 
ELEVEN_VOICE_ID = "pNInz6obpgDQGcFmaJgB" 

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = GOOGLE_KEY

app = Flask(__name__)
CORS(app)
sock = Sock(app)

# -----------------------------
# INITIALIZE CLIENTS
# -----------------------------
speech_client = speech.SpeechClient()
eleven = ElevenLabs(api_key=ELEVEN_API_KEY)

_END_OF_STREAM = object()

# -----------------------------
# STT Helper Functions
# -----------------------------
def request_generator(audio_queue):
    """Generates audio requests from the queue."""
    while True:
        chunk = audio_queue.get()
        if chunk is _END_OF_STREAM:
            break
        yield speech.StreamingRecognizeRequest(audio_content=chunk)

def google_thread(audio_queue, streaming_config_obj, ws):
    """Runs the blocking Google STT API call in a separate thread."""
    try:
        requests_stream = request_generator(audio_queue) 
        responses = speech_client.streaming_recognize(
            requests=requests_stream,
            config=streaming_config_obj 
        )

        for response in responses:
            for result in response.results:
                if result.is_final:
                    user_text = result.alternatives[0].transcript
                    print(f"User Final Text: {user_text}")
                    ws.send(json.dumps({
                        "type": "transcription",
                        "text": user_text
                    }))
    except Exception as e:
        if "Audio Timeout Error" in str(e):
            print("STT Thread Error: Audio Timeout (Likely user stopped speaking).")
        else:
            print(f"STT Thread Error: {e}")


# -----------------------------
# 1. STREAMING GOOGLE SPEECH-TO-TEXT (UPDATED FOR MULTILINGUAL)
# -----------------------------
def stream_google_stt(ws):
    """
    Creates a thread-safe queue for incoming audio and starts the Google STT
    streaming thread.
    """
    audio_queue = queue.Queue()

    # Google STT config
    config = speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
        language_code="en-IN",
        # UPDATED: Allow Hindi recognition (add other codes here if needed)
        alternative_language_codes=["hi-IN"], 
        sample_rate_hertz=16000,
        enable_automatic_punctuation=True
    )

    streaming_config_obj = speech.StreamingRecognitionConfig(
        config=config,
        interim_results=False,
        single_utterance=False
    )
    
    threading.Thread(
        target=google_thread, 
        args=(audio_queue, streaming_config_obj, ws), 
        daemon=True
    ).start()

    return audio_queue


# -----------------------------
# 2. STREAMING ELEVENLABS TTS (UPDATED FOR MULTILINGUAL)
# -----------------------------
def stream_eleven_tts(text, ws):
    """Streams TTS audio chunks to the frontend in real time."""
    try:
        stream = eleven.text_to_speech.convert( 
            text=text,
            voice_id=ELEVEN_VOICE_ID,
            # UPDATED: Use multilingual model to speak Hindi
            model_id="eleven_multilingual_v2" 
        )
        print(f"Generating TTS for: '{text[:30]}...'")
        
        for chunk in stream:
            audio_base64 = base64.b64encode(chunk).decode()
            ws.send(json.dumps({
                "type": "audio_chunk",
                "data": audio_base64
            }))

        ws.send(json.dumps({"type": "audio_end"}))

    except Exception as e:
        print("TTS Error:", e)


# -----------------------------
# 3. MAIN WEBSOCKET ROUTE
# -----------------------------
@sock.route('/stream')
def ws_stream(ws):
    print("🔌 Client Connected")

    incoming_audio_queue = stream_google_stt(ws)

    while True:
        try:
            message = ws.receive()
            if not message:
                break

            data = json.loads(message)

            # A. Incoming microphone audio → Google STT
            if data["type"] == "audio_input":
                audio_bytes = base64.b64decode(data["data"])
                incoming_audio_queue.put(audio_bytes) 

            # B. LLM response text → ElevenLabs TTS
            elif data["type"] == "tts_request":
                text = data["text"]
                stream_eleven_tts(text, ws)

        except Exception as e:
            print("WebSocket error:", e)
            break

    incoming_audio_queue.put(_END_OF_STREAM) 
    print("🔌 Client Disconnected")


if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000, debug=True)
