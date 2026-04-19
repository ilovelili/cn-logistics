/*
  # Shipment Document Storage

  Creates a public Supabase Storage bucket for uploaded shipment documents.
  The shipment_documents table stores metadata, approval state, and the storage
  path/public URL for each file.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('shipment-documents', 'shipment-documents', true, 52428800)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Anyone can read shipment documents'
  ) THEN
    CREATE POLICY "Anyone can read shipment documents"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'shipment-documents');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Anon can upload shipment documents in demo'
  ) THEN
    CREATE POLICY "Anon can upload shipment documents in demo"
      ON storage.objects FOR INSERT
      TO anon
      WITH CHECK (bucket_id = 'shipment-documents');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Anon can update shipment documents in demo'
  ) THEN
    CREATE POLICY "Anon can update shipment documents in demo"
      ON storage.objects FOR UPDATE
      TO anon
      USING (bucket_id = 'shipment-documents')
      WITH CHECK (bucket_id = 'shipment-documents');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Anon can delete shipment documents in demo'
  ) THEN
    CREATE POLICY "Anon can delete shipment documents in demo"
      ON storage.objects FOR DELETE
      TO anon
      USING (bucket_id = 'shipment-documents');
  END IF;
END $$;
