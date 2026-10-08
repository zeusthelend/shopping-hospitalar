CREATE OR REPLACE FUNCTION public.is_approved_user() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND active AND approved) $$;
REVOKE ALL ON FUNCTION public.is_approved_user() FROM public,anon;
GRANT EXECUTE ON FUNCTION public.is_approved_user() TO authenticated;
CREATE OR REPLACE FUNCTION public.can_manage_member_position(_member uuid,_position uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT public.is_approved_user() AND EXISTS(SELECT 1 FROM public.positions WHERE id=_position) AND EXISTS(SELECT 1 FROM public.profiles WHERE id=_member) AND (public.has_role(auth.uid(),'admin') OR (public.has_role(auth.uid(),'gerente') AND _member<>auth.uid() AND EXISTS(SELECT 1 FROM public.profiles caller JOIN public.profiles target ON target.department_id=caller.department_id WHERE caller.id=auth.uid() AND target.id=_member AND target.active AND target.approved) AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_member AND role IN ('admin','diretor','gerente')) AND EXISTS(SELECT 1 FROM public.positions WHERE id=_position AND name NOT IN ('Administrador','Diretor','Gerente') AND NOT permissions && ARRAY['all','admin_view','manage_content'])));
$$;
REVOKE ALL ON FUNCTION public.can_manage_member_position(uuid,uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_member_position(uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.set_member_position(_member uuid,_position uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NOT public.can_manage_member_position(_member,_position) THEN RAISE EXCEPTION 'Sem permissão para alterar este cargo'; END IF;
PERFORM set_config('shopping_hospitalar.position_target',_member::text,true);
UPDATE public.profiles SET position_id=_position WHERE id=_member;
PERFORM set_config('shopping_hospitalar.position_target','',true);
END $$;
REVOKE ALL ON FUNCTION public.set_member_position(uuid,uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.set_member_position(uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.guard_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN
IF current_setting('shopping_hospitalar.position_target',true) IS DISTINCT FROM OLD.id::text OR NOT public.can_manage_member_position(OLD.id,NEW.position_id) THEN NEW.position_id:=OLD.position_id; END IF;
NEW.department_id:=OLD.department_id; NEW.active:=OLD.active; NEW.email:=OLD.email;
IF current_setting('shopping_hospitalar.pin_approval_user',true) IS DISTINCT FROM OLD.id::text OR OLD.id IS DISTINCT FROM auth.uid() THEN NEW.approved:=OLD.approved; END IF;
END IF; RETURN NEW; END $$;
CREATE TABLE IF NOT EXISTS public.access_pin_attempts(user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,attempts integer NOT NULL DEFAULT 0,window_started_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.access_pin_attempts TO service_role;
ALTER TABLE public.access_pin_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.access_pin_attempts FROM anon,authenticated;
CREATE OR REPLACE FUNCTION public.create_access_pin(_label text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$ DECLARE _pin text; BEGIN
IF NOT public.is_approved_user() OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gerente')) THEN RAISE EXCEPTION 'Apenas administradores e gerentes podem emitir PINs'; END IF;
LOOP
_pin:=lpad((((('x'||encode(extensions.gen_random_bytes(4),'hex'))::bit(32)::bigint) % 100000000))::text,8,'0');
EXIT WHEN NOT EXISTS(SELECT 1 FROM public.access_pins WHERE pin_hash=encode(extensions.digest(_pin,'sha256'),'hex'));
END LOOP;
INSERT INTO public.access_pins(pin_hash,label,created_by) VALUES(encode(extensions.digest(_pin,'sha256'),'hex'),left(_label,120),auth.uid()); RETURN _pin; END $$;
REVOKE ALL ON FUNCTION public.create_access_pin(text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.create_access_pin(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.redeem_access_pin(_pin text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$ DECLARE _row uuid; _attempts integer; _window timestamptz; BEGIN
IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND active AND NOT approved) THEN RETURN false; END IF;
INSERT INTO public.access_pin_attempts(user_id) VALUES(auth.uid()) ON CONFLICT DO NOTHING;
SELECT attempts,window_started_at INTO _attempts,_window FROM public.access_pin_attempts WHERE user_id=auth.uid() FOR UPDATE;
IF _window < now()-interval '15 minutes' THEN UPDATE public.access_pin_attempts SET attempts=0,window_started_at=now() WHERE user_id=auth.uid(); _attempts:=0; END IF;
IF _attempts>=20 THEN RETURN false; END IF;
UPDATE public.access_pins SET used_by=auth.uid(),used_at=now() WHERE id=(SELECT id FROM public.access_pins WHERE pin_hash=encode(extensions.digest(trim(_pin),'sha256'),'hex') AND used_by IS NULL AND expires_at>now() LIMIT 1 FOR UPDATE) RETURNING id INTO _row;
IF _row IS NULL THEN UPDATE public.access_pin_attempts SET attempts=attempts+1 WHERE user_id=auth.uid(); RETURN false; END IF;
PERFORM set_config('shopping_hospitalar.pin_approval_user',auth.uid()::text,true);
UPDATE public.profiles SET approved=true WHERE id=auth.uid();
PERFORM set_config('shopping_hospitalar.pin_approval_user','',true);
DELETE FROM public.access_pin_attempts WHERE user_id=auth.uid(); RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.redeem_access_pin(text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.redeem_access_pin(text) TO authenticated;
REVOKE SELECT ON public.access_pins FROM authenticated;
GRANT SELECT(id,label,created_by,expires_at,used_by,used_at,created_at),DELETE ON public.access_pins TO authenticated;
DROP POLICY IF EXISTS "admins read pins" ON public.access_pins;
DROP POLICY IF EXISTS "admins delete pins" ON public.access_pins;
CREATE POLICY "authorized read pins" ON public.access_pins FOR SELECT TO authenticated USING(public.is_approved_user() AND (public.has_role(auth.uid(),'admin') OR (public.has_role(auth.uid(),'gerente') AND created_by=auth.uid())));
CREATE POLICY "authorized revoke pins" ON public.access_pins FOR DELETE TO authenticated USING(public.is_approved_user() AND (public.has_role(auth.uid(),'admin') OR (public.has_role(auth.uid(),'gerente') AND created_by=auth.uid())));
DO $$ DECLARE t text; BEGIN
FOREACH t IN ARRAY ARRAY['chat_conversations','chat_participants','chat_messages','chat_reactions','davs','dav_attachments','documents','announcements','meetings','posts','departments','positions','user_roles'] LOOP
EXECUTE format('CREATE POLICY "approved access required" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_approved_user()) WITH CHECK (public.is_approved_user())',t);
END LOOP; END $$;
CREATE POLICY "approved profiles access" ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated USING(id=auth.uid() OR public.is_approved_user());
REVOKE UPDATE ON public.chat_participants FROM authenticated;
GRANT UPDATE(muted,pinned,last_read_at) ON public.chat_participants TO authenticated;