import logging
import os
from io import BytesIO

import speech_recognition as sr
from dotenv import load_dotenv
from groq import Groq
from pydub import AudioSegment

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')


def record_audio(file_path, timeout=20, phrase_time_limit=None):
    """
    Record audio from the microphone and save it as an MP3 file.

    Args:
        file_path (str): Path to save the recorded audio file.
        timeout (int): Maximum time to wait for a phrase to start (in seconds).
        phrase_time_limit (int): Maximum time for the phrase to be recorded (in seconds).
    """
    recognizer = sr.Recognizer()
    with sr.Microphone() as source:
        logging.info('Adjusting for ambient noise...')
        recognizer.adjust_for_ambient_noise(source, duration=1)
        logging.info('Start speaking now...')
        audio_data = recognizer.listen(source, timeout=timeout, phrase_time_limit=phrase_time_limit)
        logging.info('Recording complete.')

    wav_data = audio_data.get_wav_data()
    audio_segment = AudioSegment.from_wav(BytesIO(wav_data))
    audio_segment.export(file_path, format='mp3', bitrate='128k')
    logging.info(f'Audio saved to {file_path}')
    return file_path


def transcribe_patient_voice(audio_filepath):
    """Transcribe the patient's recording to text via Groq Whisper."""
    if not audio_filepath:
        raise ValueError('No audio provided. Please record your voice before submitting.')

    if not os.path.exists(audio_filepath):
        raise FileNotFoundError(f'Audio file not found: {audio_filepath}')

    groq_api_key = os.environ.get('GROQ_API_KEY')
    if not groq_api_key:
        raise ValueError('Missing GROQ_API_KEY in .env or environment')

    client = Groq(api_key=groq_api_key)
    with open(audio_filepath, 'rb') as audio_file:
        transcription = client.audio.transcriptions.create(
            file=audio_file,
            model=os.environ.get('WHISPER_MODEL', 'whisper-large-v3')
        )
    return transcription.text
