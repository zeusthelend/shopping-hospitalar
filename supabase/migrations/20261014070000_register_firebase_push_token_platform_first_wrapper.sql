CREATE OR REPLACE FUNCTION public.register_firebase_push_token_from_platform(
  _platform text,
  _token text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  PERFORM public.register_firebase_push_token(_token, _platform);
END;
$function$;

REVOKE ALL ON FUNCTION public.register_firebase_push_token_from_platform(text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_firebase_push_token_from_platform(text, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
