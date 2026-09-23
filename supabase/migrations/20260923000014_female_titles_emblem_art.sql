-- ============================================================================
-- Updated female path titles (levels 3–7) and the first emblem art.
--
-- Emblem art is served from public/emblems/ (cut from the source art in
-- /Emblems by scripts/cut-emblems.mjs). Levels 1–2 are shared, so their art
-- is set on both paths. Female levels 3–9 and The Eclipse keep the
-- placeholder until their art is added.
-- ============================================================================

update public.emblems e set title = v.title
  from (values (3, 'Shadow Oracle'), (4, 'Shadow Huntress'), (5, 'Shadow Warrior'),
               (6, 'Shadow Valkyrie'), (7, 'Shadow Assassin')) as v(rank_level, title)
 where e.path = 'female' and e.rank_level = v.rank_level;

update public.emblems e set image_url = '/emblems/' || v.file || '.webp'
  from (values (1, 'initiate'), (2, 'apprentice'), (3, 'ronin'), (4, 'blade'), (5, 'berserker'),
               (6, 'marshal'), (7, 'warlord'), (8, 'regent'), (9, 'king')) as v(rank_level, file)
 where e.rank_level = v.rank_level
   and (e.path = 'male' or (e.path = 'female' and e.rank_level <= 2));
