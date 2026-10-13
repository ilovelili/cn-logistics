// Pass a temporary directory containing @electric-sql/pglite; never connects to production.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const require = createRequire(resolve(process.argv[2] ?? ".", "package.json"));
const { PGlite } = require("@electric-sql/pglite");
const db = new PGlite();
const sql = readFileSync(
  new URL(
    "../supabase/migrations/20261013091109_allow_super_admin_sales_assignments.sql",
    import.meta.url,
  ),
  "utf8",
);
await db.exec(`
CREATE TABLE app_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text,user_name text,role text,staff_role text,staff_roles text[],is_active boolean DEFAULT true,deleted_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),auth0_provisioning_status text);
CREATE TABLE app_user_admin_assignments(normal_user_id uuid,admin_user_id uuid,assigned_by text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),PRIMARY KEY(normal_user_id,admin_user_id));
CREATE TABLE shipment_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),operations_admin_user_ids uuid[],sales_admin_user_ids uuid[],assigned_admin_user_ids uuid[],created_by_admin_user_id uuid);
CREATE FUNCTION authenticated_caller_can_assume_email(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION authenticated_caller_can_manage_normal_user(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION current_app_user_role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('test.role',true) $$;
CREATE FUNCTION current_app_user_email() RETURNS text LANGUAGE sql AS $$ SELECT 'super@example.test'::text $$;
SET test.role='super_admin';
`);
const tested = new Set([
  "list_assignable_admin_operators",
  "get_normal_user_admin_assignments",
  "enforce_shipper_staff_assignment_role",
  "enforce_shipment_assignment_roles",
  "set_operator_shipper_assignment",
]);
for (const definition of sql.matchAll(
  /CREATE OR REPLACE FUNCTION public\.(\w+)[\s\S]*?\$function\$;/g,
)) {
  if (tested.has(definition[1])) await db.exec(definition[0]);
}
await db.exec(
  `CREATE TRIGGER validate_shipper BEFORE INSERT ON app_user_admin_assignments FOR EACH ROW EXECUTE FUNCTION enforce_shipper_staff_assignment_role(); CREATE TRIGGER validate_shipment BEFORE INSERT ON shipment_jobs FOR EACH ROW EXECUTE FUNCTION enforce_shipment_assignment_roles();`,
);
const addUser = async (email, role, duties) =>
  (
    await db.query(
      "INSERT INTO app_users(email,role,staff_roles) VALUES($1,$2,$3) RETURNING id",
      [email, role, duties],
    )
  ).rows[0].id;
const liang = await addUser("liang_liang@cnlogistics.co.jp", "super_admin", [
  "other",
]);
const other = await addUser("super@example.test", "super_admin", ["other"]);
const admin = await addUser("sales@example.test", "admin", ["sales"]);
const contact = await addUser("contact@example.test", "normal", null);
await db.exec(
  sql.slice(sql.indexOf("-- Liang retains"), sql.indexOf("NOTIFY pgrst")),
);
assert.equal(
  (await db.query("SELECT role FROM app_users WHERE id=$1", [liang])).rows[0]
    .role,
  "super_admin",
);
const ids = (
  await db.query(
    "SELECT id FROM list_assignable_admin_operators('super@example.test')",
  )
).rows.map((r) => r.id);
assert(ids.includes(liang));
assert(ids.includes(admin));
assert(!ids.includes(other));
assert(!ids.includes(contact));
await db.query(
  "SELECT set_operator_shipper_assignment('super@example.test',$1,$2,true)",
  [contact, liang],
);
assert.equal(
  (
    await db.query(
      "SELECT get_normal_user_admin_assignments($1) AS assignments",
      [contact],
    )
  ).rows[0].assignments[0].admin_user_id,
  liang,
);
await db.query(
  "INSERT INTO shipment_jobs(sales_admin_user_ids) VALUES(ARRAY[$1::uuid])",
  [liang],
);
await assert.rejects(
  () =>
    db.query(
      "INSERT INTO shipment_jobs(operations_admin_user_ids) VALUES(ARRAY[$1::uuid])",
      [liang],
    ),
  (e) => e.code === "22023",
);
await assert.rejects(
  () =>
    db.query(
      "INSERT INTO shipment_jobs(sales_admin_user_ids) VALUES(ARRAY[$1::uuid])",
      [other],
    ),
  (e) => e.code === "22023",
);
await db.query("UPDATE app_users SET is_active=false WHERE id=$1", [liang]);
await assert.rejects(
  () =>
    db.query(
      "SELECT set_operator_shipper_assignment('super@example.test',$1,$2,true)",
      [contact, liang],
    ),
  (e) => e.code === "22023",
);
await db.exec("SET test.role='admin'");
await assert.rejects(
  () =>
    db.query(
      "SELECT set_operator_shipper_assignment('super@example.test',$1,$2,true)",
      [contact, admin],
    ),
  (e) => e.code === "42501",
);
console.log(
  "PASS: Liang keeps super-admin role; Sales selection/save/display works; Ops, unrelated super admins, inactive accounts and unauthorized callers are rejected",
);
await db.close();
