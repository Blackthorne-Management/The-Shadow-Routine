-- ============================================================================
-- Goal slots: five required, one optional
--
--   gym        Workouts                                  300
--   refraining Refrain                                   200
--   custom_1   Reading: chapters of a nonfiction book    200  (required)
--   custom_2   Eating: sticking to your chosen diet      150  (required, yes/no)
--   custom_3   Custom                                    150
--   custom_4   Tracking custom: optional, logged only      0  (no score, band,
--              punishment, Gold Month or Ultra impact)
--
--   Point values per slot are unchanged, so a perfect week is still 1,049.
--   Existing goals keep scoring exactly as before.
-- ============================================================================

create or replace function public.category_point_max(c public.goal_category)
returns int language sql immutable as $$
  select case c
    when 'gym'        then 300
    when 'refraining' then 200
    when 'custom_1'   then 200
    when 'custom_2'   then 150
    when 'custom_3'   then 150
    else 0            -- custom_4: tracking only
  end;
$$;

-- One goal from the setup form → the stored shape, enforcing each slot's rules
create or replace function public.normalize_goal(g jsonb,
  out category public.goal_category, out theme public.goal_theme, out goal_type public.goal_type,
  out unit text, out target numeric, out prompt text)
language plpgsql immutable set search_path = public as $$
begin
  category  := (g ->> 'category')::public.goal_category;
  theme     := (g ->> 'theme')::public.goal_theme;
  goal_type := (g ->> 'goal_type')::public.goal_type;
  unit      := coalesce(nullif(trim(g ->> 'unit'), ''), 'days');
  target    := (g ->> 'target_value')::numeric;
  prompt    := nullif(trim(g ->> 'prompt'), '');

  if category = 'gym' then
    theme := 'gym'; goal_type := 'percentage'; unit := 'workouts';
    prompt := 'Did you work out for 30 minutes or more today?';
    if target not between 1 and 21 then raise exception 'BAD_WORKOUT_TARGET'; end if;
  elsif category = 'refraining' then
    theme := 'refraining'; goal_type := 'inverse'; unit := 'days';
  elsif category = 'custom_1' then                  -- Reading
    theme := 'reading'; goal_type := 'percentage'; unit := 'chapters';
    prompt := coalesce(prompt, 'How many chapters did you read today?');
    if target not between 1 and 300 then raise exception 'BAD_READING_TARGET'; end if;
  elsif category = 'custom_2' then                  -- Eating
    theme := 'nutrition'; goal_type := 'binary'; unit := 'days';
    prompt := coalesce(prompt, 'Did you stick to your diet today?');
  elsif theme in ('gym', 'refraining') or goal_type = 'inverse' then
    raise exception 'BAD_CUSTOM_GOAL';
  end if;
  if goal_type <> 'percentage' and target > 7 then raise exception 'TARGET_OVER_7_DAYS'; end if;
  if target is null or target <= 0 then raise exception 'BAD_TARGET'; end if;
end $$;

-- Five required slots, plus the optional tracking one
create or replace function public.check_goal_set(p_goals jsonb)
returns void language plpgsql immutable set search_path = public as $$
declare v_cats text[];
begin
  select array_agg(x ->> 'category') into v_cats from jsonb_array_elements(p_goals) x;
  if cardinality(v_cats) not in (5, 6)
     or (select count(distinct c) from unnest(v_cats) c) <> cardinality(v_cats)
     or not (v_cats @> array['gym', 'refraining', 'custom_1', 'custom_2', 'custom_3'])
     or not (v_cats <@ array['gym', 'refraining', 'custom_1', 'custom_2', 'custom_3', 'custom_4']) then
    raise exception 'NEED_FIVE_GOALS';
  end if;
end $$;

create or replace function public.submit_goals(p_goals jsonb, p_consequences jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  g     jsonb;
  n     record;
begin
  if not exists (select 1 from public.profiles
                 where id = v_uid and status = 'pending_approval' and role = 'participant') then
    raise exception 'GOALS_LOCKED';
  end if;
  perform public.check_goal_set(p_goals);
  if coalesce(trim(p_consequences ->> 'ultra_punishment'), '') = ''
     or coalesce(trim(p_consequences ->> 'ultra_wish'), '') = '' then
    raise exception 'NEED_CONSEQUENCES';
  end if;

  delete from public.goals where user_id = v_uid;

  for g in select * from jsonb_array_elements(p_goals) loop
    select * into n from public.normalize_goal(g);
    -- Scored goals need their punishment and rewards; the tracking goal doesn't
    if public.category_point_max(n.category) > 0
       and (coalesce(trim(g ->> 'red_week_punishment'), '') = ''
            or coalesce(trim(g ->> 'gold_reward'), '') = ''
            or coalesce(trim(g ->> 'three_gold_reward'), '') = '') then
      raise exception 'NEED_CONSEQUENCES';
    end if;
    insert into public.goals (user_id, category, theme, goal_type, label, prompt, target_value, unit,
                              category_point_max, red_week_punishment, gold_reward, three_gold_reward)
    values (v_uid, n.category, n.theme, n.goal_type, trim(g ->> 'label'), coalesce(n.prompt, ''),
            n.target, n.unit, public.category_point_max(n.category),
            nullif(trim(g ->> 'red_week_punishment'), ''), nullif(trim(g ->> 'gold_reward'), ''),
            nullif(trim(g ->> 'three_gold_reward'), ''));
  end loop;

  insert into public.consequences (user_id, ultra_punishment, ultra_wish)
  values (v_uid, trim(p_consequences ->> 'ultra_punishment'), trim(p_consequences ->> 'ultra_wish'))
  on conflict (user_id) do update set
    ultra_punishment = excluded.ultra_punishment, ultra_wish = excluded.ultra_wish, updated_at = now();
end $$;

-- Mentors who check in: same slots, saved in place (history kept); dropping the
-- tracking goal removes it
create or replace function public.mentor_save_goals(p_goals jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  g     jsonb;
  n     record;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  perform public.check_goal_set(p_goals);
  for g in select * from jsonb_array_elements(p_goals) loop
    select * into n from public.normalize_goal(g);
    insert into public.goals (user_id, category, theme, goal_type, label, prompt, target_value, unit,
                              category_point_max, status, approved_by, approved_at)
    values (v_uid, n.category, n.theme, n.goal_type, trim(g ->> 'label'), coalesce(n.prompt, ''),
            n.target, n.unit, public.category_point_max(n.category), 'approved', v_uid, now())
    on conflict (user_id, category) do update set
      theme = excluded.theme, goal_type = excluded.goal_type, label = excluded.label, prompt = excluded.prompt,
      target_value = excluded.target_value, unit = excluded.unit, status = 'approved';
  end loop;
  delete from public.goals
   where user_id = v_uid and category = 'custom_4'
     and not exists (select 1 from jsonb_array_elements(p_goals) x where x ->> 'category' = 'custom_4');
  perform public.compute_week(public.week_start(public.local_today(v_uid)));
end $$;

-- Scoring, month results and approval only look at scored goals
do $$
declare
  r   record;
  def text;
begin
  for r in select * from (values
    ('public.compute_week(date)',
       'where g.status = ''approved''',
       'where g.status = ''approved'' and g.category_point_max > 0'),
    ('public.month_goal_stats(uuid,integer)',
       'where gl.user_id = p_user and gl.status = ''approved''',
       'where gl.user_id = p_user and gl.status = ''approved'' and gl.category_point_max > 0'),
    ('public.approve_goals(uuid,jsonb,jsonb)',
       'where user_id = p_user and status = ''approved'') <> 5',
       'where user_id = p_user and status = ''approved'' and category_point_max > 0) <> 5'),
    -- Reading and Eating keep their fixed kind, like workouts and refraining
    ('public.approve_goals(uuid,jsonb,jsonb)',
       'goal_type           = case when category in (''gym'', ''refraining'') then goal_type',
       'goal_type           = case when category in (''gym'', ''refraining'', ''custom_1'', ''custom_2'') then goal_type'),
    ('public.approve_goals(uuid,jsonb,jsonb)',
       'theme               = case when category in (''gym'', ''refraining'') then theme',
       'theme               = case when category in (''gym'', ''refraining'', ''custom_1'', ''custom_2'') then theme')
  ) as v(fn, find, repl) loop
    def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.find in def) = 0 then raise exception 'pattern not found in %: %', r.fn, r.find; end if;
    execute replace(def, r.find, r.repl);
  end loop;
end $$;

revoke execute on function public.normalize_goal(jsonb)   from public, anon, authenticated;
revoke execute on function public.check_goal_set(jsonb)   from public, anon, authenticated;
