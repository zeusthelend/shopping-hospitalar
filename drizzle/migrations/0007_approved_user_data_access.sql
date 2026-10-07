CREATE OR REPLACE FUNCTION public.is_approved_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND active AND approved
  )
$$;
REVOKE ALL ON FUNCTION public.is_approved_user() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_approved_user() TO authenticated;

DROP POLICY IF EXISTS "read roles" ON public.user_roles;
DROP POLICY IF EXISTS "admin manage roles" ON public.user_roles;
CREATE POLICY "users read own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_approved_user());
CREATE POLICY "approved admins manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.is_approved_user() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_approved_user() AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "read profiles" ON public.profiles;
CREATE POLICY "approved users read profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_approved_user());
DROP POLICY IF EXISTS "admin delete profile" ON public.profiles;
CREATE POLICY "approved admins delete profiles"
  ON public.profiles FOR DELETE TO authenticated
  USING (public.is_approved_user() AND public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.guard_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.position_id := OLD.position_id;
    NEW.department_id := OLD.department_id;
    NEW.active := OLD.active;
    NEW.email := OLD.email;
    IF current_setting('shopping_hospitalar.pin_approval_user', true)
       IS DISTINCT FROM auth.uid()::text THEN
      NEW.approved := OLD.approved;
    END IF;
    IF NOT OLD.approved OR NOT OLD.active THEN
      NEW.status := 'offline';
      NEW.last_seen_at := OLD.last_seen_at;
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['departments', 'positions', 'banners', 'app_settings'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'read ' || table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'admin write ' || table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_approved_user())',
      'approved users read ' || table_name,
      table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_approved_user() AND public.has_role(auth.uid(), ''admin'')) WITH CHECK (public.is_approved_user() AND public.has_role(auth.uid(), ''admin''))',
      'approved admins write ' || table_name,
      table_name
    );
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY['announcements', 'meetings', 'documents', 'posts'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'read ' || table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'managers write ' || table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_approved_user())',
      'approved users read ' || table_name,
      table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_approved_user() AND public.is_manager(auth.uid())) WITH CHECK (public.is_approved_user() AND public.is_manager(auth.uid()))',
      'approved managers write ' || table_name,
      table_name
    );
  END LOOP;
END
$$;

DROP POLICY IF EXISTS "managers manage all davs" ON public.davs;
DROP POLICY IF EXISTS "sellers read own davs" ON public.davs;
DROP POLICY IF EXISTS "sellers create own davs" ON public.davs;
DROP POLICY IF EXISTS "sellers update own davs" ON public.davs;
DROP POLICY IF EXISTS "managers read davs" ON public.davs;
DROP POLICY IF EXISTS "managers create davs" ON public.davs;
DROP POLICY IF EXISTS "managers update davs" ON public.davs;
DROP POLICY IF EXISTS "authorized delete davs" ON public.davs;
CREATE POLICY "approved users read assigned davs"
  ON public.davs FOR SELECT TO authenticated
  USING (
    public.is_approved_user()
    AND (seller_id = auth.uid() OR public.is_manager(auth.uid()) OR public.can_delete_davs(auth.uid()))
  );
CREATE POLICY "approved users create assigned davs"
  ON public.davs FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_user()
    AND created_by = auth.uid()
    AND (seller_id = auth.uid() OR public.is_manager(auth.uid()))
  );
CREATE POLICY "approved users update assigned davs"
  ON public.davs FOR UPDATE TO authenticated
  USING (
    public.is_approved_user() AND (seller_id = auth.uid() OR public.is_manager(auth.uid()))
  )
  WITH CHECK (
    public.is_approved_user()
    AND (seller_id = auth.uid() OR public.is_manager(auth.uid()))
    AND (created_by = auth.uid() OR public.is_manager(auth.uid()))
  );
CREATE POLICY "approved authorized users delete davs"
  ON public.davs FOR DELETE TO authenticated
  USING (public.is_approved_user() AND public.can_delete_davs(auth.uid()));

DROP POLICY IF EXISTS "authorized users read dav attachments" ON public.dav_attachments;
DROP POLICY IF EXISTS "authorized users add dav attachments" ON public.dav_attachments;
DROP POLICY IF EXISTS "authorized users delete dav attachments" ON public.dav_attachments;
DROP POLICY IF EXISTS "authorized delete dav attachments" ON public.dav_attachments;
CREATE POLICY "approved users read assigned dav attachments"
  ON public.dav_attachments FOR SELECT TO authenticated
  USING (
    public.is_approved_user()
    AND EXISTS (SELECT 1 FROM public.davs d WHERE d.id = dav_id)
  );
CREATE POLICY "approved users add assigned dav attachments"
  ON public.dav_attachments FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_user()
    AND uploaded_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.davs d WHERE d.id = dav_id)
  );
CREATE POLICY "approved authorized users delete dav attachments"
  ON public.dav_attachments FOR DELETE TO authenticated
  USING (public.is_approved_user() AND public.can_delete_davs(auth.uid()));

DROP POLICY IF EXISTS "users manage notification preferences" ON public.notification_preferences;
CREATE POLICY "approved users manage own notification preferences"
  ON public.notification_preferences FOR ALL TO authenticated
  USING (public.is_approved_user() AND user_id = auth.uid())
  WITH CHECK (public.is_approved_user() AND user_id = auth.uid());

DROP POLICY IF EXISTS "users manage own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "approved users manage own push subscriptions"
  ON public.push_subscriptions FOR ALL TO authenticated
  USING (public.is_approved_user() AND user_id = auth.uid())
  WITH CHECK (public.is_approved_user() AND user_id = auth.uid());

DROP POLICY IF EXISTS "users read own dav alerts" ON public.dav_alert_deliveries;
CREATE POLICY "approved users read own dav alerts"
  ON public.dav_alert_deliveries FOR SELECT TO authenticated
  USING (public.is_approved_user() AND user_id = auth.uid());

DROP POLICY IF EXISTS "users manage own firebase tokens" ON public.firebase_push_tokens;
CREATE POLICY "approved users manage own firebase tokens"
  ON public.firebase_push_tokens FOR ALL TO authenticated
  USING (public.is_approved_user() AND user_id = auth.uid())
  WITH CHECK (public.is_approved_user() AND user_id = auth.uid());

DROP POLICY IF EXISTS "admins read pins" ON public.access_pins;
DROP POLICY IF EXISTS "admins delete pins" ON public.access_pins;
CREATE POLICY "approved admins read pins"
  ON public.access_pins FOR SELECT TO authenticated
  USING (public.is_approved_user() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "approved admins delete pins"
  ON public.access_pins FOR DELETE TO authenticated
  USING (public.is_approved_user() AND public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.create_access_pin(_label text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _pin text;
  _bytes bytea;
  _number numeric;
BEGIN
  IF NOT public.is_approved_user() OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores aprovados podem emitir PINs';
  END IF;

  LOOP
    _bytes := extensions.gen_random_bytes(5);
    _number :=
      get_byte(_bytes, 0)::numeric * 4294967296
      + get_byte(_bytes, 1)::numeric * 16777216
      + get_byte(_bytes, 2)::numeric * 65536
      + get_byte(_bytes, 3)::numeric * 256
      + get_byte(_bytes, 4)::numeric;
    _pin := lpad(mod(_number, 100000000)::bigint::text, 8, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.access_pins
      WHERE pin_hash = encode(extensions.digest(_pin, 'sha256'), 'hex')
    );
  END LOOP;

  INSERT INTO public.access_pins (pin_hash, label, created_by)
  VALUES (encode(extensions.digest(_pin, 'sha256'), 'hex'), left(_label, 120), auth.uid());
  RETURN _pin;
END
$$;
REVOKE ALL ON FUNCTION public.create_access_pin(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_access_pin(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_delete_davs(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id = auth.uid()
    AND public.is_approved_user()
    AND (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('admin', 'gerente')
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.positions po ON po.id = p.position_id
        WHERE p.id = auth.uid() AND po.name = 'Encarregado de Estoque'
      )
    )
$$;
REVOKE ALL ON FUNCTION public.can_delete_davs(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_delete_davs(uuid) TO authenticated;

DROP POLICY IF EXISTS "read avatars" ON storage.objects;
DROP POLICY IF EXISTS "upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "update own avatar" ON storage.objects;
CREATE POLICY "approved users read avatars"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND public.is_approved_user());
CREATE POLICY "approved users upload own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND public.is_approved_user()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "approved users update own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND public.is_approved_user()
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND public.is_approved_user()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "admin branding ins" ON storage.objects;
DROP POLICY IF EXISTS "admin branding upd" ON storage.objects;
CREATE POLICY "approved admins upload branding"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'branding'
    AND public.is_approved_user()
    AND public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "approved admins update branding"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'branding'
    AND public.is_approved_user()
    AND public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    bucket_id = 'branding'
    AND public.is_approved_user()
    AND public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "read documents" ON storage.objects;
DROP POLICY IF EXISTS "managers upload documents" ON storage.objects;
DROP POLICY IF EXISTS "managers delete documents" ON storage.objects;
CREATE POLICY "approved users read documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND public.is_approved_user());
CREATE POLICY "approved managers upload documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND public.is_approved_user() AND public.is_manager(auth.uid()));
CREATE POLICY "approved managers delete documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND public.is_approved_user() AND public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "authorized users manage dav files" ON storage.objects;
CREATE POLICY "approved users read assigned dav files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'dav-files'
    AND public.is_approved_user()
    AND EXISTS (
      SELECT 1 FROM public.davs d
      WHERE d.id::text = (storage.foldername(name))[1]
    )
  );
CREATE POLICY "approved users upload assigned dav files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dav-files'
    AND public.is_approved_user()
    AND EXISTS (
      SELECT 1 FROM public.davs d
      WHERE d.id::text = (storage.foldername(name))[1]
    )
  );
CREATE POLICY "approved authorized users delete dav files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'dav-files'
    AND public.is_approved_user()
    AND public.can_delete_davs(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.davs d
      WHERE d.id::text = (storage.foldername(name))[1]
    )
  );
