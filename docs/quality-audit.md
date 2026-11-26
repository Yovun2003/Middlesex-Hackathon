# NouDilo quality audit

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
