-- Add checking and crypto to account_category enum
alter type public.account_category add value 'checking';
alter type public.account_category add value 'crypto';
