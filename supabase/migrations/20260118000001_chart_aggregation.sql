-- Chart Data Aggregation Functions
-- Task 2.1: Time-bucketed interval aggregation

-- Function to get aggregated portfolio snapshots
-- Buckets snapshots into time intervals (1h, 1d, 1w, 1m)
create or replace function public.get_portfolio_history(
  p_user_id uuid,
  p_interval text default '1d',
  p_start_date timestamp with time zone default null,
  p_end_date timestamp with time zone default null
)
returns table (
  bucket_start timestamp with time zone,
  total_value_usd numeric,
  account_count bigint
)
language plpgsql
security definer
as $$
declare
  v_bucket_interval interval;
begin
  -- Map interval string to Postgres interval
  v_bucket_interval := case p_interval
    when '1h' then interval '1 hour'
    when '1d' then interval '1 day'
    when '1w' then interval '1 week'
    when '1m' then interval '1 month'
    else interval '1 day'
  end;

  return query
  with user_accounts as (
    select id from public.accounts where user_id = p_user_id
  ),
  filtered_snapshots as (
    select
      s.timestamp,
      s.value_usd,
      s.account_id
    from public.snapshots s
    inner join user_accounts ua on s.account_id = ua.id
    where
      (p_start_date is null or s.timestamp >= p_start_date)
      and (p_end_date is null or s.timestamp <= p_end_date)
  ),
  bucketed as (
    select
      date_trunc(
        case p_interval
          when '1h' then 'hour'
          when '1d' then 'day'
          when '1w' then 'week'
          when '1m' then 'month'
          else 'day'
        end,
        timestamp
      ) as bucket,
      value_usd,
      account_id
    from filtered_snapshots
  ),
  -- Get the latest snapshot value per account per bucket
  latest_per_bucket as (
    select distinct on (bucket, account_id)
      bucket,
      value_usd,
      account_id
    from (
      select
        b.bucket,
        b.value_usd,
        b.account_id,
        row_number() over (partition by b.bucket, b.account_id order by b.bucket desc) as rn
      from bucketed b
    ) sub
    where rn = 1
  )
  select
    lpb.bucket as bucket_start,
    sum(lpb.value_usd) as total_value_usd,
    count(distinct lpb.account_id) as account_count
  from latest_per_bucket lpb
  group by lpb.bucket
  order by lpb.bucket;
end;
$$;

-- Function to get current portfolio summary
create or replace function public.get_portfolio_summary(p_user_id uuid)
returns table (
  total_value_usd numeric,
  account_count bigint,
  last_synced_at timestamp with time zone,
  change_24h numeric,
  change_24h_percent numeric
)
language plpgsql
security definer
as $$
begin
  return query
  with current_values as (
    select
      sum(balance_usd) as total_value,
      count(*) as num_accounts,
      max(last_synced_at) as last_sync
    from public.accounts
    where user_id = p_user_id
  ),
  value_24h_ago as (
    select coalesce(sum(s.value_usd), 0) as total_value
    from public.snapshots s
    inner join public.accounts a on s.account_id = a.id
    where a.user_id = p_user_id
      and s.timestamp <= now() - interval '24 hours'
      and s.timestamp > now() - interval '25 hours'
  )
  select
    coalesce(cv.total_value, 0) as total_value_usd,
    coalesce(cv.num_accounts, 0) as account_count,
    cv.last_sync as last_synced_at,
    coalesce(cv.total_value, 0) - coalesce(v24.total_value, cv.total_value, 0) as change_24h,
    case
      when coalesce(v24.total_value, 0) > 0
      then ((coalesce(cv.total_value, 0) - v24.total_value) / v24.total_value * 100)
      else 0
    end as change_24h_percent
  from current_values cv
  cross join value_24h_ago v24;
end;
$$;

-- Grant execute permissions
grant execute on function public.get_portfolio_history(uuid, text, timestamp with time zone, timestamp with time zone) to authenticated;
grant execute on function public.get_portfolio_summary(uuid) to authenticated;
