drop index if exists public.idx_shipment_feedback_job_submitter_operator;

create unique index idx_shipment_feedback_job_submitter_operator_role
  on public.shipment_feedback (
    shipment_job_id,
    lower(trim(submitter_email)),
    admin_operator_id,
    admin_operator_staff_role
  );
