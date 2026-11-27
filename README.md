# NouDilo

A Mauritius water response application with one persistent 3D neighbourhood, resident reporting, coordinator operations, and assigned field-team workflows. The actual API, permissions, saved records, delivery review, and independent repair verification drive the same world state.

## Install and run

Use Node.js 24 or later.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The development server includes the Fastify API and preserves existing SQLite accounts and records in `.noudilo/`. A new normal database starts empty. The website must use the API server; opening `dist/index.html` alone cannot sign in or save reports.

For the isolated hackathon demonstration:

```sh
npm run demo
```

Use **Demo roles** in the header to enter the Resident, Neighbour, Coordinator, Tanker driver, or Maintenance crew account. This explicitly enabled local environment seeds a reviewed neighbouring Curepipe shortage and example resources. It writes to `.noudilo-demo/`, separate from existing data. Quick role access is loopback-only, uses seeded demo accounts, and is unavailable in normal or Oracle mode.

The [demonstration script](docs/demonstration.md) covers the complete Curepipe shortage and Rose Hill leak scenario. Repeated demo runs preserve their records. Use a new `NOU_DATA_DIR` containing `demo` for a fresh isolated scenario; do not delete existing user records.

## Build and serve

```sh
npm run build
npm start
```

`npm start` serves `dist/` and the API together at `http://127.0.0.1:3000`. `npm run preview` also includes the API for local build verification. The development, preview, start, migration, inventory, and account commands read `.env` when present. Copy `.env.example` to `.env` for server configuration; never put database credentials in a `VITE_` variable.

The build emits Brotli and Gzip variants for scripts, styles, and GLB assets. The standalone Fastify server negotiates these encodings; API event streams remain uncompressed.

## Accounts and operational inventory

Residents create their account on the sign-in page. Staff accounts are provisioned from the server terminal; roles are enforced by the API, not selected in a normal browser session.

| Account     | Access                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| Resident    | Submit reports, read owned reports and their published response timeline                             |
| Coordinator | Review, group, prioritise, assign resources, publish updates, verify outcomes, inspect audit history |
| Worker      | Read and update only the assignments for their provisioned vehicle or crew                           |

Configure a JSON inventory before adding custom worker resources, particularly in Oracle mode:

```json
{
  "waterAvailable": 28000,
  "fleet": [{ "id": "WT-04", "name": "Curepipe depot", "capacity": 8000 }],
  "crews": ["Central maintenance crew"]
}
```

These example values are demonstration values. `waterAvailable` is the starting water budget from which stored allocations and actual deliveries are deducted. Replacing inventory is blocked while assignments remain active.

```sh
npm run inventory -- /absolute/path/to/inventory.json
```

Provision each staff account using a distinct password of 12–128 characters, passed through stdin. Examples for zsh:

```zsh
read -rs 'nou_password?Coordinator password: '
printf '%s\n' "$nou_password" | npm run account -- coordinator coordinator@example.test
unset nou_password

read -rs 'nou_password?Driver password: '
printf '%s\n' "$nou_password" | npm run account -- worker driver@example.test WT-04
unset nou_password

read -rs 'nou_password?Crew password: '
printf '%s\n' "$nou_password" | npm run account -- worker crew@example.test "Central maintenance crew"
unset nou_password
```

The local development fallback retains the established example fleet (`WT-04`, `WT-07`, `WT-09`) and crew names for compatibility. Oracle starts with zero inventory and requires explicit operational configuration. A vehicle or crew is assignable only after an associated worker account exists.

## Oracle Autonomous Database

1. Create a dedicated application schema and configure the server-only `NOU_ORACLE_*` values in `.env`. Use a TCPS connect string and wallet settings appropriate to your Autonomous Database.
2. Apply the runtime migration: `npm run migrate:oracle`. `npm run migrate:oracle -- --check` prints the migration plan without connecting or executing.
3. Set `NOU_DATABASE=oracle`. The application refuses missing Oracle configuration; it never silently switches to SQLite.
4. Configure inventory and provision staff accounts using the same commands above, then run the server.

The official `oracledb` Thin driver requires no local Oracle client installation. The adapter provides actual pooled database operations, bound values, row locking, explicit commit/rollback, idempotency receipts, entity projections, ownership, sessions, and in-app notifications. Credentials remain server-side.

The migration under `server/migrations/` is the runnable schema for this adapter. The older `docs/oracle-schema.sql` is a separate proposed, more granular spatial schema; do not apply it as the runtime migration. See [runtime architecture](docs/runtime-architecture.md) and [Oracle proposal](docs/oracle-architecture.md).

Live Oracle execution requires credentials and network connectivity. Connection-stub tests do not prove a live Autonomous Database deployment. The local development adapter and end-to-end scenarios remain usable without Oracle

## Quality checks

```sh
npm run check
npm test
npm run test:e2e
npm run build
```

Playwright uses an installed Google Chrome on macOS. On other systems, install its browser once with `npx playwright install chromium`. Browser tests use a new temporary SQLite demo database, not `.noudilo/`. They cover the two end-to-end response scenarios, persistent canvas identity, privacy and verification boundaries, camera controls, reduced motion, narrow layouts, no-WebGL fallbacks, failed submission recovery, and axe-core accessibility checks.

Original GLB assets, a Blender source scene, and CC0 material maps are included. `npm run assets` generates intermediate geometry; `scripts/refine-assets.py` applies the Blender refinement and export pass. Normal builds do not require Blender or paid services. See [asset provenance and budgets](docs/assets.md), [design system](docs/design-system.md), and [quality audit](docs/quality-audit.md).

For a repeatable local rendering measurement against an isolated built demo server, run `npm run check:performance -- http://127.0.0.1:4176/`. The report records actual demand frames, draw calls, triangle counts, loading/layout entries, and the test environment. It does not assert a device-wide frame-rate guarantee.

## Neighbourhood and response feedback

The home page offers **Report a water issue**, **Track my reports**, and **View water problems map**. The NouDilo logo returns to the home page and closes its reporting drawer. The neighbourhood remains a background for reporting and response; scene exploration, depot labels, technical captions, and asset credits are removed from the main interface. Reporting and staff tasks open with the illustration hidden so the form uses the page. **Show example** and **Hide example** toggle it without losing form details. The optional tap view has a connected pipe with a transparent X-ray section. Default/normal supply shows strong moving water; Low pressure slows and narrows the flow; No running water stops it inside the pipe and at the outlet. Reduced motion shows a static depiction of the selected state. The view has a plain-language caption, and moving examples have a direct pause control. The old **Display options** menu and duplicate scene-focus cards were removed.

**Water problems map** (`#/map`) is public and shows reviewed shortages, pipe leaks and response updates across Mauritius, with filters for active problems, shortages, leaks and all updates. Raster street tiles include place and road names. Markers identify community areas, not private household addresses. Unreported areas must not be read as confirmed normal supply. Required OpenStreetMap attribution remains within the map.

Both resident report forms offer **Choose location on map**. Zoom and click, drag the pin, or use the keyboard and **Use centre of map**. A pin is optional; town and landmark reporting remain available without it. Confirmed coordinates are validated server-side, saved with the report, visible in review/tracking and coordinator details, and supplied only to the assigned driver or crew. Public projections contain no private report coordinates. Existing records need no destructive migration. The locality choices include the places already held in the project's Mauritius geographic data.

**Send report** confirms only after the API commits; **Try again** preserves a failed submission. A brief confirmation travels to the local dispatch office.

A coordinator can verify a repaired pipe without claiming household supply recovery. The additional **I also confirmed water is flowing at the affected home** checkbox records an explicit `waterRestoredAt` verification. Only that confirmation shows **Water restored** and the restored tap in the resident view. Existing repair records without this field remain repair-only records.

**Demo route** follows the moving tanker with the camera, respects pause and reduced motion, and returns to the recorded milestone afterwards. Vehicle movement remains explicitly simulated. No live position or arrival estimate is available in this deployment; no position or ETA is invented.

## What is real and what is illustrative

Reporting, authentication, role-filtered records, file persistence, assignments, actual delivery quantities, coordinator publication, repair verification, audit events, and in-app notifications use the backend. Server revision events synchronise authorised snapshots across clients, with periodic read fallback.

Terrain and towns are geographic. Buildings, infrastructure placement, household connections, duration-responsive tank levels, and vehicle journey playback are illustrative. The app does not have live utility feeds, measured household tank levels, GPS tracking, or an approved road-routing service. Delivery does not mean regular household supply is restored. A submitted repair remains unverified until coordinator approval.

Before public use, configure HTTPS and secure cookies, production inventory, private evidence storage and scanning, account recovery, backups, audit retention, and operational monitoring. SSE currently uses in-process revision notifications, with polling across server processes; a durable distributed outbox is a separate deployment improvement.
