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
            
        from apps.core.company import company_profile

        company = company_profile()
        currency = invoice.currency.code if invoice.currency else company['currency']
        subject = f"Invoice {invoice.invoice_number} from {company['name']}"
        body = (f"Dear {invoice.customer.name},\n\nPlease find attached your invoice {invoice.invoice_number} "
                f"for {currency} {invoice.total_amount:,.2f}.\n\nThank you for your business.\n\n{company['name']}")
        
        email = EmailMessage(
            subject=subject,
            body=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
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
