-- Restrict employee suspension and PIN-based reactivation to authorized leadership.
CREATE TABLE IF NOT EXISTS public.employee_reactivation_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  pin_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  used_by uuid REFERENCES public.profiles(id),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_reactivation_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_reactivation_pins FROM anon, authenticated;
GRANT ALL ON public.employee_reactivation_pins TO service_role;

CREATE OR REPLACE FUNCTION public.can_manage_employee_access(_user uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _user AND p.active AND p.approved
        AND (
          public.has_role(_user, 'admin')
          OR public.has_role(_user, 'gerente')
          OR EXISTS (
            SELECT 1 FROM public.positions po
            WHERE po.id = p.position_id AND po.name ILIKE '%encarregado%'
          )
        )
    ), false
  )
$$;
REVOKE ALL ON FUNCTION public.can_manage_employee_access(uuid) FROM public, anon;
-- Internal authorization helper; only SECURITY DEFINER RPCs should call it.

-- Keep the existing profile protections, allowing active to change only inside
-- the authorized PIN workflow below.
CREATE OR REPLACE FUNCTION public.guard_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    IF current_setting('shopping_hospitalar.position_target',true) IS DISTINCT FROM OLD.id::text
       OR NOT public.can_manage_member_position(OLD.id,NEW.position_id) THEN
      NEW.position_id := OLD.position_id;
    END IF;
    NEW.department_id := OLD.department_id;
    IF current_setting('shopping_hospitalar.employee_access_target',true) IS DISTINCT FROM OLD.id::text THEN
      NEW.active := OLD.active;
    END IF;
    NEW.email := OLD.email;
    IF current_setting('shopping_hospitalar.pin_approval_user',true) IS DISTINCT FROM OLD.id::text
       OR OLD.id IS DISTINCT FROM auth.uid() THEN
      NEW.approved := OLD.approved;
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.ban_employee_with_pin(_employee uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE
  _pin text;
  _target public.profiles%ROWTYPE;
BEGIN
  IF NOT public.can_manage_employee_access(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores, gerentes ou encarregados podem suspender funcionários';
  END IF;
  IF _employee IS NULL OR _employee = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode suspender sua própria conta';
  END IF;

  SELECT * INTO _target FROM public.profiles WHERE id=_employee FOR UPDATE;
  IF NOT FOUND OR NOT _target.active OR NOT _target.approved THEN
    RAISE EXCEPTION 'Funcionário não encontrado ou já está suspenso';
  END IF;
  IF public.has_role(_employee,'admin')
     OR public.has_role(_employee,'diretor')
     OR public.has_role(_employee,'gerente')
     OR EXISTS (SELECT 1 FROM public.positions po WHERE po.id=_target.position_id AND po.name ILIKE '%encarregado%') THEN
    RAISE EXCEPTION 'Para proteger a gestão, não é permitido suspender uma conta de liderança por esta opção';
  END IF;

  LOOP
    _pin := lpad((((('x'||encode(extensions.gen_random_bytes(4),'hex'))::bit(32)::bigint) % 100000000))::text,8,'0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.employee_reactivation_pins
      WHERE pin_hash=encode(extensions.digest(_pin,'sha256'),'hex')
    );
  END LOOP;

  DELETE FROM public.employee_reactivation_pins WHERE employee_id=_employee AND used_by IS NULL;
  INSERT INTO public.employee_reactivation_pins(employee_id,created_by,pin_hash)
  VALUES (_employee,auth.uid(),encode(extensions.digest(_pin,'sha256'),'hex'));

  PERFORM set_config('shopping_hospitalar.employee_access_target',_employee::text,true);
  UPDATE public.profiles SET active=false WHERE id=_employee;
  PERFORM set_config('shopping_hospitalar.employee_access_target','',true);
  RETURN _pin;
END
$$;
REVOKE ALL ON FUNCTION public.ban_employee_with_pin(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ban_employee_with_pin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.issue_employee_reactivation_pin(_employee uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE
  _pin text;
  _target public.profiles%ROWTYPE;
BEGIN
  IF NOT public.can_manage_employee_access(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores, gerentes ou encarregados podem emitir PINs';
  END IF;
  SELECT * INTO _target FROM public.profiles WHERE id=_employee;
  IF NOT FOUND OR _target.active OR NOT _target.approved THEN
    RAISE EXCEPTION 'O funcionário precisa estar suspenso para receber um PIN de reativação';
  END IF;
  IF public.has_role(_employee,'admin')
     OR public.has_role(_employee,'diretor')
     OR public.has_role(_employee,'gerente')
     OR EXISTS (SELECT 1 FROM public.positions po WHERE po.id=_target.position_id AND po.name ILIKE '%encarregado%') THEN
    RAISE EXCEPTION 'Não é permitido emitir PIN por esta opção para uma conta de liderança';
  END IF;

  LOOP
    _pin := lpad((((('x'||encode(extensions.gen_random_bytes(4),'hex'))::bit(32)::bigint) % 100000000))::text,8,'0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.employee_reactivation_pins
      WHERE pin_hash=encode(extensions.digest(_pin,'sha256'),'hex')
    );
  END LOOP;
  DELETE FROM public.employee_reactivation_pins WHERE employee_id=_employee AND used_by IS NULL;
  INSERT INTO public.employee_reactivation_pins(employee_id,created_by,pin_hash)
  VALUES (_employee,auth.uid(),encode(extensions.digest(_pin,'sha256'),'hex'));
  RETURN _pin;
END
$$;
REVOKE ALL ON FUNCTION public.issue_employee_reactivation_pin(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.issue_employee_reactivation_pin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_employee_reactivation_pin(_pin text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE
  _row uuid;
  _attempts integer;
  _window timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id=auth.uid() AND approved AND NOT active
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.access_pin_attempts(user_id) VALUES(auth.uid()) ON CONFLICT DO NOTHING;
  SELECT attempts,window_started_at INTO _attempts,_window
  FROM public.access_pin_attempts WHERE user_id=auth.uid() FOR UPDATE;
  IF _window < now()-interval '15 minutes' THEN
    UPDATE public.access_pin_attempts SET attempts=0,window_started_at=now() WHERE user_id=auth.uid();
    _attempts := 0;
  END IF;
  IF _attempts >= 10 THEN RETURN false; END IF;

  UPDATE public.employee_reactivation_pins
  SET used_by=auth.uid(),used_at=now()
  WHERE id=(
    SELECT id FROM public.employee_reactivation_pins
    WHERE employee_id=auth.uid()
      AND pin_hash=encode(extensions.digest(trim(_pin),'sha256'),'hex')
      AND used_by IS NULL AND expires_at>now()
    LIMIT 1 FOR UPDATE
  )
  RETURNING id INTO _row;

  IF _row IS NULL THEN
    UPDATE public.access_pin_attempts SET attempts=attempts+1 WHERE user_id=auth.uid();
    RETURN false;
  END IF;

  PERFORM set_config('shopping_hospitalar.employee_access_target',auth.uid()::text,true);
  UPDATE public.profiles SET active=true WHERE id=auth.uid();
  PERFORM set_config('shopping_hospitalar.employee_access_target','',true);
  DELETE FROM public.access_pin_attempts WHERE user_id=auth.uid();
  RETURN true;
END
$$;
REVOKE ALL ON FUNCTION public.redeem_employee_reactivation_pin(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.redeem_employee_reactivation_pin(text) TO authenticated;
