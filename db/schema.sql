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
