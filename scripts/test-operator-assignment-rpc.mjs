// Run against an isolated embedded PostgreSQL fixture, never a live Supabase database.
// Install @electric-sql/pglite in a temporary directory and pass that directory as argv[2].
import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(resolve(process.argv[2] ?? ".", "package.json"));
const { PGlite } = require("@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const shipper = "00000000-0000-0000-0000-000000000001";
const joe = "00000000-0000-0000-0000-000000000002";
const yumi = "00000000-0000-0000-0000-000000000003";
const ayumi = "00000000-0000-0000-0000-000000000004";
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE public.app_users (id uuid PRIMARY KEY, role text, is_active boolean DEFAULT true, deleted_at timestamptz, staff_role text, staff_roles text[]);
CREATE TABLE public.app_user_admin_assignments (normal_user_id uuid REFERENCES public.app_users(id), admin_user_id uuid REFERENCES public.app_users(id), assigned_by text, PRIMARY KEY(normal_user_id,admin_user_id));
CREATE FUNCTION public.current_app_user_role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('test.role',true) $$;
CREATE FUNCTION public.current_app_user_email() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('test.email',true) $$;
CREATE FUNCTION public.authenticated_caller_can_manage_normal_user(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.manage',true),'false') = 'true' $$;
INSERT INTO public.app_users(id,role,staff_roles) VALUES ('${shipper}','normal',NULL),('${joe}','admin',ARRAY['operations']),('${yumi}','admin',ARRAY['sales']),('${ayumi}','admin',ARRAY['operations']);
SET test.role = 'super_admin'; SET test.email = 'super@example.test'; SET test.manage = 'true';
`);
await db.exec(
  readFileSync(
    new URL(
      "../supabase/migrations/20261005081047_add_atomic_operator_shipper_assignment.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
const call = (
  operator,
  assigned,
  email = "super@example.test",
  user = shipper,
) =>
  db.query(
    "SELECT public.set_operator_shipper_assignment($1,$2::uuid,$3::uuid,$4::boolean)",
    [email, user, operator, assigned],
  );
const ids = async () =>
  (
    await db.query(
      "SELECT admin_user_id FROM public.app_user_admin_assignments ORDER BY admin_user_id",
    )
  ).rows.map((row) => row.admin_user_id);
const rejects = async (fn, code) =>
  assert.rejects(fn, (error) => error.code === code);
await db.exec("SET ROLE authenticated");
await call(joe, true);
// Independent edits after the same original snapshot must both survive.
// PGlite queues these calls; this checks SQL semantics, not multi-session locking.
await Promise.all([call(yumi, true), call(ayumi, true)]);
await rejects(() => ids(), "42501"); // Direct table reads stay denied.
await db.exec("RESET ROLE");
assert.deepEqual(await ids(), [joe, yumi, ayumi]);
await call(ayumi, true);
assert.deepEqual(await ids(), [joe, yumi, ayumi]);
await call(joe, false);
await call(joe, false);
assert.deepEqual(await ids(), [yumi, ayumi]);
await rejects(() => call(yumi, true, "forged@example.test"), "42501");
await db.exec("SET test.role = 'admin'");
await rejects(() => call(joe, true), "42501");
await db.exec("SET test.role = 'normal'");
await rejects(() => call(joe, true), "42501");
await db.exec("SET test.role = ''");
await rejects(() => call(joe, true), "42501");
await db.exec("SET test.role = 'super_admin'; SET test.manage = 'false'");
await rejects(() => call(joe, true), "42501");
await db.exec("SET test.manage = 'true'");
await rejects(() => call(joe, true, "super@example.test", joe), "42501");
await rejects(() => call(joe, null), "22023");
await rejects(() => call(null, true), "22023");
await rejects(() => call(shipper, true), "22023");
await db.exec(`UPDATE app_users SET is_active=false WHERE id='${joe}'`);
await rejects(() => call(joe, true), "22023");
await db.exec(
  `UPDATE app_users SET is_active=true,staff_roles=ARRAY['other'] WHERE id='${joe}'`,
);
await rejects(() => call(joe, true), "22023");
await db.exec(`UPDATE app_users SET deleted_at=now() WHERE id='${shipper}'`);
await rejects(() => call(yumi, false), "42501");
await db.exec("SET ROLE anon");
await rejects(() => call(yumi, false), "42501");
await db.exec("RESET ROLE");
assert.deepEqual(await ids(), [yumi, ayumi]);
console.log(
  "PASS: preserving unrelated edits, retry idempotence, requester identity, role/access checks, invalid/inactive targets, restricted execution and direct table access",
);
await db.close();
