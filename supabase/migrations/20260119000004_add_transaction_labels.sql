-- Add transaction labels and matching rules

-- Transaction labels table
create table public.transaction_labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  color text not null default '#6b7280',
  created_at timestamptz not null default now(),
  unique(user_id, name)
);

create index idx_transaction_labels_user on public.transaction_labels(user_id);

-- Add label_id to transactions
alter table public.transactions
  add column label_id uuid references public.transaction_labels(id) on delete set null;

create index idx_transactions_label on public.transactions(label_id);

-- Matching rules for auto-labeling
create table public.label_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label_id uuid not null references public.transaction_labels(id) on delete cascade,
  match_field text not null default 'description', -- 'description', 'payee', or 'both'
  match_pattern text not null, -- case-insensitive substring match
  created_at timestamptz not null default now()
);

create index idx_label_rules_user on public.label_rules(user_id);

-- Enable RLS
alter table public.transaction_labels enable row level security;
alter table public.label_rules enable row level security;

-- RLS policies for transaction_labels
create policy "Users can view own labels"
  on public.transaction_labels for select
  using (user_id = auth.uid());

create policy "Users can insert own labels"
  on public.transaction_labels for insert
  with check (user_id = auth.uid());

create policy "Users can update own labels"
  on public.transaction_labels for update
  using (user_id = auth.uid());

create policy "Users can delete own labels"
  on public.transaction_labels for delete
  using (user_id = auth.uid());

-- RLS policies for label_rules
create policy "Users can view own rules"
  on public.label_rules for select
  using (user_id = auth.uid());

create policy "Users can insert own rules"
  on public.label_rules for insert
  with check (user_id = auth.uid());

create policy "Users can update own rules"
  on public.label_rules for update
  using (user_id = auth.uid());

create policy "Users can delete own rules"
  on public.label_rules for delete
  using (user_id = auth.uid());
