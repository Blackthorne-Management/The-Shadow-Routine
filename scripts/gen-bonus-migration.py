# Builds the bonus-challenge seed block from supabase/seed/bonus_challenges.tsv.
# Used once to write migration 21; kept so the library can be regenerated.
import sys
rows = [l.rstrip('\n').split('\t') for l in open('supabase/seed/bonus_challenges.tsv', encoding='utf8').read().strip().split('\n')[1:]]
q = lambda s: "'" + s.replace("'", "''") + "'"
vals = ',\n'.join(f"  ({q(c)}, {q(d)}, {q(p)}, {i + 1})" for i, (c, d, p) in enumerate(rows))
sys.stdout.write(f"insert into public.bonus_presets (category, description, photo_hint, sort_order) values\n{vals};\n")
