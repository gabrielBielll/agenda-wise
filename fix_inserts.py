
import re

input_file = 'backups/cockroach_ready_inserts.sql'
output_file = 'backups/cockroach_fixed_final.sql'

with open(input_file, 'r') as f:
    content = f.read()

# 1. Replace literal newlines inside values with standard spaces
# This regex looks for patterns like: 'text\ntext' and replaces \n with space
# But a simpler way for SQL dumps is to join lines that don't start with recognized commands

lines = content.split('\n')
fixed_lines = []
buffer = ""

for line in lines:
    stripped = line.strip()
    if not stripped:
        continue
    
    # Check if line starts with a valid SQL command start
    if stripped.startswith('INSERT INTO') or stripped.startswith('CREATE TABLE') or \
       stripped.startswith('ALTER TABLE') or stripped.startswith('DROP TABLE') or \
       stripped.startswith('(') or stripped.startswith(')'):
        
        if buffer:
            fixed_lines.append(buffer)
            buffer = ""
        fixed_lines.append(line)
    else:
        # It's likely a continuation of a previous line (broken string)
        if fixed_lines:
            last_line = fixed_lines.pop()
            # Append this line to the previous one, replacing newline with space
            # but keep the quote if it was split
            fixed_lines.append(last_line + " " + line)
        else:
            fixed_lines.append(line)

# Join everything
full_script = '\n'.join(fixed_lines)

# 2. Add DROP TABLE commands at the TOP
header = """
DROP TABLE IF EXISTS agendamentos CASCADE;
DROP TABLE IF EXISTS bloqueios_agenda CASCADE;
DROP TABLE IF EXISTS papel_permissoes CASCADE;
DROP TABLE IF EXISTS prontuarios CASCADE;
DROP TABLE IF EXISTS pacientes CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;
DROP TABLE IF EXISTS permissoes CASCADE;
DROP TABLE IF EXISTS papeis CASCADE;
DROP TABLE IF EXISTS clinicas CASCADE;

"""

final_content = header + full_script

# 3. Reorder Logic (Incorporating the previous reorder script logic but safer)
# We need to make sure INSERTS are in correct dependency order
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

# Split again by statement to reorder
statements = final_content.split(';')
inserts_map = {t: [] for t in table_order}
others = []

for stmt in statements:
    stmt = stmt.strip()
    if not stmt: continue
    
    if stmt.upper().startswith('INSERT INTO'):
        found = False
        for table in table_order:
            if f"INSERT INTO {table}" in stmt:
                inserts_map[table].append(stmt + ';')
                found = True
                break
        if not found:
            others.append(stmt + ';')
    else:
        # Keep CREATE/DROP/ALTER as is (but we need to separate CREATE from ALTER if possible)
        # For simplicity, we assume CREATEs are already at the top or we filter them
        others.append(stmt + ';')

# Re-assemble: DROPS -> CREATES -> INSERTS (Ordered) -> ALTERS
# Since 'others' contains drops, creates and alters mixed, we need to defer ALTERS
creates_drops = []
alters = []

for stmt in others:
    if stmt.upper().startswith('ALTER TABLE'):
        alters.append(stmt)
    else:
        creates_drops.append(stmt)

final_ordered_script = '\n'.join(creates_drops) + '\n\n'

for table in table_order:
    if inserts_map[table]:
        final_ordered_script += f"\n-- Inserts for {table}\n"
        final_ordered_script += '\n'.join(inserts_map[table])

final_ordered_script += '\n\n' + '\n'.join(alters)

with open(output_file, 'w') as f:
    f.write(final_ordered_script)

print(f"Fixed SQL generated at: {output_file}")
