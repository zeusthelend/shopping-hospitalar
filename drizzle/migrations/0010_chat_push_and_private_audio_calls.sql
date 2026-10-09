ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS chat_push_enabled boolean NOT NULL DEFAULT true;
CREATE TABLE public.chat_calls (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
 caller_id uuid NOT NULL REFERENCES public.profiles(id), callee_id uuid NOT NULL REFERENCES public.profiles(id),
 status text NOT NULL DEFAULT 'ringing' CHECK(status IN ('ringing','accepted','ended','declined')),
 offer text NOT NULL CHECK(length(offer) BETWEEN 1 AND 100000), answer text CHECK(length(answer) <= 100000),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK(caller_id <> callee_id)
);
GRANT SELECT ON public.chat_calls TO authenticated;
GRANT ALL ON public.chat_calls TO service_role;
ALTER TABLE public.chat_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "call participants read" ON public.chat_calls FOR SELECT TO authenticated USING(public.is_approved_user() AND auth.uid() IN (caller_id,callee_id) AND public.is_chat_member(conversation_id,auth.uid()));
CREATE OR REPLACE FUNCTION public.start_chat_call(_conversation uuid,_callee uuid,_offer text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result uuid;
BEGIN
 IF NOT public.is_approved_user() OR NOT public.is_chat_member(_conversation,auth.uid()) OR NOT public.is_chat_member(_conversation,_callee) OR _callee=auth.uid() OR NOT EXISTS(select 1 from profiles where id=_callee and approved and active) THEN RAISE EXCEPTION 'Chamada não autorizada'; END IF;
 INSERT INTO chat_calls(conversation_id,caller_id,callee_id,offer) VALUES(_conversation,auth.uid(),_callee,_offer) RETURNING id INTO result;
 RETURN result;
END; $$;
CREATE OR REPLACE FUNCTION public.respond_chat_call(_call uuid,_action text,_answer text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.chat_calls;
BEGIN
 SELECT * INTO c FROM chat_calls WHERE id=_call FOR UPDATE;
 IF c.id IS NULL OR NOT public.is_approved_user() OR auth.uid() NOT IN(c.caller_id,c.callee_id) OR NOT public.is_chat_member(c.conversation_id,auth.uid()) THEN RAISE EXCEPTION 'Chamada não autorizada'; END IF;
 IF _action='accepted' THEN
  IF auth.uid()<>c.callee_id OR c.status<>'ringing' OR c.created_at<now()-interval '60 seconds' OR _answer IS NULL OR length(_answer)=0 THEN RAISE EXCEPTION 'Chamada expirada ou inválida'; END IF;
 ELSIF _action='declined' THEN
  IF auth.uid()<>c.callee_id OR c.status<>'ringing' THEN RAISE EXCEPTION 'Chamada inválida'; END IF;
 ELSIF _action<>'ended' THEN RAISE EXCEPTION 'Ação inválida'; END IF;
 UPDATE chat_calls SET status=_action,answer=CASE WHEN _action='accepted' THEN _answer ELSE answer END,updated_at=now() WHERE id=_call;
END; $$;
REVOKE ALL ON FUNCTION public.start_chat_call(uuid,uuid,text), public.respond_chat_call(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_chat_call(uuid,uuid,text), public.respond_chat_call(uuid,text,text) TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_calls;