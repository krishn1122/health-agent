import os
import platform
import subprocess
import tempfile
from deepgram import DeepgramClient
from dotenv import load_dotenv

load_dotenv()

DEFAULT_VOICE = os.environ.get('DEEPGRAM_VOICE', 'aura-2-thalia-en')


def convert_text_to_doctor_audio(text, voice=None, output_path=None):
    """Synthesize the doctor's reply and return the path to the audio file.

    Args:
        text: The doctor's response to speak. Must be non-empty.
        voice: Deepgram voice model. Defaults to DEEPGRAM_VOICE, else aura-2-thalia-en.
        output_path: Where to write the mp3. Defaults to a unique temp file so
            concurrent requests never overwrite each other.
    """
    if not text or not text.strip():
        raise ValueError("No text to synthesize: the doctor's response was empty.")

    api_key = os.environ.get('DEEPGRAM_API_KEY')
    if not api_key:
        raise ValueError('Missing DEEPGRAM_API_KEY in .env or environment')

    if output_path is None:
        handle, output_path = tempfile.mkstemp(prefix='doctor_reply_', suffix='.mp3')
        os.close(handle)

    deepgram = DeepgramClient(api_key=api_key)
    audio = deepgram.speak.v1.audio.generate(
        text=text,
        model=voice or DEFAULT_VOICE,
        encoding='mp3'
    )

    with open(output_path, 'wb') as f:
        for chunk in audio:
            f.write(chunk)

    return output_path


def play_audio(audio_path):
    """Play audio on the machine running this process.

    Only useful for local CLI testing. The Gradio app returns the file to the
    browser instead, which is what plays it for the patient.
    """
    if not audio_path or not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    system = platform.system()
    if system == 'Darwin':
        subprocess.run(['afplay', str(audio_path)], check=False)
    elif system == 'Windows':
        os.startfile(audio_path)
    else:
        subprocess.run(['xdg-open', str(audio_path)], check=False)


if __name__ == '__main__':
    sample = input('Text for the doctor to say: ').strip()
    play_audio(convert_text_to_doctor_audio(sample))
