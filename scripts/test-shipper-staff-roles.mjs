// Isolated PostgreSQL test. Pass a temporary directory containing @electric-sql/pglite.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const require = createRequire(resolve(process.argv[2] ?? ".", "package.json"));
const { PGlite } = require("@electric-sql/pglite");
const db = new PGlite();
process.on("uncaughtException", (error) => {
  console.error(
    error.code ?? "ASSERTION",
    error.message,
    error.where
      ?.split("\n")
      .filter((line) => line.startsWith("PL/pgSQL function")),
  );
  process.exit(1);
});
const migrationFile =
  "20261013100936_separate_shipper_ops_sales_assignments.sql";
const read = (file) =>
  readFileSync(
    new URL(`../supabase/migrations/${file}`, import.meta.url),
    "utf8",
  );
function previousFunction(file, name, rename = name) {
  const source = read(file);
  const pattern = new RegExp(
    `CREATE (?:OR REPLACE )?FUNCTION (?:public\\.)?${name}\\([\\s\\S]*?AS (\\$\\$|\\$function\\$)[\\s\\S]*?\\1;`,
    "i",
  );
  const definition = source.match(pattern)?.[0];
  if (!definition) throw Error(`Baseline ${name} not found`);
  return definition.replace(
    new RegExp(`FUNCTION (?:public\\.)?${name}\\(`, "i"),
    `FUNCTION public.${rename}(`,
  );
}
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('email',current_setting('test.email',true)) $$;
CREATE FUNCTION current_app_user_email() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('test.email',true) $$;
CREATE FUNCTION current_app_user_role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('test.role',true) $$;
CREATE FUNCTION authenticated_caller_can_manage_normal_user(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT COALESCE(current_setting('test.manage',true),'false')='true' $$;
CREATE FUNCTION authenticated_caller_can_assume_email(text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1=current_setting('test.email',true) $$;
CREATE FUNCTION queue_shipper_registration_approval_emails(text,text) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION emit_app_notification(text,text,text,text,jsonb,boolean,boolean) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE TABLE app_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text UNIQUE,user_name text,role text,staff_role text,staff_roles text[],shipper_name text,zipcode text,shipper_address text,telephone text,budget numeric DEFAULT 0,contact_person text,notes text,approval_status text DEFAULT 'to_be_approved',created_by text,is_active boolean DEFAULT true,deleted_at timestamptz,deleted_by text,temporary_password text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),auth0_provisioning_status text DEFAULT 'provisioned');
CREATE TABLE app_user_admin_assignments(normal_user_id uuid REFERENCES app_users(id),admin_user_id uuid REFERENCES app_users(id),assigned_by text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),PRIMARY KEY(normal_user_id,admin_user_id));
CREATE TABLE shipment_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),shipper_name text,operations_admin_user_ids uuid[],sales_admin_user_ids uuid[],assigned_admin_user_ids uuid[],created_by_admin_user_id uuid,deleted_at timestamptz,updated_at timestamptz DEFAULT now());
CREATE TABLE shipper_change_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),target_user_id uuid,shipper_name text,shipper_created_by text,requested_by uuid,requested_by_email text,current_snapshot jsonb,proposed_snapshot jsonb,status text DEFAULT 'pending',reviewed_by uuid,reviewed_by_email text,reviewed_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
SET test.email='super@example.test'; SET test.role='super_admin'; SET test.manage='true';
`);
await db.exec(
  previousFunction(
    "20260916025351_shipper_change_request_approval.sql",
    "shipper_group_snapshot",
  ),
);
await db.exec(
  previousFunction(
    "20260529100000_rename_company_to_shipper.sql",
    "update_registered_shipper_contacts",
    "update_registered_shipper_contacts_unchecked_20260822",
  ),
);
await db.exec(
  previousFunction(
    "20260917044628_restore_shipper_operations_assignments.sql",
    "enforce_shipper_staff_assignment_role",
  ),
);
await db.exec(
  "CREATE TRIGGER enforce_shipper_staff_assignment_role BEFORE INSERT OR UPDATE OF admin_user_id ON app_user_admin_assignments FOR EACH ROW EXECUTE FUNCTION enforce_shipper_staff_assignment_role()",
);
await db.exec(
  previousFunction(
    "20260529100000_rename_company_to_shipper.sql",
    "create_registered_normal_user",
    "create_registered_normal_user_unchecked_20260822",
  ),
);
await db.exec(
  previousFunction(
    "20260822014316_harden_legacy_auth_and_storage.sql",
    "create_registered_normal_user",
  ),
);
await db.exec(
  "CREATE UNIQUE INDEX one_pending_company ON shipper_change_requests(shipper_name,COALESCE(shipper_created_by,'')) WHERE status='pending'",
);
// Enough shipment columns to exercise the real default-assignment save function.
await db.exec(`
ALTER TABLE shipment_jobs
  ADD COLUMN status text, ADD COLUMN under_process_from_date date, ADD COLUMN under_process_to_date date,
  ADD COLUMN customs_hold_from_date date, ADD COLUMN customs_hold_to_date date, ADD COLUMN completed_from_date date,
  ADD COLUMN completed_to_date date, ADD COLUMN trade_mode text, ADD COLUMN trade_term text,
  ADD COLUMN invoice_number text, ADD COLUMN job_number text, ADD COLUMN transport_mode text,
  ADD COLUMN consignee_name text, ADD COLUMN consignor_name text, ADD COLUMN pol_aol text, ADD COLUMN pod_aod text,
  ADD COLUMN vessel_flight_numbers text[], ADD COLUMN mbl_mawb text, ADD COLUMN hbl_hawb text, ADD COLUMN bl_awb_date date,
  ADD COLUMN progress_percent integer, ADD COLUMN progress_color_hex text, ADD COLUMN documents text[],
  ADD COLUMN internal_documents text[], ADD COLUMN notes text;
CREATE FUNCTION can_requester_access_shipment_shipper(uuid,text,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION replace_accessible_shipment_documents(text,uuid,jsonb) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION replace_accessible_shipment_tracking_events(text,uuid,jsonb) RETURNS void LANGUAGE sql AS $$ SELECT $$;
`);
const insertUser = async (email, role, roles, name = null, creator = null) =>
  (
    await db.query(
      `INSERT INTO app_users(email,role,staff_roles,staff_role,user_name,shipper_name,created_by,zipcode,shipper_address,telephone,contact_person) VALUES($1,$2,$3,($3::text[])[1],$1,$4,$5,'1000001','Tokyo','000','Contact') RETURNING id`,
      [email, role, roles, name, creator],
    )
  ).rows[0].id;
const superId = await insertUser("super@example.test", "super_admin", [
  "other",
]);
const dual = await insertUser("dual@example.test", "admin", [
  "operations",
  "sales",
]);
const sales = await insertUser("sales@example.test", "admin", ["sales"]);
const liang = await insertUser("liang@example.test", "super_admin", ["sales"]);
const contact = await insertUser(
  "a@example.test",
  "normal",
  [],
  "ABC",
  "creator@example.test",
);
const contact2 = await insertUser(
  "b@example.test",
  "normal",
  [],
  "ABC",
  "creator@example.test",
);
const unrelated = await insertUser(
  "other@example.test",
  "normal",
  [],
  "ABC",
  "different@example.test",
);
await db.query(
  "INSERT INTO app_user_admin_assignments(normal_user_id,admin_user_id) VALUES($1,$2),($3,$2)",
  [contact, dual, contact2],
);
// Existing pending requests must be carried through the migration, including dual-role staff.
const snapshot = (
  await db.query("SELECT shipper_group_snapshot($1) AS snapshot", [contact])
).rows[0].snapshot;
const legacyId = (
  await db.query(
    "INSERT INTO shipper_change_requests(target_user_id,shipper_name,shipper_created_by,current_snapshot,proposed_snapshot) VALUES($1,$2,'creator@example.test',$3,$3) RETURNING id",
    [contact, "ABC", snapshot],
  )
).rows[0].id;
await db.exec(`BEGIN; ${read(migrationFile)} COMMIT;`);
await db.exec(
  `BEGIN; ${read("20261013113439_fix_shipper_staff_assignment_edge_cases.sql")} COMMIT;`,
);
await db.exec(
  previousFunction(
    "20261013091109_allow_super_admin_sales_assignments.sql",
    "enforce_shipment_assignment_roles",
  ),
);
await db.exec(
  "CREATE TRIGGER enforce_shipment_roles BEFORE INSERT OR UPDATE ON shipment_jobs FOR EACH ROW EXECUTE FUNCTION enforce_shipment_assignment_roles()",
);
const roles = async (id, operator = dual) =>
  (
    await db.query(
      "SELECT assignment_roles FROM app_user_admin_assignments WHERE normal_user_id=$1 AND admin_user_id=$2",
      [id, operator],
    )
  ).rows[0]?.assignment_roles;
assert.deepEqual(await roles(contact), ["operations", "sales"]);
assert.deepEqual(
  (
    await db.query(
      "SELECT current_snapshot FROM shipper_change_requests WHERE id=$1",
      [legacyId],
    )
  ).rows[0].current_snapshot.operations_admin_user_ids,
  [dual],
);
await db.query("SELECT * FROM review_shipper_change_request($1,'approved')", [
  legacyId,
]);
assert.deepEqual(await roles(contact), ["operations", "sales"]);
const save = (ops, salesIds, email = "super@example.test", id = contact) =>
  db.query(
    "SELECT * FROM update_accessible_shipper_staff_assignments($1,$2,$3,$4)",
    [email, id, ops, salesIds],
  );
await save([dual], []);
assert.deepEqual(await roles(contact), ["operations"]);
assert.deepEqual(await roles(contact2), ["operations"]);
assert.equal(await roles(unrelated), undefined);
const payload = (
  await db.query(
    "SELECT get_normal_user_admin_assignments($1) AS assignments",
    [contact],
  )
).rows[0].assignments[0];
assert.deepEqual(payload.assignment_roles, ["operations"]);
assert.deepEqual(payload.staff_roles, ["operations", "sales"]);
await save([], [dual]);
assert.deepEqual(await roles(contact), ["sales"]);
await save([dual], [dual]);
assert.deepEqual(await roles(contact), ["operations", "sales"]);
await save([dual], []);
const before = (
  await db.query("SELECT updated_at FROM app_users WHERE id=$1", [contact])
).rows[0].updated_at;
await save([dual], []);
assert.deepEqual(
  (await db.query("SELECT updated_at FROM app_users WHERE id=$1", [contact]))
    .rows[0].updated_at,
  before,
);
await db.query(
  "SELECT * FROM update_accessible_normal_user_admin_assignments($1,$2,$3)",
  ["super@example.test", contact, [dual]],
);
assert.deepEqual(await roles(contact), ["operations"]);
await assert.rejects(
  () => save([sales], []),
  (e) => e.code === "22023",
);
await assert.rejects(
  () => save([liang], []),
  (e) => e.code === "22023",
);
await save([dual], [liang]);
assert.deepEqual(await roles(contact, liang), ["sales"]);
await assert.rejects(
  () => save([null], []),
  (e) => e.code === "22023",
);
await assert.rejects(
  () => save([dual], [], "forged@example.test"),
  (e) => e.code === "42501",
);
await db.exec("SET test.manage='false'");
await assert.rejects(
  () => save([dual], []),
  (e) => e.code === "42501",
);
await db.exec("SET test.manage='true'");
await db.query(
  "UPDATE app_users SET approval_status=$1 WHERE shipper_name=$2",
  ["approved", "ABC"],
);
await db.exec("SET test.email='dual@example.test';SET test.role='admin'");
await assert.rejects(
  () => save([dual], [], "dual@example.test"),
  (e) => e.code === "42501",
);
const submit = (ops, salesIds) =>
  db.query(
    "SELECT submit_shipper_staff_change_request($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS id",
    [
      contact,
      "ABC",
      "1000001",
      "Tokyo",
      "000",
      0,
      [
        { id: contact, email: "a@example.test", contact_person: "Contact" },
        { id: contact2, email: "b@example.test", contact_person: "Contact" },
      ],
      "",
      ops,
      salesIds,
      "dual@example.test",
    ],
  );
const requestId = (await submit([], [dual])).rows[0].id;
const proposed = (
  await db.query(
    "SELECT proposed_snapshot FROM shipper_change_requests WHERE id=$1",
    [requestId],
  )
).rows[0].proposed_snapshot;
assert.deepEqual(proposed.operations_admin_user_ids, []);
assert.deepEqual(proposed.sales_admin_user_ids, [dual]);
await db.exec(
  "SET test.email='super@example.test';SET test.role='super_admin'",
);
await db.query("SELECT * FROM review_shipper_change_request($1,'approved')", [
  requestId,
]);
assert.deepEqual(await roles(contact), ["sales"]);
assert.deepEqual(await roles(contact2), ["sales"]);
// Ops-only customer selection must not become Sales merely because the person is dual-qualified.
await save([dual], []);
await db.exec("SET test.email='dual@example.test'; SET test.role='admin'");
const jobId = "10000000-0000-0000-0000-000000000001";
await db.query("SELECT save_accessible_shipment_job($1,$2,$3,$4,$5,true)", [
  "dual@example.test",
  jobId,
  { shipper_name: "ABC", status: "under_process" },
  [],
  [],
]);
assert.deepEqual(
  (
    await db.query(
      "SELECT sales_admin_user_ids FROM shipment_jobs WHERE id=$1",
      [jobId],
    )
  ).rows[0].sales_admin_user_ids,
  [],
);
await db.exec(
  "SET test.email='super@example.test'; SET test.role='super_admin'",
);
await save([], [dual]);
// Explicit shipment Sales additions merge only the actual assigned duty into the customer.
await db.exec(
  "CREATE TRIGGER sync_shipper_roles AFTER UPDATE OF operations_admin_user_ids,sales_admin_user_ids ON shipment_jobs FOR EACH ROW EXECUTE FUNCTION sync_updated_shipment_assignees_to_shipper()",
);
await db.query(
  "UPDATE shipment_jobs SET operations_admin_user_ids=ARRAY[]::uuid[],sales_admin_user_ids=ARRAY[$1::uuid] WHERE id=$2",
  [liang, jobId],
);
assert.equal(await roles(contact, liang), undefined);
// Adding a new contact copies the saved Sales-only assignment, not all qualifications.
const contacts = [
  { id: contact, email: "a@example.test", contact_person: "Contact" },
  { id: contact2, email: "b@example.test", contact_person: "Contact" },
  { email: "new@example.test", contact_person: "New Contact" },
];
await db.query(
  "SELECT * FROM update_registered_shipper_contacts_unchecked_20260822($1,$2,$3,$4,$5,$6,$7,$8)",
  [contact, "ABC", "1000001", "Tokyo", "000", 0, contacts, ""],
);
const newId = (
  await db.query("SELECT id FROM app_users WHERE email='new@example.test'")
).rows[0].id;
assert.deepEqual(await roles(newId), ["sales"]);
const createCompany = (name, email, opsIds, salesIds) =>
  db.query(
    "SELECT create_registered_shipper_with_staff_roles($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [
      name,
      "1000001",
      "Tokyo",
      "000",
      100,
      [{ email, contact_person: "New Contact" }],
      "",
      "super@example.test",
      opsIds,
      salesIds,
    ],
  );
const beforeCreate = (
  await db.query("SELECT count(*)::int AS count FROM app_users")
).rows[0].count;
await assert.rejects(
  () => createCompany("Invalid Company", "invalid@example.test", [sales], []),
  (e) => e.code === "22023",
);
assert.equal(
  (await db.query("SELECT count(*)::int AS count FROM app_users")).rows[0]
    .count,
  beforeCreate,
);
// Force a failure after registration but before assignments; all new contacts must roll back.
await db.exec("SET test.manage='false'");
await assert.rejects(
  () => createCompany("Rollback Company", "rollback@example.test", [dual], []),
  (e) => e.code === "42501",
);
await db.exec("SET test.manage='true'");
assert.equal(
  (await db.query("SELECT count(*)::int AS count FROM app_users")).rows[0]
    .count,
  beforeCreate,
);
await createCompany("Created Company", "created@example.test", [dual], []);
const createdId = (
  await db.query("SELECT id FROM app_users WHERE email='created@example.test'")
).rows[0].id;
assert.deepEqual(await roles(createdId), ["operations"]);
await assert.rejects(
  () => createCompany("Created Company", "extra@example.test", [], [dual]),
  (e) => e.code === "23505",
);
assert.deepEqual(await roles(createdId), ["operations"]);
// A role-only edit invalidates a pending request even when membership IDs are unchanged.
await db.query(
  "UPDATE app_users SET approval_status='approved' WHERE id=ANY($1)",
  [[contact, contact2, newId]],
);
await db.exec("SET test.email='dual@example.test';SET test.role='admin'");
const staleRequestId = (await submit([dual], [])).rows[0].id;
await db.exec(
  "SET test.email='super@example.test';SET test.role='super_admin'",
);
await save([dual], [dual]);
await assert.rejects(
  () =>
    db.query("SELECT * FROM review_shipper_change_request($1,'approved')", [
      staleRequestId,
    ]),
  (e) => e.code === "40001",
);
assert.deepEqual(await roles(contact), ["operations", "sales"]);
await save([], []);
assert.equal(await roles(contact), undefined);
assert.equal(await roles(contact2), undefined);
// Regression: shipment creator can be Ops without being Ops-qualified; customer sync must skip that duty.
const uniqueContact = await insertUser(
  "sync-contact@example.test",
  "normal",
  [],
  "Unique Sync",
  "creator@example.test",
);
await db.query(
  "INSERT INTO app_user_admin_assignments(normal_user_id,admin_user_id,assignment_roles) VALUES($1,$2,$3)",
  [uniqueContact, sales, ["sales"]],
);
const creatorJob = "10000000-0000-0000-0000-000000000002";
await db.query(
  "INSERT INTO shipment_jobs(id,shipper_name,operations_admin_user_ids,sales_admin_user_ids,created_by_admin_user_id) VALUES($1,$2,$3,$4,$5)",
  [creatorJob, "Unique Sync", [sales], [], sales],
);
await db.query("UPDATE shipment_jobs SET sales_admin_user_ids=$1 WHERE id=$2", [
  [liang],
  creatorJob,
]);
assert.deepEqual(await roles(uniqueContact, sales), ["sales"]);
assert.deepEqual(await roles(uniqueContact, liang), ["sales"]);
// Regression: review returns renamed contacts from exactly the same creator-defined company.
await db.query("SELECT * FROM review_shipper_change_request($1,'rejected')", [
  staleRequestId,
]);
await save([dual], []);
await db.query(
  "UPDATE app_users SET approval_status='approved' WHERE id=ANY($1)",
  [[contact, contact2, newId]],
);
await insertUser(
  "renamed-other@example.test",
  "normal",
  [],
  "Renamed Company",
  "different@example.test",
);
await db.exec("SET test.email='dual@example.test';SET test.role='admin'");
const renameId = (
  await db.query(
    "SELECT submit_shipper_staff_change_request($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS id",
    [
      contact,
      "Renamed Company",
      "1000001",
      "Tokyo",
      "000",
      0,
      [
        { id: contact, email: "a@example.test", contact_person: "Contact" },
        { id: contact2, email: "b@example.test", contact_person: "Contact" },
        { id: newId, email: "new@example.test", contact_person: "New Contact" },
      ],
      "",
      [dual],
      [],
      "dual@example.test",
    ],
  )
).rows[0].id;
await db.exec(
  "SET test.email='super@example.test';SET test.role='super_admin'",
);
const renamed = (
  await db.query("SELECT * FROM review_shipper_change_request($1,'approved')", [
    renameId,
  ])
).rows;
assert.equal(renamed.length, 3);
assert(
  renamed.every(
    (row) =>
      row.shipper_name === "Renamed Company" &&
      row.created_by === "creator@example.test",
  ),
);
assert.equal(
  (
    await db.query("SELECT shipper_name FROM app_users WHERE id=$1", [
      unrelated,
    ])
  ).rows[0].shipper_name,
  "ABC",
);
// A historical membership with no operational duties must not lose its access link on an unrelated duty save.
const legacyOther = await insertUser("legacy-other@example.test", "admin", [
  "other",
]);
await db.query(
  "INSERT INTO app_user_admin_assignments(normal_user_id,admin_user_id,assignment_roles) VALUES($1,$2,ARRAY[]::text[])",
  [uniqueContact, legacyOther],
);
await save([], [], "super@example.test", uniqueContact);
assert.deepEqual(await roles(uniqueContact, legacyOther), []);
await db.exec("SET ROLE anon");
await assert.rejects(
  () => save([], []),
  (e) => e.code === "42501",
);
await db.exec("RESET ROLE");

console.log(
  "PASS: backfill, pending request compatibility, independent duties, company isolation, idempotence, legacy saves, qualified staff, authentication, approved-record guard, approval/reopen, contact inheritance, atomic registration rollback, stale role-only requests, creator exemptions, rename isolation and empty-duty membership preservation",
);
await db.close();
