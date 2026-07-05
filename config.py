import os
from dotenv import load_dotenv

load_dotenv()

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "openai/gpt-4o-mini"
OPENROUTER_SITE_URL = "http://localhost"
OPENROUTER_APP_NAME = "Email Summarizer"

def get_openrouter_api_key():
    return os.getenv("OPENROUTER_API_KEY")