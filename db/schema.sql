create table if not exists admins (
  id serial primary key,
  name text not null default '',
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists shipping_prices (
  id serial primary key,
  auction text not null,
  location text not null,
  price numeric(10, 2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (auction, location)
);

create table if not exists requests (
  id serial primary key,
  subject text not null default '',
  name text not null default '',
  phone text not null default '',
  email text not null default '',
  message text not null default '',
  status text not null default 'new',
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists lots (
  id serial primary key,
  slug text unique,
  title text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cars (
  id serial primary key,
  slug text unique,
  title text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists korea_cars (
  id serial primary key,
  slug text unique,
  title text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists parts (
  id serial primary key,
  slug text unique,
  title text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists catalog (
  id serial primary key,
  slug text unique,
  title text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists services (
  id serial primary key,
  slug text unique,
  title text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pages (
  id serial primary key,
  slug text unique,
  title text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists news (
  id serial primary key,
  slug text unique,
  title text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hero_slides (
  id serial primary key,
  slug text unique,
  title text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists brands (
  id serial primary key,
  slug text unique,
  title text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists part_types (
  id serial primary key,
  slug text unique,
  title text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id serial primary key,
  name text not null default '',
  email text not null unique,
  phone text not null default '',
  password_hash text not null,
  role text not null default 'user',
  company text not null default '',
  dealer_status text not null default '',
  is_blocked boolean not null default false,
  created_at timestamptz not null default now()
);

alter table admins add column if not exists role text not null default 'admin';
alter table admins add column if not exists is_active boolean not null default true;
alter table requests add column if not exists user_id integer references users (id) on delete set null;
alter table requests add column if not exists assigned_to integer references admins (id) on delete set null;
alter table cars add column if not exists owner_id integer references users (id) on delete set null;

create table if not exists languages (
  code text primary key,
  name text not null,
  is_active boolean not null default true,
  is_default boolean not null default false,
  sort_order integer not null default 0
);

create table if not exists translations (
  key text not null,
  lang text not null references languages (code) on delete cascade on update cascade,
  value text not null default '',
  primary key (key, lang)
);

create table if not exists audit_logs (
  id serial primary key,
  admin_id integer references admins (id) on delete set null,
  admin_name text not null default '',
  action text not null,
  entity text not null,
  entity_id text not null default '',
  summary text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists car_clicks (
  id serial primary key,
  car_id integer not null references cars (id) on delete cascade,
  type text not null default 'whatsapp',
  created_at timestamptz not null default now()
);

create table if not exists market_prices (
  id serial primary key,
  country text not null,
  make text not null,
  model text not null,
  year integer not null,
  price numeric(12, 2) not null default 0,
  source text not null default '',
  updated_at timestamptz not null default now(),
  unique (country, make, model, year)
);
