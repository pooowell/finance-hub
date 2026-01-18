-- Add credentials table for storing provider access tokens
-- Note: In production, consider using Supabase Vault for additional encryption
create table public.credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  access_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, provider)
);

create index idx_credentials_user_provider on public.credentials(user_id, provider);

-- Enable RLS
alter table public.credentials enable row level security;

-- RLS policies: users can only access their own credentials
create policy "Users can view own credentials"
  on public.credentials for select
  using (user_id = auth.uid());

create policy "Users can insert own credentials"
  on public.credentials for insert
  with check (user_id = auth.uid());

create policy "Users can update own credentials"
  on public.credentials for update
  using (user_id = auth.uid());

create policy "Users can delete own credentials"
  on public.credentials for delete
  using (user_id = auth.uid());
