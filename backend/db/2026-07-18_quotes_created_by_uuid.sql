-- quotes.created_by was integer (legacy ERP numeric user id) but Nest JWT users
-- use UUID primary keys → INSERT fails:
--   invalid input syntax for type integer: "f054e58d-..."
-- Join already uses u.id::text = q.created_by::text, so text/uuid storage is correct.
-- Idempotent: cast existing ints to text when present.

ALTER TABLE quotes
  ALTER COLUMN created_by TYPE character varying(36)
  USING CASE
    WHEN created_by IS NULL THEN NULL
    ELSE created_by::text
  END;

-- quote_versions often copies same actor id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quote_versions' AND column_name = 'created_by'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE quote_versions
      ALTER COLUMN created_by TYPE character varying(36)
      USING CASE WHEN created_by IS NULL THEN NULL ELSE created_by::text END;
  END IF;
END $$;
