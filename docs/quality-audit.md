# NouDilo quality audit

## Connected X-ray water flow — 27 November 2026

The household example now uses a continuous supply-to-tap curve with opaque couplings and a transparent inspection shell. An internal water core and instanced moving traces show strong default flow, reduced speed/width for Low pressure, and stopped flow for No running water. The original embedded tap is excluded from the batched model so there is no overlapping old pipe. The same scene state drives the outlet stream and plain-language caption. Browser checks passed for default strong flow, low/stopped states, real particle movement, stationary no-supply state, live reduced-motion changes, hide/show, and mobile accessibility. TypeScript and production build passed.

## Form-first reporting — 27 November 2026

Reporting and staff tasks now hide the illustration by default and use the available width. Explicit Show example / Hide example controls work from the workspace and report dialog without clearing details. The dry/weak-stream tap camera now sits inside the boundary wall and focuses on the tap rather than the facade. Plain labels explain the chosen condition and identify the visual as an example. The Display options menu, technical world description, and duplicate focus action have been removed. The resident map scenario, dry/low-pressure example controls, mobile accessibility and production build passed.

## Resident testing interface — 27 November 2026

The main navigation now separates Home, Water problems map, reporting/tracking, and Help. The home page offers reporting, report tracking and the public map. Scene exploration/depot targets, technical captions, coordinates and asset credits have been removed from the main screen. Optional motion/detail controls are collapsed. The brand explicitly resets the home drawer and route even when clicked from Home.

The public map shows reviewed community shortages/leaks, place and street names, active/type/resolved filters, selectable status details and a whole-island control. Report forms support optional exact pins, drag adjustment, keyboard map-centre selection, review and saved location links. Coordinates survive refresh and are supplied to the report owner, coordinators and the assigned response staff; public snapshots omit private reports. Coordinates outside Mauritius are rejected server-side. Geographic choices reuse all places already available in the project data.

The new resident browser scenario verified map navigation/filtering, empty results, logo reset, pin submission, refresh persistence, private/public projection, anonymous access and mobile accessibility. Sixteen unit/API tests and the production build passed. All five browser suites passed together, including delivery/repair, the new map journey, mobile and fallback layouts, sign-up and cross-session updates. Existing browser tests were adapted for the collapsed display controls and Home label. Street-map attribution remains in the map itself.

## Neighbourhood refinement — 27 November 2026

The opening now shows the street-scale neighbourhood full-screen. A reporting drawer preserves camera position when it opens or closes. Homes, rooftop tanks, the tanker depot, dispatch office, property boundaries, drains, lights, utility lines, and tropical palms share the same renderer. Original model geometry was refined/exported in Blender 4.5.9 LTS; the editable source scene is included. Verified CC0 ground and concrete maps are bundled as 1K WebP assets, with provenance and source checksums.

- TypeScript and the production build passed. The 15 unit/API tests passed. Four browser suites passed; the full delivery/repair suite was additionally rerun after adding the separate normal-supply restoration scene.
- The delivery journey covers resident intake, coordinator review/assignment, driver departure/arrival/delivery, publication, resident delivery tracking, and separately verified regular supply recovery.
- The repair journey covers report/photo, coordinator verification, crew assignment/inspection/work, independent repair verification, explicit household water confirmation, restored tap, resident **Water restored** status, and persistence after refresh.
- Browser checks cover desktop/phone layouts, axe accessibility rules, reduced motion, no WebGL, failed submission and retry, keyboard camera controls, camera preservation when toggling the drawer, canvas identity across roles, and committed cross-session updates. Overlapping scene targets and mobile introduction contrast were corrected during review.
- Demo tanker playback follows the vehicle with an interruptible camera and explicit simulation text. No GPS position or arrival estimate is invented. The report confirmation travels to the neighbourhood dispatch office only after the backend accepts it.
- The final production laboratory sample recorded 69 draw calls and 253,084 triangles in the high-detail heavy-leak scene, versus 128,656 triangles in low detail. It observed 60.3 rendered frames/s over three seconds, LCP 180 ms and CLS 0.0058 on local headless Chrome. These are local measurements, not physical-phone or field performance claims; see `performance-lab.json`.

Visual evidence: [desktop neighbourhood](previews/neighbourhood-desktop.png), [phone opening](previews/neighbourhood-mobile.png), [pipe report](previews/public-leak.png), [depot](previews/tanker-depot.png), and [verified repair](previews/verified-repair.png).

Oracle configuration was absent. The real Oracle adapter remains server-only; live Autonomous Database execution could not be verified. The labelled SQLite demo provides saved records and real API-driven role workflows. No production user records were changed for acceptance tests. Safari, Firefox, physical phones, live GPS and operational ETA feeds were not tested.

## Persistent world rebuild — 27 November 2026

This section records the preceding world rebuild. The neighbourhood refinement above is the current version.

NouDilo now uses one mounted 3D world for public exploration, household reporting, coordinator review, tanker response, repair work, and resident tracking. Original procedural GLB assets replace the earlier independent illustrations. The Node/Fastify API supports SQLite development storage and an implemented Oracle adapter with a separate runtime migration.

| Check | Evidence and result |
| --- | --- |
| Unit/API suite | 15 Vitest tests passed: transitions, grouping, privacy, capacity, worker scope, independent verification, retry receipts, decline/reallocation, concurrent dispatch, priority reasons, and Oracle adapter contracts. |
| Browser scenarios | Four Playwright suites passed. They exercise Curepipe shortage → grouping → verified incident → tanker assignment → driver milestones → actual delivery → coordinator publication → resident tracking, and Rose Hill leak → photo → verification → crew assignment → inspection → repair evidence → independent verification → public map update. |
| Persistent renderer | The actual world canvas DOM node remains identical across route changes, normal registration, all demo roles, and 2D/3D switches. Graphics quality changes retain the canvas. |
| State integrity | The tap responds to the chosen condition; confirmation uses the server's report reference; failed submissions retain details and retry safely; a submitted repair remains leaking/pending until verification; delivery remains distinct from normal supply recovery. Linked residents see recorded driver milestones while unapproved litres and worker details remain private. |
| Event delivery | Two independent browser contexts received committed revision signals within the test deadline. The coordinator updated without navigation. Signal payloads contained only timestamps; anonymous reads contained no private reports. |
| Camera and input | Guided camera travel, cancellation by a new task, skip, pause/resume, keyboard exploration, return-to-overview, and re-focusing a task all passed their browser checks. |
| Responsive layout | Public/reporting layouts at 320, 390, 768, 1024, 1440, and 1920 CSS pixels; coordinator, tanker driver, and crew layouts at 320, 390, 768, 1024, and 1440. No horizontal document overflow in the tested settled layouts. |
| Accessibility | axe-core WCAG A/AA rule sets passed for tested public, reporting, dispatch, driver, crew, review, receipt, mobile role, and no-WebGL states. Missing names on collapsed mobile controls were corrected and rechecked. |
| Fallbacks | Reduced motion, live preference changes, no-WebGL relief/map operation, and failed network submission/retry passed. Reporting does not require world manipulation. |
| Production serving | The built application was started through the standalone Fastify entry point. Its actual API and compressed GLB/script delivery worked in Chrome. |
| Build and dependencies | TypeScript, production build, whitespace checks, and runtime dependency audit passed. The old MapLibre vulnerability was removed by upgrading to the patched release. Large deferred Three.js/MapLibre chunks still produce Vite's advisory. |
| Oracle migration | Runtime migration plan contains 29 statements and parses through the migration runner's check mode. Connection-stub tests verify pooling, bind mapping, row locking, commit/rollback, and entity writes. No live Oracle execution is claimed. |

The browser tests use isolated temporary demonstration databases. The existing `.noudilo` accounts and records were not populated with test cases.

### Visual review

Desktop and mobile frames were inspected for the public overview, reporting side panel, tanker depot, damaged-pipe view, verified repair, and saved receipt. Nearby illustrative buildings were culled from guided task views where they obscured the pipe; depot framing was adjusted to face the vehicle and uses the configured fleet depot. World orientation text now has a calm, contrast-preserving surface over the moving scene.

Saved review images: [island overview](previews/island-overview.png), [public leak](previews/public-leak.png), [mobile overview](previews/mobile-home.png), and [tanker depot](previews/tanker-depot.png).

### Local performance sample

The [recorded laboratory report](performance-lab.json) measured the compressed production build in local headless Google Chrome at 1440 × 1000 pixels, with an active heavy-leak illustration:

- 180 demand-rendered frames over 3.001 seconds, approximately 60 frames per second in this single run.
- High detail: 150 draw calls and 1,181,654 visible triangles; low detail: 150 draw calls and 527,990 triangles, about 55% fewer triangles.
- Largest Contentful Paint entry: 188 ms; cumulative layout shift: 0.039. These are local desktop laboratory entries, not mobile field percentiles. INP and physical-device performance were not measured.
- Fifteen compressible build outputs reduced from about 4.24 MB to 0.85 MB in Brotli variants, including deferred assets. The compressed house model transferred about 27 KB rather than its 312 KB decoded size.
- No page errors during the measured scenario. This does not promise a frame rate on other hardware.

### Explicit limitations

- Oracle credentials and an accessible Autonomous Database were unavailable. The adapter/migrations are implemented; actual cloud execution remains unverified.
- The geography is real; individual buildings, infrastructure, household connections, duration tank levels, and journey playback are illustrative. There is no live utility feed, GPS stream, or safe-routing integration.
- Models are original procedural architectural representations, not surveyed buildings or scanned assets. Blender was unavailable; the brief's procedural Three.js alternative was used.
- Photos persist in bounded private records. Production object storage/scanning, identity-provider or recovery email, deployment TLS, backups, and operational monitoring are separate deployment work.
- SSE revision broadcasts are in-process with periodic cross-process read fallback; a durable distributed outbox is not included.
- Browser coverage is Chromium with desktop/touch-width layouts and automated accessibility checks. Physical devices, Safari, Firefox, screen-reader sessions, and public-scale load tests remain untested.

## Public experience redesign — 27 November 2026

The public home now introduces NouDilo through the Mauritius relief map, published incident counts, a locality filter, a labelled response walkthrough, and reporting help. Resident reporting, account intent, coordinator review, and worker access continue to use the existing API and permissions.

Verification used a separate local server and SQLite database under the system temporary directory. No test accounts or reports were added to the project's existing database.

- Completed 19 browser assertions covering keyboard walkthrough navigation, issue/condition changes, registration with retained reporting intent, editing, shortage and leak submission, saved references, report tracking, Escape dismissal, role routing, coordinator verification, map publication, selection focus, return focus, unavailable counts, page errors, and responsive overflow.
- Swept the public home, reporting workspace, account screen, map, coordinator sections, and worker queues at widths from 320 to 1920 CSS pixels. No horizontal page overflow was recorded in the tested layouts.
- Ran axe-core WCAG A/AA rule sets on the public home, report workspace, resident registration, shortage and leak detail dialogs, leak review, coordinator review, populated public overview, standalone map, and worker assignments. The home had two inactive walkthrough labels below the contrast threshold. Their contrast was corrected; the populated home was rechecked with no violations. The other tested states reported no violations.
- Inspected desktop and mobile renders of the public home, coordinator review, and resident report. Checked the normal entrance animation and reduced-motion path.
- Eight final checks passed: corrected home contrast, walkthrough and help deep-link focus, 2D map switching, mobile entrance visibility, island and scene fallbacks without WebGL, reduced-motion content visibility, and absence of page errors.
- TypeScript, the Vite production build, and whitespace checks passed. Only the two required Latin variable font files are emitted. The existing deferred Three.js and MapLibre chunks still produce Vite's bundle-size advisory.

This is a local implementation, not a public deployment. Live utility feeds, Oracle migration, account recovery, operational inventory configuration, and public-service readiness remain outside this redesign. Chromium checks and automated accessibility checks do not replace cross-browser or assistive-technology testing.

The older audit sections below describe earlier iterations and their data/access models.

## Embedded 3D and access checks

The current app places 3D models beside the actions they explain. The report walkthrough, incident map, Coordinator review, and field assignments each display the scene for the current state.

- Verified in Chromium that issue and condition selection update the 3D scene and carry through account creation into the report. Confirmed that review and save update the scene in the same form.
- Completed the tanker and pipe-repair flows through separate Coordinator and Worker browser sessions. Checked the WebGL frames and tracked the scene state as actions were accepted, published, and verified.
- Verified that residents can read their own reports, workers can update only their vehicle or crew assignments, and coordinator-only actions are rejected for other accounts.
- Opened and dismissed Map credits in the map and confirmed the address and tab count stayed the same.
- Checked the public layout at 320, 390, 768, and 1440 CSS pixels and ran axe-core on the tested public workspace.

## Earlier iterations

This audit covers the local sample-data site. Checks ran in Chromium on 26 November 2026.

## Visual and interaction checks

| Area | Check | Result |
| --- | --- | --- |
| Public overview | Inspected the desktop and mobile screenshots for type hierarchy, button clarity, map framing, incident labels and visible sample-data disclosure. | Passed |
| Responsive layout | Checked document width at 320, 390, 650, 768, 1024 and 1440 CSS pixels. Opened a resident form at 390 pixels. | No horizontal page overflow |
| Keyboard navigation | Opened and closed mobile navigation and the report dialog. Used the skip link from the coordinator workspace. Selected an incident from its card and returned focus to the trigger when closing details. | Passed |
| Automated accessibility | axe-core WCAG A and AA rules covered the public overview, both reporting dialogs, walkthrough, coordinator and field workspaces. | No violations reported in the tested states |
| Reduced motion | Exercised scene controls and role navigation with the browser’s reduced-motion preference enabled. | Passed |
| Island and street map | Rendered the terrain on desktop and mobile. Exercised zoom, reset and keyboard marker selection. Loaded OpenStreetMap tiles and checked incident selection in street mode. | Passed |
| Map failure and low-performance paths | Blocked the street tile requests and ran a separate session with WebGL disabled. Incident selection stayed usable in the relief view. | Passed |
| Tanker and pipe scenes | Rendered the 3D tanker and scrubbed and reset its 2D route with the keyboard. Rendered the pipe cutaway, explored all seven stages and returned from the 2D illustration to the work order’s actual stage. | Passed |

## Functional checks

| Scenario | Observed outcome |
| --- | --- |
| Curepipe shortage | Submitted a household report, linked it to the existing incident and verified it as a coordinator. The report did not create a tanker assignment. |
| Approval and delivery | Approved the assignment, accepted it in Field team, confirmed arrival and recorded actual litres separately. The resident timeline updated after coordinator publication. Regular supply remained a separate verification action. |
| Rose Hill leak | Submitted a public leak report. The incident remained absent from the public map until verification. Assigned a crew, recorded an inspection and submitted the repair. The outcome remained pending until coordinator verification. The public card and selected map details then showed **Repair verified**. |
| Shared state | Reloaded the browser after both scenarios. The updated incidents and all seven completed walkthrough steps remained visible. |
| Verified notices | Published a sample notice from Coordinator and confirmed that it appeared on the public overview and followed the neighbourhood filter. |
| Reducer guards | Checked vehicle capacity and double-booking, invalid state transitions, premature delivery and repair verification, report privacy, separate restoration and audit history. |
| Build | TypeScript and the production Vite build passed. Vite reports size warnings for the deferred Three.js and MapLibre bundles. |

## Verification limits

- The browser run covered Chromium desktop and touch-width layouts. Safari, Firefox, physical mobile devices and assistive-technology sessions were outside this run.
- The demonstration uses sample locations, dispatch records and outcomes. Its role switch and browser storage support one local walkthrough. The Oracle integration and production access controls are documented separately.
- The Oracle SQL passed structural checks. A live Oracle instance was unavailable for execution.
- Penpot’s tool returned no connected design session. This audit covers the implemented web interface.
- The initial brief was the basis for the first build. The subsequent redesign used the four skill files added to the project.

## Role redesign

The landing page now directs visitors to the User, Coordinator, and Workers workspaces. The relief map of Mauritius carries the visual identity. The User workspace prioritises reporting and tracking, the Coordinator uses a review-first operations layout when reports are pending, and Workers has separate tanker and maintenance queues.

The redesign used the supplied Unslop, Awwwards Web Design, Prism, and UI/UX Pro Max instructions. The companion reference folders and verification scripts were unavailable. Chromium and axe-core were used for the browser audit.

- Verified the home and all three workspaces at 320, 390, 768, 1024, 1440, and 1920 CSS pixels. Reviewed desktop and mobile screenshots and exercised keyboard navigation.
- Tested the built site at `/dist/index.html` through a plain HTTP server to reproduce the Live Server setup. The terrain, optional map libraries, and styles use relative build URLs.
- Re-ran both guided incident workflows across the updated workspaces. Confirmed publication and verification gates, map updates, persistence, and all seven walkthrough steps.
