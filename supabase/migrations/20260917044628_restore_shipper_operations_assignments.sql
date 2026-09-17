/* Restore shipper-level Ops assignments alongside Sales assignments. */

SET lock_timeout = '5s';

DROP TRIGGER enforce_sales_only_shipper_assignment
  ON public.app_user_admin_assignments;
DROP FUNCTION public.enforce_sales_only_shipper_assignment();

CREATE FUNCTION public.enforce_shipper_staff_assignment_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.app_users AS operator
    WHERE operator.id = NEW.admin_user_id
      AND operator.role = 'admin'
      AND operator.is_active = true
      AND operator.deleted_at IS NULL
      AND COALESCE(
        operator.staff_roles,
        ARRAY[COALESCE(operator.staff_role, 'other')]::text[]
      ) && ARRAY['operations', 'sales']::text[]
  ) THEN
    -- Legacy registration functions also try to bind their creator. Ignore
    -- that automatic link when the creator is neither Ops nor Sales.
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_shipper_staff_assignment_role
BEFORE INSERT OR UPDATE OF admin_user_id
ON public.app_user_admin_assignments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_shipper_staff_assignment_role();

REVOKE ALL ON FUNCTION public.enforce_shipper_staff_assignment_role()
  FROM PUBLIC, anon, authenticated;

-- The earlier Sales-only migration removed Ops-only shipper links. Recover the
-- available relationship from the immutable Ops snapshots on existing jobs.
INSERT INTO public.app_user_admin_assignments (
  normal_user_id,
  admin_user_id,
  assigned_by
)
SELECT DISTINCT
  shipper_user.id,
  operator.id,
  'migration:restore-shipper-operations-assignments'
FROM public.shipment_jobs AS job
CROSS JOIN LATERAL unnest(
  COALESCE(job.operations_admin_user_ids, ARRAY[]::uuid[])
) AS selected(admin_user_id)
JOIN public.app_users AS operator
  ON operator.id = selected.admin_user_id
JOIN public.app_users AS shipper_user
  ON shipper_user.role = 'normal'
  AND shipper_user.is_active = true
  AND shipper_user.deleted_at IS NULL
  AND lower(trim(shipper_user.shipper_name)) = lower(trim(job.shipper_name))
WHERE job.deleted_at IS NULL
  AND operator.role = 'admin'
  AND operator.is_active = true
  AND operator.deleted_at IS NULL
  AND 'operations' = ANY(COALESCE(
    operator.staff_roles,
    ARRAY[COALESCE(operator.staff_role, 'other')]::text[]
  ))
ON CONFLICT (normal_user_id, admin_user_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
