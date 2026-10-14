CREATE OR REPLACE FUNCTION public.register_firebase_push_token(
  _token text,
  _platform text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF _token IS NULL OR length(btrim(_token)) = 0 OR length(_token) > 4096 THEN
    RAISE EXCEPTION 'Invalid push token'
      USING ERRCODE = '22023';
  END IF;

  IF _platform IS NULL OR _platform NOT IN ('web', 'android', 'ios') THEN
    RAISE EXCEPTION 'Invalid push platform'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.firebase_push_tokens (user_id, token, platform)
  VALUES (v_user_id, _token, _platform)
  ON CONFLICT (token) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        platform = EXCLUDED.platform,
        updated_at = pg_catalog.now();
END;
$function$;

REVOKE ALL ON FUNCTION public.register_firebase_push_token(text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_firebase_push_token(text, text)
  TO authenticated;
