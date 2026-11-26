# NouDilo

NouDilo is a 3D water response app for Mauritius. Reporting, coordination, field assignments, and progress tracking have interactive illustrations next to their controls.

## Run the site

Use Node.js 24 or later.

```sh
npm ci
npm run dev
```

Open the URL Vite prints. The same server handles the website and its account API. To run the built site, use `npm run build` followed by `npm run preview`. Sign-in and reporting need the API. Open the Vite URL for the full app.

## Use the interactive workspaces

- On the public home page, change the issue and condition to see the tap or cutaway change. Continue into the report with the selected condition. The map in the same workspace shows published incidents.
- In a report, the scene follows the details, review, and receipt steps. In tracking, the illustration reflects the latest visible response.
- Coordinator and Workers see the tanker move as actual assignment milestones are recorded. Pipe scenes follow work-order stages and distinguish submitted work from a verified outcome. The scenes illustrate the workflow and offer rotate controls and a 2D fallback.

## Give people access

| Account | Provisioning | Permissions |
| --- | --- | --- |
| User | Create a resident account on the sign-in page | Submit a report, track owned reports, view public updates |
| Coordinator | Provision from the server terminal | Review reports, assign work, verify and publish outcomes |
| Worker | Provision from the server terminal with a vehicle ID or crew name | View and update assignments for that vehicle or crew |

Use the commands below from the project folder. The examples show zsh syntax. Enter a different password of at least 12 characters for each account. Replace the example email addresses with the intended account addresses.

```zsh
read -rs 'nou_password?Coordinator password: '
printf '%s\n' "$nou_password" | npm run account -- coordinator coordinator@example.test
unset nou_password

read -rs 'nou_password?Driver password: '
printf '%s\n' "$nou_password" | npm run account -- worker driver@example.test WT-04
unset nou_password

read -rs 'nou_password?Repair account password: '
printf '%s\n' "$nou_password" | npm run account -- worker repairs@example.test "Central maintenance crew"
unset nou_password
```

The fleet IDs are `WT-04`, `WT-07`, and `WT-09`. The repair crew names are **Central maintenance crew**, **Northern maintenance crew**, and **Eastern maintenance crew**. A vehicle or crew becomes assignable after a worker account has been provisioned for it. Each person uses **Sign in** and lands in the workspace for their role. Use separate browser profiles to test multiple accounts simultaneously.

## Follow a case

1. Create a resident account and submit a shortage in Curepipe or a public leak in Rose Hill.
2. Sign in as Coordinator, review the report, and assign a provisioned tanker or crew.
3. Sign in as the Worker for that vehicle or crew. Complete the assignment and submit the actual delivery or repair record.
4. In Coordinator, publish the delivery update or verify the repair. Check the public map and the resident’s report timeline.

## Data and deployment

The API stores accounts, sessions, report ownership, and operations in SQLite under `.noudilo/`. Set `NOU_DATA_DIR` to select a different data directory. It starts with no incidents. The fleet, crews, and baseline supply capacity are configured in source for the prototype. The server enforces account and assignment permissions on writes and filters reads before returning them to the browser.

The current server is for local development and evaluation. Public deployment needs HTTPS, secure cookies (`NOU_SECURE_COOKIE=1`), operational inventory configuration, account recovery, durable backups, and review of how supporting photos are stored. The [Oracle proposal](docs/oracle-architecture.md) and [schema](docs/oracle-schema.sql) describe the planned migration from SQLite.

- [Quality audit](docs/quality-audit.md)
- [Mapzen elevation data](https://registry.opendata.aws/terrain-tiles/)
- [Natural Earth shoreline data](https://www.naturalearthdata.com/downloads/10m-physical-vectors/)
- [OpenStreetMap attribution](https://www.openstreetmap.org/copyright)
