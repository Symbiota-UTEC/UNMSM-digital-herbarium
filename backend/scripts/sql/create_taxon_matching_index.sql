-- Run against an existing PostgreSQL database outside a transaction.
-- New tables receive this index through the ORM metadata.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_taxon_scientific_name_lower
    ON public.taxon (lower(scientific_name));
