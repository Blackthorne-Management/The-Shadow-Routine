-- ============================================================================
-- Admin invite links: an 'admin' code signs someone up as an Admin (staff with
-- is_super_admin), active immediately. Only Admins can create them (the
-- invite policies already limit non-participant codes to Admins).
-- ============================================================================
alter table public.invite_codes drop constraint invite_codes_role_check;
alter table public.invite_codes add constraint invite_codes_role_check
  check (role in ('participant', 'mentor', 'admin'));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_code     text := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  v_username text := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  v_display  text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), v_username);
  v_tz       text := coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'UTC');
  v_sex      text := nullif(new.raw_user_meta_data ->> 'sex', '');
  v_invite   public.invite_codes;
begin
  select * into v_invite from public.invite_codes
   where code = v_code and status = 'unused'
   for update;
  if v_invite.id is null then
    raise exception 'INVALID_INVITE_CODE';
  end if;
  if not public.valid_timezone(v_tz) then v_tz := 'UTC'; end if;
  if v_sex not in ('male', 'female') then v_sex := null; end if;

  if v_invite.role in ('mentor', 'admin') then
    insert into public.profiles (id, email, username, display_name, invite_code_used, timezone, sex,
                                 role, status, activated_at, is_super_admin)
    values (new.id, new.email, v_username, v_display, v_code, v_tz, v_sex, 'admin', 'active', now(),
            v_invite.role = 'admin');
  else
    insert into public.profiles (id, email, username, display_name, invite_code_used, timezone, sex)
    values (new.id, new.email, v_username, v_display, v_code, v_tz, v_sex);
  end if;

  update public.invite_codes
     set status = 'used', used_by = new.id, used_at = now()
   where id = v_invite.id;
  return new;
end $$;
