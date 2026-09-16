/* Enforce shipment-role assignments independently of the client UI.
   The shipment creator is the only permitted exception to the global Ops role. */

CREATE FUNCTION public.enforce_shipment_assignment_roles()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM unnest(
      COALESCE(NEW.operations_admin_user_ids, ARRAY[]::uuid[])
    ) AS selected(id)
    LEFT JOIN public.app_users AS operator
      ON operator.id = selected.id
      AND operator.role = 'admin'
      AND operator.is_active = true
      AND operator.deleted_at IS NULL
    WHERE operator.id IS NULL
      OR (
        NOT ('operations' = ANY(COALESCE(
          operator.staff_roles,
          ARRAY[COALESCE(operator.staff_role, 'other')]::text[]
        )))
        AND selected.id IS DISTINCT FROM NEW.created_by_admin_user_id
      )
  ) THEN
    RAISE EXCEPTION 'Ops assignments require an active Operations admin or the shipment creator'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(
      COALESCE(NEW.sales_admin_user_ids, ARRAY[]::uuid[])
    ) AS selected(id)
    LEFT JOIN public.app_users AS operator
      ON operator.id = selected.id
      AND operator.role = 'admin'
      AND operator.is_active = true
      AND operator.deleted_at IS NULL
    WHERE operator.id IS NULL
      OR NOT ('sales' = ANY(COALESCE(
        operator.staff_roles,
        ARRAY[COALESCE(operator.staff_role, 'other')]::text[]
      )))
  ) THEN
    RAISE EXCEPTION 'Sales assignments require an active Sales admin'
      USING ERRCODE = '22023';
  END IF;

  NEW.assigned_admin_user_ids := ARRAY(
    SELECT DISTINCT selected_id
    FROM unnest(
      COALESCE(NEW.operations_admin_user_ids, ARRAY[]::uuid[])
      || COALESCE(NEW.sales_admin_user_ids, ARRAY[]::uuid[])
    ) AS selected(selected_id)
    ORDER BY selected_id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_shipment_assignment_roles
BEFORE INSERT OR UPDATE OF operations_admin_user_ids,
  sales_admin_user_ids, created_by_admin_user_id
ON public.shipment_jobs
FOR EACH ROW EXECUTE FUNCTION public.enforce_shipment_assignment_roles();

REVOKE ALL ON FUNCTION public.enforce_shipment_assignment_roles()
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
