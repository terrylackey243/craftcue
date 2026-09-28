-- sync_push must run with its owner's rights: signed-in users deliberately have no direct
-- insert/update rights on records (so versions and last-edit-wins can't be bypassed). It still
-- only ever writes rows for auth.uid(), the caller.
alter function public.sync_push(jsonb) security definer;
