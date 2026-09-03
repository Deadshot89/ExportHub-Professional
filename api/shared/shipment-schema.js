'use strict';

const SHIPMENT_SCHEMA_SQL=`
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

alter table shipment_edit_locks enable row level security;
drop policy if exists tenant_isolation on shipment_edit_locks;
create policy tenant_isolation on shipment_edit_locks
  using (tenant_id::text = current_setting('app.tenant_id', true))
  with check (tenant_id::text = current_setting('app.tenant_id', true));

alter table shipment_colli enable row level security;
drop policy if exists tenant_isolation on shipment_colli;
create policy tenant_isolation on shipment_colli
  using (tenant_id::text = current_setting('app.tenant_id', true))
  with check (tenant_id::text = current_setting('app.tenant_id', true));

alter table carriers enable row level security;
drop policy if exists tenant_isolation on carriers;
create policy tenant_isolation on carriers
  using (tenant_id::text = current_setting('app.tenant_id', true))
  with check (tenant_id::text = current_setting('app.tenant_id', true));

alter table packaging_types enable row level security;
drop policy if exists tenant_isolation on packaging_types;
create policy tenant_isolation on packaging_types
  using (tenant_id::text = current_setting('app.tenant_id', true))
  with check (tenant_id::text = current_setting('app.tenant_id', true));
`;

async function applyShipmentSchema(client){
  if(!client||typeof client.query!=='function') throw new TypeError('PostgreSQL client required.');
  await client.query('BEGIN');
  try{
    await client.query("select pg_advisory_xact_lock(hashtext('exporthub_professional_shipment_schema_v1'))");
    await client.query(SHIPMENT_SCHEMA_SQL);
    await client.query('COMMIT');
  }catch(err){
    try{await client.query('ROLLBACK');}catch{}
    throw err;
  }
}

module.exports={applyShipmentSchema,SHIPMENT_SCHEMA_SQL};
