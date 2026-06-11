-- ShipNow database schema (PostgreSQL / Supabase)
-- Run via the Supabase SQL editor or `supabase db push` after `supabase init`.

create extension if not exists "pgcrypto";

-- ── Profiles ────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  avatar_url text,
  role text not null default 'customer'
    check (role in ('customer', 'admin', 'support')),
  wallet_balance numeric(10, 2) not null default 0,
  reward_points int not null default 0,
  company_name text not null default '',
  default_address_id uuid,
  two_factor_enabled boolean not null default false,
  fcm_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_role on public.profiles (role);

-- ── Shipments ───────────────────────────────────────────────────────────
create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  tracking_number text unique not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'created'
    check (status in ('created','picked_up','in_transit','out_for_delivery',
                      'delivered','exception','cancelled','returned')),
  service text not null check (service in ('Express','Standard','Air Freight','Sea Freight')),
  origin jsonb not null,
  destination jsonb not null,
  package jsonb not null,
  price numeric(10, 2) not null default 0,
  currency text not null default 'USD',
  declared_value numeric(10, 2) not null default 0,
  estimated_delivery timestamptz,
  delivered_at timestamptz,
  label_url text,
  invoice_url text,
  reference text,
  payment_intent_id text,
  paid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shipments_user on public.shipments (user_id);
create index if not exists idx_shipments_status on public.shipments (status);
create index if not exists idx_shipments_tracking on public.shipments (tracking_number);

-- ── Tracking events ─────────────────────────────────────────────────────
create table if not exists public.tracking_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  status text not null,
  location text not null,
  description text,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_tracking_events_shipment
  on public.tracking_events (shipment_id, occurred_at desc);

-- ── Chat messages ───────────────────────────────────────────────────────
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id text not null,
  sender_id text not null,
  sender_name text not null default 'Unknown',
  text text not null,
  sent_at timestamptz not null default now(),
  from_agent boolean not null default false,
  read boolean not null default false,
  attachment_url text
);

create index if not exists idx_chat_thread on public.chat_messages (thread_id, sent_at);

-- ── Notifications ───────────────────────────────────────────────────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null default '',
  read boolean not null default false,
  shipment_tracking text,
  sent_at timestamptz not null default now()
);

create index if not exists idx_notifications_user
  on public.notifications (user_id, sent_at desc);

-- ── Trigger: keep updated_at fresh ──────────────────────────────────────
create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_shipments_updated on public.shipments;
create trigger trg_shipments_updated before update on public.shipments
  for each row execute function public.set_updated_at();

-- ── Row-level security ──────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.shipments enable row level security;
alter table public.tracking_events enable row level security;
alter table public.chat_messages enable row level security;
alter table public.notifications enable row level security;

-- Profiles: owner reads/updates own row; admins read all
drop policy if exists profiles_owner_select on public.profiles;
create policy profiles_owner_select on public.profiles
  for select using (auth.uid() = id or auth.jwt() ->> 'role' = 'admin');
drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update on public.profiles
  for update using (auth.uid() = id);

-- Shipments: owner reads/writes own; public tracking lookup by number
drop policy if exists shipments_owner_select on public.shipments;
create policy shipments_owner_select on public.shipments
  for select using (
    auth.uid() = user_id
    or auth.jwt() ->> 'role' in ('admin', 'support')
  );
drop policy if exists shipments_public_select on public.shipments;
create policy shipments_public_select on public.shipments
  for select using (true);  -- tracking by tracking_number is public
drop policy if exists shipments_owner_insert on public.shipments;
create policy shipments_owner_insert on public.shipments
  for insert with check (auth.uid() = user_id);

-- Tracking events: read by anyone (public progress), write by owner/admin
drop policy if exists tracking_public_select on public.tracking_events;
create policy tracking_public_select on public.tracking_events
  for select using (true);
drop policy if exists tracking_owner_insert on public.tracking_events;
create policy tracking_owner_insert on public.tracking_events
  for insert with check (
    exists (
      select 1 from public.shipments s
      where s.id = tracking_events.shipment_id
        and (s.user_id = auth.uid() or auth.jwt() ->> 'role' in ('admin','support'))
    )
  );

-- Chat: members of the thread can read/write
drop policy if exists chat_thread_select on public.chat_messages;
create policy chat_thread_select on public.chat_messages
  for select using (
    sender_id = auth.uid()::text
    or auth.jwt() ->> 'role' in ('admin', 'support')
  );
drop policy if exists chat_thread_insert on public.chat_messages;
create policy chat_thread_insert on public.chat_messages
  for insert with check (
    sender_id = auth.uid()::text
    or auth.jwt() ->> 'role' in ('admin', 'support')
  );

-- Notifications: owner only
drop policy if exists notifications_owner_select on public.notifications;
create policy notifications_owner_select on public.notifications
  for select using (auth.uid() = user_id);
