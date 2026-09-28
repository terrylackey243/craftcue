-- Shared barcode catalog. Anyone can look up a barcode; signed-in crafters contribute through
-- submit_product(). Only product-description fields are kept, never quantities, costs,
-- locations or photos. An entry is "confirmed" once two different people submitted the same
-- details; the version with the most supporters is the one everyone sees.

create table public.products (
  upc          text primary key check (upc ~ '^[0-9]{8,14}$'),
  data         jsonb       not null,
  fingerprint  text        not null,
  supporters   int         not null default 1,
  status       text        not null default 'unconfirmed' check (status in ('unconfirmed', 'confirmed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.product_submissions (
  upc          text        not null,
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  data         jsonb       not null,
  fingerprint  text        not null,
  submitted_at timestamptz not null default now(),
  primary key (upc, user_id)
);

alter table public.products enable row level security;
alter table public.product_submissions enable row level security;

create policy "anyone can look up products" on public.products
  for select to anon, authenticated using (true);

create policy "see own submissions" on public.product_submissions
  for select to authenticated using (user_id = (select auth.uid()));

grant select on public.products to anon, authenticated;
grant select on public.product_submissions to authenticated;

-- GTIN check digit (UPC-A, EAN-8/13, GTIN-14).
create or replace function public.gtin_valid(code text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  digits int[];
  n int;
  total int := 0;
  i int;
begin
  if code !~ '^[0-9]+$' or char_length(code) not in (8, 12, 13, 14) then
    return false;
  end if;
  n := char_length(code);
  for i in 1 .. n - 1 loop
    -- weight 3 for the digit right before the check digit, then alternating
    total := total + substr(code, n - i, 1)::int * (case when i % 2 = 1 then 3 else 1 end);
  end loop;
  return (10 - total % 10) % 10 = substr(code, n, 1)::int;
end;
$$;

-- Keep only known product fields as trimmed strings, lower-case the fingerprint.
create or replace function public.product_clean(d jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(key, left(btrim(value #>> '{}'), 120)), '{}'::jsonb)
    from jsonb_each(d)
   where key in ('name', 'category', 'subtype', 'brand', 'color', 'finish', 'dimensions', 'unit', 'adhesive')
     and jsonb_typeof(value) = 'string'
     and btrim(value #>> '{}') <> '';
$$;

create or replace function public.submit_product(p_upc text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  code text := regexp_replace(coalesce(p_upc, ''), '[^0-9]', '', 'g');
  clean jsonb;
  fp text;
  top record;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  -- EAN-13 with a leading zero is the same product as its UPC-A.
  if char_length(code) = 13 and left(code, 1) = '0' then
    code := substr(code, 2);
  end if;
  if not public.gtin_valid(code) then
    raise exception 'invalid barcode' using errcode = '22023';
  end if;
  clean := public.product_clean(p_data);
  if clean ->> 'name' is null then
    raise exception 'a product name is required' using errcode = '22023';
  end if;
  fp := md5(lower(clean::text));

  insert into public.product_submissions (upc, user_id, data, fingerprint)
  values (code, uid, clean, fp)
  on conflict (upc, user_id) do update
    set data = excluded.data, fingerprint = excluded.fingerprint, submitted_at = now();

  -- The version with the most distinct supporters wins; ties go to the earliest.
  select s.fingerprint, count(*)::int as supporters, min(s.submitted_at) as first_at,
         (array_agg(s.data order by s.submitted_at))[1] as data
    into top
    from public.product_submissions s
   where s.upc = code
   group by s.fingerprint
   order by count(*) desc, min(s.submitted_at)
   limit 1;

  insert into public.products as p (upc, data, fingerprint, supporters, status)
  values (code, top.data, top.fingerprint, top.supporters,
          case when top.supporters >= 2 then 'confirmed' else 'unconfirmed' end)
  on conflict (upc) do update
    set data = excluded.data,
        fingerprint = excluded.fingerprint,
        supporters = excluded.supporters,
        status = excluded.status,
        updated_at = now();

  return jsonb_build_object('upc', code, 'status', case when top.supporters >= 2 then 'confirmed' else 'unconfirmed' end, 'supporters', top.supporters);
end;
$$;

revoke all on function public.submit_product(text, jsonb) from public, anon;
grant execute on function public.submit_product(text, jsonb) to authenticated;
grant execute on function public.gtin_valid(text) to anon, authenticated;
