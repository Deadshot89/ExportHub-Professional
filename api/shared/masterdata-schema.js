'use strict';

const MASTERDATA_SCHEMA_SQL=`
alter table customers add column if not exists active boolean not null default true;
alter table customers add column if not exists updated_at timestamptz not null default now();
create unique index if not exists customers_tenant_id_id_uq on customers(tenant_id,id);

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

alter table customer_location_registration_emails enable row level security;
drop policy if exists tenant_isolation on customer_location_registration_emails;
create policy tenant_isolation on customer_location_registration_emails
  using (tenant_id::text = current_setting('app.tenant_id', true))
  with check (tenant_id::text = current_setting('app.tenant_id', true));
`;

async function applyMasterdataSchema(client){
  if(!client||typeof client.query!=='function') throw new TypeError('PostgreSQL client required.');
  await client.query(MASTERDATA_SCHEMA_SQL);
}

module.exports={applyMasterdataSchema,MASTERDATA_SCHEMA_SQL};
