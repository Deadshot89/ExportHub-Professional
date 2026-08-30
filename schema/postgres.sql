-- ExportHUB Professional 0.4 – Zielschema (noch nicht automatisch aktiv)
create table if not exists tenants (
  id uuid primary key,
  name text not null,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now()
);

create table if not exists app_users (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  username text not null,
  display_name text not null,
  email text,
  role text not null,
  active boolean not null default true,
  password_reset_required boolean not null default true,
  created_at timestamptz not null default now(),
  unique(tenant_id, username)
);
create index if not exists app_users_tenant_idx on app_users(tenant_id);

create table if not exists customers (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  legacy_id text,
  account text,
  name text not null,
  country text,
  iso text,
  created_at timestamptz not null default now(),
  unique(tenant_id, account)
);
create index if not exists customers_tenant_idx on customers(tenant_id);


create table if not exists customer_locations (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  customer_id uuid not null references customers(id),
  legacy_location_id text,
  name text not null,
  address text,
  country text,
  contact_name text,
  email text,
  phone text,
  derived_main boolean not null default false,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists customer_locations_tenant_customer_idx on customer_locations(tenant_id, customer_id);

create table if not exists shipments (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  customer_id uuid references customers(id),
  reference text not null,
  legacy_shipment_id text,
  status text not null,
  source_status text,
  process_status text,
  pod_evidence boolean not null default false,
  locked boolean not null default false,
  lock_reason text,
  picked_up_at timestamptz,
  actual_pickup_date date,
  created_at timestamptz not null default now(),
  unique(tenant_id, reference)
);
create index if not exists shipments_tenant_idx on shipments(tenant_id);

create table if not exists documents (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  shipment_id uuid references shipments(id),
  customer_id uuid references customers(id),
  kind text not null,
  original_name text not null,
  sha256 text,
  storage_key text,
  verification_status text not null,
  migration_priority text not null default 'OK',
  cutover_blocking boolean not null default true,
  remote_source_class text,
  recovery_action text not null default 'SOURCE_FILE_REQUIRED',
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists documents_tenant_idx on documents(tenant_id);
create index if not exists documents_shipment_idx on documents(shipment_id);

create table if not exists generated_artifacts (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  shipment_id uuid not null references shipments(id),
  artifact_type text not null,
  legacy_id text,
  version integer,
  status text,
  signature text,
  generated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists generated_artifacts_shipment_idx on generated_artifacts(shipment_id);

create table if not exists migration_runs (
  id uuid primary key,
  tenant_id uuid references tenants(id),
  source_version text,
  source_format text,
  source_sha256 text not null,
  read_only_ready boolean not null default false,
  cutover_ready boolean not null default false,
  report jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists migration_source_map (
  migration_run_id uuid not null references migration_runs(id),
  source_pointer text not null,
  target_type text not null,
  target_id uuid,
  duplicate_alias boolean not null default false,
  primary key(migration_run_id, source_pointer, target_type)
);

create table if not exists audit_events (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  user_id uuid references app_users(id),
  event_type text not null,
  entity_type text,
  entity_id uuid,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists audit_events_tenant_time_idx on audit_events(tenant_id, occurred_at desc);
