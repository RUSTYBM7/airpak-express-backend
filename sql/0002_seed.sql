-- ShipNow sample seed data
--
-- Run after 0001_init.sql. Provides:
--   - Two demo auth.users (one customer, one admin)
--   - Matching profiles
--   - 12 sample shipments across all four services + 8 statuses
--   - A ladder of tracking events per shipment
--   - A sample chat thread
--   - A few notifications
--
-- The auth.users rows use fixed UUIDs so the rest of the inserts can
-- reference them safely. In real life you'd create users via
-- supabase.auth.admin.createUser() so the bcrypt hashes are correct.
-- For local dev, this file is enough to make the dashboard
-- non-empty.

begin;

-- ── Auth users (passwords are 'demo1234' / 'admin1234' — dev only) ──
insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id)
values
  ('00000000-0000-0000-0000-000000000001', 'demo@airpak-express.com',
   crypt('demo1234', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-000000000002', 'admin@airpak-express.com',
   crypt('admin1234', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000')
on conflict (id) do nothing;

-- Mirror to public.profiles (the trigger from 0001 keeps timestamps fresh,
-- so we use plain inserts here)
insert into public.profiles (id, email, full_name, phone, role, wallet_balance, reward_points, company_name, two_factor_enabled)
values
  ('00000000-0000-0000-0000-000000000001', 'demo@airpak-express.com', 'Demo Customer',
   '+60 12-345 6789', 'customer', 248.50, 1240, 'Lumen Trading', false),
  ('00000000-0000-0000-0000-000000000002', 'admin@airpak-express.com', 'Admin User',
   '+60 3-7875 7768', 'admin', 0, 0, 'AirPak Express', true)
on conflict (id) do update set
  full_name = excluded.full_name,
  phone = excluded.phone,
  role = excluded.role,
  wallet_balance = excluded.wallet_balance,
  reward_points = excluded.reward_points,
  company_name = excluded.company_name,
  two_factor_enabled = excluded.two_factor_enabled;

-- ── Shipments ────────────────────────────────────────────────────────
-- 12 sample shipments with realistic-looking origin / destination /
-- package data spanning the four service levels.
do $$
declare
  customer_id uuid := '00000000-0000-0000-0000-000000000001';
  origins jsonb[] := array[
    '{"name":"Aaliyah Tan","phone":"+60 12-345 1111","line1":"12 Jalan Sultan","city":"Kuala Lumpur","state":"Wilayah Persekutuan","postal_code":"50000","country":"Malaysia"}',
    '{"name":"Ben Lee","phone":"+60 12-345 2222","line1":"88 Beach Road","city":"George Town","state":"Penang","postal_code":"10000","country":"Malaysia"}',
    '{"name":"Chloe Wong","phone":"+60 12-345 3333","line1":"5 Lorong Bukit Bintang","city":"Kuala Lumpur","state":"Wilayah Persekutuan","postal_code":"55100","country":"Malaysia"}'
  ];
  dests jsonb[] := array[
    '{"name":"Farid Lim","phone":"+65 9123 4567","line1":"1 Marina Boulevard","city":"Singapore","state":"Central","postal_code":"018989","country":"Singapore"}',
    '{"name":"Mei Park","phone":"+852 9123 4567","line1":"8 Connaught Place","city":"Central","state":"Hong Kong","postal_code":"999077","country":"Hong Kong"}',
    '{"name":"Hiroshi Yamada","phone":"+81 90 1234 5678","line1":"1-1 Shinjuku","city":"Tokyo","state":"Shinjuku","postal_code":"160-0022","country":"Japan"}',
    '{"name":"Olivia Reyes","phone":"+61 4 1234 5678","line1":"200 George Street","city":"Sydney","state":"NSW","postal_code":"2000","country":"Australia"}',
    '{"name":"Victor Ahmad","phone":"+60 3-7875 7768","line1":"10 Jalan Tun Razak","city":"Kuala Lumpur","state":"Wilayah Persekutuan","postal_code":"50400","country":"Malaysia"}'
  ];
  services text[] := array['Express','Standard','Air Freight','Sea Freight'];
  statuses text[] := array['created','picked_up','in_transit','out_for_delivery','delivered','exception'];
  i int;
  tracking text;
  svc text;
  st text;
  origin jsonb;
  dest jsonb;
  pkg jsonb;
  weight numeric;
  price numeric;
  eta timestamptz;
  days_old int;
  s_id uuid;
  ladder text[];
  step int;
  step_time timestamptz;
begin
  for i in 1..12 loop
    tracking := 'APK' || to_char(now() - (i || ' days')::interval, 'YYYYMMDD') || (10000 + i)::text;
    svc := services[(i % 4) + 1];
    st := statuses[(i % 6) + 1];
    origin := origins[(i % 3) + 1];
    dest := dests[(i % 5) + 1];
    weight := 0.5 + (i * 0.7) % 12;
    pkg := jsonb_build_object(
      'weight_kg', weight,
      'length_cm', 20 + (i * 3) % 30,
      'width_cm', 15 + (i * 2) % 25,
      'height_cm', 10 + i % 15,
      'pieces', 1 + (i % 3),
      'description', 'Sample shipment #' || i
    );
    days_old := i * 2;
    if svc = 'Express' then
      price := 18.0 + weight * 1.4;
      eta := now() - (days_old || ' days')::interval + '4 days'::interval;
    elsif svc = 'Standard' then
      price := 9.5 + weight * 1.0;
      eta := now() - (days_old || ' days')::interval + '7 days'::interval;
    elsif svc = 'Air Freight' then
      price := 75.0 + weight * 2.0;
      eta := now() - (days_old || ' days')::interval + '6 days'::interval;
    else
      price := 32.0 + weight * 1.5;
      eta := now() - (days_old || ' days')::interval + '22 days'::interval;
    end if;

    insert into public.shipments (
      tracking_number, user_id, status, service, origin, destination, package,
      price, currency, declared_value, estimated_delivery, created_at, paid
    ) values (
      tracking, customer_id, st, svc, origin, dest, pkg,
      round(price, 2), 'USD', 100 + i * 25, eta,
      now() - (days_old || ' days')::interval,
      i % 4 <> 0  -- 75% paid
    )
    on conflict (tracking_number) do nothing
    returning id into s_id;

    if s_id is null then
      select id into s_id from public.shipments where tracking_number = tracking;
    end if;

    -- Tracking events (a ladder walking forward through statuses)
    ladder := array['created','picked_up','in_transit','out_for_delivery','delivered'];
    for step in 1..5 loop
      if ladder[step] = st then
        exit;  -- only emit events up to the current status
      end if;
      step_time := now() - (days_old || ' days')::interval + ((step - 1) * 6 || ' hours')::interval;
      insert into public.tracking_events (shipment_id, status, location, description, occurred_at)
      values (
        s_id, ladder[step],
        case (step % 4)
          when 0 then 'KUL Hub'
          when 1 then 'SIN Hub'
          when 2 then 'BKK Hub'
          else 'HKG Hub'
        end,
        case ladder[step]
          when 'created' then 'Label created, awaiting pickup'
          when 'picked_up' then 'Picked up by courier'
          when 'in_transit' then 'In transit to destination hub'
          when 'out_for_delivery' then 'Out for delivery'
          when 'delivered' then 'Delivered — signed by recipient'
        end,
        step_time
      )
      on conflict do nothing;
    end loop;
  end loop;
end $$;

-- ── Chat thread + sample messages ────────────────────────────────────
insert into public.chat_messages (id, thread_id, sender_id, sender_name, text, sent_at, from_agent)
values
  (gen_random_uuid(), 'thread_demo', '00000000-0000-0000-0000-000000000001',
   'Demo Customer', 'Hi! Can you help me track shipment APK20240521001230?',
   now() - interval '2 hours', false),
  (gen_random_uuid(), 'thread_demo', 'agent_1', 'AirPak Support',
   'Of course! That shipment cleared customs this morning and is now out for delivery in Petaling Jaya. ETA today before 6pm.',
   now() - interval '1 hour 50 minutes', true)
on conflict do nothing;

-- ── Notifications ─────────────────────────────────────────────────────
insert into public.notifications (user_id, title, body, read, shipment_tracking, sent_at)
values
  ('00000000-0000-0000-0000-000000000001', 'Out for delivery',
   'APK20240521001230 is out for delivery in Petaling Jaya', false,
   'APK20240521001230', now() - interval '30 minutes'),
  ('00000000-0000-0000-0000-000000000001', 'Reward points credited',
   'You earned 120 points on your last shipment', true, null,
   now() - interval '1 day');

commit;
