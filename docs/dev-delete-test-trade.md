# Dev: Delete the MT Sync Test Trade

Use this only in development/testing.

## 1) Find your user id

In Supabase SQL Editor:

```sql
select id, email
from public.profiles
where email = '<YOUR_EMAIL>';
```

## 2) Preview the test trade (safe)

Replace `<USER_ID>`:

```sql
select *
from public.trades
where user_id = '<USER_ID>'
  and symbol = 'XAUUSD'
  and pnl = 45;
```

## 3) Delete the test trade (danger)

Replace `<USER_ID>`:

```sql
delete from public.trades
where user_id = '<USER_ID>'
  and symbol = 'XAUUSD'
  and pnl = 45
  and date = '2025-12-20';
```

