-- Artwork from the optional image add-ons (sticker art) syncs like other records; its picture
-- goes to the photos bucket (the record keeps only the storage path).
alter table public.records drop constraint records_collection_ok;
alter table public.records add constraint records_collection_ok check (collection in (
  'supplies', 'categories', 'setup', 'upcCache', 'people', 'projects', 'usage', 'shoppingChecks', 'artwork'
));
