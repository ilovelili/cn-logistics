// Local UI fixture with intercepted APIs: no production requests or real account changes.
// argv[2]: directory containing playwright; argv[3]: optional Chromium executable.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const require = createRequire(resolve(process.argv[2] ?? ".", "package.json"));
const { chromium } = require("playwright");
const root = resolve(new URL("..", import.meta.url).pathname);
const pageFile = resolve(root, "__shipper-role-test.html");
const fixtureFile = resolve(root, "__shipper-role-test.tsx");
const dual = {
  id: "00000000-0000-0000-0000-000000000002",
  email: "dual@example.test",
  user_name: "Dual Role",
  staff_role: "operations",
  staff_roles: ["operations", "sales"],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  auth0_provisioning_status: "provisioned",
};
const contact = {
  id: "00000000-0000-0000-0000-000000000003",
  email: "contact@example.test",
  shipper_name: "Test Company",
  zipcode: "1000001",
  shipper_address: "Tokyo",
  telephone: "000",
  budget: 100,
  contact_person: "Contact",
  notes: "",
  approval_status: "to_be_approved",
  created_by: "super@example.test",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  auth0_provisioning_status: "provisioned",
  admin_assignments: [],
};
const fixture = `import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import UserRegistrationForm,{UserDetailModal} from './src/admin/UserRegistrationForm';
import './src/index.css';
const operator=${JSON.stringify(dual)};
const initial=${JSON.stringify(contact)};
const historicalSnapshot={...initial,contacts:[],admin_user_ids:[]};
const historicalRequest={id:'historical',target_user_id:initial.id,shipper_name:initial.shipper_name,status:'approved',requested_by_email:'super@example.test',current_snapshot:historicalSnapshot,proposed_snapshot:{...historicalSnapshot,admin_user_ids:[operator.id]},created_at:initial.created_at};
function Fixture(){const mode=new URLSearchParams(location.search).get('mode');
const retained=(mode==='stale'||mode==='inactive')?[{...operator,admin_user_id:operator.id,assignment_roles:['operations']}]:[];
const [user,setUser]=useState({...initial,admin_assignments:retained});const [opened,setOpened]=useState(true);
const options=mode==='inactive'?[]:mode==='stale'?[{...operator,staff_roles:['sales'],staff_role:'sales'}]:[operator];
if(new URLSearchParams(location.search).get('mode')==='create')return <UserRegistrationForm adminEmail="super@example.test" isSuperAdmin/>;
return <><button onClick={()=>setOpened(true)}>Reopen details</button>{opened&&<UserDetailModal user={user} users={[user]} detailsReadOnly showAdminAssignments adminOperators={options} requesterEmail="super@example.test" changeRequest={mode==='history'?historicalRequest:undefined} onSaved={()=>undefined} onAssignmentsSaved={setUser} onClose={()=>setOpened(false)}/>}</>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);`;
let server, browser;
try {
  writeFileSync(
    pageFile,
    '<html><head></head><body><div id="root"></div><script type="module" src="/__shipper-role-test.tsx"></script></body></html>',
  );
  writeFileSync(fixtureFile, fixture);
  server = spawn(
    process.execPath,
    [
      resolve(root, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      "4187",
      "--strictPort",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        VITE_SUPABASE_URL: "http://127.0.0.1:4187",
        VITE_SUPABASE_ANON_KEY: "local-fixture-key",
      },
      stdio: "pipe",
    },
  );
  await new Promise((accept, reject) => {
    const timeout = setTimeout(
      () => reject(Error("Local server startup timeout")),
      15000,
    );
    server.stdout.on("data", (chunk) => {
      if (String(chunk).includes("127.0.0.1:4187")) {
        clearTimeout(timeout);
        accept();
      }
    });
    server.on("exit", (code) => {
      clearTimeout(timeout);
      reject(Error(`Local server exited ${code}`));
    });
  });
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.argv[3] ??
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage();
  const errors = [],
    writes = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") {
      await route.abort();
      return;
    }
    if (!url.pathname.startsWith("/rest/v1/rpc/")) {
      await route.continue();
      return;
    }
    const rpc = url.pathname.split("/").at(-1),
      body = request.postDataJSON();
    let response = [];
    if (rpc === "list_assignable_admin_operators") response = [dual];
    if (rpc === "list_registered_normal_users") response = [contact];
    if (rpc === "update_accessible_shipper_staff_assignments") {
      writes.push(body);
      const roles = [
        ...(body.operations_admin_user_ids.includes(dual.id)
          ? ["operations"]
          : []),
        ...(body.sales_admin_user_ids.includes(dual.id) ? ["sales"] : []),
      ];
      response = [
        {
          ...contact,
          admin_assignments: roles.length
            ? [{ ...dual, admin_user_id: dual.id, assignment_roles: roles }]
            : [],
        },
      ];
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
  const checkbox = (role) =>
    page
      .getByRole("heading", {
        name: role === "operations" ? "Ops担当" : "Sales担当",
        exact: true,
      })
      .locator("..")
      .getByText("Dual Role", { exact: true })
      .locator("xpath=ancestor::label[1]")
      .getByRole("checkbox");
  await page.goto("http://127.0.0.1:4187/__shipper-role-test.html?mode=create");
  await page.getByRole("button", { name: "新規荷主登録", exact: true }).click();
  await checkbox("operations").check();
  assert.equal(await checkbox("sales").isChecked(), false);
  await checkbox("sales").check();
  await checkbox("operations").uncheck();
  assert.equal(await checkbox("sales").isChecked(), true);
  // The actual detail component saves each combination through the new client helper.
  await page.goto("http://127.0.0.1:4187/__shipper-role-test.html");
  await checkbox("operations").check();
  assert.equal(await checkbox("sales").isChecked(), false);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "Reopen details" }).click();
  await checkbox("operations").waitFor();
  assert.equal(await checkbox("operations").isChecked(), true);
  assert.equal(await checkbox("sales").isChecked(), false);
  assert.deepEqual(writes.at(-1).operations_admin_user_ids, [dual.id]);
  assert.deepEqual(writes.at(-1).sales_admin_user_ids, []);
  await checkbox("sales").check();
  await checkbox("operations").uncheck();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "Reopen details" }).click();
  assert.equal(await checkbox("operations").isChecked(), false);
  assert.equal(await checkbox("sales").isChecked(), true);
  assert.deepEqual(writes.at(-1).operations_admin_user_ids, []);
  assert.deepEqual(writes.at(-1).sales_admin_user_ids, [dual.id]);
  await checkbox("operations").check();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "Reopen details" }).click();
  assert.equal(await checkbox("operations").isChecked(), true);
  assert.equal(await checkbox("sales").isChecked(), true);
  // Selected but unqualified or missing staff must remain removable, not hidden.
  for (const mode of ["stale", "inactive"]) {
    await page.goto(
      `http://127.0.0.1:4187/__shipper-role-test.html?mode=${mode}`,
    );
    assert.equal(await checkbox("operations").isChecked(), true);
    await page
      .getByText(
        "現在、この担当区分には割り当てできません。選択を解除して保存してください。",
        { exact: true },
      )
      .waitFor();
    await checkbox("operations").click();
    await checkbox("operations").waitFor({ state: "detached" });
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page
      .getByRole("heading", { name: "Ops担当", exact: true })
      .waitFor({ state: "detached" });
    assert.deepEqual(writes.at(-1).operations_admin_user_ids, []);
    assert.deepEqual(writes.at(-1).sales_admin_user_ids, []);
  }
  await page.goto(
    "http://127.0.0.1:4187/__shipper-role-test.html?mode=history",
  );
  const historicalSummary = page.locator("section.bg-amber-50");
  await historicalSummary.waitFor();
  assert.equal(
    await historicalSummary.getByText("CN担当", { exact: true }).count(),
    1,
  );
  assert.equal(
    await historicalSummary.getByText("Ops担当", { exact: true }).count(),
    0,
  );
  assert.equal(
    await historicalSummary.getByText("Sales担当", { exact: true }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: creation checkboxes are independent; detail saves Ops-only, Sales-only and both, reopens correctly, and emits role-specific RPC payloads; stale/inactive selections can be removed, historical duties are combined, and no browser errors",
  );
} finally {
  await browser?.close();
  server?.kill();
  for (const path of [pageFile, fixtureFile]) {
    try {
      unlinkSync(path);
    } catch {}
  }
}
