/*
  Allow every active regular administrator to submit an approved shipper
  change request, including when a super administrator is switched into that
  administrator's view. The visible administrator remains the audit actor.
*/

DROP FUNCTION IF EXISTS public.submit_shipper_change_request(
  uuid, text, text, text, text, numeric, jsonb, text, uuid[]
);

CREATE FUNCTION public.submit_shipper_change_request(
  target_user_id uuid,
  proposed_shipper_name text,
  proposed_zipcode text,
  proposed_shipper_address text,
  proposed_telephone text,
  proposed_budget numeric,
  proposed_contacts jsonb,
  proposed_notes text,
  proposed_admin_user_ids uuid[],
  requester_email text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_id uuid;
  normalized_requester_email text := lower(trim(requester_email));
  target_record record;
  normalized_contacts jsonb;
  normalized_admin_ids uuid[];
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

  IF requester_id IS NULL OR target_record.approval_status <> 'approved' THEN
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
  FROM unnest(COALESCE(proposed_admin_user_ids, ARRAY[]::uuid[])) AS selected(selected_id);

  IF EXISTS (
    SELECT 1
    FROM unnest(normalized_admin_ids) AS selected(id)
    LEFT JOIN public.app_users AS operator
      ON operator.id = selected.id
      AND operator.role = 'admin'
      AND operator.is_active
      AND operator.deleted_at IS NULL
    WHERE operator.id IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more selected admins are not assignable' USING ERRCODE = '22023';
  END IF;

  current_data := public.shipper_group_snapshot(target_user_id);
  proposed_data := jsonb_build_object(
    'shipper_name', trim(proposed_shipper_name),
    'zipcode', trim(proposed_zipcode),
    'shipper_address', trim(proposed_shipper_address),
    'telephone', trim(proposed_telephone),
    'budget', proposed_budget,
    'notes', trim(COALESCE(proposed_notes, '')),
    'contacts', normalized_contacts,
    'admin_user_ids', to_jsonb(normalized_admin_ids)
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
$$;

REVOKE ALL ON FUNCTION public.submit_shipper_change_request(
  uuid, text, text, text, text, numeric, jsonb, text, uuid[], text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_shipper_change_request(
  uuid, text, text, text, text, numeric, jsonb, text, uuid[], text
) TO authenticated, service_role;
