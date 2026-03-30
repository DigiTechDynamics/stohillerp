import os
import django

# Setup django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.crm.models import Pipeline, PipelineStage, LostReason

def seed():
    # 1. Pipeline
    p, created = Pipeline.objects.get_or_create(
        name='Sales Pipeline', 
        defaults={'pipeline_type': 'sale', 'is_default': True}
    )
    
    # 2. Stages
    stages = [
        ('New', 'initial', 10),
        ('Qualified', 'qualified', 30),
        ('Proposition', 'offer', 60),
        ('Negotiation', 'negotiation', 80),
        ('Won', 'won', 100),
        ('Lost', 'lost', 0)
    ]
    
    if not p.stages.exists():
        for i, (name, stype, prob) in enumerate(stages):
            PipelineStage.objects.get_or_create(
                pipeline=p, 
                name=name, 
                defaults={'stage_type': stype, 'position': i, 'probability': prob, 'is_terminal': stype in ['won', 'lost'], 'is_won': stype == 'won'}
            )
        print(f"Created {len(stages)} stages for {p.name}")
    else:
        print("Stages already exist.")

    # 3. Lost Reasons
    reasons = ['Competition', 'Price', 'No Budget', 'Not Suitable', 'Changed Mind', 'Bought Elsewhere', 'Timing', 'Other']
    for r in reasons:
        LostReason.objects.get_or_create(name=r)
    print(f"Seeded {len(reasons)} lost reasons.")

if __name__ == "__main__":
    seed()
