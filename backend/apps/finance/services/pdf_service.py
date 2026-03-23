import io

class PDFService:
    @staticmethod
    def generate_invoice_pdf(invoice):
        """
        Mocks the generation of a PDF for a customer invoice.
        In a real application, this would use ReportLab, WeasyPrint, or xhtml2pdf.
        Returns bytes representing the PDF file.
        """
        # Create a mock text file that acts as our "PDF" content for demonstration purposes
        content = f"""
STOHILL ERP - INVOICE
=====================
Invoice Number: {invoice.invoice_number}
Date: {invoice.invoice_date}
Due Date: {invoice.due_date}

Billed To:
{invoice.customer.name}
{invoice.customer.email or 'No email provided'}

Totals:
Subtotal: {invoice.subtotal}
Tax Amount: {invoice.tax_amount}
Total Amount: {invoice.total_amount}

Thank you for your business!
        """
        # Return as bytes
        return content.encode('utf-8')
