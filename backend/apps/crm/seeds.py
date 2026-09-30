"""CRM reference data: the default sales pipeline and lost reasons (idempotent)."""

import logging

from django.db import transaction

from apps.crm.models import LostReason, Pipeline, PipelineStage

logger = logging.getLogger("stohill.seeds")

# (name, stage_type, probability %)
DEFAULT_STAGES = [
    ("New", "initial", 10),
    ("Qualified", "qualified", 30),
    ("Proposition", "offer", 60),
    ("Negotiation", "negotiation", 80),
    ("Won", "won", 100),
    ("Lost", "lost", 0),
]

LOST_REASONS = ["Competition", "Price", "No Budget", "Not Suitable", "Changed Mind", "Bought Elsewhere", "Timing", "Other"]


@transaction.atomic
def seed_crm_defaults() -> None:
    pipeline, _ = Pipeline.objects.get_or_create(
        name="Sales Pipeline", defaults={"pipeline_type": "sale", "is_default": True}
    )
    if not pipeline.stages.exists():
        for position, (name, stage_type, probability) in enumerate(DEFAULT_STAGES):
            PipelineStage.objects.get_or_create(
                pipeline=pipeline,
                name=name,
                defaults={
                    "stage_type": stage_type,
                    "position": position,
                    "probability": probability,
                    "is_terminal": stage_type in ("won", "lost"),
                    "is_won": stage_type == "won",
                },
            )
        logger.info("Created %d stages for %s", len(DEFAULT_STAGES), pipeline.name)

    for reason in LOST_REASONS:
        LostReason.objects.get_or_create(name=reason)
