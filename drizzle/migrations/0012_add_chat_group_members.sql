CREATE OR REPLACE FUNCTION public.add_chat_participants(
  _conversation_id uuid,
  _members uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _member_ids uuid[];
  _added integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_approved_user()
    OR NOT public.is_chat_admin(_conversation_id, auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores aprovados do grupo podem adicionar pessoas';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.chat_conversations
    WHERE id = _conversation_id AND kind = 'group'
  ) THEN
    RAISE EXCEPTION 'O grupo não foi encontrado';
  END IF;

  SELECT array_agg(DISTINCT member_id)
  INTO _member_ids
  FROM unnest(COALESCE(_members, '{}'::uuid[])) AS requested(member_id)
  WHERE member_id <> auth.uid();

  IF COALESCE(cardinality(_member_ids), 0) = 0 THEN
    RAISE EXCEPTION 'Selecione pelo menos uma pessoa';
  END IF;

  IF cardinality(_member_ids) > 100 THEN
    RAISE EXCEPTION 'É possível adicionar até 100 pessoas por vez';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(_member_ids) AS requested(member_id)
    LEFT JOIN public.profiles p ON p.id = requested.member_id
    LEFT JOIN public.chat_participants cp
      ON cp.conversation_id = _conversation_id
      AND cp.user_id = requested.member_id
    WHERE cp.user_id IS NULL
      AND (p.id IS NULL OR NOT p.active OR NOT p.approved)
  ) THEN
    RAISE EXCEPTION 'Só é possível adicionar funcionários ativos e aprovados';
  END IF;

  INSERT INTO public.chat_participants (conversation_id, user_id)
  SELECT _conversation_id, requested.member_id
  FROM unnest(_member_ids) AS requested(member_id)
  JOIN public.profiles p
    ON p.id = requested.member_id
    AND p.active
    AND p.approved
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  GET DIAGNOSTICS _added = ROW_COUNT;
  RETURN _added;
END;
$$;

REVOKE ALL ON FUNCTION public.add_chat_participants(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_chat_participants(uuid, uuid[]) TO authenticated;
