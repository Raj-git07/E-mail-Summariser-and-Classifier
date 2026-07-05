from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from google_auth_oauthlib.flow import Flow
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build
import google.oauth2.credentials
import requests
import json
import base64
import os
from bs4 import BeautifulSoup
from config import get_openrouter_api_key

try:
    from email_classifier import EmailClassifier, EmailFeedbackManager
    HAS_CLASSIFIER = True
except ImportError:
    HAS_CLASSIFIER = False

app = FastAPI()

# Gmail scopes required
SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify'
]

# Helper to read credentials.json content
def get_client_config():
    if os.environ.get("GOOGLE_CREDENTIALS_JSON"):
        try:
            return json.loads(os.environ.get("GOOGLE_CREDENTIALS_JSON"))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to parse GOOGLE_CREDENTIALS_JSON env: {e}")
            
    if os.path.exists("credentials.json"):
        with open("credentials.json", "r") as f:
            try:
                return json.load(f)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to parse credentials.json file: {e}")
                
    raise HTTPException(
        status_code=500,
        detail="Missing Google Client Credentials. Please set GOOGLE_CREDENTIALS_JSON in Vercel env or add credentials.json to your project folder."
    )

def get_gmail_service(creds_dict):
    creds = google.oauth2.credentials.Credentials(
        token=creds_dict['token'],
        refresh_token=creds_dict['refresh_token'],
        token_uri=creds_dict['token_uri'],
        client_id=creds_dict['client_id'],
        client_secret=creds_dict['client_secret'],
        scopes=creds_dict['scopes']
    )
    if not creds.valid:
        try:
            creds.refresh(GoogleRequest())
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Failed to refresh credentials: {e}")
    return build('gmail', 'v1', credentials=creds, static_discovery=False)

def decode_base64(data):
    try:
        missing_padding = len(data) % 4
        if missing_padding:
            data += '=' * (4 - missing_padding)
        return base64.urlsafe_b64decode(data).decode('utf-8', errors='replace')
    except Exception:
        return ''

def get_email_body(payload):
    if 'parts' in payload:
        for part in payload['parts']:
            if part['mimeType'] == 'text/plain':
                return decode_base64(part['body'].get('data', ''))
            elif part['mimeType'] == 'text/html':
                html = decode_base64(part['body'].get('data', ''))
                soup = BeautifulSoup(html, 'html.parser')
                return soup.get_text(separator='\n', strip=True)
            elif 'parts' in part:
                res = get_email_body(part)
                if res:
                    return res
    if 'body' in payload and 'data' in payload['body']:
        return decode_base64(payload['body']['data'])
    return ''

@app.get("/api/auth_url")
def get_auth_url(request: Request):
    client_config = get_client_config()
    
    # Dynamically resolve redirect URI to match hosting domain
    # Use request headers to determine if we are running on Vercel or localhost
    forwarded_host = request.headers.get("x-forwarded-host")
    forwarded_proto = request.headers.get("x-forwarded-proto", "https")
    
    if forwarded_host:
        redirect_uri = f"{forwarded_proto}://{forwarded_host}/api/oauth_callback"
    else:
        redirect_uri = f"{request.url.scheme}://{request.url.netloc}/api/oauth_callback"
        
    flow = Flow.from_client_config(client_config, scopes=SCOPES, autogenerate_code_verifier=False)
    flow.redirect_uri = redirect_uri
    auth_url, _ = flow.authorization_url(prompt='consent', access_type='offline')
    return {"auth_url": auth_url}

@app.get("/api/oauth_callback")
def oauth_callback(code: str, request: Request):
    client_config = get_client_config()
    
    forwarded_host = request.headers.get("x-forwarded-host")
    forwarded_proto = request.headers.get("x-forwarded-proto", "https")
    
    if forwarded_host:
        redirect_uri = f"{forwarded_proto}://{forwarded_host}/api/oauth_callback"
        origin = f"{forwarded_proto}://{forwarded_host}"
    else:
        redirect_uri = f"{request.url.scheme}://{request.url.netloc}/api/oauth_callback"
        origin = f"{request.url.scheme}://{request.url.netloc}"
        
    flow = Flow.from_client_config(client_config, scopes=SCOPES, autogenerate_code_verifier=False)
    flow.redirect_uri = redirect_uri
    flow.fetch_token(code=code)
    
    creds = flow.credentials
    creds_dict = {
        'token': creds.token,
        'refresh_token': creds.refresh_token,
        'token_uri': creds.token_uri,
        'client_id': creds.client_id,
        'client_secret': creds.client_secret,
        'scopes': creds.scopes
    }
    
    # Fetch profile to identify the email address
    service = build('gmail', 'v1', credentials=creds, static_discovery=False)
    profile = service.users().getProfile(userId='me').execute()
    email = profile.get('emailAddress')
    
    # Serialize credentials into base64 to pass back to the frontend
    creds_json = json.dumps(creds_dict)
    creds_b64 = base64.b64encode(creds_json.encode('utf-8')).decode('utf-8')
    
    # Redirect back to homepage with credentials in query
    response_url = f"{origin}/?token={creds_b64}&email={email}"
    return RedirectResponse(url=response_url)

@app.post("/api/fetch_emails")
def fetch_emails(payload: dict):
    creds_dict = payload.get("credentials")
    max_results = payload.get("max_results", 5)
    if not creds_dict:
        raise HTTPException(status_code=400, detail="Missing Gmail credentials in request payload.")
        
    try:
        service = get_gmail_service(creds_dict)
        results = service.users().messages().list(
            userId='me', maxResults=max_results, labelIds=['INBOX']
        ).execute()
        messages = results.get('messages', [])
        
        emails = []
        for msg in messages:
            msg_id = msg['id']
            message = service.users().messages().get(userId='me', id=msg_id, format='full').execute()
            
            headers = {}
            for header in message['payload'].get('headers', []):
                headers[header['name']] = header['value']
                
            body = get_email_body(message['payload'])
            snippet = message.get('snippet', '')
            
            email_data = {
                'id': msg_id,
                'subject': headers.get('Subject', '(No subject)'),
                'from': headers.get('From', 'Unknown'),
                'date': headers.get('Date', ''),
                'body': body,
                'snippet': snippet,
                'labels': message.get('labelIds', []),
                'predicted_class': 'none'   # No auto-classification; user assigns manually
            }
            emails.append(email_data)
            
        return {"emails": emails}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch emails: {e}")

@app.post("/api/update_label")
def update_label(payload: dict):
    creds_dict = payload.get("credentials")
    email_id = payload.get("email_id")
    new_class = payload.get("new_class")
    
    if not creds_dict or not email_id:
        raise HTTPException(status_code=400, detail="Missing required parameters in request body.")
    if new_class not in ('junk', 'important', 'none'):
        raise HTTPException(status_code=400, detail=f"Invalid new_class value: {new_class!r}")
        
    try:
        service = get_gmail_service(creds_dict)

        def get_or_create_label(name):
            """Get or create a custom Gmail label by name, return its ID."""
            results = service.users().labels().list(userId='me').execute()
            for label in results.get('labels', []):
                if label['name'].lower() == name.lower():
                    return label['id']
            created = service.users().labels().create(
                userId='me',
                body={'name': name, 'labelListVisibility': 'labelShow', 'messageListVisibility': 'show'}
            ).execute()
            return created['id']

        if new_class == 'junk':
            # Move to custom 'Junk' label, remove from Inbox
            junk_label_id = get_or_create_label('Junk')
            modify_body = {
                'addLabelIds': [junk_label_id],
                'removeLabelIds': ['INBOX', 'IMPORTANT', 'STARRED']
            }
        elif new_class == 'important':
            # Restore to Inbox, remove custom Junk label if present
            junk_label_id = get_or_create_label('Junk')
            modify_body = {
                'addLabelIds': ['INBOX', 'IMPORTANT', 'STARRED'],
                'removeLabelIds': [junk_label_id]
            }
        else:
            # 'none' — return to plain inbox
            junk_label_id = get_or_create_label('Junk')
            modify_body = {
                'addLabelIds': ['INBOX'],
                'removeLabelIds': [junk_label_id, 'IMPORTANT', 'STARRED']
            }

        result = service.users().messages().modify(
            userId='me', id=email_id, body=modify_body
        ).execute()

        print(f"[update_label] email={email_id} new_class={new_class} labels_after={result.get('labelIds', [])}")
        return {"status": "success", "labels": result.get('labelIds', [])}
    except Exception as e:
        print(f"[update_label] ERROR: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update Gmail label: {e}")


@app.post("/api/summarize")
def summarize(payload: dict):
    emails = payload.get("emails", [])
    api_key = os.environ.get("OPENROUTER_API_KEY") or payload.get("api_key") or get_openrouter_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="Missing OpenRouter API Key. Add OPENROUTER_API_KEY in environment variables.")
        
    if not emails:
        return {"summary": "No emails selected."}
        
    lines = [f"You have {len(emails)} email(s) to summarize.\n"]
    for i, email in enumerate(emails, start=1):
        body = email.get('body', '') or ''
        body_preview = body[:1500]
        lines.extend([
            f"--- Email {i} ---",
            f"From   : {email.get('from', 'Unknown')}",
            f"Date   : {email.get('date', '')}",
            f"Subject: {email.get('subject', '(No subject)')}",
            f"Body   :\n{body_preview}",
            "",
        ])
    user_prompt = "\n".join(lines)
    
    system_prompt = """You are a professional email assistant.
Given a list of emails, produce a concise, structured summary with exactly three sections:

## 📌 Bullet-Point Summary
A short bullet point for each email describing what it is about.

## 💡 Key Insights
The 3–5 most important takeaways across all emails.

## ✅ Action Items
Any concrete tasks, deadlines, or responses the user should act on.
If there are none, write "None identified."

Be factual, professional, and brief. Do not add greetings or sign-offs."""

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost",
        "X-Title": "Email Summarizer",
    }
    
    request_payload = {
        "model": "openai/gpt-4o-mini",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": 1500,
        "temperature": 0.3,
    }
    
    try:
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=request_payload,
            timeout=60
        )
        response.raise_for_status()
        data = response.json()
        summary = data["choices"][0]["message"]["content"]
        return {"summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate summary: {e}")

# Mount static folder for local FastAPI runs
if os.path.exists("public"):
    app.mount("/", StaticFiles(directory="public", html=True), name="static")
elif os.path.exists("."):
    app.mount("/", StaticFiles(directory=".", html=True), name="static")
