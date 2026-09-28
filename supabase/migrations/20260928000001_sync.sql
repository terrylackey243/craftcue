-- CraftCue sync: one table holds every synced record, owned by one user.
--
-- The app is offline-first: each device keeps its own IndexedDB copy and exchanges changes
-- through this table. Rows are opaque JSON documents (the client's data model is the source of
-- truth); the server only enforces ownership, ordering and last-edit-wins.

create table public.records (
  user_id           uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  collection        text        not null,
  id                text        not null,
  data              jsonb,                       -- null once deleted
  deleted           boolean     not null default false,
  client_updated_at timestamptz not null,       -- when the edit was made (clamped to server time)
  version           bigint      not null,       -- per-user change order, assigned by sync_push
  server_updated_at timestamptz not null default now(),
  primary key (user_id, collection, id),
  constraint records_collection_ok check (collection in (
    'supplies', 'categories', 'setup', 'upcCache', 'people', 'projects', 'usage', 'shoppingChecks'
  )),
  constraint records_id_ok check (char_length(id) between 1 and 200),
  constraint records_data_ok check (deleted or data is not null),
  constraint records_size_ok check (pg_column_size(data) < 200000)
);

create index records_user_version on public.records (user_id, version);

alter table public.records enable row level security;

-- Owners can read their own rows. Writes only go through sync_push (no insert/update/delete
-- policies), so versions and conflict rules can't be bypassed.
create policy "read own records" on public.records
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.records from anon;
grant select on public.records to authenticated;

create sequence public.records_version_seq;

-- Push a batch of changes. Each change: {collection, id, data, deleted, updatedAt}.
-- Last edit wins by client edit time; edits "from the future" are clamped to now so a device
-- with a wrong clock can't win forever. Returns {applied, skipped, version}.
create or replace function public.sync_push(changes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  c jsonb;
  edit_time timestamptz;
  existing timestamptz;
  applied int := 0;
  skipped int := 0;
  v bigint;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes) > 500 then
    raise exception 'changes must be an array of at most 500 items' using errcode = '22023';
  end if;

  -- Serialise each user's pushes so version order matches commit order; otherwise a device
  -- pulling "everything after version N" could skip a row committed late with a lower version.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 42));

  for c in select * from jsonb_array_elements(changes) loop
    edit_time := least(coalesce((c ->> 'updatedAt')::timestamptz, now()), now());
    select r.client_updated_at into existing
      from public.records r
     where r.user_id = uid and r.collection = c ->> 'collection' and r.id = c ->> 'id';

    if existing is not null and existing > edit_time then
      skipped := skipped + 1;
      continue;
    end if;

    v := nextval('public.records_version_seq');
    insert into public.records as r (user_id, collection, id, data, deleted, client_updated_at, version, server_updated_at)
    values (
      uid,
      c ->> 'collection',
      c ->> 'id',
      case when coalesce((c ->> 'deleted')::boolean, false) then null else c -> 'data' end,
      coalesce((c ->> 'deleted')::boolean, false),
      edit_time,
      v,
      now()
    )
    on conflict (user_id, collection, id) do update
      set data = excluded.data,
          deleted = excluded.deleted,
          client_updated_at = excluded.client_updated_at,
          version = excluded.version,
          server_updated_at = excluded.server_updated_at;
    applied := applied + 1;
  end loop;

  return jsonb_build_object('applied', applied, 'skipped', skipped, 'version', coalesce(v, 0));
end;
$$;

revoke all on function public.sync_push(jsonb) from public, anon;
grant execute on function public.sync_push(jsonb) to authenticated;


-- ---------------------------------------------------------------------------
-- Photos: private bucket, one folder per user (<user id>/...).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "read own photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "add own photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "replace own photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "delete own photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);


-- ---------------------------------------------------------------------------
-- Account deletion: removes the user; records and catalog submissions cascade.
-- The client deletes the user's photos through the Storage API first.
-- ---------------------------------------------------------------------------

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
