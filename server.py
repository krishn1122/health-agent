"""FastAPI backend serving the MedAssistant AI diagnostic workspace.

Wires the existing pipeline modules to a single /api/analyze endpoint:
    voice_of_patient.transcribe_patient_voice -> brain_of_the_doctor -> voice_of_doctor
"""

import logging
import os
import shutil
import tempfile
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from brain_of_the_doctor import brain_of_the_doctor
from voice_of_doctor import convert_text_to_doctor_audio
from voice_of_patient import transcribe_patient_voice

IS_VERCEL = os.environ.get("VERCEL") == "1"

if not IS_VERCEL:
    STATIC_DIR = Path(__file__).parent / "frontend" / "dist"
    if not STATIC_DIR.exists():
        STATIC_DIR.mkdir(parents=True, exist_ok=True)
        (STATIC_DIR / "index.html").write_text("React app is not built yet. Run npm run build in frontend directory.")


log = logging.getLogger(__name__)

app = FastAPI(title="MedAssistant AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Maps an opaque token to a generated mp3 path. Serving by token rather than by
# path keeps user input out of the filesystem lookup.
_audio_replies: dict[str, str] = {}


def _save_upload(upload: UploadFile) -> str:
    """Persist an upload to a temp file, since the pipeline reads by path."""
    suffix = Path(upload.filename or "").suffix or ".bin"
    handle, path = tempfile.mkstemp(prefix="upload_", suffix=suffix)
    with os.fdopen(handle, "wb") as f:
        shutil.copyfileobj(upload.file, f)
    return path


@app.post("/api/analyze")
def analyze(
    image: UploadFile = File(...),
    text: str = Form(""),
    audio: UploadFile | None = File(None),
    video: UploadFile | None = File(None),
):
    """Run one consultation. An image is required; symptoms come from text or voice."""
    if not text.strip() and audio is None:
        raise HTTPException(
            status_code=400,
            detail="Describe your symptoms in the Clinical Text tab or record a Voice Note.",
        )

    temp_paths: list[str] = []
    try:
        image_path = _save_upload(image)
        temp_paths.append(image_path)

        video_path = None
        if video is not None:
            video_path = _save_upload(video)
            temp_paths.append(video_path)

        # Typed text wins when both are present; it needs no transcription.
        patient_text = text.strip()
        if not patient_text:
            audio_path = _save_upload(audio)
            temp_paths.append(audio_path)
            try:
                patient_text = transcribe_patient_voice(audio_path).strip()
            except Exception as exc:
                raise HTTPException(400, f"Could not transcribe your voice: {exc}")
            if not patient_text:
                raise HTTPException(400, "No speech detected in the recording. Please try again.")

        try:
            reply = brain_of_the_doctor(
                patient_text=patient_text,
                image_filepath=image_path,
                video_filepath=video_path,
            )
        except Exception as exc:
            raise HTTPException(502, f"Could not generate the doctor's response: {exc}")

        audio_url = None
        try:
            reply_path = convert_text_to_doctor_audio(reply)
            token = uuid.uuid4().hex
            _audio_replies[token] = reply_path
            audio_url = f"/api/audio/{token}"
        except Exception:
            # Text is the primary result; losing speech should not fail the request.
            log.exception("Text-to-speech failed; returning the response without audio")

        return {"transcript": patient_text, "reply": reply, "audio_url": audio_url}
    finally:
        for path in temp_paths:
            try:
                os.remove(path)
            except OSError:
                pass


@app.get("/api/audio/{token}")
def get_audio(token: str):
    path = _audio_replies.get(token)
    if not path or not os.path.exists(path):
        raise HTTPException(404, "Audio reply not found or expired.")
    return FileResponse(path, media_type="audio/mpeg")


if not IS_VERCEL:
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=7860)
