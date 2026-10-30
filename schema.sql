-- Rentex Market schema. Run in Supabase SQL editor.
create extension if not exists pgcrypto;
create table profiles(id uuid primary key references auth.users on delete cascade, email text, role text not null default 'customer' check(role in('customer','staff','admin')), created_at timestamptz default now());
create function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into profiles(id,email) values(new.id,new.email); return new; end $$;
create trigger on_signup after insert on auth.users for each row execute function handle_new_user();
create function is_staff() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where id=auth.uid() and role in('staff','admin')) $$;
create function is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where id=auth.uid() and role='admin') $$;

create table categories(id serial primary key, slug text unique not null, name text not null, icon text, sort int default 0);
create table products(id uuid primary key default gen_random_uuid(), category_id int references categories not null, name text not null, description text, icon text default '✦', features text[] default '{}', requirements text, terms text,
  authorized boolean not null default false, -- operator confirms they are licensed to rent this
  published boolean not null default false, stock int check(stock>=0), -- null = unlimited
  created_at timestamptz default now());
create table plans(id uuid primary key default gen_random_uuid(), product_id uuid references products on delete cascade not null, unit text not null check(unit in('hour','day','month')), price numeric(12,2) not null check(price>0), active boolean default true, unique(product_id,unit));
create type rental_status as enum('pending','active','expired','cancelled','rejected');
create table rentals(id uuid primary key default gen_random_uuid(), user_id uuid references profiles not null, product_id uuid references products on delete restrict not null, plan_id uuid references plans on delete restrict not null,
  units int not null check(units>0), unit text not null, unit_price numeric(12,2) not null, total numeric(12,2) not null, status rental_status not null default 'pending', starts_at timestamptz, expires_at timestamptz, created_at timestamptz default now());
create table payments(id uuid primary key default gen_random_uuid(), rental_id uuid references rentals on delete cascade not null, user_id uuid references profiles not null, method text not null check(method in('bkash','nagad','crypto')), amount numeric(12,2) not null, trx_id text not null,
  status text not null default 'pending' check(status in('pending','verified','rejected')), verified_by uuid, verified_at timestamptz, created_at timestamptz default now(), unique(method,trx_id));
create table notifications(id uuid primary key default gen_random_uuid(), user_id uuid references profiles not null, rental_id uuid references rentals on delete cascade, message text not null, read boolean default false, created_at timestamptz default now());
create table access_grants(id uuid primary key default gen_random_uuid(), rental_id uuid unique references rentals on delete cascade, granted_at timestamptz default now(), revoked_at timestamptz, note text);

-- RLS: clients can read what they own; ALL writes to rentals/payments go through RPCs below.
alter table profiles enable row level security; alter table categories enable row level security; alter table products enable row level security; alter table plans enable row level security;
alter table rentals enable row level security; alter table payments enable row level security; alter table notifications enable row level security; alter table access_grants enable row level security;
create policy p_self on profiles for select using(id=auth.uid() or is_staff()); -- no update policy: users cannot escalate role
create policy c_read on categories for select using(true); create policy c_write on categories for all using(is_admin()) with check(is_admin());
create policy pr_read on products for select using((published and authorized) or is_staff()); create policy pr_write on products for all using(is_admin()) with check(is_admin());
create policy pl_read on plans for select using((active and exists(select 1 from products p where p.id=product_id and p.published and p.authorized)) or is_staff()); create policy pl_write on plans for all using(is_admin()) with check(is_admin());
create policy r_read on rentals for select using(user_id=auth.uid() or is_staff());
create policy pay_read on payments for select using(user_id=auth.uid() or is_staff());
create policy n_read on notifications for select using(user_id=auth.uid()); create policy n_upd on notifications for update using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy g_read on access_grants for select using(is_staff());

-- Customer: create booking. Price/duration are computed HERE, never trusted from the client.
create function create_rental(p_plan uuid, p_units int, p_method text, p_trx text) returns uuid language plpgsql security definer set search_path=public as $$
declare pl plans; pr products; r uuid; mx int; busy int;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  select * into pl from plans where id=p_plan and active; if not found then raise exception 'plan not found'; end if;
  select * into pr from products where id=pl.product_id and published and authorized; if not found then raise exception 'product unavailable'; end if;
  mx := case pl.unit when 'hour' then 72 when 'day' then 90 else 12 end;
  if p_units<1 or p_units>mx then raise exception 'duration must be 1-% %s', mx, pl.unit; end if;
  if p_method not in('bkash','nagad','crypto') or length(coalesce(p_trx,''))<6 then raise exception 'valid method and transaction id required'; end if;
  if pr.stock is not null then select count(*) into busy from rentals where product_id=pr.id and status in('pending','active'); if busy>=pr.stock then raise exception 'sold out'; end if; end if;
  insert into rentals(user_id,product_id,plan_id,units,unit,unit_price,total) values(auth.uid(),pr.id,pl.id,p_units,pl.unit,pl.price,pl.price*p_units) returning id into r;
  insert into payments(rental_id,user_id,method,amount,trx_id) values(r,auth.uid(),p_method,pl.price*p_units,trim(p_trx));
  return r;
end $$;

-- Staff: verify a manual (bKash/Nagad) payment after checking the merchant statement. Approving starts the rental and grants access.
create function review_payment(p_payment uuid, p_approve boolean) returns void language plpgsql security definer set search_path=public as $$
declare py payments; rt rentals;
begin
  if not is_staff() then raise exception 'forbidden'; end if;
  select * into py from payments where id=p_payment and status='pending'; if not found then raise exception 'not pending'; end if;
  select * into rt from rentals where id=py.rental_id;
  if p_approve then
    update payments set status='verified',verified_by=auth.uid(),verified_at=now() where id=py.id;
    update rentals set status='active',starts_at=now(),expires_at=now()+(rt.units||' '||rt.unit||'s')::interval where id=rt.id;
    insert into access_grants(rental_id) values(rt.id) on conflict do nothing;
    insert into notifications(user_id,rental_id,message) values(rt.user_id,rt.id,'Payment verified. Your rental is now active.');
  else
    update payments set status='rejected',verified_by=auth.uid(),verified_at=now() where id=py.id;
    update rentals set status='rejected' where id=rt.id;
    insert into notifications(user_id,rental_id,message) values(rt.user_id,rt.id,'Payment could not be verified. Contact support with your transaction ID.');
  end if;
end $$;

-- Cron: expire rentals, revoke access, notify (also warns 24h before expiry).
create function expire_rentals() returns int language plpgsql security definer set search_path=public as $$
declare n int;
begin
  insert into notifications(user_id,rental_id,message) select user_id,id,'Your rental expires in under 24 hours.' from rentals r where status='active' and expires_at<now()+interval '24 hours' and expires_at>now()
    and not exists(select 1 from notifications n where n.rental_id=r.id and n.message like '%under 24 hours%');
  with e as(update rentals set status='expired' where status='active' and expires_at<=now() returning id,user_id)
  , g as(update access_grants set revoked_at=now() where rental_id in(select id from e) and revoked_at is null)
  insert into notifications(user_id,rental_id,message) select user_id,id,'Your rental has expired and access was revoked.' from e;
  get diagnostics n=row_count; return n;
end $$;
revoke execute on function expire_rentals() from public,anon,authenticated;
-- Enable pg_cron in Dashboard > Database > Extensions, then:
-- select cron.schedule('expire-rentals','* * * * *','select public.expire_rentals()');

create function admin_stats() returns json language sql security definer set search_path=public as $$
  select case when is_staff() then json_build_object(
   'revenue',(select coalesce(sum(amount),0) from payments where status='verified'),
   'active',(select count(*) from rentals where status='active'),'expired',(select count(*) from rentals where status='expired'),
   'pending',(select count(*) from rentals where status='pending'),'bookings',(select count(*) from rentals),'customers',(select count(*) from profiles where role='customer')) end $$;

alter publication supabase_realtime add table rentals, notifications;
insert into categories(slug,name,icon,sort) values('ai-tools','AI Tools','🤖',1),('discord','Discord Bots & Bot Hosting','💬',2),('game-servers','Game Servers','🎮',3),('vps','VPS & Virtual Servers','🖥️',4),('hosting','Website Hosting','🌐',5),('software','Licensed Software & Digital Tools','🔑',6);
-- Make yourself admin after signing up:  update profiles set role='admin' where email='you@example.com';
