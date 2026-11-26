-- Proposed Oracle Autonomous AI Database schema for an empty NouDilo owner schema.
-- Runtime package bodies, deployment grants and tenant-specific provisioning
-- belong in a reviewed migration. See oracle-architecture.md for that boundary.

CREATE TABLE nd_account (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  oidc_issuer VARCHAR2(512 CHAR) NOT NULL,
  oidc_subject VARCHAR2(255 CHAR) NOT NULL,
  account_state VARCHAR2(16 CHAR) DEFAULT 'ACTIVE' NOT NULL
    CHECK (account_state IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT nd_account_identity_uk UNIQUE (oidc_issuer, oidc_subject)
);

CREATE TABLE nd_area (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  area_name VARCHAR2(160 CHAR) NOT NULL UNIQUE
);

CREATE TABLE nd_locality (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  area_id NUMBER NOT NULL REFERENCES nd_area(id),
  locality_name VARCHAR2(160 CHAR) NOT NULL,
  public_point MDSYS.SDO_GEOMETRY NOT NULL,
  CONSTRAINT nd_locality_name_uk UNIQUE (area_id, locality_name)
);

CREATE TABLE nd_account_role (
  account_id NUMBER NOT NULL REFERENCES nd_account(id),
  role_code VARCHAR2(20 CHAR) NOT NULL CHECK (
    role_code IN ('RESIDENT', 'COORDINATOR', 'DRIVER', 'CREW')
  ),
  CONSTRAINT nd_account_role_pk PRIMARY KEY (account_id, role_code)
);

CREATE TABLE nd_coordinator_area (
  account_id NUMBER NOT NULL REFERENCES nd_account(id),
  area_id NUMBER NOT NULL REFERENCES nd_area(id),
  CONSTRAINT nd_coord_area_pk PRIMARY KEY (account_id, area_id)
);

CREATE TABLE nd_report (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  resident_id NUMBER NOT NULL REFERENCES nd_account(id),
  locality_id NUMBER NOT NULL REFERENCES nd_locality(id),
  incident_kind VARCHAR2(12 CHAR) NOT NULL CHECK (incident_kind IN ('SHORTAGE', 'LEAK')),
  state_code VARCHAR2(24 CHAR) DEFAULT 'SUBMITTED' NOT NULL CHECK (
    state_code IN ('SUBMITTED', 'IN_REVIEW', 'VERIFIED', 'DISMISSED', 'WITHDRAWN')
  ),
  shortage_condition VARCHAR2(16 CHAR) CHECK (
    shortage_condition IN ('NO_WATER', 'LOW_PRESSURE')
  ),
  duration_band VARCHAR2(32 CHAR),
  reported_households NUMBER(8) CHECK (reported_households > 0),
  household_litres NUMBER(10) CHECK (household_litres > 0),
  leak_severity VARCHAR2(12 CHAR) CHECK (leak_severity IN ('LOW', 'MEDIUM', 'HIGH')),
  location_description VARCHAR2(240 CHAR),
  private_point MDSYS.SDO_GEOMETRY,
  resident_notes VARCHAR2(1000 CHAR),
  version_no NUMBER DEFAULT 1 NOT NULL CHECK (version_no > 0),
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT nd_report_kind_uk UNIQUE (id, incident_kind),
  CONSTRAINT nd_report_kind_fields_ck CHECK (
    (incident_kind = 'SHORTAGE' AND shortage_condition IS NOT NULL
      AND duration_band IS NOT NULL AND reported_households IS NOT NULL AND leak_severity IS NULL)
    OR
    (incident_kind = 'LEAK' AND leak_severity IS NOT NULL AND shortage_condition IS NULL
      AND duration_band IS NULL AND reported_households IS NULL AND household_litres IS NULL)
  )
);

CREATE INDEX nd_report_resident_ix ON nd_report(resident_id, submitted_at);
CREATE INDEX nd_report_locality_ix ON nd_report(locality_id, incident_kind, submitted_at);

CREATE TABLE nd_incident (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  locality_id NUMBER NOT NULL REFERENCES nd_locality(id),
  incident_kind VARCHAR2(12 CHAR) NOT NULL CHECK (incident_kind IN ('SHORTAGE', 'LEAK')),
  state_code VARCHAR2(24 CHAR) DEFAULT 'PENDING_REVIEW' NOT NULL CHECK (
    state_code IN ('PENDING_REVIEW', 'VERIFIED', 'MONITORING', 'RESOLVED', 'DISMISSED')
  ),
  priority VARCHAR2(12 CHAR) CHECK (priority IN ('NORMAL', 'HIGH', 'CRITICAL')),
  affected_households NUMBER(10) CHECK (affected_households > 0),
  assessed_litres NUMBER(12) CHECK (assessed_litres > 0),
  operational_point MDSYS.SDO_GEOMETRY,
  verified_by NUMBER REFERENCES nd_account(id),
  verified_at TIMESTAMP WITH TIME ZONE,
  opened_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  version_no NUMBER DEFAULT 1 NOT NULL CHECK (version_no > 0),
  CONSTRAINT nd_incident_kind_uk UNIQUE (id, incident_kind),
  CONSTRAINT nd_incident_verify_ck CHECK (
    (verified_by IS NULL AND verified_at IS NULL)
    OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)
  ),
  CONSTRAINT nd_incident_active_ck CHECK (
    state_code NOT IN ('VERIFIED', 'MONITORING', 'RESOLVED')
    OR (verified_by IS NOT NULL AND priority IS NOT NULL)
  ),
  CONSTRAINT nd_incident_assessment_ck CHECK (
    (incident_kind = 'LEAK' AND affected_households IS NULL AND assessed_litres IS NULL
      AND state_code <> 'MONITORING')
    OR incident_kind = 'SHORTAGE'
  )
);

CREATE INDEX nd_incident_queue_ix ON nd_incident(locality_id, state_code, incident_kind);

CREATE TABLE nd_report_incident_link (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id NUMBER NOT NULL,
  incident_id NUMBER NOT NULL,
  incident_kind VARCHAR2(12 CHAR) NOT NULL,
  linked_by NUMBER NOT NULL REFERENCES nd_account(id),
  linked_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  unlinked_by NUMBER REFERENCES nd_account(id),
  unlinked_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT nd_link_report_fk FOREIGN KEY (report_id, incident_kind)
    REFERENCES nd_report(id, incident_kind),
  CONSTRAINT nd_link_incident_fk FOREIGN KEY (incident_id, incident_kind)
    REFERENCES nd_incident(id, incident_kind),
  CONSTRAINT nd_link_inactive_ck CHECK (
    (unlinked_by IS NULL AND unlinked_at IS NULL)
    OR (unlinked_by IS NOT NULL AND unlinked_at IS NOT NULL AND unlinked_at >= linked_at)
  )
);

CREATE UNIQUE INDEX nd_active_report_link_ux ON nd_report_incident_link(
  CASE WHEN unlinked_at IS NULL THEN report_id END
);
CREATE INDEX nd_incident_link_ix ON nd_report_incident_link(incident_id, unlinked_at);

CREATE TABLE nd_water_source (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  locality_id NUMBER NOT NULL REFERENCES nd_locality(id),
  source_name VARCHAR2(160 CHAR) NOT NULL,
  available_litres NUMBER(12) NOT NULL CHECK (available_litres >= 0),
  measured_at TIMESTAMP WITH TIME ZONE NOT NULL,
  state_code VARCHAR2(16 CHAR) NOT NULL CHECK (state_code IN ('OPEN', 'CLOSED', 'REVIEW'))
);

CREATE TABLE nd_tanker (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  area_id NUMBER NOT NULL REFERENCES nd_area(id),
  vehicle_ref VARCHAR2(48 CHAR) NOT NULL UNIQUE,
  capacity_litres NUMBER(10) NOT NULL CHECK (capacity_litres > 0),
  state_code VARCHAR2(16 CHAR) NOT NULL CHECK (
    state_code IN ('OPERABLE', 'UNAVAILABLE', 'MAINTENANCE')
  )
);

CREATE TABLE nd_tanker_assignment (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id NUMBER NOT NULL,
  incident_kind VARCHAR2(12 CHAR) DEFAULT 'SHORTAGE' NOT NULL CHECK (incident_kind = 'SHORTAGE'),
  vehicle_id NUMBER NOT NULL REFERENCES nd_tanker(id),
  driver_id NUMBER NOT NULL REFERENCES nd_account(id),
  source_id NUMBER NOT NULL REFERENCES nd_water_source(id),
  approved_by NUMBER NOT NULL REFERENCES nd_account(id),
  approved_litres NUMBER(10) NOT NULL CHECK (approved_litres > 0),
  delivery_point MDSYS.SDO_GEOMETRY NOT NULL,
  route_ref VARCHAR2(160 CHAR),
  state_code VARCHAR2(24 CHAR) DEFAULT 'APPROVED' NOT NULL CHECK (
    state_code IN ('APPROVED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED',
      'DELIVERY_RECORDED', 'DELIVERY_VERIFIED', 'CANCELLED')
  ),
  approved_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  version_no NUMBER DEFAULT 1 NOT NULL CHECK (version_no > 0),
  CONSTRAINT nd_assign_incident_uk UNIQUE (id, incident_id),
  CONSTRAINT nd_assign_source_uk UNIQUE (id, source_id),
  CONSTRAINT nd_assign_shortage_fk FOREIGN KEY (incident_id, incident_kind)
    REFERENCES nd_incident(id, incident_kind)
);

CREATE UNIQUE INDEX nd_active_tanker_ux ON nd_tanker_assignment(
  CASE WHEN state_code IN ('APPROVED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED') THEN vehicle_id END
);
CREATE UNIQUE INDEX nd_active_driver_ux ON nd_tanker_assignment(
  CASE WHEN state_code IN ('APPROVED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED') THEN driver_id END
);
CREATE INDEX nd_assignment_incident_ix ON nd_tanker_assignment(incident_id, state_code);
CREATE INDEX nd_assignment_driver_ix ON nd_tanker_assignment(driver_id, approved_at);
CREATE INDEX nd_assignment_source_ix ON nd_tanker_assignment(source_id, state_code);

CREATE TABLE nd_assignment_issue (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assignment_id NUMBER NOT NULL REFERENCES nd_tanker_assignment(id),
  recorded_by NUMBER NOT NULL REFERENCES nd_account(id),
  detail VARCHAR2(1000 CHAR) NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE INDEX nd_assignment_issue_ix ON nd_assignment_issue(assignment_id, recorded_at);

CREATE TABLE nd_source_movement (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id NUMBER NOT NULL REFERENCES nd_water_source(id),
  assignment_id NUMBER,
  recorded_by NUMBER NOT NULL REFERENCES nd_account(id),
  movement_kind VARCHAR2(16 CHAR) NOT NULL CHECK (
    movement_kind IN ('RESERVED', 'RELEASED', 'REPLENISHED', 'CORRECTED')
  ),
  change_litres NUMBER(12) NOT NULL CHECK (change_litres <> 0),
  reason VARCHAR2(1000 CHAR) NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT nd_source_assign_fk FOREIGN KEY (assignment_id, source_id)
    REFERENCES nd_tanker_assignment(id, source_id),
  CONSTRAINT nd_source_movement_ck CHECK (
    (movement_kind = 'RESERVED' AND change_litres < 0 AND assignment_id IS NOT NULL)
    OR (movement_kind = 'RELEASED' AND change_litres > 0 AND assignment_id IS NOT NULL)
    OR (movement_kind = 'REPLENISHED' AND change_litres > 0)
    OR movement_kind = 'CORRECTED'
  )
);

CREATE INDEX nd_source_movement_ix ON nd_source_movement(source_id, recorded_at);

CREATE TABLE nd_delivery (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assignment_id NUMBER NOT NULL UNIQUE,
  incident_id NUMBER NOT NULL,
  recorded_by NUMBER NOT NULL REFERENCES nd_account(id),
  actual_litres NUMBER(10) NOT NULL CHECK (actual_litres >= 0),
  delivered_at TIMESTAMP WITH TIME ZONE NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  delivery_note VARCHAR2(1000 CHAR),
  CONSTRAINT nd_delivery_incident_uk UNIQUE (id, incident_id),
  CONSTRAINT nd_delivery_assignment_fk FOREIGN KEY (assignment_id, incident_id)
    REFERENCES nd_tanker_assignment(id, incident_id)
);

CREATE TABLE nd_crew (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  area_id NUMBER NOT NULL REFERENCES nd_area(id),
  crew_name VARCHAR2(100 CHAR) NOT NULL,
  state_code VARCHAR2(16 CHAR) NOT NULL CHECK (state_code IN ('ACTIVE', 'UNAVAILABLE'))
);

CREATE TABLE nd_crew_member (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  crew_id NUMBER NOT NULL REFERENCES nd_crew(id),
  account_id NUMBER NOT NULL REFERENCES nd_account(id),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  left_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT nd_crew_membership_dates_ck CHECK (left_at IS NULL OR left_at >= joined_at)
);

CREATE UNIQUE INDEX nd_crew_current_member_ux ON nd_crew_member(
  CASE WHEN left_at IS NULL THEN crew_id END,
  CASE WHEN left_at IS NULL THEN account_id END
);
CREATE INDEX nd_crew_account_ix ON nd_crew_member(account_id, left_at);

CREATE TABLE nd_work_order (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id NUMBER NOT NULL,
  incident_kind VARCHAR2(12 CHAR) DEFAULT 'LEAK' NOT NULL CHECK (incident_kind = 'LEAK'),
  crew_id NUMBER NOT NULL REFERENCES nd_crew(id),
  assigned_by NUMBER NOT NULL REFERENCES nd_account(id),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  state_code VARCHAR2(24 CHAR) DEFAULT 'ASSIGNED' NOT NULL CHECK (
    state_code IN ('ASSIGNED', 'ACCEPTED', 'INSPECTED', 'IN_PROGRESS',
      'COMPLETION_SUBMITTED', 'REOPENED', 'REPAIR_VERIFIED', 'CANCELLED')
  ),
  inspection_note VARCHAR2(1000 CHAR),
  completion_note VARCHAR2(1000 CHAR),
  version_no NUMBER DEFAULT 1 NOT NULL CHECK (version_no > 0),
  CONSTRAINT nd_work_incident_uk UNIQUE (id, incident_id),
  CONSTRAINT nd_work_leak_fk FOREIGN KEY (incident_id, incident_kind)
    REFERENCES nd_incident(id, incident_kind),
  CONSTRAINT nd_work_inspection_ck CHECK (
    state_code NOT IN ('INSPECTED', 'IN_PROGRESS', 'COMPLETION_SUBMITTED',
      'REOPENED', 'REPAIR_VERIFIED') OR inspection_note IS NOT NULL
  ),
  CONSTRAINT nd_work_completion_ck CHECK (
    state_code NOT IN ('COMPLETION_SUBMITTED', 'REPAIR_VERIFIED') OR completion_note IS NOT NULL
  )
);

CREATE INDEX nd_work_order_crew_ix ON nd_work_order(crew_id, state_code);
CREATE UNIQUE INDEX nd_active_leak_work_ux ON nd_work_order(
  CASE WHEN state_code NOT IN ('REPAIR_VERIFIED', 'CANCELLED') THEN incident_id END
);
CREATE UNIQUE INDEX nd_active_crew_work_ux ON nd_work_order(
  CASE WHEN state_code IN ('ASSIGNED', 'ACCEPTED', 'INSPECTED', 'IN_PROGRESS', 'REOPENED')
    THEN crew_id END
);

CREATE TABLE nd_outcome (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id NUMBER NOT NULL,
  incident_kind VARCHAR2(12 CHAR) NOT NULL,
  outcome_kind VARCHAR2(20 CHAR) NOT NULL CHECK (
    outcome_kind IN ('DELIVERY', 'REPAIR', 'SUPPLY_RESTORATION')
  ),
  delivery_id NUMBER,
  work_order_id NUMBER,
  submitted_by NUMBER NOT NULL REFERENCES nd_account(id),
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  state_code VARCHAR2(16 CHAR) DEFAULT 'SUBMITTED' NOT NULL CHECK (
    state_code IN ('SUBMITTED', 'IN_REVIEW', 'VERIFIED', 'REJECTED')
  ),
  reviewed_by NUMBER REFERENCES nd_account(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  decision_note VARCHAR2(1000 CHAR),
  version_no NUMBER DEFAULT 1 NOT NULL CHECK (version_no > 0),
  CONSTRAINT nd_outcome_incident_fk FOREIGN KEY (incident_id, incident_kind)
    REFERENCES nd_incident(id, incident_kind),
  CONSTRAINT nd_outcome_delivery_fk FOREIGN KEY (delivery_id, incident_id)
    REFERENCES nd_delivery(id, incident_id),
  CONSTRAINT nd_outcome_work_fk FOREIGN KEY (work_order_id, incident_id)
    REFERENCES nd_work_order(id, incident_id),
  CONSTRAINT nd_outcome_subject_ck CHECK (
    (outcome_kind = 'DELIVERY' AND incident_kind = 'SHORTAGE'
      AND delivery_id IS NOT NULL AND work_order_id IS NULL)
    OR (outcome_kind = 'REPAIR' AND incident_kind = 'LEAK'
      AND delivery_id IS NULL AND work_order_id IS NOT NULL)
    OR (outcome_kind = 'SUPPLY_RESTORATION' AND incident_kind = 'SHORTAGE'
      AND delivery_id IS NULL AND work_order_id IS NULL)
  ),
  CONSTRAINT nd_outcome_review_ck CHECK (
    (state_code IN ('VERIFIED', 'REJECTED') AND reviewed_by IS NOT NULL
      AND reviewed_at IS NOT NULL AND decision_note IS NOT NULL
      AND reviewed_by <> submitted_by AND reviewed_at >= submitted_at)
    OR (state_code IN ('SUBMITTED', 'IN_REVIEW') AND reviewed_by IS NULL
      AND reviewed_at IS NULL)
  )
);

CREATE UNIQUE INDEX nd_open_delivery_outcome_ux ON nd_outcome(
  CASE WHEN outcome_kind = 'DELIVERY' AND state_code <> 'REJECTED' THEN delivery_id END
);
CREATE UNIQUE INDEX nd_open_repair_outcome_ux ON nd_outcome(
  CASE WHEN outcome_kind = 'REPAIR' AND state_code <> 'REJECTED' THEN work_order_id END
);
CREATE UNIQUE INDEX nd_open_supply_outcome_ux ON nd_outcome(
  CASE WHEN outcome_kind = 'SUPPLY_RESTORATION' AND state_code <> 'REJECTED' THEN incident_id END
);
CREATE INDEX nd_outcome_incident_ix ON nd_outcome(incident_id, state_code, outcome_kind);

CREATE TABLE nd_evidence (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id NUMBER REFERENCES nd_report(id),
  work_order_id NUMBER REFERENCES nd_work_order(id),
  outcome_id NUMBER REFERENCES nd_outcome(id),
  uploaded_by NUMBER NOT NULL REFERENCES nd_account(id),
  object_key VARCHAR2(512 CHAR) NOT NULL UNIQUE,
  media_type VARCHAR2(80 CHAR) NOT NULL,
  size_bytes NUMBER(12) NOT NULL CHECK (size_bytes > 0),
  sha256 RAW(32),
  scan_state VARCHAR2(16 CHAR) DEFAULT 'PENDING' NOT NULL CHECK (
    scan_state IN ('PENDING', 'CLEAN', 'REJECTED')
  ),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT nd_evidence_subject_ck CHECK (
    (CASE WHEN report_id IS NOT NULL THEN 1 ELSE 0 END
      + CASE WHEN work_order_id IS NOT NULL THEN 1 ELSE 0 END
      + CASE WHEN outcome_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  ),
  CONSTRAINT nd_evidence_scanned_ck CHECK (scan_state <> 'CLEAN' OR sha256 IS NOT NULL)
);

CREATE TABLE nd_public_incident (
  incident_id NUMBER PRIMARY KEY REFERENCES nd_incident(id),
  public_id RAW(16) DEFAULT SYS_GUID() NOT NULL UNIQUE,
  locality_id NUMBER NOT NULL REFERENCES nd_locality(id),
  public_point MDSYS.SDO_GEOMETRY NOT NULL,
  public_status VARCHAR2(24 CHAR) NOT NULL CHECK (
    public_status IN ('VERIFIED_SHORTAGE', 'CRITICAL_SHORTAGE', 'ASSISTANCE_ASSIGNED',
      'VERIFIED_LEAK', 'REPAIR_IN_PROGRESS', 'REPAIR_AWAITING_REVIEW',
      'DELIVERY_VERIFIED', 'REPAIR_VERIFIED', 'SUPPLY_RESTORED')
  ),
  summary VARCHAR2(800 CHAR) NOT NULL,
  latest_verified_litres NUMBER(10) CHECK (latest_verified_litres > 0),
  approved_by NUMBER NOT NULL REFERENCES nd_account(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  withdrawn_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE nd_notice (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  locality_id NUMBER NOT NULL REFERENCES nd_locality(id),
  title VARCHAR2(160 CHAR) NOT NULL,
  notice_body VARCHAR2(1000 CHAR) NOT NULL,
  created_by NUMBER NOT NULL REFERENCES nd_account(id),
  approved_by NUMBER REFERENCES nd_account(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  withdrawn_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT nd_notice_approval_ck CHECK (
    (approved_by IS NULL AND approved_at IS NULL)
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  )
);

CREATE TABLE nd_audit_event (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id NUMBER NOT NULL REFERENCES nd_account(id),
  request_id VARCHAR2(64 CHAR) NOT NULL,
  entity_type VARCHAR2(24 CHAR) NOT NULL CHECK (
    entity_type IN ('REPORT', 'REPORT_LINK', 'INCIDENT', 'TANKER_ASSIGNMENT',
      'ASSIGNMENT_ISSUE', 'SOURCE_MOVEMENT', 'DELIVERY', 'WORK_ORDER',
      'OUTCOME', 'EVIDENCE', 'PUBLIC_INCIDENT',
      'NOTICE', 'RESOURCE')
  ),
  entity_id NUMBER NOT NULL,
  action_code VARCHAR2(48 CHAR) NOT NULL,
  before_state CLOB CHECK (before_state IS JSON),
  after_state CLOB CHECK (after_state IS JSON),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE INDEX nd_audit_entity_ix ON nd_audit_event(entity_type, entity_id, created_at);
CREATE INDEX nd_audit_request_ix ON nd_audit_event(request_id);

CREATE TABLE nd_request_dedup (
  actor_id NUMBER NOT NULL REFERENCES nd_account(id),
  operation_code VARCHAR2(48 CHAR) NOT NULL,
  idempotency_key VARCHAR2(96 CHAR) NOT NULL,
  payload_hash RAW(32) NOT NULL,
  http_status NUMBER(3) CHECK (http_status BETWEEN 200 AND 599),
  result_payload CLOB CHECK (result_payload IS JSON),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT nd_request_dedup_pk PRIMARY KEY (actor_id, operation_code, idempotency_key)
);

CREATE TABLE nd_outbox (
  id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id NUMBER NOT NULL REFERENCES nd_audit_event(id),
  topic VARCHAR2(48 CHAR) NOT NULL,
  payload CLOB NOT NULL CHECK (payload IS JSON),
  next_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  attempts NUMBER(8) DEFAULT 0 NOT NULL CHECK (attempts >= 0),
  published_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT nd_outbox_event_topic_uk UNIQUE (event_id, topic)
);

CREATE INDEX nd_outbox_pending_ix ON nd_outbox(published_at, next_attempt_at);

CREATE VIEW nd_public_map_v AS
  SELECT RAWTOHEX(p.public_id) AS public_id, l.locality_name,
    p.public_point, p.public_status, p.summary, p.latest_verified_litres, p.updated_at
  FROM nd_public_incident p
  JOIN nd_locality l ON l.id = p.locality_id
  WHERE p.withdrawn_at IS NULL;

CREATE VIEW nd_public_notice_v AS
  SELECT n.id AS public_notice_id, l.locality_name, n.title, n.notice_body,
    n.approved_at, n.expires_at
  FROM nd_notice n
  JOIN nd_locality l ON l.id = n.locality_id
  WHERE n.approved_at <= SYSTIMESTAMP
    AND n.withdrawn_at IS NULL
    AND (n.expires_at IS NULL OR n.expires_at > SYSTIMESTAMP);

-- The API validates coordinate range and writes two-dimensional WGS 84 geometries.
INSERT INTO USER_SDO_GEOM_METADATA (TABLE_NAME, COLUMN_NAME, DIMINFO, SRID)
VALUES ('ND_REPORT', 'PRIVATE_POINT', MDSYS.SDO_DIM_ARRAY(
  MDSYS.SDO_DIM_ELEMENT('LONGITUDE', -180, 180, 0.5),
  MDSYS.SDO_DIM_ELEMENT('LATITUDE', -90, 90, 0.5)), 4326);

INSERT INTO USER_SDO_GEOM_METADATA (TABLE_NAME, COLUMN_NAME, DIMINFO, SRID)
VALUES ('ND_INCIDENT', 'OPERATIONAL_POINT', MDSYS.SDO_DIM_ARRAY(
  MDSYS.SDO_DIM_ELEMENT('LONGITUDE', -180, 180, 0.5),
  MDSYS.SDO_DIM_ELEMENT('LATITUDE', -90, 90, 0.5)), 4326);

INSERT INTO USER_SDO_GEOM_METADATA (TABLE_NAME, COLUMN_NAME, DIMINFO, SRID)
VALUES ('ND_PUBLIC_INCIDENT', 'PUBLIC_POINT', MDSYS.SDO_DIM_ARRAY(
  MDSYS.SDO_DIM_ELEMENT('LONGITUDE', -180, 180, 0.5),
  MDSYS.SDO_DIM_ELEMENT('LATITUDE', -90, 90, 0.5)), 4326);

COMMIT;

CREATE INDEX nd_report_point_sx ON nd_report(private_point) INDEXTYPE IS MDSYS.SPATIAL_INDEX_V2;
CREATE INDEX nd_incident_point_sx ON nd_incident(operational_point) INDEXTYPE IS MDSYS.SPATIAL_INDEX_V2;
CREATE INDEX nd_public_point_sx ON nd_public_incident(public_point) INDEXTYPE IS MDSYS.SPATIAL_INDEX_V2;
