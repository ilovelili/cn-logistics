// Isolated PostgreSQL fixture; pass a temporary directory containing @electric-sql/pglite.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const require = createRequire(resolve(process.argv[2] ?? ".", "package.json"));
const { PGlite } = require("@electric-sql/pglite");
const db = new PGlite();
const migration = (name) =>
  readFileSync(
    new URL(`../supabase/migrations/${name}`, import.meta.url),
    "utf8",
  );
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE TABLE app_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), role text, email text, shipper_name text, created_by text, created_at timestamptz DEFAULT now(), is_active boolean DEFAULT true, deleted_at timestamptz);
CREATE TABLE app_user_admin_assignments(normal_user_id uuid REFERENCES app_users(id), admin_user_id uuid REFERENCES app_users(id), assigned_by text, PRIMARY KEY(normal_user_id,admin_user_id));
CREATE FUNCTION current_app_user_email() RETURNS text LANGUAGE sql AS $$ SELECT 'creator@example.test'::text $$;
`);
await db.exec(
  migration("20260917052917_add_role_aware_app_notifications.sql").split(
    "CREATE FUNCTION public.notify_app_event_triggers()",
  )[0],
);
await db.exec(migration("20260917053242_notify_shipper_creations_in_app.sql"));
const user = async (
  role,
  name = null,
  creator = null,
  age = "0 minutes",
  active = true,
) =>
  (
    await db.query(
      "INSERT INTO app_users(role,shipper_name,created_by,created_at,is_active) VALUES($1,$2,$3,now()-$4::interval,$5) RETURNING id",
      [role, name, creator, age, active],
    )
  ).rows[0].id;
const superAdmin = await user("super_admin");
const ops = await user("admin");
const inactive = await user("super_admin", null, null, "0 minutes", false);
const assign = (contact, operator = ops) =>
  db.query(
    "INSERT INTO app_user_admin_assignments VALUES($1,$2,'creator@example.test')",
    [contact, operator],
  );
const count = async (recipient, name) =>
  Number(
    (
      await db.query(
        "SELECT count(*) AS count FROM app_notifications WHERE recipient_user_id=$1 AND shipper_name=$2 AND event_type='shipper_created'",
        [recipient, name],
      )
    ).rows[0].count,
  );
const contacts = [];
for (let i = 0; i < 3; i++) {
  const contact = await user(
    "normal",
    "Legacy Company",
    "creator@example.test",
  );
  contacts.push(contact);
  await assign(contact);
}
assert.equal(await count(superAdmin, "Legacy Company"), 3);
assert.equal(await count(ops, "Legacy Company"), 5);
await db.exec(
  "UPDATE app_notifications SET read_at=now() WHERE id=(SELECT id FROM app_notifications ORDER BY created_at,id LIMIT 1)",
);
await db.exec(
  `BEGIN; ${migration("20261005081737_deduplicate_shipper_registration_notifications.sql")} COMMIT;`,
);
assert.equal(await count(superAdmin, "Legacy Company"), 1);
assert.equal(await count(ops, "Legacy Company"), 1);
assert.equal(
  (
    await db.query(
      "SELECT count(*)::int AS count FROM app_notifications WHERE shipper_name='Legacy Company' AND read_at IS NULL",
    )
  ).rows[0].count,
  2,
);
for (let i = 0; i < 3; i++) {
  const contact = await user("normal", "New Company", "creator@example.test");
  await assign(contact);
}
assert.equal(await count(superAdmin, "New Company"), 1);
assert.equal(await count(ops, "New Company"), 1);
assert.equal(await count(inactive, "New Company"), 0);
// Adding a contact to an existing company must not repeat its registration notice.
const added = await user("normal", "New Company", "creator@example.test");
await assign(added);
assert.equal(await count(superAdmin, "New Company"), 1);
assert.equal(await count(ops, "New Company"), 1);
// Identical names registered by different creators are separate companies.
const separate = await user("normal", "New Company", "other@example.test");
await assign(separate);
assert.equal(await count(superAdmin, "New Company"), 2);
assert.equal(await count(ops, "New Company"), 2);
await db.query(
  "DELETE FROM app_user_admin_assignments WHERE normal_user_id=$1",
  [added],
);
await assign(added);
assert.equal(await count(ops, "New Company"), 2);
const oldContact = await user(
  "normal",
  "Older Company",
  "creator@example.test",
  "20 minutes",
);
await assign(oldContact);
assert.equal(await count(ops, "Older Company"), 0);
await db.exec("SET ROLE authenticated");
await assert.rejects(
  () =>
    db.query("SELECT emit_shipper_registration_notification($1,$2,$3)", [
      added,
      ops,
      "forged@example.test",
    ]),
  (e) => e.code === "42501",
);
await db.exec("RESET ROLE");
console.log(
  "PASS: legacy cleanup, unread preservation, company grouping, recipient deduplication, creator isolation, retries, age/active guards, and helper permissions",
);
await db.close();
