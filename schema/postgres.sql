-- ExportHUB Professional 0.7 – SaaS-Zielschema mit Identity Administration
-- Noch nicht an den RC826-Bestand schreibend angeschlossen.
create extension if not exists pgcrypto;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now()
);

-- Upgradepfad von Professional 0.5: bestehende Mandanten erhalten zunächst eine eindeutige technische Workspace-ID.
alter table tenants add column if not exists slug text;
update tenants
   set slug=left(regexp_replace(lower(coalesce(name,'tenant')),'[^a-z0-9]+','-','g'),45)||'-'||left(replace(id::text,'-',''),8)
 where slug is null or btrim(slug)='';
alter table tenants alter column slug set not null;
create unique index if not exists tenants_slug_uq on tenants(slug);

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  external_subject text,
  username text not null,
  display_name text not null,
  email text,
  active boolean not null default true,
  password_reset_required boolean not null default true,
  created_at timestamptz not null default now(),
  unique(tenant_id, username)
);
create index if not exists app_users_tenant_idx on app_users(tenant_id);

create table if not exists tenant_memberships (
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references app_users(id),
  role text not null check (role in ('TENANT_ADMIN','EXPORT_ADMIN','TEAM_LEAD','OPERATOR','WAREHOUSE','AUDITOR')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(tenant_id,user_id)
);

create table if not exists app_user_auth (
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references app_users(id) on delete cascade,
  login_name text not null,
  password_hash text not null,
  password_changed_at timestamptz not null default now(),
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  primary key(tenant_id,user_id),
  unique(tenant_id,login_name)
);
create index if not exists app_user_auth_tenant_login_idx on app_user_auth(tenant_id,login_name);

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references app_users(id) on delete cascade,
  session_hash text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  unique(tenant_id,session_hash)
);
create index if not exists auth_sessions_tenant_hash_idx on auth_sessions(tenant_id,session_hash);
create index if not exists auth_sessions_expiry_idx on auth_sessions(expires_at);

create table if not exists user_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  email text not null,
  login_name text not null,
  display_name text not null,
  role text not null check (role in ('TENANT_ADMIN','EXPORT_ADMIN','TEAM_LEAD','OPERATOR','WAREHOUSE','AUDITOR')),
  token_hash text not null,
  expires_at timestamptz not null,
  created_by uuid references app_users(id),
  accepted_user_id uuid references app_users(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique(tenant_id,token_hash)
);
create index if not exists user_invitations_tenant_login_idx on user_invitations(tenant_id,login_name);
create index if not exists user_invitations_expiry_idx on user_invitations(expires_at);

create table if not exists password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  created_by uuid references app_users(id),
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique(tenant_id,token_hash)
);
create index if not exists password_reset_tokens_tenant_user_idx on password_reset_tokens(tenant_id,user_id);
create index if not exists password_reset_tokens_expiry_idx on password_reset_tokens(expires_at);

create table if not exists tenant_settings (
  tenant_id uuid primary key references tenants(id),
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
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

-- Live-Stammdaten-Erweiterung. Bestehende Legacy-Zeilen bleiben kompatibel.
alter table customers add column if not exists active boolean not null default true;
alter table customers add column if not exists updated_at timestamptz not null default now();
create unique index if not exists customers_tenant_id_id_uq on customers(tenant_id,id);

create table if not exists customer_locations (
  id uuid primary key default gen_random_uuid(),
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

-- Strukturierte Live-Adresse zusätzlich zu den unveränderten Legacy-Feldern address/email/derived_main.
alter table customer_locations add column if not exists street text;
alter table customer_locations add column if not exists house_number text;
alter table customer_locations add column if not exists postal_code text;
alter table customer_locations add column if not exists city text;
alter table customer_locations add column if not exists country_iso text;
alter table customer_locations add column if not exists contact_email text;
alter table customer_locations add column if not exists carrier_name text;
alter table customer_locations add column if not exists shipping_instructions text;
alter table customer_locations add column if not exists active boolean not null default true;
alter table customer_locations add column if not exists updated_at timestamptz not null default now();
create unique index if not exists customer_locations_tenant_id_id_uq on customer_locations(tenant_id,id);

-- Zusätzliche tenant-sichere Beziehung. NOT VALID schützt den Upgradepfad für mögliche alte Inkonsistenzen;
-- neue/aktualisierte Zeilen werden trotzdem sofort durch den Constraint geprüft.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname='customer_locations_tenant_customer_fk'
       and conrelid='customer_locations'::regclass
  ) then
    alter table customer_locations
      add constraint customer_locations_tenant_customer_fk
      foreign key (tenant_id,customer_id)
      references customers(tenant_id,id)
      not valid;
  end if;
end $$;

create table if not exists customer_location_registration_emails (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  location_id uuid not null,
  email text not null,
  created_at timestamptz not null default now(),
  constraint customer_location_registration_emails_location_fk
    foreign key (tenant_id,location_id)
    references customer_locations(tenant_id,id)
    on delete cascade
);
create index if not exists customer_location_registration_emails_tenant_location_idx
  on customer_location_registration_emails(tenant_id,location_id);
create unique index if not exists customer_location_registration_emails_uq
  on customer_location_registration_emails(tenant_id,location_id,lower(email));

create table if not exists shipments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  customer_id uuid references customers(id),
  location_id uuid references customer_locations(id),
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

-- Live-Sendungskern. Bestehende Bestände werden standardmäßig als MIGRATED behandelt.
alter table shipments add column if not exists source_kind text not null default 'MIGRATED';
alter table shipments add column if not exists revision bigint not null default 0;
alter table shipments add column if not exists recipient_snapshot jsonb not null default '{}'::jsonb;
alter table shipments add column if not exists sender_snapshot jsonb not null default '{}'::jsonb;
alter table shipments add column if not exists carrier_snapshot jsonb not null default '{}'::jsonb;
alter table shipments add column if not exists fx_snapshot jsonb not null default '{}'::jsonb;
alter table shipments add column if not exists readiness jsonb not null default '{}'::jsonb;
alter table shipments add column if not exists planned_pickup_date date;
alter table shipments add column if not exists completed_at timestamptz;
alter table shipments add column if not exists archived_at timestamptz;
alter table shipments add column if not exists discarded_at timestamptz;
alter table shipments add column if not exists rework jsonb not null default '{}'::jsonb;
alter table shipments add column if not exists updated_at timestamptz not null default now();
create unique index if not exists shipments_tenant_reference_uq on shipments(tenant_id,reference);
create index if not exists shipments_tenant_status_pickup_idx on shipments(tenant_id,status,planned_pickup_date);
create unique index if not exists shipments_tenant_id_id_uq on shipments(tenant_id,id);

create table if not exists carriers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  active boolean not null default true,
  abd_required_default boolean not null default false,
  contact_name text,
  email text,
  phone text,
  portal_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists carriers_tenant_name_uq on carriers(tenant_id,lower(name));
create unique index if not exists carriers_tenant_id_id_uq on carriers(tenant_id,id);

create table if not exists packaging_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  active boolean not null default true,
  length_cm numeric(12,2),
  width_cm numeric(12,2),
  height_cm numeric(12,2),
  ldm_mode text not null check(ldm_mode in ('FIXED_PER_UNIT','FOOTPRINT')),
  fixed_ldm_per_unit numeric(14,4),
  allow_length boolean not null default false,
  allow_width boolean not null default false,
  allow_height boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists packaging_types_tenant_name_uq on packaging_types(tenant_id,lower(name));
create unique index if not exists packaging_types_tenant_id_id_uq on packaging_types(tenant_id,id);

create table if not exists shipment_edit_locks (
  tenant_id uuid not null references tenants(id),
  shipment_id uuid not null,
  user_id uuid not null references app_users(id),
  lock_token text not null,
  acquired_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  primary key(tenant_id,shipment_id),
  constraint shipment_edit_locks_shipment_fk
    foreign key (tenant_id,shipment_id)
    references shipments(tenant_id,id)
    on delete cascade
);
create index if not exists shipment_edit_locks_tenant_activity_idx on shipment_edit_locks(tenant_id,last_activity_at);

create table if not exists shipment_colli (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  shipment_id uuid not null,
  packaging_type_id uuid,
  packaging_name_snapshot text not null,
  quantity integer not null check(quantity>0),
  weight_kg numeric(14,3) not null check(weight_kg>=0),
  length_cm numeric(12,2),
  width_cm numeric(12,2),
  height_cm numeric(12,2),
  ldm numeric(14,4) not null check(ldm>=0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipment_colli_shipment_fk
    foreign key (tenant_id,shipment_id)
    references shipments(tenant_id,id)
    on delete cascade,
  constraint shipment_colli_packaging_fk
    foreign key (tenant_id,packaging_type_id)
    references packaging_types(tenant_id,id)
);
create index if not exists shipment_colli_tenant_shipment_idx on shipment_colli(tenant_id,shipment_id,position);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
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
  id uuid primary key default gen_random_uuid(),
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
  id uuid primary key default gen_random_uuid(),
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
  tenant_id uuid not null references tenants(id),
  source_pointer text not null,
  target_type text not null,
  target_id uuid,
  duplicate_alias boolean not null default false,
  primary key(migration_run_id, source_pointer, target_type)
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid references app_users(id),
  event_type text not null,
  entity_type text,
  entity_id uuid,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists audit_events_tenant_time_idx on audit_events(tenant_id, occurred_at desc);

-- Datenbankseitige zweite Schutzschicht. Die API setzt app.tenant_id pro Transaktion.
do $$
declare t text;
begin
  foreach t in array array['app_users','tenant_memberships','app_user_auth','auth_sessions','user_invitations','password_reset_tokens','tenant_settings','customers','customer_locations','customer_location_registration_emails','shipments','shipment_edit_locks','shipment_colli','carriers','packaging_types','documents','generated_artifacts','migration_runs','migration_source_map','audit_events']
  loop
    execute format('alter table %I enable row level security',t);
    execute format('drop policy if exists tenant_isolation on %I',t);
    execute format('create policy tenant_isolation on %I using (tenant_id::text = current_setting(''app.tenant_id'', true)) with check (tenant_id::text = current_setting(''app.tenant_id'', true))',t);
  end loop;
end $$;
