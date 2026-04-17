CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA public;

-- plpgsql is never inlined by the optimizer, which avoids the
-- "function unaccent(text) does not exist during inlining" error
-- that occurs with LANGUAGE sql IMMUTABLE functions.
CREATE OR REPLACE FUNCTION public.unaccent_immutable(text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
BEGIN
  RETURN public.unaccent($1);
END;
$$;
