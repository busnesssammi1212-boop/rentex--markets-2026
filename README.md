# Rentex Market
Static HTML/CSS/JS front end + Supabase (Auth, Postgres RLS, Realtime). No build step.

## Setup
1. Create a Supabase project. SQL editor → run `supabase/schema.sql`.
2. Database → Extensions → enable `pg_cron`, then run the `cron.schedule(...)` line at the bottom of the schema (expiry check every minute).
3. Auth → Providers: enable Email. Sign up on the site, then run: `update profiles set role='admin' where email='you@example.com';`
4. Edit `config.js`: project URL, **anon** key, your bKash/Nagad merchant numbers. Never put the `service_role` key in this repo.
5. Open `/admin`, add products, tick "authorized", publish.

## Deploy
```
git init && git add . && git commit -m "Rentex Market"
git remote add origin <your-github-repo> && git push -u origin main
```
Vercel → Add New Project → import the repo → Framework "Other", no build command, output directory `.` → Deploy. Then Supabase → Auth → URL Configuration: add your Vercel URL as Site URL.

## Payment flow (manual bKash/Nagad)
Customer books → server computes price → customer sends money and submits Transaction ID → staff compare it with the merchant statement in **Admin → payments** → Approve starts the rental, records `access_grants`, notifies the customer. `pg_cron` expires rentals, revokes the grant, and notifies.

## Production-ready vs demo
| Area | Status |
|---|---|
| Auth, RLS, server-side price/duration validation (`create_rental`), role-gated admin | Production-ready (review before launch) |
| Manual bKash/Nagad verification, expiry cron, notifications, realtime | Production-ready |
| Duplicate Trx IDs blocked per method | Done (unique constraint) |
| **Granting actual access** (VPS login, bot hosting, license keys) | **Demo.** `access_grants` records grant/revoke; connect it to your provider's API with a Supabase Edge Function (service role, server-side only) triggered from `review_payment`/`expire_rentals`. |
| **Crypto payments** | **Not implemented.** Crypto bookings must not be accepted until an Edge Function verifies the tx on-chain (amount, address, confirmations) and calls a service-role-only activation function. The UI only offers bKash/Nagad. |
| Automatic bKash/Nagad APIs | Not implemented (use merchant API later, verify via server callback) |
| Email/SMS notifications | In-app only |

## Notes
- Only list products you are licensed/authorized to rent; publishing requires the "authorized" confirmation.
- Revenue depends on customers and completed rentals; nothing here guarantees earnings.
- Add terms of service, refund policy and privacy policy pages before taking real payments.
