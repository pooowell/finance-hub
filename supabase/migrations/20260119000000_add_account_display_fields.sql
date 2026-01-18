-- Add account display fields for tabbed navigation feature
create type public.account_category as enum ('savings', 'retirement', 'assets', 'credit_cards');

alter table public.accounts
  add column is_hidden boolean not null default false,
  add column include_in_net_worth boolean not null default true,
  add column category account_category;

create index idx_accounts_is_hidden on public.accounts(user_id, is_hidden);
