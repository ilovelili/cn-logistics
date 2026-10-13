/* Separate customer assignment duties from the employee's qualified roles.
   Backfill preserves all existing memberships and their current display roles.
   This migration is additive: older clients keep their existing RPC signatures. */
SET lock_timeout = '5s';
ALTER TABLE public.app_user_admin_assignments ADD COLUMN assignment_roles text[];
UPDATE public.app_user_admin_assignments AS assignment
SET assignment_roles = ARRAY(
  SELECT DISTINCT duty FROM unnest(COALESCE(NULLIF(operator.staff_roles, ARRAY[]::text[]),
    ARRAY[COALESCE(operator.staff_role, 'other')]::text[])) duties(duty)
  WHERE duty IN ('operations', 'sales') ORDER BY duty
)
FROM public.app_users AS operator WHERE operator.id = assignment.admin_user_id;
ALTER TABLE public.app_user_admin_assignments
  ALTER COLUMN assignment_roles SET NOT NULL,
  ADD CONSTRAINT shipper_assignment_roles_valid
    CHECK (assignment_roles <@ ARRAY['operations', 'sales']::text[]
      AND array_position(assignment_roles, NULL) IS NULL);

CREATE OR REPLACE FUNCTION public.enforce_shipper_staff_assignment_role()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE qualified_roles text[];
BEGIN
  SELECT ARRAY(SELECT DISTINCT duty FROM unnest(COALESCE(NULLIF(operator.staff_roles, ARRAY[]::text[]),
    ARRAY[COALESCE(operator.staff_role, 'other')]::text[])) duties(duty)
    WHERE duty IN ('operations','sales') ORDER BY duty)
  INTO qualified_roles FROM public.app_users AS operator
  WHERE operator.id = NEW.admin_user_id AND operator.is_active AND operator.deleted_at IS NULL
    AND (operator.role = 'admin' OR (operator.role = 'super_admin'
      AND 'sales' = ANY(COALESCE(NULLIF(operator.staff_roles, ARRAY[]::text[]), ARRAY[operator.staff_role]))));
  IF NEW.assignment_roles IS NULL THEN
    -- Compatibility for legacy clients and registration's automatic creator link.
    IF COALESCE(cardinality(qualified_roles), 0) = 0 THEN RETURN NULL; END IF;
    NEW.assignment_roles := qualified_roles;
  ELSE
    IF qualified_roles IS NULL OR NOT NEW.assignment_roles <@ qualified_roles
      OR array_position(NEW.assignment_roles, NULL) IS NOT NULL THEN
      RAISE EXCEPTION 'Selected customer duties require an active qualified administrator'
        USING ERRCODE = '22023';
    END IF;
    NEW.assignment_roles := ARRAY(SELECT DISTINCT duty FROM unnest(NEW.assignment_roles) duties(duty) ORDER BY duty);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER enforce_shipper_staff_assignment_role ON public.app_user_admin_assignments;
CREATE TRIGGER enforce_shipper_staff_assignment_role
BEFORE INSERT OR UPDATE OF admin_user_id, assignment_roles ON public.app_user_admin_assignments
FOR EACH ROW EXECUTE FUNCTION public.enforce_shipper_staff_assignment_role();
REVOKE ALL ON FUNCTION public.enforce_shipper_staff_assignment_role() FROM PUBLIC, anon, authenticated;

-- Internal validation is shared by direct saves and approval requests.
CREATE FUNCTION public.validate_shipper_staff_selection(operations_ids uuid[], sales_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT id, 'operations' AS duty FROM unnest(COALESCE(operations_ids, ARRAY[]::uuid[])) ids(id)
      UNION ALL SELECT id, 'sales' FROM unnest(COALESCE(sales_ids, ARRAY[]::uuid[])) ids(id)
    ) selected LEFT JOIN public.app_users operator ON operator.id = selected.id
      AND operator.is_active AND operator.deleted_at IS NULL
      AND (operator.role = 'admin' OR (operator.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(NULLIF(operator.staff_roles, ARRAY[]::text[]), ARRAY[operator.staff_role]))))
      AND selected.duty = ANY(COALESCE(NULLIF(operator.staff_roles, ARRAY[]::text[]), ARRAY[operator.staff_role]))
    WHERE operator.id IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more selected administrators do not have the requested customer duty'
      USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_shipper_staff_selection(uuid[], uuid[]) FROM PUBLIC, anon, authenticated;

-- Legacy membership-only saves preserve existing explicit duties for retained staff.
CREATE FUNCTION public.shipper_staff_selection_from_membership(target_user_id uuid, admin_ids uuid[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH target AS (
    SELECT shipper_name, created_by FROM public.app_users WHERE id = target_user_id
  ), choices AS (
    SELECT DISTINCT operator.id, duty FROM public.app_users operator
    CROSS JOIN unnest(COALESCE(NULLIF(operator.staff_roles, ARRAY[]::text[]), ARRAY[operator.staff_role])) duties(duty)
    WHERE operator.id = ANY(COALESCE(admin_ids, ARRAY[]::uuid[])) AND duty IN ('operations','sales')
      AND (
        NOT EXISTS (SELECT 1 FROM public.app_user_admin_assignments assignment
          JOIN public.app_users contact ON contact.id = assignment.normal_user_id CROSS JOIN target
          WHERE assignment.admin_user_id = operator.id AND contact.role = 'normal' AND contact.is_active
            AND contact.deleted_at IS NULL AND contact.shipper_name = target.shipper_name
            AND COALESCE(contact.created_by,'') = COALESCE(target.created_by,''))
        OR EXISTS (SELECT 1 FROM public.app_user_admin_assignments assignment
          JOIN public.app_users contact ON contact.id = assignment.normal_user_id CROSS JOIN target
          WHERE assignment.admin_user_id = operator.id AND duty = ANY(assignment.assignment_roles)
            AND contact.role = 'normal' AND contact.is_active AND contact.deleted_at IS NULL
            AND contact.shipper_name = target.shipper_name
            AND COALESCE(contact.created_by,'') = COALESCE(target.created_by,''))
      )
  ) SELECT jsonb_build_object(
    'operations_admin_user_ids', COALESCE(jsonb_agg(id ORDER BY id) FILTER(WHERE duty='operations'),'[]'::jsonb),
    'sales_admin_user_ids', COALESCE(jsonb_agg(id ORDER BY id) FILTER(WHERE duty='sales'),'[]'::jsonb)
  ) FROM choices;
$$;
REVOKE ALL ON FUNCTION public.shipper_staff_selection_from_membership(uuid, uuid[]) FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.get_normal_user_admin_assignments(target_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'admin_user_id', admin_user.id,
        'email', admin_user.email,
        'user_name', admin_user.user_name,
        'staff_role', COALESCE(admin_user.staff_role, 'other'),
        'assignment_roles', assignment.assignment_roles,
        'staff_roles', COALESCE(admin_user.staff_roles, ARRAY[COALESCE(admin_user.staff_role, 'other')]::text[]),
        'created_at', assignment.created_at,
        'updated_at', assignment.updated_at
      )
      ORDER BY admin_user.email
    ),
    '[]'::jsonb
  )
  FROM app_user_admin_assignments assignment
  JOIN app_users admin_user
    ON admin_user.id = assignment.admin_user_id
  WHERE assignment.normal_user_id = target_user_id
    AND (admin_user.role = 'admin' OR (admin_user.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(admin_user.staff_roles, ARRAY[COALESCE(admin_user.staff_role, 'other')]::text[]))))
    AND admin_user.deleted_at IS NULL;
$function$;

CREATE OR REPLACE FUNCTION public.shipper_group_snapshot(target_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH target AS (
    SELECT shipper_name, created_by
    FROM public.app_users
    WHERE id = target_user_id
      AND role = 'normal'
      AND is_active
      AND deleted_at IS NULL
  ), contacts AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', shipper_user.id,
        'email', shipper_user.email,
        'contact_person', COALESCE(shipper_user.contact_person, '')
      ) ORDER BY shipper_user.created_at, shipper_user.id
    ) AS value
    FROM public.app_users AS shipper_user
    CROSS JOIN target
    WHERE shipper_user.role = 'normal'
      AND shipper_user.is_active
      AND shipper_user.deleted_at IS NULL
      AND shipper_user.shipper_name = target.shipper_name
      AND COALESCE(shipper_user.created_by, '') = COALESCE(target.created_by, '')
  ), assignments AS (
    SELECT jsonb_agg(DISTINCT assignment.admin_user_id ORDER BY assignment.admin_user_id) AS value,
      jsonb_agg(DISTINCT assignment.admin_user_id ORDER BY assignment.admin_user_id) FILTER (WHERE 'operations' = ANY(assignment.assignment_roles)) AS operations_ids,
      jsonb_agg(DISTINCT assignment.admin_user_id ORDER BY assignment.admin_user_id) FILTER (WHERE 'sales' = ANY(assignment.assignment_roles)) AS sales_ids
    FROM public.app_user_admin_assignments AS assignment
    INNER JOIN public.app_users AS shipper_user ON shipper_user.id = assignment.normal_user_id
    CROSS JOIN target
    WHERE shipper_user.role = 'normal'
      AND shipper_user.is_active
      AND shipper_user.deleted_at IS NULL
      AND shipper_user.shipper_name = target.shipper_name
      AND COALESCE(shipper_user.created_by, '') = COALESCE(target.created_by, '')
  )
  SELECT jsonb_build_object(
    'shipper_name', representative.shipper_name,
    'zipcode', COALESCE(representative.zipcode, ''),
    'shipper_address', COALESCE(representative.shipper_address, ''),
    'telephone', COALESCE(representative.telephone, ''),
    'budget', representative.budget,
    'notes', COALESCE(representative.notes, ''),
    'contacts', COALESCE(contacts.value, '[]'::jsonb),
    'admin_user_ids', COALESCE(assignments.value, '[]'::jsonb),
    'operations_admin_user_ids', COALESCE(assignments.operations_ids, '[]'::jsonb),
    'sales_admin_user_ids', COALESCE(assignments.sales_ids, '[]'::jsonb)
  )
  FROM target
  INNER JOIN LATERAL (
    SELECT shipper_user.*
    FROM public.app_users AS shipper_user
    WHERE shipper_user.role = 'normal'
      AND shipper_user.is_active
      AND shipper_user.deleted_at IS NULL
      AND shipper_user.shipper_name = target.shipper_name
      AND COALESCE(shipper_user.created_by, '') = COALESCE(target.created_by, '')
    ORDER BY shipper_user.created_at, shipper_user.id
    LIMIT 1
  ) AS representative ON true
  CROSS JOIN contacts
  CROSS JOIN assignments;
$function$;

CREATE OR REPLACE FUNCTION public.update_accessible_shipper_staff_assignments(requester_email text, target_user_id uuid, operations_admin_user_ids uuid[], sales_admin_user_ids uuid[])
 RETURNS TABLE(id uuid, email text, shipper_name text, zipcode text, shipper_address text, telephone text, budget numeric, contact_person text, notes text, approval_status text, created_by text, created_at timestamp with time zone, updated_at timestamp with time zone, auth0_provisioning_status text, admin_assignments jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  normalized_requester_email text := lower(trim(requester_email));
  normalized_admin_user_ids uuid[] := ARRAY(SELECT DISTINCT ids.id FROM unnest(COALESCE(operations_admin_user_ids, ARRAY[]::uuid[]) || COALESCE(sales_admin_user_ids, ARRAY[]::uuid[])) ids(id) ORDER BY ids.id);
  target_shipper_name text;
  target_created_by text;
  shipper_user_ids uuid[];
  assignments_changed boolean;
BEGIN
  IF public.current_app_user_role() IS NULL OR public.current_app_user_role() NOT IN ('admin','super_admin')
    OR normalized_requester_email IS NULL OR normalized_requester_email IS DISTINCT FROM public.current_app_user_email() THEN
    RAISE EXCEPTION 'Only the authenticated operator can update assignments'
      USING ERRCODE = '42501';
  END IF;

  SELECT target.shipper_name, target.created_by
  INTO target_shipper_name, target_created_by
  FROM public.app_users AS target
  WHERE target.id = target_user_id
    AND target.role = 'normal'
    AND target.is_active = true
    AND target.deleted_at IS NULL
  ;

  IF NOT FOUND
    OR NOT public.authenticated_caller_can_manage_normal_user(target_user_id) THEN
    RAISE EXCEPTION 'The authenticated operator cannot manage this shipper user'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.validate_shipper_staff_selection(operations_admin_user_ids, sales_admin_user_ids);

  SELECT array_agg(shipper_user.id)
  INTO shipper_user_ids
  FROM public.app_users AS shipper_user
  WHERE shipper_user.role = 'normal'
    AND shipper_user.is_active = true
    AND shipper_user.deleted_at IS NULL
    AND shipper_user.shipper_name = target_shipper_name
    AND COALESCE(shipper_user.created_by, '') = COALESCE(target_created_by, '');

  -- Lock the entire company in a deterministic order, not the clicked contact first.
  PERFORM contact.id FROM public.app_users contact
  WHERE contact.id = ANY(shipper_user_ids) ORDER BY contact.id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.app_users contact WHERE contact.id=target_user_id
    AND contact.is_active AND contact.deleted_at IS NULL AND contact.shipper_name=target_shipper_name
    AND COALESCE(contact.created_by,'')=COALESCE(target_created_by,'')) THEN
    RAISE EXCEPTION 'Shipper data changed; reload and retry' USING ERRCODE='40001';
  END IF;
  IF public.current_app_user_role()='admin' AND EXISTS (
    SELECT 1 FROM public.app_users contact WHERE contact.id=ANY(shipper_user_ids) AND contact.approval_status='approved'
  ) THEN
    RAISE EXCEPTION 'Approved shipper assignments require a change request' USING ERRCODE='42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.app_user_admin_assignments assignment
    WHERE assignment.normal_user_id=ANY(shipper_user_ids)
      AND (NOT assignment.admin_user_id=ANY(normalized_admin_user_ids)
        OR assignment.assignment_roles IS DISTINCT FROM ARRAY(
          SELECT duty FROM (VALUES
            ('operations',assignment.admin_user_id=ANY(COALESCE(operations_admin_user_ids,ARRAY[]::uuid[]))),
            ('sales',assignment.admin_user_id=ANY(COALESCE(sales_admin_user_ids,ARRAY[]::uuid[])))
          ) duties(duty,chosen) WHERE chosen ORDER BY duty))
  ) OR EXISTS (
    SELECT 1 FROM unnest(shipper_user_ids) contacts(id) CROSS JOIN unnest(normalized_admin_user_ids) operators(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.app_user_admin_assignments assignment
      WHERE assignment.normal_user_id=contacts.id AND assignment.admin_user_id=operators.id)
  ) INTO assignments_changed;

  IF assignments_changed THEN
    DELETE FROM public.app_user_admin_assignments assignment
    WHERE assignment.normal_user_id=ANY(shipper_user_ids) AND NOT assignment.admin_user_id=ANY(normalized_admin_user_ids);
    INSERT INTO public.app_user_admin_assignments(normal_user_id,admin_user_id,assigned_by,assignment_roles)
    SELECT contact_id,operator_id,normalized_requester_email,ARRAY(
      SELECT duty FROM (VALUES
        ('operations',operator_id=ANY(COALESCE(operations_admin_user_ids,ARRAY[]::uuid[]))),
        ('sales',operator_id=ANY(COALESCE(sales_admin_user_ids,ARRAY[]::uuid[])))
      ) duties(duty,chosen) WHERE chosen ORDER BY duty)
    FROM unnest(shipper_user_ids) contacts(contact_id) CROSS JOIN unnest(normalized_admin_user_ids) operators(operator_id)
    ON CONFLICT(normal_user_id,admin_user_id) DO UPDATE
    SET assignment_roles=EXCLUDED.assignment_roles,assigned_by=EXCLUDED.assigned_by,updated_at=now()
    WHERE app_user_admin_assignments.assignment_roles IS DISTINCT FROM EXCLUDED.assignment_roles;

    UPDATE public.app_users contact SET approval_status=CASE WHEN contact.approval_status='approved' THEN 'to_be_approved' ELSE contact.approval_status END,updated_at=now()
    WHERE contact.id=ANY(shipper_user_ids);
  END IF;

  RETURN QUERY
  SELECT
    target.id,
    target.email,
    target.shipper_name,
    target.zipcode,
    target.shipper_address,
    target.telephone,
    target.budget,
    target.contact_person,
    target.notes,
    target.approval_status,
    target.created_by,
    target.created_at,
    target.updated_at,
    target.auth0_provisioning_status,
    public.get_normal_user_admin_assignments(target.id)
  FROM public.app_users AS target
  WHERE target.id = target_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_accessible_shipper_staff_assignments(text,uuid,uuid[],uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_accessible_shipper_staff_assignments(text,uuid,uuid[],uuid[]) TO authenticated, service_role;

-- Customer creation and explicit role selection commit or roll back together.
CREATE FUNCTION public.create_registered_shipper_with_staff_roles(
  user_shipper_name text, user_zipcode text, user_shipper_address text,
  user_telephone text, user_budget numeric, user_contacts jsonb,
  user_notes text, admin_email text, operations_admin_user_ids uuid[], sales_admin_user_ids uuid[]
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE requester text:=lower(trim(admin_email)); created_contact_id uuid;
BEGIN
  IF public.current_app_user_role() IS NULL OR public.current_app_user_role() NOT IN ('admin','super_admin')
    OR requester IS NULL OR requester IS DISTINCT FROM public.current_app_user_email() THEN
    RAISE EXCEPTION 'The authenticated operator cannot create shipper users' USING ERRCODE='42501';
  END IF;
  PERFORM public.validate_shipper_staff_selection(operations_admin_user_ids,sales_admin_user_ids);
  -- The name/creator pair is the application's existing company identity.
  PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(trim(user_shipper_name),requester)::text,0));
  IF EXISTS(SELECT 1 FROM public.app_users contact WHERE contact.role='normal' AND contact.is_active
    AND contact.deleted_at IS NULL AND contact.shipper_name=trim(user_shipper_name)
    AND COALESCE(contact.created_by,'')=requester) THEN
    RAISE EXCEPTION 'This shipper already exists; add contacts through its edit form' USING ERRCODE='23505';
  END IF;
  PERFORM public.create_registered_normal_user(user_shipper_name,user_zipcode,user_shipper_address,
    user_telephone,user_budget,user_contacts,user_notes,admin_email);
  SELECT contact.id INTO created_contact_id FROM public.app_users contact
  WHERE contact.role='normal' AND contact.is_active AND contact.deleted_at IS NULL
    AND contact.shipper_name=trim(user_shipper_name) AND COALESCE(contact.created_by,'')=requester
    AND lower(trim(contact.email))=lower(trim(user_contacts->0->>'email'));
  IF created_contact_id IS NULL THEN RAISE EXCEPTION 'Created contact was not found'; END IF;
  PERFORM public.update_accessible_shipper_staff_assignments(requester,created_contact_id,
    operations_admin_user_ids,sales_admin_user_ids);
END;
$$;
REVOKE ALL ON FUNCTION public.create_registered_shipper_with_staff_roles(text,text,text,text,numeric,jsonb,text,text,uuid[],uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_registered_shipper_with_staff_roles(text,text,text,text,numeric,jsonb,text,text,uuid[],uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_accessible_normal_user_admin_assignments(requester_email text, target_user_id uuid, admin_user_ids uuid[])
 RETURNS TABLE(id uuid, email text, shipper_name text, zipcode text, shipper_address text, telephone text, budget numeric, contact_person text, notes text, approval_status text, created_by text, created_at timestamp with time zone, updated_at timestamp with time zone, auth0_provisioning_status text, admin_assignments jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE choices jsonb; ops_ids uuid[]; sales_ids uuid[];
BEGIN
  IF EXISTS(SELECT 1 FROM unnest(COALESCE(admin_user_ids,ARRAY[]::uuid[])) selected(id)
    LEFT JOIN public.app_users operator ON operator.id=selected.id AND operator.is_active AND operator.deleted_at IS NULL
      AND (operator.role='admin' OR (operator.role='super_admin' AND 'sales'=ANY(operator.staff_roles)))
    WHERE operator.id IS NULL) THEN
    RAISE EXCEPTION 'One or more selected admins are not assignable' USING ERRCODE='22023';
  END IF;
  choices:=public.shipper_staff_selection_from_membership(target_user_id,admin_user_ids);
  ops_ids:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(choices->'operations_admin_user_ids') items(value));
  sales_ids:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(choices->'sales_admin_user_ids') items(value));
  RETURN QUERY SELECT * FROM public.update_accessible_shipper_staff_assignments(requester_email,target_user_id,ops_ids,sales_ids);
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_shipper_staff_change_request(target_user_id uuid, proposed_shipper_name text, proposed_zipcode text, proposed_shipper_address text, proposed_telephone text, proposed_budget numeric, proposed_contacts jsonb, proposed_notes text, proposed_operations_admin_user_ids uuid[], proposed_sales_admin_user_ids uuid[], requester_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  requester_id uuid;
  normalized_requester_email text := lower(trim(requester_email));
  target_record record;
  normalized_contacts jsonb;
  normalized_admin_ids uuid[];
  normalized_ops_ids uuid[];
  normalized_sales_ids uuid[];
  current_data jsonb;
  proposed_data jsonb;
  request_id uuid;
BEGIN
  IF NOT public.authenticated_caller_can_assume_email(
    normalized_requester_email
  ) THEN
    RAISE EXCEPTION 'The authenticated user cannot act as this administrator'
      USING ERRCODE = '42501';
  END IF;

  SELECT app_user.id
  INTO requester_id
  FROM public.app_users AS app_user
  WHERE lower(trim(app_user.email)) = normalized_requester_email
    AND app_user.role = 'admin'
    AND app_user.is_active
    AND app_user.deleted_at IS NULL
  LIMIT 1;

  SELECT app_user.shipper_name, app_user.created_by, app_user.approval_status
  INTO target_record
  FROM public.app_users AS app_user
  WHERE app_user.id = target_user_id
    AND app_user.role = 'normal'
    AND app_user.is_active
    AND app_user.deleted_at IS NULL
  FOR UPDATE;

  IF requester_id IS NULL OR target_record.approval_status IS DISTINCT FROM 'approved'
    OR NOT public.authenticated_caller_can_manage_normal_user(target_user_id) THEN
    RAISE EXCEPTION 'Only an active regular administrator can request changes to an approved shipper'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(trim(proposed_shipper_name), '') IS NULL
    OR NULLIF(trim(proposed_zipcode), '') IS NULL
    OR NULLIF(trim(proposed_shipper_address), '') IS NULL
    OR NULLIF(trim(proposed_telephone), '') IS NULL
    OR proposed_budget IS NULL
    OR proposed_budget < 0 THEN
    RAISE EXCEPTION 'Required shipper fields are missing' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', NULLIF(contact->>'id', '')::uuid,
      'email', lower(trim(contact->>'email')),
      'contact_person', trim(contact->>'contact_person')
    ) ORDER BY ordinal
  )
  INTO normalized_contacts
  FROM jsonb_array_elements(COALESCE(proposed_contacts, '[]'::jsonb))
    WITH ORDINALITY AS item(contact, ordinal)
  WHERE NULLIF(trim(contact->>'email'), '') IS NOT NULL
    AND NULLIF(trim(contact->>'contact_person'), '') IS NOT NULL;

  IF jsonb_array_length(COALESCE(normalized_contacts, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'At least one customer contact is required' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT selected_id ORDER BY selected_id), ARRAY[]::uuid[])
  INTO normalized_admin_ids
  FROM unnest(COALESCE(proposed_operations_admin_user_ids,ARRAY[]::uuid[]) || COALESCE(proposed_sales_admin_user_ids,ARRAY[]::uuid[])) AS selected(selected_id);

  PERFORM public.validate_shipper_staff_selection(proposed_operations_admin_user_ids, proposed_sales_admin_user_ids);
  normalized_ops_ids:=ARRAY(SELECT DISTINCT id FROM unnest(COALESCE(proposed_operations_admin_user_ids,ARRAY[]::uuid[])) ids(id) ORDER BY ids.id);
  normalized_sales_ids:=ARRAY(SELECT DISTINCT id FROM unnest(COALESCE(proposed_sales_admin_user_ids,ARRAY[]::uuid[])) ids(id) ORDER BY ids.id);

  current_data := public.shipper_group_snapshot(target_user_id);
  proposed_data := jsonb_build_object(
    'shipper_name', trim(proposed_shipper_name),
    'zipcode', trim(proposed_zipcode),
    'shipper_address', trim(proposed_shipper_address),
    'telephone', trim(proposed_telephone),
    'budget', proposed_budget,
    'notes', trim(COALESCE(proposed_notes, '')),
    'contacts', normalized_contacts,
    'admin_user_ids', to_jsonb(normalized_admin_ids),
    'operations_admin_user_ids',to_jsonb(normalized_ops_ids),
    'sales_admin_user_ids',to_jsonb(normalized_sales_ids)
  );

  IF current_data = proposed_data THEN
    RAISE EXCEPTION 'No shipper changes were provided' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.shipper_change_requests (
    target_user_id, shipper_name, shipper_created_by, requested_by,
    requested_by_email, current_snapshot, proposed_snapshot
  ) VALUES (
    target_user_id, target_record.shipper_name, target_record.created_by,
    requester_id, normalized_requester_email, current_data, proposed_data
  )
  RETURNING id INTO request_id;

  PERFORM public.queue_shipper_registration_approval_emails(
    target_record.shipper_name,
    normalized_requester_email
  );

  RETURN request_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_shipper_staff_change_request(uuid,text,text,text,text,numeric,jsonb,text,uuid[],uuid[],text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_shipper_staff_change_request(uuid,text,text,text,text,numeric,jsonb,text,uuid[],uuid[],text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_shipper_change_request(target_user_id uuid, proposed_shipper_name text, proposed_zipcode text, proposed_shipper_address text, proposed_telephone text, proposed_budget numeric, proposed_contacts jsonb, proposed_notes text, proposed_admin_user_ids uuid[], requester_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE choices jsonb;
BEGIN
  IF EXISTS(SELECT 1 FROM unnest(COALESCE(proposed_admin_user_ids,ARRAY[]::uuid[])) selected(id)
    LEFT JOIN public.app_users operator ON operator.id=selected.id AND operator.is_active AND operator.deleted_at IS NULL
      AND (operator.role='admin' OR (operator.role='super_admin' AND 'sales'=ANY(operator.staff_roles)))
    WHERE operator.id IS NULL) THEN
    RAISE EXCEPTION 'One or more selected admins are not assignable' USING ERRCODE='22023';
  END IF;
  choices:=public.shipper_staff_selection_from_membership(target_user_id,proposed_admin_user_ids);
  RETURN public.submit_shipper_staff_change_request(target_user_id,proposed_shipper_name,proposed_zipcode,
    proposed_shipper_address,proposed_telephone,proposed_budget,proposed_contacts,proposed_notes,
    ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(choices->'operations_admin_user_ids') items(value)),
    ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(choices->'sales_admin_user_ids') items(value)),requester_email);
END;
$function$;

-- Pending legacy requests represented all qualified duties for each selected admin.
UPDATE public.shipper_change_requests request
SET current_snapshot=request.current_snapshot || jsonb_build_object(
  'operations_admin_user_ids', COALESCE((SELECT jsonb_agg(operator.id ORDER BY operator.id) FROM public.app_users operator
    WHERE operator.id::text IN (SELECT jsonb_array_elements_text(request.current_snapshot->'admin_user_ids'))
      AND 'operations'=ANY(COALESCE(NULLIF(operator.staff_roles, ARRAY[]::text[]),ARRAY[operator.staff_role]))),'[]'::jsonb),
  'sales_admin_user_ids', COALESCE((SELECT jsonb_agg(operator.id ORDER BY operator.id) FROM public.app_users operator
    WHERE operator.id::text IN (SELECT jsonb_array_elements_text(request.current_snapshot->'admin_user_ids'))
      AND 'sales'=ANY(COALESCE(NULLIF(operator.staff_roles, ARRAY[]::text[]),ARRAY[operator.staff_role]))),'[]'::jsonb)
), proposed_snapshot=request.proposed_snapshot || jsonb_build_object(
  'operations_admin_user_ids', COALESCE((SELECT jsonb_agg(operator.id ORDER BY operator.id) FROM public.app_users operator
    WHERE operator.id::text IN (SELECT jsonb_array_elements_text(request.proposed_snapshot->'admin_user_ids'))
      AND 'operations'=ANY(COALESCE(NULLIF(operator.staff_roles, ARRAY[]::text[]),ARRAY[operator.staff_role]))),'[]'::jsonb),
  'sales_admin_user_ids', COALESCE((SELECT jsonb_agg(operator.id ORDER BY operator.id) FROM public.app_users operator
    WHERE operator.id::text IN (SELECT jsonb_array_elements_text(request.proposed_snapshot->'admin_user_ids'))
      AND 'sales'=ANY(COALESCE(NULLIF(operator.staff_roles, ARRAY[]::text[]),ARRAY[operator.staff_role]))),'[]'::jsonb)
)
WHERE request.status='pending' AND NOT request.current_snapshot ? 'shipment_job_id'
  AND NOT request.current_snapshot ? 'operations_admin_user_ids';

CREATE OR REPLACE FUNCTION public.review_shipper_change_request(request_id uuid, next_status text)
 RETURNS TABLE(id uuid, email text, shipper_name text, zipcode text, shipper_address text, telephone text, budget numeric, contact_person text, notes text, approval_status text, created_by text, created_at timestamp with time zone, updated_at timestamp with time zone, auth0_provisioning_status text, admin_assignments jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  reviewer_id uuid;
  reviewer_email text := public.current_app_user_email();
  pending_request public.shipper_change_requests%rowtype;
  updated_user_ids uuid[];
  proposed_admin_ids uuid[];
  target_job public.shipment_jobs%rowtype;
  proposed_ops_ids uuid[];
  proposed_sales_ids uuid[];
begin
  select app_user.id into reviewer_id
  from public.app_users app_user
  where lower(trim(app_user.email)) = reviewer_email
    and app_user.role = 'super_admin'
    and app_user.is_active and app_user.deleted_at is null
  limit 1;

  if reviewer_id is null or next_status not in ('approved', 'rejected') then
    raise exception 'Only the authenticated super admin can review shipper changes'
      using errcode = '42501';
  end if;

  select * into pending_request
  from public.shipper_change_requests request
  where request.id = request_id and request.status = 'pending'
  for update;

  if not found then
    raise exception 'Pending shipper change request was not found' using errcode = 'P0002';
  end if;

  if next_status = 'approved' and pending_request.proposed_snapshot ? 'shipment_job_id' then
    select * into target_job
    from public.shipment_jobs job
    where job.id = (pending_request.proposed_snapshot->>'shipment_job_id')::uuid
      and job.deleted_at is null
    for update;

    if target_job.id is null
      or to_jsonb(target_job.operations_admin_user_ids) is distinct from pending_request.current_snapshot->'operations_admin_user_ids'
      or to_jsonb(target_job.sales_admin_user_ids) is distinct from pending_request.current_snapshot->'sales_admin_user_ids' then
      raise exception 'Shipment assignments changed after this request was submitted; reject it and submit a new request'
        using errcode = '40001';
    end if;

    select coalesce(array_agg(value::uuid), array[]::uuid[]) into proposed_ops_ids
    from jsonb_array_elements_text(coalesce(pending_request.proposed_snapshot->'operations_admin_user_ids', '[]'::jsonb)) item(value);
    select coalesce(array_agg(value::uuid), array[]::uuid[]) into proposed_sales_ids
    from jsonb_array_elements_text(coalesce(pending_request.proposed_snapshot->'sales_admin_user_ids', '[]'::jsonb)) item(value);

    update public.shipment_jobs job
    set operations_admin_user_ids = proposed_ops_ids,
        sales_admin_user_ids = proposed_sales_ids,
        assigned_admin_user_ids = array(select distinct unnest(proposed_ops_ids || proposed_sales_ids)),
        updated_at = now()
    where job.id = target_job.id;
  elsif next_status = 'approved' then
    -- Use the same lock order as direct staff saves before checking the snapshot.
    perform contact.id from public.app_users contact
    where contact.role='normal' and contact.is_active and contact.deleted_at is null
      and contact.shipper_name=pending_request.shipper_name
      and coalesce(contact.created_by,'')=coalesce(pending_request.shipper_created_by,'')
    order by contact.id for update;
    if pending_request.current_snapshot ? 'operations_admin_user_ids' then
      if public.shipper_group_snapshot(pending_request.target_user_id) is distinct from pending_request.current_snapshot then
        raise exception 'Shipper data changed after this request; reject it and submit a new request' using errcode='40001';
      end if;
    else
      -- Existing pending requests must be resubmitted rather than guessing their role intent.
      raise exception 'This request predates separate customer duties; reject it and submit a new request' using errcode='40001';
    end if;
    proposed_ops_ids:=ARRAY(select value::uuid from jsonb_array_elements_text(pending_request.proposed_snapshot->'operations_admin_user_ids') items(value));
    proposed_sales_ids:=ARRAY(select value::uuid from jsonb_array_elements_text(pending_request.proposed_snapshot->'sales_admin_user_ids') items(value));
    perform public.validate_shipper_staff_selection(proposed_ops_ids,proposed_sales_ids);

    select array_agg(updated_user.id) into updated_user_ids
    from public.update_registered_shipper_contacts_unchecked_20260822(
      pending_request.target_user_id,
      pending_request.proposed_snapshot->>'shipper_name',
      pending_request.proposed_snapshot->>'zipcode',
      pending_request.proposed_snapshot->>'shipper_address',
      pending_request.proposed_snapshot->>'telephone',
      (pending_request.proposed_snapshot->>'budget')::numeric,
      pending_request.proposed_snapshot->'contacts',
      pending_request.proposed_snapshot->>'notes'
    ) updated_user;

    select coalesce(array_agg(value::uuid), array[]::uuid[]) into proposed_admin_ids
    from jsonb_array_elements_text(coalesce(pending_request.proposed_snapshot->'admin_user_ids', '[]'::jsonb)) item(value);

    delete from public.app_user_admin_assignments assignment
    where assignment.normal_user_id = any(coalesce(updated_user_ids, array[]::uuid[]));
    insert into public.app_user_admin_assignments(normal_user_id, admin_user_id, assigned_by, assignment_roles)
    select shipper_user_id, admin_user_id, reviewer_email, ARRAY(
      select duty from (values ('operations',admin_user_id=ANY(proposed_ops_ids)),
        ('sales',admin_user_id=ANY(proposed_sales_ids))) duties(duty,chosen) where chosen order by duty)
    from unnest(coalesce(updated_user_ids, array[]::uuid[])) shipper(shipper_user_id)
    cross join unnest(proposed_admin_ids) admin(admin_user_id)
    on conflict (normal_user_id, admin_user_id) do update
    set assigned_by = excluded.assigned_by, assignment_roles=excluded.assignment_roles, updated_at = now();
    update public.app_users shipper_user
    set approval_status = 'approved', updated_at = now()
    where shipper_user.id = any(coalesce(updated_user_ids, array[]::uuid[]));
  end if;

  update public.shipper_change_requests change_request
  set status = next_status, reviewed_by = reviewer_id,
      reviewed_by_email = reviewer_email, reviewed_at = now(), updated_at = now()
  where change_request.id = request_id;

  return query
  select app_user.id, app_user.email, app_user.shipper_name, app_user.zipcode,
    app_user.shipper_address, app_user.telephone, app_user.budget,
    app_user.contact_person, app_user.notes, app_user.approval_status,
    app_user.created_by, app_user.created_at, app_user.updated_at,
    app_user.auth0_provisioning_status,
    public.get_normal_user_admin_assignments(app_user.id)
  from public.app_users app_user
  where app_user.role = 'normal' and app_user.is_active and app_user.deleted_at is null
    and lower(trim(app_user.shipper_name)) = lower(trim(pending_request.shipper_name))
  order by app_user.created_at, app_user.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_accessible_shipper_admin_assignments(requester_email text)
 RETURNS TABLE(shipper_name text, admin_assignments jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH requested_user AS (
    SELECT app_users.shipper_name
    FROM public.app_users
    WHERE lower(trim(app_users.email)) = lower(trim(requester_email))
      AND app_users.role = 'normal'
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
      AND public.authenticated_caller_can_assume_email(app_users.email)
    LIMIT 1
  ), assigned_ids AS (
    SELECT assignment.admin_user_id, duty AS assignment_role
    FROM public.app_users AS shipper_user
    JOIN public.app_user_admin_assignments AS assignment
      ON assignment.normal_user_id = shipper_user.id
    CROSS JOIN requested_user
    CROSS JOIN LATERAL unnest(assignment.assignment_roles) duties(duty)
    WHERE shipper_user.role = 'normal'
      AND shipper_user.is_active AND shipper_user.deleted_at IS NULL
      AND lower(trim(shipper_user.shipper_name)) = lower(trim(requested_user.shipper_name))
    UNION
    SELECT selected.id, selected.duty
    FROM public.shipment_jobs AS job CROSS JOIN requested_user
    CROSS JOIN LATERAL (
      SELECT id,'operations' AS duty FROM unnest(COALESCE(job.operations_admin_user_ids,ARRAY[]::uuid[])) ids(id)
      UNION SELECT id,'sales' FROM unnest(COALESCE(job.sales_admin_user_ids,ARRAY[]::uuid[])) ids(id)
    ) selected
    WHERE job.deleted_at IS NULL
      AND lower(trim(job.shipper_name)) = lower(trim(requested_user.shipper_name))
  ), grouped_ids AS (SELECT admin_user_id, array_agg(DISTINCT assignment_role ORDER BY assignment_role) AS assignment_roles FROM assigned_ids GROUP BY admin_user_id)
  SELECT requested_user.shipper_name, COALESCE(jsonb_agg(
    jsonb_build_object(
      'admin_user_id', operator.id,
      'email', operator.email,
      'user_name', operator.user_name,
      'staff_role', COALESCE(operator.staff_role, 'other'),
      'assignment_roles',assigned_ids.assignment_roles,
      'staff_roles', COALESCE(NULLIF(operator.staff_roles, ARRAY[]::text[]), ARRAY[COALESCE(operator.staff_role, 'other')]::text[]),
      'created_at', operator.created_at,
      'updated_at', operator.updated_at
    ) ORDER BY operator.email
  ) FILTER (WHERE operator.id IS NOT NULL), '[]'::jsonb)
  FROM requested_user
  LEFT JOIN grouped_ids AS assigned_ids ON true
  LEFT JOIN public.app_users AS operator
    ON operator.id = assigned_ids.admin_user_id
    AND (operator.role = 'admin' OR (operator.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(NULLIF(operator.staff_roles, ARRAY[]::text[]), ARRAY[COALESCE(operator.staff_role, 'other')]::text[]))))
    AND operator.is_active = true
    AND operator.deleted_at IS NULL
  GROUP BY requested_user.shipper_name;
$function$;

CREATE OR REPLACE FUNCTION public.save_accessible_shipment_job(requester_email text, target_job_id uuid, job_payload jsonb, documents_payload jsonb, events_payload jsonb, create_new boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  requester_record record;
  target_shipper_name text := NULLIF(job_payload->>'shipper_name', '');
  next_ops_ids uuid[];
  next_sales_ids uuid[];
BEGIN
  SELECT app_users.id, app_users.email, app_users.role INTO requester_record
  FROM public.app_users
  WHERE lower(trim(app_users.email)) = lower(trim(requester_email))
    AND app_users.role IN ('admin', 'super_admin')
    AND app_users.is_active AND app_users.deleted_at IS NULL
    AND public.authenticated_caller_can_assume_email(app_users.email)
  LIMIT 1;
  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'The authenticated operator cannot save shipment jobs'
      USING ERRCODE = '42501';
  END IF;
  IF target_shipper_name IS NULL OR NOT public.can_requester_access_shipment_shipper(
    requester_record.id, requester_record.email, requester_record.role,
    target_shipper_name
  ) THEN
    RAISE EXCEPTION 'The authenticated operator cannot access this shipper'
      USING ERRCODE = '42501';
  END IF;

  IF create_new THEN
    IF requester_record.role = 'admin' THEN
      next_ops_ids := ARRAY[requester_record.id]::uuid[];
      SELECT COALESCE(array_agg(DISTINCT operator.id ORDER BY operator.id), ARRAY[]::uuid[])
      INTO next_sales_ids
      FROM public.app_users AS shipper_user
      JOIN public.app_user_admin_assignments AS assignment
        ON assignment.normal_user_id = shipper_user.id
      JOIN public.app_users AS operator ON operator.id = assignment.admin_user_id
      WHERE shipper_user.role = 'normal'
        AND shipper_user.is_active = true
        AND shipper_user.deleted_at IS NULL
        AND lower(trim(shipper_user.shipper_name)) = lower(trim(target_shipper_name))
        AND (operator.role = 'admin' OR (operator.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(NULLIF(operator.staff_roles, ARRAY[]::text[]), ARRAY[COALESCE(operator.staff_role, 'other')]::text[]))))
        AND operator.is_active = true
        AND operator.deleted_at IS NULL
        AND 'sales' = ANY(assignment.assignment_roles);
    ELSE
      next_ops_ids := COALESCE(ARRAY(
        SELECT DISTINCT jsonb_array_elements_text(
          COALESCE(job_payload->'operations_admin_user_ids', '[]'::jsonb)
        )::uuid
      ), ARRAY[]::uuid[]);
      next_sales_ids := COALESCE(ARRAY(
        SELECT DISTINCT jsonb_array_elements_text(
          COALESCE(job_payload->'sales_admin_user_ids', '[]'::jsonb)
        )::uuid
      ), ARRAY[]::uuid[]);
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(next_ops_ids || next_sales_ids) AS selected(id)
      LEFT JOIN public.app_users AS operator
        ON operator.id = selected.id
        AND (operator.role = 'admin' OR (operator.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(NULLIF(operator.staff_roles, ARRAY[]::text[]), ARRAY[COALESCE(operator.staff_role, 'other')]::text[]))))
        AND operator.is_active = true
        AND operator.deleted_at IS NULL
      WHERE operator.id IS NULL
    ) THEN
      RAISE EXCEPTION 'One or more selected shipment admins are not assignable'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.shipment_jobs (
      id, status, under_process_from_date, under_process_to_date,
      customs_hold_from_date, customs_hold_to_date, completed_from_date,
      completed_to_date, trade_mode, trade_term, invoice_number, job_number,
      transport_mode, shipper_name, consignee_name, consignor_name, pol_aol,
      pod_aod, vessel_flight_numbers, mbl_mawb, hbl_hawb, bl_awb_date,
      assigned_admin_user_ids, operations_admin_user_ids, sales_admin_user_ids,
      created_by_admin_user_id, progress_percent, progress_color_hex,
      documents, internal_documents, notes
    ) VALUES (
      target_job_id, job_payload->>'status',
      NULLIF(job_payload->>'under_process_from_date', '')::date,
      NULLIF(job_payload->>'under_process_to_date', '')::date,
      NULLIF(job_payload->>'customs_hold_from_date', '')::date,
      NULLIF(job_payload->>'customs_hold_to_date', '')::date,
      NULLIF(job_payload->>'completed_from_date', '')::date,
      NULLIF(job_payload->>'completed_to_date', '')::date,
      job_payload->>'trade_mode', NULLIF(job_payload->>'trade_term', ''),
      NULLIF(job_payload->>'invoice_number', ''), NULLIF(job_payload->>'job_number', ''),
      NULLIF(job_payload->>'transport_mode', ''), target_shipper_name,
      NULLIF(job_payload->>'consignee_name', ''), NULLIF(job_payload->>'consignor_name', ''),
      NULLIF(job_payload->>'pol_aol', ''), NULLIF(job_payload->>'pod_aod', ''),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(job_payload->'vessel_flight_numbers')), ARRAY[]::text[]),
      NULLIF(job_payload->>'mbl_mawb', ''), NULLIF(job_payload->>'hbl_hawb', ''),
      NULLIF(job_payload->>'bl_awb_date', '')::date,
      ARRAY(SELECT DISTINCT selected_id FROM unnest(next_ops_ids || next_sales_ids) AS selected(selected_id) ORDER BY selected_id),
      next_ops_ids, next_sales_ids, requester_record.id,
      NULLIF(job_payload->>'progress_percent', '')::integer,
      NULLIF(job_payload->>'progress_color_hex', ''),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(job_payload->'documents')), ARRAY[]::text[]),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(job_payload->'internal_documents')), ARRAY[]::text[]),
      NULLIF(job_payload->>'notes', '')
    );
  ELSE
    PERFORM public.update_accessible_shipment_job(requester_email, target_job_id, job_payload);
  END IF;
  PERFORM public.replace_accessible_shipment_documents(
    requester_email, target_job_id, COALESCE(documents_payload, '[]'::jsonb)
  );
  PERFORM public.replace_accessible_shipment_tracking_events(
    requester_email, target_job_id, COALESCE(events_payload, '[]'::jsonb)
  );
  RETURN target_job_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_app_event_triggers()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE event_name text; actor text; assignment_changed boolean;
BEGIN
  IF TG_TABLE_NAME = 'shipment_jobs' THEN
    IF TG_OP = 'INSERT' THEN event_name := 'shipment_created';
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN event_name := 'shipment_status_updated';
    ELSE RETURN NEW; END IF;
    PERFORM public.emit_app_notification(event_name, NEW.shipper_name,
      public.current_app_user_email(), COALESCE(NEW.invoice_number, NEW.job_number, NEW.id::text),
      jsonb_build_object('job_id', NEW.id, 'previous_status', CASE WHEN TG_OP='UPDATE' THEN OLD.status END,
        'current_status', NEW.status), true, event_name = 'shipment_status_updated');
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'shipper_change_requests' THEN
    assignment_changed := NEW.current_snapshot->'admin_user_ids'
      IS DISTINCT FROM NEW.proposed_snapshot->'admin_user_ids'
      OR NEW.current_snapshot->'operations_admin_user_ids' IS DISTINCT FROM NEW.proposed_snapshot->'operations_admin_user_ids'
      OR NEW.current_snapshot->'sales_admin_user_ids' IS DISTINCT FROM NEW.proposed_snapshot->'sales_admin_user_ids';
    IF TG_OP = 'INSERT' THEN
      event_name := CASE WHEN assignment_changed THEN 'assignment_change_requested' ELSE 'shipper_update_requested' END;
      actor := NEW.requested_by_email;
    ELSIF OLD.status = 'pending' AND NEW.status IN ('approved','rejected') THEN
      event_name := CASE WHEN assignment_changed THEN 'assignment_change_' ELSE 'shipper_update_' END || NEW.status;
      actor := NEW.reviewed_by_email;
    ELSE RETURN NEW; END IF;
    PERFORM public.emit_app_notification(event_name, NEW.shipper_name, actor,
      NEW.shipper_name, jsonb_build_object('request_id', NEW.id, 'status', NEW.status), true, false);
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'shipment_documents' THEN
    IF TG_OP = 'INSERT' AND NEW.scope = 'customer' THEN event_name := 'customer_document_added';
    ELSIF OLD.approval_status IS DISTINCT FROM NEW.approval_status
      AND NEW.approval_status IN ('pending','approved','rejected') THEN
      event_name := 'document_download_' || NEW.approval_status;
    ELSE RETURN NEW; END IF;
    SELECT job.shipper_name INTO actor FROM public.shipment_jobs job WHERE job.id = NEW.shipment_job_id;
    PERFORM public.emit_app_notification(event_name, actor,
      COALESCE(NEW.approved_by, public.current_app_user_email()), NEW.name,
      jsonb_build_object('document_id', NEW.id, 'job_id', NEW.shipment_job_id), false, true);
    RETURN NEW;
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.sync_updated_shipment_assignees_to_shipper()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  insert into public.app_user_admin_assignments (
    normal_user_id,
    admin_user_id,
    assigned_by,
    assignment_roles
  )
  select distinct
    shipper_user.id,
    selected.admin_user_id,
    coalesce(
      nullif(public.current_app_user_email(), ''),
      'system:shipment-assignee-sync'
    ), ARRAY(SELECT duty FROM (VALUES
      ('operations',selected.admin_user_id=ANY(COALESCE(new.operations_admin_user_ids,ARRAY[]::uuid[]))),
      ('sales',selected.admin_user_id=ANY(COALESCE(new.sales_admin_user_ids,ARRAY[]::uuid[])))) duties(duty,chosen) WHERE chosen ORDER BY duty)
  from unnest(
    coalesce(new.operations_admin_user_ids, array[]::uuid[])
    || coalesce(new.sales_admin_user_ids, array[]::uuid[])
  ) as selected(admin_user_id)
  join public.app_users as operator
    on operator.id = selected.admin_user_id
    and (operator.role = 'admin' OR (operator.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(NULLIF(operator.staff_roles, ARRAY[]::text[]), ARRAY[COALESCE(operator.staff_role, 'other')]::text[]))))
    and operator.is_active = true
    and operator.deleted_at is null
  join public.app_users as shipper_user
    on shipper_user.role = 'normal'
    and shipper_user.is_active = true
    and shipper_user.deleted_at is null
    and lower(trim(shipper_user.shipper_name)) = lower(trim(new.shipper_name))
  on conflict (normal_user_id, admin_user_id) do update set assignment_roles=ARRAY(
    select distinct duty from unnest(public.app_user_admin_assignments.assignment_roles || excluded.assignment_roles) duties(duty) order by duty
  ) where not excluded.assignment_roles <@ public.app_user_admin_assignments.assignment_roles;

  return new;
end;
$function$;

DO $patch$
DECLARE source text;
BEGIN
  source:=pg_get_functiondef('public.update_registered_shipper_contacts_unchecked_20260822(uuid,text,text,text,text,numeric,jsonb,text)'::regprocedure);
  IF position('assignment.assignment_roles' in source)=0 THEN
    IF position('assignment.assigned_by' in source)=0 THEN RAISE EXCEPTION 'Unexpected contact-copy function'; END IF;
    source:=replace(source, '        assigned_by' || chr(10) || '      )',
      '        assigned_by,' || chr(10) || '        assignment_roles' || chr(10) || '      )');
    source:=replace(source, '        assignment.assigned_by' || chr(10),
      '        assignment.assigned_by,' || chr(10) || '        assignment.assignment_roles' || chr(10));
    source:=replace(source, 'assigned_by = EXCLUDED.assigned_by,', 'assigned_by = EXCLUDED.assigned_by, assignment_roles = EXCLUDED.assignment_roles,');
    IF position('assignment.assignment_roles' in source)=0 THEN RAISE EXCEPTION 'Contact-copy patch did not match'; END IF;
    EXECUTE source;
  END IF;
END;
$patch$;

NOTIFY pgrst, 'reload schema';
