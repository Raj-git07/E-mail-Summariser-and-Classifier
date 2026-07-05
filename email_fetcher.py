class EmailMessage:
    def __init__(self, sender, date, subject, body):
        self.sender = sender
        self.date = date
        self.subject = subject
        self.body = body

    def display_body(self):
        return self.body