"""Stohil Properties - Rentals Views"""
from decimal import Decimal
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
# type: ignore
from rest_framework.permissions import IsAuthenticated, AllowAny
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Sum, Count, Q
from apps.rentals.models import Lease, RentalInvoice, RentalPayment, MaintenanceRequest, OwnerSettlement


class LeaseViewSet(viewsets.ModelViewSet):
    queryset = Lease.objects.select_related(
        'property', 'property__property_type', 'tenant', 'unit', 'managing_agent'
    )
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'lease_type', 'managing_agent']
    search_fields = ['lease_number', 'tenant__last_name', 'tenant__first_name', 'property__reference_number', 'property__name']
    ordering_fields = ['start_date', 'monthly_rental', 'created_at', 'lease_number']

    def get_serializer_class(self):
        from apps.rentals.serializers import LeaseSerializer
        return LeaseSerializer

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Dashboard-style stats for the rentals module."""
        from apps.properties.models import Property

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

        from django.utils import timezone
        today = timezone.now().date()
        
        pending_billing = Lease.objects.filter(
            status='active',
            next_invoice_date__lte=today
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
            'leases_pending_billing': pending_billing,
        })

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

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Transition a draft lease to active status and optionally post security deposit."""
        lease = self.get_object()
        lease.activate()
        
        post_deposit = request.data.get('post_deposit', False)
        deposit_posted = False
        journal_ref = None
        
        if post_deposit and lease.deposit_amount > 0:
            try:
                from apps.finance.services.accounting import AccountingService
                service = AccountingService(user=request.user)
                entry = service.post_deposit_received(lease, lease.deposit_amount)
                lease.deposit_paid = True
                from django.utils import timezone
                lease.deposit_paid_date = timezone.now().date()
                lease.save(update_fields=['deposit_paid', 'deposit_paid_date'])
                deposit_posted = True
                journal_ref = entry.reference
            except Exception as e:
                import logging
                logging.getLogger('stohill.rentals').error(f"Failed to post security deposit for lease {lease.lease_number}: {e}")

        return Response({
            'status': 'activated', 
            'lease_number': lease.lease_number,
            'next_invoice_date': str(lease.next_invoice_date),
            'deposit_posted': deposit_posted,
            'journal_reference': journal_ref
        })

    @action(detail=True, methods=['post'])
    def terminate(self, request, pk=None):
        """End a lease early."""
        lease = self.get_object()
        date_str = request.data.get('termination_date')
        reason = request.data.get('reason', '')
        
        from datetime import date
        term_date = date.fromisoformat(date_str) if date_str else date.today()
        
        lease.terminate(termination_date=term_date, reason=reason)
        return Response({
            'status': 'terminated', 
            'end_date': str(lease.end_date),
            'lease_number': lease.lease_number
        })

    @action(detail=True, methods=['post'])
    def renew(self, request, pk=None):
        """Renew an existing lease."""
        lease = self.get_object()
        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')
        new_rent = request.data.get('monthly_rental')
        
        if not all([start_date, end_date]):
            return Response({'error': 'start_date and end_date are required for renewal'}, status=400)
            
        from datetime import date
        new_lease = lease.renew(
            start_date=date.fromisoformat(start_date),
            end_date=date.fromisoformat(end_date),
            new_rent=Decimal(str(new_rent)) if new_rent else None
        )
        
        from apps.rentals.serializers import LeaseSerializer
        return Response({
            'status': 'renewed',
            'new_lease_number': new_lease.lease_number,
            'new_lease': LeaseSerializer(new_lease).data
        })


class RentalInvoiceViewSet(viewsets.ModelViewSet):
    queryset = RentalInvoice.objects.select_related(
        'lease', 'lease__tenant', 'lease__property'
    )
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'lease']
    search_fields = ['invoice_number', 'lease__lease_number', 'lease__tenant__last_name']
    ordering_fields = ['period_start', 'due_date', 'total_amount', 'invoice_number']

    def get_serializer_class(self):
        from apps.rentals.serializers import RentalInvoiceSerializer
        return RentalInvoiceSerializer

    @action(detail=True, methods=['get'])
    def download_pdf(self, request, pk=None):
        """Generate and download a printable PDF invoice."""
        from django.http import HttpResponse
        from apps.finance.models.ar import CustomerInvoice
        
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
            from apps.finance.services.pdf_service import PDFService
            pdf_bytes = PDFService.generate_invoice_pdf(ar_invoice)
            
            response = HttpResponse(pdf_bytes, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="Invoice_{rental_invoice.invoice_number}.pdf"'
            return response
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'])
    def run_billing(self, request):
        """Trigger bulk monthly invoicing."""
        from apps.rentals.services.billing import LeaseBillingService
        from datetime import date
        
        date_str = request.data.get('date')
        target_date = date.fromisoformat(date_str) if date_str else date.today()
        
        results = LeaseBillingService.generate_monthly_invoices(target_date=target_date)
        return Response(results)

    @action(detail=False, methods=['post'])
    def run_late_fees(self, request):
        """Trigger bulk late fee processing."""
        from apps.rentals.services.billing import LeaseBillingService
        from datetime import date
        
        date_str = request.data.get('date')
        target_date = date.fromisoformat(date_str) if date_str else date.today()
        
        results = LeaseBillingService.apply_late_fees(target_date=target_date)
        return Response(results)


class RentalPaymentViewSet(viewsets.ModelViewSet):
    queryset = RentalPayment.objects.select_related(
        'invoice', 'invoice__lease', 'invoice__lease__tenant'
    )
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['invoice']
    ordering_fields = ['payment_date', 'amount']

    def get_serializer_class(self):
        from apps.rentals.serializers import RentalPaymentSerializer
        return RentalPaymentSerializer


class MaintenanceViewSet(viewsets.ModelViewSet):
    queryset = MaintenanceRequest.objects.select_related(
        'property', 'lease', 'lease__property', 'lease__tenant'
    )
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'priority', 'property', 'lease']
    search_fields = ['reference', 'description', 'property__name', 'lease__property__name']
    ordering_fields = ['created_at', 'reference', 'category', 'status']

    def get_serializer_class(self):
        from apps.rentals.serializers import MaintenanceRequestSerializer
        return MaintenanceRequestSerializer

    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        """Transition the status of a maintenance ticket."""
        ticket = self.get_object()
        new_status = request.data.get('status')
        if not new_status:
            return Response({'error': 'status is required'}, status=400)
        
        ticket.status = new_status
        if new_status == 'completed':
            from django.utils import timezone
            ticket.completed_date = timezone.now()
        
        if 'resolution_notes' in request.data:
            ticket.resolution_notes = request.data['resolution_notes']
        
        if 'actual_cost' in request.data:
            ticket.actual_cost = Decimal(str(request.data['actual_cost']))
            
        ticket.save()
        return Response({'status': 'updated', 'new_status': ticket.status})


class OwnerSettlementViewSet(viewsets.ModelViewSet):
    queryset = OwnerSettlement.objects.select_related('owner', 'property', 'currency')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'owner', 'property']
    search_fields = ['property__name', 'owner__last_name', 'payment_reference']
    ordering_fields = ['period_start', 'net_payout_amount', 'status']

    def get_serializer_class(self):
        from apps.rentals.serializers import OwnerSettlementSerializer
        return OwnerSettlementSerializer

    @action(detail=False, methods=['post'])
    def generate_monthly(self, request):
        """Trigger the automated settlement calculation for a given month/year."""
        month = request.data.get('month')
        year = request.data.get('year')
        
        if not all([month, year]):
            from django.utils import timezone
            today = timezone.now().date()
            month = month or today.month
            year = year or today.year
            
        from apps.rentals.services.settlement_service import OwnerSettlementService
        try:
            results = OwnerSettlementService.generate_monthly_settlements(int(month), int(year))
            return Response(results)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def approve_and_post(self, request, pk=None):
        """Approve a draft settlement and post it to GL."""
        settlement = self.get_object()
        from apps.rentals.services.settlement_service import OwnerSettlementService
        try:
            je = OwnerSettlementService.process_and_post_settlement(settlement, user=request.user)
            return Response({
                'status': 'paid',
                'journal_reference': je.reference,
                'net_payout': str(settlement.net_payout_amount)
            })
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class PublicMaintenanceViewSet(viewsets.ViewSet):
    """
    Publicly accessible endpoint for external website integration.
    Allows tenants to log maintenance requests without ERP access.
    """
    permission_classes = [AllowAny]

    def create(self, request):
        lease_number = request.data.get('lease_number')
        email = request.data.get('email')
        category = request.data.get('category')
        description = request.data.get('description')
        priority = request.data.get('priority', 'medium')

        if not all([lease_number, email, category, description]):
            return Response(
                {'error': 'lease_number, email, category, and description are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            lease = Lease.objects.select_related('property', 'tenant').get(
                lease_number__iexact=lease_number,
                tenant__email__iexact=email,
                status='active'
            )

            ticket = MaintenanceRequest.objects.create(
                lease=lease,
                property=lease.property,
                reported_by=lease.tenant,
                category=category,
                description=description,
                priority=priority,
                status='logged'
            )

            if lease.managing_agent and lease.managing_agent.user:
                try:
                    from apps.notifications.utils import create_notification
                    create_notification(
                        user=lease.managing_agent.user,
                        title="New Website Maintenance Ticket",
                        message=f"A new ticket ({ticket.reference}) was logged for {lease.property.name} via the website.",
                        module='rentals',
                        priority='urgent' if priority in ['high', 'emergency'] else 'normal'
                    )
                except:
                    pass

            return Response({
                'status': 'success',
                'reference': ticket.reference,
                'message': 'Your maintenance request has been logged successfully.'
            }, status=status.HTTP_201_CREATED)

        except Lease.DoesNotExist:
            return Response(
                {'error': 'No active lease found matching those details. Please check your lease number and email.'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
