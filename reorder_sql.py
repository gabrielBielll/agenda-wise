
import re

input_file = 'backups/cockroach_ready_inserts.sql'
output_file = 'backups/cockroach_final_migration.sql'

# Dependency Order
table_order = [
    'clinicas',
    'papeis',
    'permissoes',
    'papel_permissoes',
    'usuarios',
    'pacientes',
    'agendamentos',
    'bloqueios_agenda',
    'prontuarios'
]

with open(input_file, 'r') as f:
    content = f.read()

# Separate parts
# 1. CREATE TABLE statements (and other DDL before inserts)
# 2. INSERT statements
# 3. ALTER TABLE (Constraints)

# Regex to find INSERT blocks
inserts = {}
for table in table_order:
    inserts[table] = []

lines = content.split('\n')
creates = []
alters = []
current_inserts = []

for line in lines:
    if line.startswith('INSERT INTO'):
        # Extract table name
        match = re.search(r'INSERT INTO ([a-z_]+)', line)
        if match:
            table_name = match.group(1)
            if table_name in inserts:
                inserts[table_name].append(line)
            else:
                # Fallback for unknown tables
                creates.append(line) 
    elif line.startswith('ALTER TABLE') or line.startswith('    ADD CONSTRAINT'):
        alters.append(line)
    else:
        creates.append(line)

# Reconstruct file
final_output = []

# Add schema creation (and comments/spacing)
final_output.extend(creates)

# Add Ordered Inserts
final_output.append("\n-- DATA LOAD (ORDERED BY DEPENDENCY) --\n")
for table in table_order:
    if inserts[table]:
        final_output.append(f"\n-- Data for: {table}")
        final_output.extend(inserts[table])

# Add Constraints at the end
final_output.append("\n-- CONSTRAINTS (FKs) --\n")
final_output.extend(alters)

with open(output_file, 'w') as f:
    f.write('\n'.join(final_output))

print(f"File reordered: {output_file}")
