"""
summarizer.py - Summarize emails via the OpenRouter API.
"""

from __future__ import annotations

import requests

from config import (
    OPENROUTER_API_URL,
    OPENROUTER_MODEL,
    OPENROUTER_SITE_URL,
    OPENROUTER_APP_NAME,
    get_openrouter_api_key,
)
from email_fetcher import EmailMessage


# ── Prompt builder ────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are a professional email assistant.
Given a list of emails, produce a concise, structured summary with exactly three sections:

## 📌 Bullet-Point Summary
A short bullet point for each email describing what it is about.

## 💡 Key Insights
The 3–5 most important takeaways across all emails.

## ✅ Action Items
Any concrete tasks, deadlines, or responses the user should act on.
If there are none, write "None identified."

Be factual, professional, and brief. Do not add greetings or sign-offs."""


def _build_user_prompt(emails: list[EmailMessage]) -> str:
    lines = [f"You have {len(emails)} email(s) to summarize.\n"]

    for i, email in enumerate(emails, start=1):
        body = email.display_body() or ""
        body_preview = body[:1500]

        lines.extend([
            f"--- Email {i} ---",
            f"From   : {email.sender}",
            f"Date   : {email.date}",
            f"Subject: {email.subject}",
            f"Body   :\n{body_preview}",
            "",
        ])

    return "\n".join(lines)


# ── OpenRouter call ───────────────────────────────────────────────────────────

def summarise_emails(emails: list[EmailMessage]) -> str:
    """
    Send emails to OpenRouter and return the structured AI summary string.

    Raises
    ------
    RuntimeError if the API call fails or returns an error response.
    """
    if not emails:
        return "No emails to summarize."

    api_key = get_openrouter_api_key()
    if not api_key:
        raise RuntimeError("Missing OpenRouter API key.")

    user_prompt = _build_user_prompt(emails)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": OPENROUTER_SITE_URL,
        "X-Title": OPENROUTER_APP_NAME,
    }

    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": 1500,
        "temperature": 0.3,
    }

    try:
        response = requests.post(
            OPENROUTER_API_URL,
            headers=headers,
            json=payload,
            timeout=60,
        )
        response.raise_for_status()
    except requests.exceptions.Timeout:
        raise RuntimeError("OpenRouter request timed out. Please try again.")
    except requests.exceptions.ConnectionError as exc:
        raise RuntimeError(f"Could not reach OpenRouter API: {exc}") from exc
    except requests.exceptions.HTTPError as exc:
        raise RuntimeError(
            f"OpenRouter API error {response.status_code}: {response.text}"
        ) from exc

    try:
        data = response.json()
    except ValueError as exc:
        raise RuntimeError(f"Invalid JSON response: {response.text}") from exc

    # Handle API-level errors
    if isinstance(data, dict) and data.get("error"):
        raise RuntimeError(f"OpenRouter error: {data['error']}")

    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(
            f"Unexpected OpenRouter response format: {data}"
        ) from exc