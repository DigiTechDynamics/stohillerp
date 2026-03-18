import logging
from django.core.mail import EmailMessage
from django.conf import settings
from .pdf_service import PDFService

logger = logging.getLogger(__name__)

class EmailService:
    @staticmethod
    def send_customer_invoice(invoice):
        """
        Generates a PDF for the given CustomerInvoice and emails it to the customer.
        """
        # 1. Generate the PDF
        pdf_content = PDFService.generate_invoice_pdf(invoice)
        if not pdf_content:
            logger.error(f"Failed to generate PDF for invoice {invoice.invoice_number}")
            return False
            
        # 2. Prepare the email
        customer_email = invoice.customer.email
        if not customer_email:
            logger.error(f"Customer {invoice.customer.name} has no email address.")
            return False
            
        subject = f"Invoice {invoice.invoice_number} from Stohil Properties"
        body = f"Dear {invoice.customer.name},\n\nPlease find attached your invoice {invoice.invoice_number} for the amount of {invoice.total_amount}.\n\nThank you for your business.\n\nStohil Properties"
        
        email = EmailMessage(
            subject=subject,
            body=body,
            from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@stohillerp.com'),
            to=[customer_email],
        )
        
        # 3. Attach the PDF
        email.attach(f"Invoice_{invoice.invoice_number}.pdf", pdf_content, 'application/pdf')
        
        # 4. Send
        try:
            # We will use console backend or dummy backend if SMTP is not configured
            email.send(fail_silently=False)
            logger.info(f"Successfully sent invoice {invoice.invoice_number} to {customer_email}")
            return True
        except Exception as e:
            logger.error(f"Failed to send email to {customer_email}: {str(e)}")
            return False
