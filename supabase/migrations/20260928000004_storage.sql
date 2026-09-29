-- CheckMyFlat — stockage des médias et des rapports
-- Buckets privés, chemins `{request_id}/…`. Lecture par URL signée pour les
-- parties autorisées ; écriture uniquement par le serveur (URL d'upload
-- signée après contrôle du quota).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'report-media',
    'report-media',
    false,
    209715200,
    array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']
  ),
  ('report-pdf', 'report-pdf', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

create or replace function public.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

grant execute on function public.try_uuid(text) to authenticated;

create policy report_files_read on storage.objects for select to authenticated
  using (
    bucket_id in ('report-media', 'report-pdf')
    and public.can_read_report(public.try_uuid((storage.foldername(name))[1]))
  );
