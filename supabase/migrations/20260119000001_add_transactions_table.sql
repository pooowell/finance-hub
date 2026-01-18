-- Add transactions table for SimpleFIN transaction history
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  external_id text not null,
  posted_at timestamptz not null,
  amount numeric(12,2) not null,
  description text not null,
  payee text,
  memo text,
  pending boolean not null default false,
  created_at timestamptz not null default now(),
  unique(account_id, external_id)
);

create index idx_transactions_account_posted on public.transactions(account_id, posted_at desc);
create index idx_transactions_posted on public.transactions(posted_at desc);

-- Enable RLS
alter table public.transactions enable row level security;

-- RLS policy: users can only see transactions for their own accounts
create policy "Users can view own transactions"
  on public.transactions for select
  using (
    account_id in (
      select id from public.accounts where user_id = auth.uid()
    )
  );

create policy "Users can insert own transactions"
  on public.transactions for insert
  with check (
    account_id in (
      select id from public.accounts where user_id = auth.uid()
    )
  );

create policy "Users can update own transactions"
  on public.transactions for update
  using (
    account_id in (
      select id from public.accounts where user_id = auth.uid()
    )
  );
