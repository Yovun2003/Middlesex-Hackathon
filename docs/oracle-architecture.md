# Oracle integration proposal

The current NouDilo prototype uses an authenticated local API and SQLite for accounts, assignments, and reports. The proposed production architecture uses Oracle Autonomous AI Database as the system of record.

## Service boundary

1. Serve the React frontend over HTTPS. Separate public map routes from resident and staff APIs. Publish only the map projection and approved notices to the public routes.
2. Use an OpenID Connect provider such as OCI IAM Identity Domains to authenticate users. OCI API Gateway can validate access tokens for protected routes. The application service validates the token and resolves its issuer and subject to an active application account with scoped permissions. [OCI API Gateway token validation](https://docs.oracle.com/en-us/iaas/Content/APIGateway/Tasks/apigatewayusingjwttokens.htm)
3. Run the application service inside an OCI virtual cloud network. Connect to Autonomous AI Database through its private endpoint over TCPS. Store the database credentials and any wallet material in an approved server-side secret store with rotation. Serve the public map from a read-only database interface. [Autonomous AI Database private access](https://docs.oracle.com/en-us/iaas/autonomous-database-serverless/doc/private-endpoints-autonomous.html)
4. Store evidence in private OCI Object Storage. The API assigns the object key, validates the allowed file type and size, and makes the file available to authorised users after scanning. Store the scan state, hash and object key in Oracle. Keep object keys and evidence metadata out of public responses. [OCI Object Storage security](https://docs.oracle.com/en-us/iaas/Content/Security/Concepts/security_core_services.htm)

## Records and lifecycles

| Record | Lifecycle and ownership |
| --- | --- |
| Individual report | Submitted, in review, verified, dismissed or withdrawn. The resident retains ownership. Linking preserves the report and its history. |
| Community shortage | Pending review, verified, monitoring, resolved or dismissed. A coordinator assesses affected households, water needs and urgency. Resolution requires a verified supply-restoration outcome. |
| Public infrastructure leak | Pending review, verified, resolved or dismissed. A coordinator verifies the leak. Resolution requires an independently verified repair outcome. |
| Tanker assignment | Approved, accepted, en route, arrived, delivery recorded, delivery verified or cancelled. Store approved litres on the assignment and actual litres on the delivery record. |
| Maintenance work order | Assigned, accepted, inspected, in progress, completion submitted, reopened, repair verified or cancelled. Capture inspection findings, maintenance notes and submitted evidence. |
| Outcome | Submitted, in review, verified or rejected. The outcome identifies a delivery, a repair or supply restoration. The coordinator records the verification decision and its evidence independently of field completion. |
| Public incident and notice | A minimal approved projection contains a safe location, public status and summary. Existing public projections are refreshed when authorised status changes are committed. Notices have a separate approval trail. |

The [proposed schema](oracle-schema.sql) models the records, links, resource allocation, evidence, versioning and audit events. The public projection contains the location and summary approved for publication. Private geometry remains available only to the appropriate reviewer or assigned crew. Store coordinates in WGS 84, longitude followed by latitude, and use Oracle Spatial for location indexing and suggestion queries. Treat a spatial match as a candidate: the review process also considers incident type, time window and service area before linking reports. [Oracle longitude and latitude spatial data](https://docs.oracle.com/en/database/oracle/oracle-database/26/spatl/getting-started-longitude-latitude-spatial-data-creating-and-indexing.html)

In the demo, a received report maps to a submitted report. A linked report also has an active association awaiting review. A delivered tanker assignment maps to a recorded delivery, and publication maps to a verified delivery with an updated public projection. A repaired leak maps to a verified repair outcome and a resolved leak incident. Preserve the resident’s original duration band and approximate household count during migration.

The map reads approved state from Oracle. The island and repair cutaway use that state for context, and the tanker animation uses a separately labelled simulation path. Operational route instructions come from an approved routing process and any future telemetry feeds a separate timestamped stream.

## API and row access

| Audience | Example routes | Row access |
| --- | --- | --- |
| Public | `GET /v1/public/incidents`, `GET /v1/public/notices` | Approved projection fields only. |
| Resident | `POST /v1/reports`, `GET /v1/me/reports`, `GET /v1/me/reports/{id}` | Own reports and the approved timeline associated with their linked incidents. |
| Coordinator | `GET /v1/operations/incidents`, `POST /v1/incidents/{id}/verify`, `POST /v1/incidents/{id}/tanker-assignments`, `POST /v1/incidents/{id}/work-orders`, `POST /v1/outcomes/{id}/verify` | Incidents, reports and resources in assigned operational areas. Only a coordinator can approve dispatch, publication and verification. |
| Driver | `GET /v1/me/tanker-assignments`, `POST /v1/tanker-assignments/{id}/events`, `POST /v1/tanker-assignments/{id}/delivery` | Assignments issued to the driver, with the destination, approved volume and necessary operating details. |
| Maintenance crew | `GET /v1/me/work-orders`, `POST /v1/work-orders/{id}/events`, `POST /v1/work-orders/{id}/evidence` | Active and historical work orders visible through that account's crew membership. |

The runtime database account receives execute access to dedicated read and command packages. A separate deployment account owns the database objects. The public API receives only access to dedicated projection views. Resolve role and area membership from database grants at request time. Where shared read interfaces require row filtering, use Oracle's trusted application context and role or owner predicates. On pooled connections, initialise the request context from the authenticated identity and clear it before returning the connection to the pool. [Oracle application contexts](https://docs.oracle.com/en/database/oracle/oracle-database/26/dbseg/application-contexts.html)

## Transaction and audit rules

- Every mutation validates the caller, target version and allowed transition. Use an idempotency key per actor and operation. Record a payload hash with the key and return the saved result for the same request. Reject a reused key with a different payload.
- Lock the incident and affected resources in a consistent order. Check that the required tanker, driver and crew are available, and validate delivery volume against vehicle capacity and the source's available stock. A reservation debits the source's available litres. Credit unused water only after recorded cancellation or verified return. Commit the stock movement, assignment, public projection update and append-only audit event together. Publish notifications asynchronously from the committed outbox.
- A delivery records actual litres independently of the assignment's approved volume. Delivery verification can update the approved public response status. A verified zero-litre record returns the shortage to the operational queue. A separate restoration outcome and incident check control the supply-restored state.
- Crew completion opens a repair outcome for coordinator review. The verification command checks crew completion, geographic scope, evidence and that the verifier is a different account from the submitter. It records the decision, updates the linked work order and incident, and refreshes any approved public projection in the same transaction. Rejection returns the work order to the crew, with the original event retained.
- Record actor, request identifier, event time and a scoped summary of the before and after state. Keep audit data out of public caches and omit unnecessary personal data from logs. Authorised correction appends a new event.

## Integration sequence

1. Provision a private non-production Autonomous AI Database and a dedicated NouDilo schema. Apply and validate the proposed DDL with SQLcl or your migration runner. Install versioned read and command packages, scoped grants, role membership and reference geography.
2. Implement the public projection, protected APIs and an adapter for the existing React repository. Seed the Curepipe shortage and Rose Hill leak from the demo fixtures. Configure the frontend to select its data adapter by environment.
3. Exercise per-role and per-row access with at least two residents, two areas, two drivers and two crews. Verify private reports and evidence stay out of the public projection, duplicate requests replay safely, concurrent allocations cannot double-book a truck, and repair and supply restoration require their own approvals.
4. Enable private evidence scanning, backups and recovery exercises, audit retention and operational monitoring before onboarding real users. Use a send queue backed by the transaction outbox for notifications.
