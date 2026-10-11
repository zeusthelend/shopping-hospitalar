-- Restrict group administration and add per-user message favorites.
CREATE OR REPLACE FUNCTION public.can_manage_chat_groups(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _user_id
      AND p.active
      AND p.approved
      AND (
        EXISTS (
          SELECT 1
          FROM public.user_roles ur
          WHERE ur.user_id = _user_id
            AND ur.role IN ('admin', 'gerente')
        )
        OR EXISTS (
          SELECT 1
          FROM public.positions po
          WHERE po.id = p.position_id
            AND lower(trim(po.name)) IN (
              'administrador',
              'gerente',
              'gerência',
              'encarregado de estoque',
              'encarregado'
            )
        )
      )
  )
$$;
REVOKE ALL ON FUNCTION public.can_manage_chat_groups(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_chat_groups(uuid) TO authenticated;

-- Replace the old group-admin-only rules so being a group creator alone
-- does not grant permission to administer other members or group metadata.
-- Remove both the original names and the replacement names introduced by
-- 0005_chat_presence_policy.sql. RLS permissive policies are OR-combined.
DROP POLICY IF EXISTS "admins update chat conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "approved admins update chat conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "admins delete chat conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "approved admins delete chat conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "admins add chat participants" ON public.chat_participants;
DROP POLICY IF EXISTS "approved admins add chat participants" ON public.chat_participants;
DROP POLICY IF EXISTS "admins remove chat participants" ON public.chat_participants;
DROP POLICY IF EXISTS "approved members remove chat participants" ON public.chat_participants;
DROP POLICY IF EXISTS "members leave own chat" ON public.chat_participants;
DROP POLICY IF EXISTS "authorized staff update group conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "authorized staff delete group conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "authorized staff add group participants" ON public.chat_participants;
DROP POLICY IF EXISTS "authorized staff remove group participants" ON public.chat_participants;

CREATE POLICY "authorized staff update group conversations"
  ON public.chat_conversations FOR UPDATE TO authenticated
  USING (
    kind = 'group'
    AND public.is_chat_member(id, auth.uid())
    AND public.can_manage_chat_groups(auth.uid())
  )
  WITH CHECK (
    kind = 'group'
    AND public.is_chat_member(id, auth.uid())
    AND public.can_manage_chat_groups(auth.uid())
  );

CREATE POLICY "authorized staff delete group conversations"
  ON public.chat_conversations FOR DELETE TO authenticated
  USING (
    kind = 'group'
    AND public.is_chat_member(id, auth.uid())
    AND public.can_manage_chat_groups(auth.uid())
  );

CREATE POLICY "authorized staff add group participants"
  ON public.chat_participants FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_chat_groups(auth.uid())
    AND public.is_chat_member(conversation_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = conversation_id AND c.kind = 'group'
    )
  );

-- Users may leave a conversation themselves. Removing someone else from a
-- group is limited to the designated roles above.
CREATE POLICY "members leave own chat"
  ON public.chat_participants FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "authorized staff remove group participants"
  ON public.chat_participants FOR DELETE TO authenticated
  USING (
    user_id <> auth.uid()
    AND public.can_manage_chat_groups(auth.uid())
    AND public.is_chat_member(conversation_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = conversation_id AND c.kind = 'group'
    )
  );

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
  IF auth.uid() IS NULL
    OR NOT public.is_approved_user()
    OR NOT public.can_manage_chat_groups(auth.uid())
    OR NOT public.is_chat_member(_conversation_id, auth.uid()) THEN
    RAISE EXCEPTION 'Apenas Administrador, Gerência ou Encarregado pode adicionar pessoas ao grupo';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.chat_conversations
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

CREATE TABLE public.chat_message_favorites (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);
GRANT SELECT, INSERT, DELETE ON public.chat_message_favorites TO authenticated;
GRANT ALL ON public.chat_message_favorites TO service_role;
ALTER TABLE public.chat_message_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approved users only message favorites"
  ON public.chat_message_favorites AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_approved_user())
  WITH CHECK (public.is_approved_user());

CREATE POLICY "users read own accessible message favorites"
  ON public.chat_message_favorites FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_messages m
      WHERE m.id = message_id
        AND public.is_chat_member(m.conversation_id, auth.uid())
    )
  );

CREATE POLICY "users favorite accessible messages"
  ON public.chat_message_favorites FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_messages m
      WHERE m.id = message_id
        AND public.is_chat_member(m.conversation_id, auth.uid())
    )
  );

CREATE POLICY "users unfavorite own messages"
  ON public.chat_message_favorites FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX chat_message_favorites_user_created_idx
  ON public.chat_message_favorites (user_id, created_at DESC);
