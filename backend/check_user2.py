import sqlite3
import pprint

conn = sqlite3.connect('db.sqlite3')
conn.row_factory = sqlite3.Row
c = conn.cursor()

c.execute("SELECT id, email, first_name, last_name FROM core_users WHERE first_name LIKE '%tino%' OR email LIKE '%tino%'")
users = c.fetchall()

print("Users found:")
for u in users:
    print(dict(u))
    # get roles
    c.execute("""
        SELECT r.name, r.role_type, m.code 
        from core_roles r
        JOIN core_users_roles ur ON ur.role_id = r.id
        LEFT JOIN core_roles_modules rm ON rm.role_id = r.id
        LEFT JOIN core_modules m ON m.id = rm.module_id
        WHERE ur.user_id = ?
    """, (u['id'],))
    roles = c.fetchall()
    role_modules = {}
    for r in roles:
        role_type = r['role_type']
        if role_type not in role_modules:
             role_modules[role_type] = []
        if r['code']:
             role_modules[role_type].append(r['code'])
    print("Roles and Modules:", role_modules)

conn.close()
