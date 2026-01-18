-- Finance Hub Initial Schema
-- Task 0.2: Database Modeling

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table (linked to auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table public.profiles enable row level security;

-- Profiles policies
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Accounts table
create type public.provider_type as enum ('SimpleFIN', 'Solana');
create type public.account_type as enum ('checking', 'savings', 'credit', 'investment', 'crypto', 'other');

create table public.accounts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  provider provider_type not null,
  name text not null,
  type account_type not null default 'other',
  balance_usd numeric(18, 2) default 0,
  external_id text, -- SimpleFIN account ID or Solana wallet address
  metadata jsonb default '{}',
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table public.accounts enable row level security;

-- Accounts policies
create policy "Users can view own accounts"
  on public.accounts for select
  using (auth.uid() = user_id);

create policy "Users can insert own accounts"
  on public.accounts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own accounts"
  on public.accounts for update
  using (auth.uid() = user_id);

create policy "Users can delete own accounts"
  on public.accounts for delete
  using (auth.uid() = user_id);

-- Snapshots table (for time-series charting)
create table public.snapshots (
  id uuid default uuid_generate_v4() primary key,
  account_id uuid references public.accounts(id) on delete cascade not null,
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null,
  value_usd numeric(18, 2) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table public.snapshots enable row level security;

-- Snapshots policies (users can view snapshots for their own accounts)
create policy "Users can view own snapshots"
  on public.snapshots for select
  using (
    exists (
      select 1 from public.accounts
      where accounts.id = snapshots.account_id
      and accounts.user_id = auth.uid()
    )
  );

create policy "Users can insert own snapshots"
  on public.snapshots for insert
  with check (
    exists (
      select 1 from public.accounts
      where accounts.id = snapshots.account_id
      and accounts.user_id = auth.uid()
    )
  );

-- Indexes for performance
create index idx_accounts_user_id on public.accounts(user_id);
create index idx_snapshots_account_id on public.snapshots(account_id);
create index idx_snapshots_timestamp on public.snapshots(timestamp);
create index idx_snapshots_account_timestamp on public.snapshots(account_id, timestamp);

-- Function to automatically create profile on user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

-- Trigger to create profile on signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Function to update updated_at timestamp
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

-- Triggers for updated_at
create trigger update_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.update_updated_at_column();

create trigger update_accounts_updated_at
  before update on public.accounts
  for each row execute procedure public.update_updated_at_column();
