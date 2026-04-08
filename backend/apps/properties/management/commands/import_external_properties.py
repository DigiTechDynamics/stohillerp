import csv
import uuid
import traceback
from decimal import Decimal, InvalidOperation
from django.core.management.base import BaseCommand
from django.utils.text import slugify
from django.db import transaction
from django.db.models.signals import post_save
from apps.properties.models import Property, PropertyType
from apps.hr.models import Employee

class Command(BaseCommand):
    help = 'Import properties from a CSV file'

    def add_arguments(self, parser):
        parser.add_argument('csv_file', type=str, help='Path to the CSV file')

    def handle(self, *args, **options):
        csv_file_path = options['csv_file']
        
        # Disconnect signals to avoid syncing during bulk import
        from apps.integrations.signals import on_property_saved
        post_save.disconnect(on_property_saved, sender=Property)
        
        def safe_decimal(val, default=Decimal('0')):
            if not val:
                return default
            try:
                # Remove currency symbols and commas
                clean_val = str(val).replace('$', '').replace(',', '').replace('USD', '').strip()
                return Decimal(clean_val)
            except (InvalidOperation, ValueError, TypeError):
                return default

        def safe_int(val, default=0):
            if not val:
                return default
            try:
                # Handle cases like "2.0" or " 5 "
                return int(float(str(val).strip()))
            except (ValueError, TypeError):
                return default

        type_map = {
            'land': ('VAC', 'Vacant Land'),
            'houses': ('RES', 'Residential House'),
            'apartments': ('FLA', 'Apartment/Flat'),
            'commercial': ('COM', 'Commercial'),
            'stands': ('VAC', 'Vacant Land'),
        }
        
        def get_p_type(csv_type):
            csv_type = (csv_type or 'houses').lower()
            code, name = type_map.get(csv_type, ('RES', 'Residential House'))
            pt, _ = PropertyType.objects.get_or_create(code=code, defaults={'name': name})
            return pt

        default_agent = Employee.objects.first()

        count = 0
        with open(csv_file_path, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    with transaction.atomic():
                        external_id = row.get('id')
                        if not external_id:
                            continue

                        p_type = get_p_type(row.get('property_type'))
                        category = row.get('category', 'for-sale')
                        
                        status = Property.PropertyStatus.AVAILABLE
                        raw_status = row.get('status', '').lower()
                        if raw_status == 'approved':
                            if category == 'for-sale':
                                status = Property.PropertyStatus.LISTED_FOR_SALE
                            elif category == 'for-rent':
                                status = Property.PropertyStatus.LISTED_FOR_RENT
                        elif raw_status == 'pending':
                            status = Property.PropertyStatus.AVAILABLE
                        else:
                            status = Property.PropertyStatus.INACTIVE

                        location_raw = row.get('location', '')
                        city = location_raw
                        suburb = ""
                        if ',' in location_raw:
                            parts = [p.strip() for p in location_raw.split(',')]
                            suburb = parts[0]
                            city = parts[1] if len(parts) > 1 else suburb

                        prop, created = Property.objects.update_or_create(
                            external_id=uuid.UUID(external_id),
                            defaults={
                                'name': row.get('title', 'Untitled Property')[:200],
                                'reference_number': row.get('ref_code') or f'EXT-{external_id[:8]}',
                                'property_type': p_type,
                                'status': status,
                                'asking_price': safe_decimal(row.get('price')),
                                'website_category': category,
                                'slug': row.get('slug') or slugify(row.get('title', 'property')),
                                'address_line1': location_raw,
                                'city': city[:100],
                                'suburb': suburb[:100],
                                'description': row.get('description', ''),
                                
                                'bedrooms': safe_int(row.get('bedrooms')),
                                'bathrooms': safe_decimal(row.get('bathrooms')),
                                'erf_size': safe_decimal(row.get('size')),
                                
                                'lounges': safe_int(row.get('lounges')),
                                'boreholes': safe_int(row.get('boreholes')),
                                'pool': safe_int(row.get('pool')),
                                'parking_spaces': safe_int(row.get('parking_spaces')),
                                'storeys': safe_int(row.get('storeys', 1), default=1),
                                'dining_rooms': safe_int(row.get('dining_rooms')),
                                'carports': safe_int(row.get('carports')),
                                
                                'entertainment_area': row.get('entertainment_area') == 't',
                                'cottage': row.get('cottage') == 't',
                                'fitted_kitchen': row.get('fitted_kitchen') == 't',
                                'tiled': row.get('tiled') == 't',
                                'built_in_cupboards': row.get('built_in_cupboards') == 't',
                                'mes': row.get('mes') == 't',
                                'walled_fenced': row.get('walled_fenced') == 't',
                                'landscaped_garden': row.get('landscaped_garden') == 't',
                                
                                'cottage_beds': safe_int(row.get('cottage_beds')),
                                'cottage_bathrooms': safe_int(row.get('cottage_bathrooms')),
                                'cottage_dining': safe_int(row.get('cottage_dining')),
                                'cottage_parking': safe_int(row.get('cottage_parking')),
                                
                                'primary_agent': default_agent,
                                'features': [row.get('image_url')] if row.get('image_url') else [],
                            }
                        )
                        
                        count += 1
                        if count % 100 == 0:
                            self.stdout.write(self.style.SUCCESS(f'Processed {count} rows...'))

                except Exception as e:
                    self.stdout.write(self.style.ERROR(f'Error importing row {row.get("id")}: {str(e)}'))

        self.stdout.write(self.style.SUCCESS(f'Successfully imported {count} new properties.'))
