#!/usr/bin/env python3
"""
app.py - Command Line Interface for AI Email Summarizer and Classifier.
"""

import os
import sys
import argparse
from gmail_integration import GmailService
from email_fetcher import EmailMessage
from email_classifier import EmailClassifier, EmailFeedbackManager
from email_summarizer import summarise_emails

# Terminal colors for styled output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def print_banner():
    banner = f"""
{Colors.OKBLUE}{Colors.BOLD}=================================================
          AI EMAIL SUMMARIZER & CLASSIFIER CLI   
================================================={Colors.ENDC}
"""
    print(banner)

def retrain_model():
    print(f"{Colors.OKCYAN}Loading feedback manager...{Colors.ENDC}")
    feedback_manager = EmailFeedbackManager()
    feedback_emails, feedback_labels = feedback_manager.get_training_data()
    
    if not feedback_emails:
        print(f"{Colors.WARNING}No manual feedback logs found. Cannot retrain model.{Colors.ENDC}")
        return False
        
    print(f"Found {Colors.BOLD}{len(feedback_emails)}{Colors.ENDC} feedback logs. Retraining classifier...")
    try:
        classifier = EmailClassifier()
        if classifier.train(feedback_emails, feedback_labels):
            print(f"{Colors.OKGREEN}[OK] Model retrained successfully!{Colors.ENDC}")
            return True
        else:
            print(f"{Colors.FAIL}[FAIL] Failed to retrain model.{Colors.ENDC}")
            return False
    except Exception as e:
        print(f"{Colors.FAIL}[FAIL] Retraining error: {e}{Colors.ENDC}")
        return False

def select_account(target_account=None):
    accounts = GmailService.list_authenticated_accounts()
    
    if target_account:
        return target_account
        
    if not accounts:
        print(f"{Colors.WARNING}No authenticated accounts found. Starting new login flow...{Colors.ENDC}")
        return None
        
    if len(accounts) == 1:
        account = accounts[0]
        print(f"Using active account: {Colors.OKGREEN}{Colors.BOLD}{account}{Colors.ENDC}")
        return account
        
    print(f"{Colors.BOLD}Available Gmail Accounts:{Colors.ENDC}")
    for idx, acc in enumerate(accounts, 1):
        print(f"  [{idx}] {acc}")
    print(f"  [{len(accounts) + 1}] Add New Account...")
    
    try:
        choice = input(f"\nSelect account (1-{len(accounts)+1}) [Default 1]: ").strip()
        if not choice:
            return accounts[0]
        choice_idx = int(choice) - 1
        if 0 <= choice_idx < len(accounts):
            return accounts[choice_idx]
        elif choice_idx == len(accounts):
            print(f"{Colors.OKCYAN}Setting up a new account login...{Colors.ENDC}")
            return None
        else:
            print(f"{Colors.WARNING}Invalid choice. Defaulting to first account.{Colors.ENDC}")
            return accounts[0]
    except (ValueError, IndexError):
        print(f"{Colors.WARNING}Invalid input. Defaulting to first account.{Colors.ENDC}")
        return accounts[0]

def main():
    # Enable ANSI terminal colors on Windows if supported
    if sys.platform == "win32":
        os.system("")

    parser = argparse.ArgumentParser(
        description="Fetch, classify, and summarize emails from your Gmail Inbox."
    )
    parser.add_argument(
        "-l", "--limit",
        type=int,
        default=5,
        help="Number of emails to fetch (default: 5, max: 100)"
    )
    parser.add_argument(
        "-a", "--account",
        type=str,
        default=None,
        help="Specific Gmail address / account to authenticate/use"
    )
    parser.add_argument(
        "-n", "--no-summary",
        action="store_true",
        help="Fetch and classify emails, but skip the AI summary step"
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Include all fetched emails in the summary (default is Important only)"
    )
    parser.add_argument(
        "-r", "--retrain",
        action="store_true",
        help="Retrain the Random Forest email classifier using feedback log data"
    )

    args = parser.parse_args()

    print_banner()

    if args.retrain:
        retrain_model()
        return

    # Cap limit to reasonable range
    limit = max(1, min(args.limit, 100))

    # Resolve account
    active_account = select_account(args.account)

    # Initialize Gmail connection
    print(f"\n{Colors.OKCYAN}Authenticating with Gmail...{Colors.ENDC}")
    gmail = GmailService()
    try:
        gmail.authenticate(target_email=active_account)
        email_address = gmail.get_user_email()
        print(f"{Colors.OKGREEN}Connected to: {Colors.BOLD}{email_address}{Colors.ENDC}")
    except Exception as e:
        print(f"{Colors.FAIL}Failed to authenticate with Gmail: {e}{Colors.ENDC}")
        sys.exit(1)

    # Fetch Emails
    print(f"{Colors.OKCYAN}Fetching the latest {limit} email(s) from Inbox...{Colors.ENDC}")
    try:
        raw_emails = gmail.get_emails(max_results=limit)
    except Exception as e:
        print(f"{Colors.FAIL}Failed to fetch emails: {e}{Colors.ENDC}")
        sys.exit(1)

    if not raw_emails:
        print(f"{Colors.WARNING}No emails found in the inbox.{Colors.ENDC}")
        return

    print(f"\n{Colors.BOLD}Emails & Auto-Classifications:{Colors.ENDC}")
    print("-" * 70)

    classifier = EmailClassifier()
    important_emails = []
    all_email_messages = []

    for idx, e in enumerate(raw_emails, 1):
        pred = classifier.predict(e)
        is_important = pred['prediction'] == 'important'
        confidence = pred['confidence'] * 100

        # Construct EmailMessage object
        msg = EmailMessage(
            sender=e.get('from', 'Unknown'),
            date=e.get('date', ''),
            subject=e.get('subject', '(No subject)'),
            body=e.get('body', '')
        )
        all_email_messages.append(msg)

        if is_important:
            important_emails.append(msg)
            class_str = f"{Colors.OKGREEN}{Colors.BOLD}Important{Colors.ENDC}"
        else:
            class_str = f"{Colors.FAIL}Junk{Colors.ENDC}"

        print(f"{Colors.BOLD}{idx}. Subject:{Colors.ENDC} {e.get('subject', '(No subject)')}")
        print(f"   {Colors.BOLD}From:{Colors.ENDC}    {e.get('from', 'Unknown')}")
        print(f"   {Colors.BOLD}Date:{Colors.ENDC}    {e.get('date', '')}")
        print(f"   {Colors.BOLD}Class:{Colors.ENDC}   {class_str} (Confidence: {confidence:.1f}%)")
        print(f"   {Colors.BOLD}Snippet:{Colors.ENDC} {e.get('snippet', '')}")
        print("-" * 70)

    if args.no_summary:
        print(f"\n{Colors.OKGREEN}Emails fetched successfully. Skipping AI Summary.{Colors.ENDC}")
        return

    # Determine which emails to summarize
    emails_to_summarize = all_email_messages if args.all else important_emails

    if not emails_to_summarize:
        print(f"\n{Colors.WARNING}No emails were classified as 'Important'. Skipping summary.{Colors.ENDC}")
        print(f"Use the {Colors.BOLD}--all{Colors.ENDC} flag to summarize all fetched emails regardless of classification.")
        return

    summary_type = "ALL fetched" if args.all else "IMPORTANT"
    print(f"\n{Colors.OKCYAN}Generating AI Summary for {Colors.BOLD}{len(emails_to_summarize)}{Colors.ENDC} {summary_type} email(s)...{Colors.ENDC}")

    try:
        summary = summarise_emails(emails_to_summarize)
        print(f"\n{Colors.OKGREEN}{Colors.BOLD}AI EMAIL SUMMARY:{Colors.ENDC}")
        print("=" * 50)
        print(summary)
        print("=" * 50)
    except Exception as e:
        print(f"\n{Colors.FAIL}Failed to generate summary: {e}{Colors.ENDC}")

if __name__ == "__main__":
    main()
