DELETE FROM public.media_library_assets a
WHERE NOT EXISTS (
  SELECT 1 FROM storage.objects o
  WHERE o.bucket_id = 'unit-photos' AND o.name = a.storage_path
);