"""Stohil Properties - Rentals Views"""
from decimal import Decimal
from rest_framework import viewsets, filters, status  # type: ignore
from rest_framework.decorators import action  # type: ignore
from rest_framework.response import Response  # type: ignore
from django_filters.rest_framework import DjangoFilterBackend  # type: ignore
from django.db.models import Sum, Count, Q  # type: ignore
from apps.rentals.models import Lease, LeaseCharge, RentalInvoice, RentalPayment, MaintenanceRequest  # type: ignore
from utils.record_rules import RecordRulesMixin


class LeaseViewSet(RecordRulesMixin, viewsets.ModelViewSet):
    queryset = Lease.objects.select_related(
        'property', 'property__property_type', 'tenant', 'unit', 'managing_agent'
    )
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'lease_type', 'managing_agent']
    search_fields = ['lease_number', 'tenant__last_name', 'tenant__first_name', 'property__reference_number', 'property__name']
    ordering_fields = ['start_date', 'monthly_rental', 'created_at', 'lease_number']

    def get_serializer_class(self):
        from apps.rentals.serializers import LeaseSerializer  # type: ignore
        return LeaseSerializer

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Dashboard-style stats for the rentals module."""
        from apps.properties.models import Property  # type: ignore

        active = Lease.objects.filter(status='active')
        active_count = active.count()
        monthly_income = active.aggregate(total=Sum('monthly_rental'))['total'] or Decimal('0')

        overdue = RentalInvoice.objects.filter(status='overdue')
        overdue_count = overdue.count()
        overdue_amount = overdue.aggregate(total=Sum('balance_due'))['total'] or Decimal('0')

        total_properties = Property.objects.filter(
            status__in=['available', 'occupied', 'listed_rent']
        ).count()
        occupied_count = Property.objects.filter(status='occupied').count()
        vacancy_rate = round(
            (1 - occupied_count / max(total_properties, 1)) * 100, 1
        )

        pending_maintenance = MaintenanceRequest.objects.filter(
            status__in=['logged', 'acknowledged', 'in_progress']
        ).count()

        return Response({
            'active_leases': active_count,
            'monthly_income': str(monthly_income),
            'overdue_count': overdue_count,
            'overdue_amount': str(overdue_amount),
            'total_rental_properties': total_properties,
            'occupied_count': occupied_count,
            'vacancy_rate': vacancy_rate,
            'pending_maintenance': pending_maintenance,
        })

    @action(detail=True, methods=['post'])
    def generate_invoices(self, request, pk=None):
        """Bill this lease up to as_of (default today), applying escalation."""
        from datetime import date
        from django.utils import timezone  # type: ignore
        from apps.rentals.services.billing import generate_due_invoices  # type: ignore

        lease = self.get_object()
        try:
            as_of = date.fromisoformat(request.data['as_of']) if request.data.get('as_of') else timezone.localdate()
        except ValueError:
            return Response({'error': 'as_of must be YYYY-MM-DD'}, status=400)
        result = generate_due_invoices(as_of, leases=Lease.objects.filter(pk=lease.pk))
        body = {'created': result.created, 'escalated': bool(result.escalated),
                'errors': [msg for _num, msg in result.errors]}
        return Response(body, status=400 if result.errors else 200)

    @action(detail=True, methods=['post'])
    def renew(self, request, pk=None):
        """Body: {"end_date", "monthly_rental"?, "rental_escalation_rate"?} -> the new lease."""
        from datetime import date
        from apps.rentals.serializers import LeaseSerializer  # type: ignore
        from apps.rentals.services.lifecycle import renew_lease  # type: ignore

        try:
            end = date.fromisoformat(request.data['end_date'])
            rent = Decimal(str(request.data['monthly_rental'])) if request.data.get('monthly_rental') else None
            rate = Decimal(str(request.data['rental_escalation_rate'])) \
                if request.data.get('rental_escalation_rate') not in (None, '') else None
        except (KeyError, ValueError, ArithmeticError):
            return Response({'error': 'end_date (YYYY-MM-DD) is required; amounts must be numbers.'}, status=400)
        renewed = renew_lease(self.get_object(), end, rent, rate)
        return Response(LeaseSerializer(renewed).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def terminate(self, request, pk=None):
        """Body: {"termination_date", "reason"?}. Credits billed periods after the date."""
        from datetime import date
        from apps.rentals.services.lifecycle import terminate_lease  # type: ignore

        try:
            on = date.fromisoformat(request.data['termination_date'])
        except (KeyError, ValueError):
            return Response({'error': 'termination_date (YYYY-MM-DD) is required.'}, status=400)
        return Response(terminate_lease(self.get_object(), on, request.data.get('reason', '')))

    @action(detail=True, methods=['post'])
    def record_deposit(self, request, pk=None):
        """Receive the security deposit into the trust account (Dr Bank Trust / Cr Tenant Deposits)."""
        from datetime import date
        from django.db import transaction  # type: ignore
        from django.utils import timezone  # type: ignore
        from apps.finance.services.accounting import AccountingError, AccountingService  # type: ignore

        lease = self.get_object()
        if lease.deposit_paid:
            return Response({'error': 'Deposit already recorded for this lease.'}, status=400)
        try:
            amount = Decimal(str(request.data.get('amount', lease.deposit_amount)))
            paid_on = date.fromisoformat(request.data['date']) if request.data.get('date') else timezone.localdate()
        except (ValueError, ArithmeticError):
            return Response({'error': 'amount must be a number and date YYYY-MM-DD'}, status=400)
        if amount <= 0:
            return Response({'error': 'Deposit amount must be greater than zero.'}, status=400)
        try:
            with transaction.atomic():
                entry = AccountingService(user=request.user).post_deposit_received(lease, amount, paid_on)
                lease.deposit_amount = amount
                lease.deposit_paid = True
                lease.deposit_paid_date = paid_on
                lease.save(update_fields=['deposit_amount', 'deposit_paid', 'deposit_paid_date'])
        except AccountingError as e:
            return Response({'error': str(e)}, status=400)
        return Response({'status': 'deposit_recorded', 'journal_entry': entry.reference})

    @action(detail=True, methods=['post'])
    def refund_deposit(self, request, pk=None):
        """
        Release the deposit: apply part to the tenant's unpaid rent (oldest
        invoices first) and refund the rest.
        Body: {"applied_to_arrears": "0.00", "date": "YYYY-MM-DD"}
        """
        from datetime import date
        from django.db import transaction  # type: ignore
        from django.utils import timezone  # type: ignore
        from apps.finance.services.accounting import AccountingError, AccountingService  # type: ignore
        from apps.rentals.services.finance_sync import RentalFinanceSyncService  # type: ignore

        lease = self.get_object()
        if not lease.deposit_paid:
            return Response({'error': 'No deposit is held for this lease.'}, status=400)
        try:
            applied = Decimal(str(request.data.get('applied_to_arrears', '0')))
            on = date.fromisoformat(request.data['date']) if request.data.get('date') else timezone.localdate()
        except (ValueError, ArithmeticError):
            return Response({'error': 'applied_to_arrears must be a number and date YYYY-MM-DD'}, status=400)
        open_invoices = lease.invoices.filter(balance_due__gt=0).exclude(
            status__in=[RentalInvoice.InvoiceStatus.DRAFT, RentalInvoice.InvoiceStatus.CANCELLED]
        ).order_by('period_start')
        arrears = open_invoices.aggregate(total=Sum('balance_due'))['total'] or Decimal('0')
        if applied < 0 or applied > lease.deposit_amount or applied > arrears:
            return Response({'error': f'applied_to_arrears must be between 0 and the lower of the deposit '
                                      f'({lease.deposit_amount}) and the arrears ({arrears}).'}, status=400)
        try:
            with transaction.atomic():
                entry = AccountingService(user=request.user).post_deposit_refund(
                    lease, lease.deposit_amount - applied, applied, on)
                remaining = applied
                for inv in open_invoices:
                    if remaining <= 0:
                        break
                    portion = min(remaining, inv.balance_due)
                    inv.amount_paid += portion
                    inv.balance_due -= portion
                    inv.status = RentalInvoice.InvoiceStatus.PAID if inv.balance_due <= 0 \
                        else RentalInvoice.InvoiceStatus.PARTIAL
                    inv.save(update_fields=['amount_paid', 'balance_due', 'status'])
                    RentalFinanceSyncService.allocate_to_ar(
                        inv, portion, note=f'Deposit applied on release ({lease.lease_number})')
                    remaining -= portion
                lease.deposit_paid = False
                lease.save(update_fields=['deposit_paid'])
        except AccountingError as e:
            return Response({'error': str(e)}, status=400)
        return Response({'status': 'deposit_released', 'refunded': str(lease.deposit_amount - applied),
                         'applied_to_arrears': str(applied), 'journal_entry': entry.reference})

    @action(detail=True, methods=['post'])
    def adjust_rental(self, request, pk=None):
        """Adjust the monthly rental amount for a lease."""
        lease = self.get_object()
        new_amount = request.data.get('monthly_rental')
        if new_amount is None:
            return Response({'error': 'monthly_rental is required'}, status=400)
        try:
            lease.monthly_rental = Decimal(str(new_amount))
            lease.save(update_fields=['monthly_rental'])
            return Response({
                'status': 'updated',
                'monthly_rental': str(lease.monthly_rental),
            })
        except Exception as e:
            return Response({'error': str(e)}, status=400)


class RentalInvoiceViewSet(RecordRulesMixin, viewsets.ModelViewSet):
    queryset = RentalInvoice.objects.select_related(
        'lease', 'lease__tenant', 'lease__property'
    )
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'lease']
    search_fields = ['invoice_number', 'lease__lease_number', 'lease__tenant__last_name']
    ordering_fields = ['period_start', 'due_date', 'total_amount', 'invoice_number']

    def get_serializer_class(self):
        from apps.rentals.serializers import RentalInvoiceSerializer  # type: ignore
        return RentalInvoiceSerializer

    @action(detail=True, methods=['get'])
    def download_pdf(self, request, pk=None):
        """Generate and download a printable PDF invoice."""
        from django.http import HttpResponse  # type: ignore
        from apps.finance.models.ar import CustomerInvoice  # type: ignore
        
        rental_invoice = self.get_object()
        
        if not rental_invoice.is_posted_to_finance:
            return Response(
                {"error": "Invoice must be posted to finance before generating a PDF."}, 
                status=status.HTTP_400_BAD_REQUEST
            )
            
        ar_invoice = CustomerInvoice.objects.filter(journal_entry=rental_invoice.journal_entry).first()
        if not ar_invoice:
            return Response(
                {"error": "Mirrored Accounts Receivable invoice not found."}, 
                status=status.HTTP_404_NOT_FOUND
            )
            
        try:
            from apps.finance.services.pdf_service import PDFService  # type: ignore
            pdf_bytes = PDFService.generate_invoice_pdf(ar_invoice)
            
            response = HttpResponse(pdf_bytes, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="Invoice_{rental_invoice.invoice_number}.pdf"'
            return response
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class RentalPaymentViewSet(RecordRulesMixin, viewsets.ModelViewSet):
    queryset = RentalPayment.objects.select_related(
        'invoice', 'invoice__lease', 'invoice__lease__tenant'
    )
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['invoice']
    ordering_fields = ['payment_date', 'amount']

    def get_serializer_class(self):
        from apps.rentals.serializers import RentalPaymentSerializer  # type: ignore
        return RentalPaymentSerializer


class MaintenanceViewSet(RecordRulesMixin, viewsets.ModelViewSet):
    queryset = MaintenanceRequest.objects.select_related(
        'property', 'lease', 'lease__property', 'lease__tenant'
    )
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'priority', 'property', 'lease']
    search_fields = ['reference', 'description', 'property__name', 'lease__property__name']
    ordering_fields = ['created_at', 'reference', 'category', 'status']

    def get_serializer_class(self):

        from apps.rentals.serializers import MaintenanceRequestSerializer  # type: ignore
        return MaintenanceRequestSerializer

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """
        Body: {"actual_cost", "contractor"? (supplier id), "contractor_invoice_number"?, "bill_to_tenant"?}
        Raises the contractor's AP bill and, if billed to the tenant, the AR recharge.
        """
        from apps.finance.models import Supplier  # type: ignore
        from apps.rentals.services.lifecycle import complete_maintenance  # type: ignore

        contractor = None
        if request.data.get('contractor'):
            contractor = Supplier.objects.filter(pk=request.data['contractor']).first()
            if contractor is None:
                return Response({'error': 'Contractor (supplier) not found.'}, status=400)
        bill_to_tenant = request.data.get('bill_to_tenant')
        if isinstance(bill_to_tenant, str):
            bill_to_tenant = bill_to_tenant.lower() in ('1', 'true', 'yes')
        try:
            cost = Decimal(str(request.data.get('actual_cost')))
        except ArithmeticError:
            return Response({'error': 'actual_cost must be a number.'}, status=400)
        return Response(complete_maintenance(
            self.get_object(), cost, contractor, request.data.get('contractor_invoice_number', ''),
            bill_to_tenant, request.user))


class LeaseChargeViewSet(viewsets.ModelViewSet):
    """Recurring charges billed with a lease's rent."""
    queryset = LeaseCharge.objects.select_related('lease', 'account')
    filterset_fields = ['lease', 'charge_type', 'is_active']

    def get_serializer_class(self):
        from apps.rentals.serializers import LeaseChargeSerializer  # type: ignore
        return LeaseChargeSerializer
