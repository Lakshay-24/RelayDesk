# RelayDesk Razorpay billing

## Current production state

RelayDesk uses Razorpay for paid subscriptions.

- Free: 5,000 remote tool calls per calendar month.
- Pro monthly plans currently enabled:
  - INR: ₹749/month — Razorpay plan `plan_TdJ6zIq7vwruvx`
  - USD: $9/month — Razorpay plan `plan_TdJ6zbIxrgC9xL`
- Other currencies fall back to USD until a native Razorpay plan is enabled for that currency.
- Pro entitlements are granted from verified server-side subscription state, never from the browser success callback.
- Checkout is intentionally fail-closed until RelayDesk's own Razorpay API credentials are securely provisioned into Supabase Vault.

## Backend surfaces

Supabase Edge Functions:

- `billing-status`: public safe plan/availability metadata.
- `billing-create-subscription`: authenticated; creates a Razorpay subscription for the selected enabled currency.
- `billing-cancel-subscription`: authenticated; schedules cancellation at the cycle end.
- `billing-razorpay-webhook`: public webhook endpoint with HMAC verification.
- `mcp`: enforces Free/Pro entitlement and monthly usage.

Webhook URL:

`https://atuvyeoctkevglimkmka.supabase.co/functions/v1/billing-razorpay-webhook`

The webhook secret is generated and stored in Supabase Vault. Configure the same secret in Razorpay before enabling live checkout.

## Security rules

- Never commit Razorpay Key Secret, webhook secrets, card details, UPI credentials, OTPs or tokens.
- API credentials must remain server-side and encrypted at rest.
- Verify Razorpay webhook HMAC over the exact raw request body before parsing/updating billing state.
- Browser checkout success is UX only; it does not grant Pro.
- Plan ID, amount and currency are loaded server-side from `billing_plans`; clients cannot supply an arbitrary amount or provider plan.
- Billing operations require the authenticated RelayDesk owner identity.
- Free usage is based on durable `usage_monthly`, independent of short-lived command history.

## Required Razorpay dashboard setup before launch

1. Ensure the merchant account is Mave Studios LLP and KYC/live-mode access is current.
2. Enable Subscriptions and required international payment/currency capabilities.
3. Configure the webhook URL above and its RelayDesk-specific webhook secret.
4. Subscribe to subscription lifecycle events needed to reconcile `active`, `past_due`, cancellation and completion.
5. Keep auto-capture/payment settings aligned with Razorpay recommendations.
6. Configure customer support details in Razorpay.
7. Run Razorpay test-mode subscription flows before enabling the production UI.
8. Perform one controlled live transaction and cancellation with the production account before public launch.

## Public compliance pages

RelayDesk publishes:

- `/terms`
- `/privacy`
- `/refunds`
- `/contact`

They identify Mave Studios LLP, disclose Razorpay payment processing, explain recurring billing, cancellation/refunds, and state that RelayDesk does not store payment-instrument credentials.

## Currency behavior

The pricing page uses country context to prefer an enabled native plan. Today:

- India → INR.
- United States → USD.
- Other countries → USD fallback.

Add a native currency only after the Razorpay merchant account can process it and a matching live plan exists in `billing_plans`. Do not dynamically convert a USD price into arbitrary currencies at checkout without an enabled Razorpay plan.
