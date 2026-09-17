DO $$
DECLARE pending_request record; pending_document record; pending_shipper record;
BEGIN
  FOR pending_request IN
    SELECT request.* FROM public.shipper_change_requests request
    WHERE request.status = 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM public.app_notifications notification
        WHERE notification.metadata->>'request_id' = request.id::text
      )
  LOOP
    PERFORM public.emit_app_notification(
      CASE WHEN pending_request.current_snapshot->'admin_user_ids'
        IS DISTINCT FROM pending_request.proposed_snapshot->'admin_user_ids'
        THEN 'assignment_change_requested' ELSE 'shipper_update_requested' END,
      pending_request.shipper_name, pending_request.requested_by_email,
      pending_request.shipper_name,
      jsonb_build_object('request_id', pending_request.id, 'status', 'pending'),
      true, false
    );
  END LOOP;

  FOR pending_document IN
    SELECT document.id, document.name, document.shipment_job_id,
      document.download_requested_by_user_id, job.shipper_name
    FROM public.shipment_documents document
    JOIN public.shipment_jobs job ON job.id = document.shipment_job_id
    WHERE document.approval_status = 'pending' AND document.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.app_notifications notification
        WHERE notification.metadata->>'document_id' = document.id::text
          AND notification.event_type = 'document_download_pending'
      )
  LOOP
    PERFORM public.emit_app_notification(
      'document_download_pending', pending_document.shipper_name,
      (SELECT email FROM public.app_users WHERE id=pending_document.download_requested_by_user_id),
      pending_document.name,
      jsonb_build_object('document_id',pending_document.id,'job_id',pending_document.shipment_job_id),
      false, true
    );
  END LOOP;

  FOR pending_shipper IN
    SELECT shipper.* FROM public.app_users shipper
    WHERE shipper.role='normal' AND shipper.approval_status='to_be_approved'
      AND shipper.is_active=true AND shipper.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.app_notifications notification
        WHERE notification.metadata->>'shipper_user_id'=shipper.id::text
          AND notification.event_type='shipper_created'
      )
  LOOP
    PERFORM public.emit_app_notification(
      'shipper_created',pending_shipper.shipper_name,pending_shipper.created_by,
      pending_shipper.shipper_name,jsonb_build_object('shipper_user_id',pending_shipper.id),
      true,false
    );
  END LOOP;
END $$;
