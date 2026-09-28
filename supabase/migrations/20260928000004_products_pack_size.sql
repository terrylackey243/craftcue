-- Shared catalog: keep the pack size ("80 in a pack") as part of a product's description.
-- It's a fact about the product, like its size or brand; the price paid is never shared.
create or replace function public.product_clean(d jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(key, val), '{}'::jsonb)
    from (
      select key, to_jsonb(left(btrim(value #>> '{}'), 120)) as val
        from jsonb_each(d)
       where key in ('name', 'category', 'subtype', 'brand', 'color', 'finish', 'dimensions', 'unit', 'adhesive')
         and jsonb_typeof(value) = 'string'
         and btrim(value #>> '{}') <> ''
      union all
      -- packSize: a whole number of units per pack, 1 to 100000.
      select key, to_jsonb((value #>> '{}')::numeric)
        from jsonb_each(d)
       where key = 'packSize'
         and jsonb_typeof(value) = 'number'
         and (value #>> '{}')::numeric between 1 and 100000
    ) cleaned;
$$;
