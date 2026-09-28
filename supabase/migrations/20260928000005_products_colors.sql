-- Shared catalog: mixed-color packs keep their pack name and color breakdown
-- (e.g. 25 colors x 3 sheets), so the next crafter's scan fills in every color.
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
       where key in ('name', 'setName', 'category', 'subtype', 'brand', 'color', 'finish', 'dimensions', 'unit', 'adhesive')
         and jsonb_typeof(value) = 'string'
         and btrim(value #>> '{}') <> ''
      union all
      -- packSize: a whole number of units per pack, 1 to 100000.
      select key, to_jsonb((value #>> '{}')::numeric)
        from jsonb_each(d)
       where key = 'packSize'
         and jsonb_typeof(value) = 'number'
         and (value #>> '{}')::numeric between 1 and 100000
      union all
      -- colors: [{color, count}], at most 100, each with a name and a count of 1 to 10000.
      select 'colors', cleaned_colors
        from (
          select jsonb_agg(jsonb_build_object('color', left(btrim(c ->> 'color'), 60), 'count', (c ->> 'count')::numeric) order by ord) as cleaned_colors
            from jsonb_array_elements(case when jsonb_typeof(d -> 'colors') = 'array' then d -> 'colors' else '[]'::jsonb end)
                 with ordinality as t(c, ord)
           where ord <= 100
             and jsonb_typeof(c) = 'object'
             and jsonb_typeof(c -> 'color') = 'string'
             and btrim(c ->> 'color') <> ''
             and jsonb_typeof(c -> 'count') = 'number'
             and (c ->> 'count')::numeric between 1 and 10000
        ) x
       where cleaned_colors is not null
    ) cleaned;
$$;
