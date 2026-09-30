from django.db import migrations, models


def tax_books_are_memo_books(apps, schema_editor):
    AssetBook = apps.get_model('fixed_assets', 'AssetBook')
    AssetBook.objects.filter(book_type__icontains='tax').update(posts_to_gl=False)


class Migration(migrations.Migration):

    dependencies = [
        ('fixed_assets', '0003_fixedasset_currency'),
    ]

    operations = [
        migrations.AddField(
            model_name='assetbook',
            name='posts_to_gl',
            field=models.BooleanField(default=True),
        ),
        migrations.RunPython(tax_books_are_memo_books, migrations.RunPython.noop),
    ]
