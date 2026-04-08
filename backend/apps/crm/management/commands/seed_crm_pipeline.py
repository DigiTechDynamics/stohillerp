from django.core.management.base import BaseCommand
from apps.crm.models import Pipeline, PipelineStage

class Command(BaseCommand):
    help = 'Seeds the CRM with default pipelines and stages'

    def handle(self, *args, **options):
        # 1. Sales Pipeline
        sales_pp, created = Pipeline.objects.get_or_create(
            name='Property Sales',
            defaults={
                'pipeline_type': 'sale',
                'is_default': True,
                'description': 'Standard property sales workflow from lead to transfer'
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS('Created Sales Pipeline'))

        sales_stages = [
            ('New Lead', PipelineStage.StageType.INITIAL, 0, 10, '#3B82F6'),
            ('Qualification', PipelineStage.StageType.QUALIFIED, 1, 20, '#6366F1'),
            ('Viewings', PipelineStage.StageType.VIEWING, 2, 40, '#8B5CF6'),
            ('Negotiation', PipelineStage.StageType.NEGOTIATION, 3, 60, '#F59E0B'),
            ('Closing', PipelineStage.StageType.CLOSING, 4, 85, '#10B981'),
            ('Won', PipelineStage.StageType.WON, 5, 100, '#059669', True, True),
            ('Lost', PipelineStage.StageType.LOST, 6, 0, '#EF4444', True, False),
        ]

        for name, stype, pos, prob, color, *terminal in sales_stages:
            is_terminal = terminal[0] if len(terminal) > 0 else False
            is_won = terminal[1] if len(terminal) > 1 else False
            PipelineStage.objects.get_or_create(
                pipeline=sales_pp,
                name=name,
                defaults={
                    'stage_type': stype,
                    'position': pos,
                    'probability': prob,
                    'color': color,
                    'is_terminal': is_terminal,
                    'is_won': is_won
                }
            )

        # 2. Rental Pipeline
        rental_pp, created = Pipeline.objects.get_or_create(
            name='Property Rentals',
            defaults={
                'pipeline_type': 'rental',
                'is_default': False,
                'description': 'Standard tenant acquisition and lease management'
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS('Created Rental Pipeline'))

        rental_stages = [
            ('Inquiry', PipelineStage.StageType.INITIAL, 0, 10, '#3B82F6'),
            ('Screening', PipelineStage.StageType.QUALIFIED, 1, 30, '#6366F1'),
            ('Showing', PipelineStage.StageType.VIEWING, 2, 50, '#8B5CF6'),
            ('Lease Prep', PipelineStage.StageType.DOCUMENTATION, 3, 80, '#F59E0B'),
            ('Active Lease', PipelineStage.StageType.WON, 4, 100, '#10B981', True, True),
            ('Lost', PipelineStage.StageType.LOST, 5, 0, '#EF4444', True, False),
        ]

        for name, stype, pos, prob, color, *terminal in rental_stages:
            is_terminal = terminal[0] if len(terminal) > 0 else False
            is_won = terminal[1] if len(terminal) > 1 else False
            PipelineStage.objects.get_or_create(
                pipeline=rental_pp,
                name=name,
                defaults={
                    'stage_type': stype,
                    'position': pos,
                    'probability': prob,
                    'color': color,
                    'is_terminal': is_terminal,
                    'is_won': is_won
                }
            )

        self.stdout.write(self.style.SUCCESS('Successfully seeded CRM pipelines and stages.'))
