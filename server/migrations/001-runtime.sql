-- Runtime schema for the Oracle adapter. Apply to a dedicated non-ADMIN application schema.
CREATE TABLE ND_ROLE (name VARCHAR2(20) PRIMARY KEY);
INSERT INTO ND_ROLE (name) SELECT 'resident' FROM dual WHERE NOT EXISTS (SELECT 1 FROM ND_ROLE WHERE name = 'resident');
INSERT INTO ND_ROLE (name) SELECT 'coordinator' FROM dual WHERE NOT EXISTS (SELECT 1 FROM ND_ROLE WHERE name = 'coordinator');
INSERT INTO ND_ROLE (name) SELECT 'worker' FROM dual WHERE NOT EXISTS (SELECT 1 FROM ND_ROLE WHERE name = 'worker');
CREATE TABLE ND_ACCOUNT (
  id VARCHAR2(80) PRIMARY KEY, email VARCHAR2(160) NOT NULL UNIQUE,
  role_code VARCHAR2(20) NOT NULL REFERENCES ND_ROLE(name), resource_key VARCHAR2(160),
  salt VARCHAR2(64) NOT NULL, password_hash VARCHAR2(128) NOT NULL
);
CREATE INDEX ND_ACCOUNT_RESOURCE_IX ON ND_ACCOUNT(resource_key, role_code);
CREATE TABLE ND_SESSION (
  token VARCHAR2(64) PRIMARY KEY, account VARCHAR2(80) NOT NULL REFERENCES ND_ACCOUNT(id), expires NUMBER(19) NOT NULL
);
CREATE INDEX ND_SESSION_EXPIRY_IX ON ND_SESSION(expires);
CREATE TABLE ND_OWNER (
  report VARCHAR2(80) PRIMARY KEY, account VARCHAR2(80) NOT NULL REFERENCES ND_ACCOUNT(id)
);
CREATE INDEX ND_OWNER_ACCOUNT_IX ON ND_OWNER(account);
CREATE TABLE ND_STATE (
  id NUMBER(1) PRIMARY KEY CHECK (id = 1), document CLOB NOT NULL CHECK (document IS JSON)
);
INSERT INTO ND_STATE (id, document) SELECT 1, '{"schema":1,"reports":[],"shortages":[],"leaks":[],"tankers":[],"repairs":[],"audit":[],"notices":[],"inventory":{"waterAvailable":0,"fleet":[],"crews":[]}}' FROM dual WHERE NOT EXISTS (SELECT 1 FROM ND_STATE WHERE id = 1);
CREATE TABLE ND_IDEMPOTENCY (
  actor VARCHAR2(80) NOT NULL REFERENCES ND_ACCOUNT(id), request_key VARCHAR2(100) NOT NULL,
  payload_hash VARCHAR2(64) NOT NULL, result CLOB NOT NULL CHECK (result IS JSON),
  PRIMARY KEY (actor, request_key)
);
CREATE TABLE ND_NOTIFICATION (
  id VARCHAR2(180) PRIMARY KEY, account_id VARCHAR2(80) NOT NULL REFERENCES ND_ACCOUNT(id),
  message VARCHAR2(2000) NOT NULL, created_at VARCHAR2(40) NOT NULL
);
CREATE INDEX ND_NOTIFICATION_ACCOUNT_IX ON ND_NOTIFICATION(account_id, created_at);
CREATE TABLE ND_LOCATION (
  name VARCHAR2(80) PRIMARY KEY, longitude NUMBER(10,6) NOT NULL, latitude NUMBER(10,6) NOT NULL,
  CHECK (longitude BETWEEN -180 AND 180), CHECK (latitude BETWEEN -90 AND 90)
);
CREATE TABLE ND_RECORD (
  kind VARCHAR2(40) NOT NULL, id VARCHAR2(80) NOT NULL,
  document CLOB NOT NULL CHECK (document IS JSON), PRIMARY KEY (kind, id)
);
CREATE OR REPLACE VIEW ND_RESIDENT_REPORTS AS SELECT id, JSON_VALUE(document, '$.town') town, JSON_VALUE(document, '$.status') status, document FROM ND_RECORD WHERE kind = 'ResidentReports';
CREATE OR REPLACE VIEW ND_COMMUNITY_INCIDENTS AS SELECT id, JSON_VALUE(document, '$.town') town, JSON_VALUE(document, '$.status') status, document FROM ND_RECORD WHERE kind = 'CommunityIncidents';
CREATE OR REPLACE VIEW ND_REPORT_LINKS AS SELECT id, JSON_VALUE(document, '$.incidentId') incident_id, document FROM ND_RECORD WHERE kind = 'IncidentReportLinks';
CREATE OR REPLACE VIEW ND_ASSIGNMENTS AS SELECT id, JSON_VALUE(document, '$.incidentId') incident_id, JSON_VALUE(document, '$.status') status, document FROM ND_RECORD WHERE kind = 'Assignments';
CREATE OR REPLACE VIEW ND_WATER_DELIVERIES AS SELECT id, JSON_VALUE(document, '$.actualLitres' RETURNING NUMBER) actual_litres, document FROM ND_RECORD WHERE kind = 'WaterDeliveries';
CREATE OR REPLACE VIEW ND_REPAIR_WORK_ORDERS AS SELECT id, JSON_VALUE(document, '$.leakId') leak_id, JSON_VALUE(document, '$.status') status, document FROM ND_RECORD WHERE kind = 'RepairWorkOrders';
CREATE OR REPLACE VIEW ND_REPAIR_EVIDENCE AS SELECT id, document FROM ND_RECORD WHERE kind = 'RepairEvidence';
CREATE OR REPLACE VIEW ND_INCIDENT_HISTORY AS SELECT id, JSON_VALUE(document, '$.subjectId') subject_id, JSON_VALUE(document, '$.at') event_at, document FROM ND_RECORD WHERE kind = 'IncidentStatusHistory';
CREATE OR REPLACE VIEW ND_AUDIT_LOGS AS SELECT id, JSON_VALUE(document, '$.actor') actor, JSON_VALUE(document, '$.at') event_at, document FROM ND_RECORD WHERE kind = 'AuditLogs';
CREATE OR REPLACE VIEW ND_TANKERS AS SELECT id, JSON_VALUE(document, '$.capacity' RETURNING NUMBER) capacity, document FROM ND_RECORD WHERE kind = 'Tankers';
CREATE OR REPLACE VIEW ND_MAINTENANCE_CREWS AS SELECT id, document FROM ND_RECORD WHERE kind = 'MaintenanceCrews';
CREATE OR REPLACE VIEW ND_DRIVERS AS SELECT a.id, a.email, a.resource_key vehicle_id FROM ND_ACCOUNT a WHERE a.role_code = 'worker' AND EXISTS (SELECT 1 FROM ND_RECORD r WHERE r.kind = 'Tankers' AND r.id = a.resource_key);
