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
