# Password recovery

The connected shop sign-in screen has Forgot password. Owners and cashiers can request an email recovery link. The Staff page also lets an authenticated owner reset an active cashier in the same shop after confirming the owner password. This requires internet. Legacy device-only password recovery is unchanged.

## Enable delivery

Deploy the updated repository first. Docker startup runs migration 003_password_recovery. Configure these server-side environment variables in Render:

- RESEND_API_KEY: a sending API key from your Resend account.
- MAIL_FROM: an address on a sender domain verified with Resend, for example StockWise <accounts@YOUR_VERIFIED_DOMAIN>.
- PUBLIC_ORIGIN: https://stockwise-online.onrender.com (Render's external URL is also accepted automatically).

Never place the email API key in Vite variables, the desktop installer, or source control. No live email credentials have been added by this implementation. Without a configured sender, recovery explicitly reports unavailable rather than claiming delivery. Cashier reset by the owner does not need email configuration.

## Behaviour and validation

Recovery requests return a generic response for known and unknown addresses. Email sending runs asynchronously after that response; delivery failures are logged without recipients, tokens or provider secrets, and the failed token is removed. A process restart during delivery can lose an unsent message; request a new link after the cooldown if it does not arrive. A durable email outbox can be added later.

Links expire after 15 minutes. Only SHA-256 token hashes are stored. The raw token appears only in the email URL fragment and is removed from browser history as the reset screen opens. Request limits and a one-minute per-address cooldown reduce abuse; the in-process limiter assumes the existing single-instance service.

Password resets lock the user record, atomically consume a valid token, update the scrypt password hash, remove all that user's server sessions and recovery tokens, and write an audit entry. Login also locks the user while verifying and creating a session to avoid issuing an old-password session during reset. Owner-driven cashier resets enforce role, shop ownership and the current owner password.

Offline queues are not deleted. After a reset, reconnect and sign in to the same account to synchronize them. Devices already offline retain only their previously authorized session until it expires or reconnects; a remote password change cannot instantly reach a disconnected device.

Tests cover generic responses, token hashing, expiry, reuse, session revocation, cross-shop and cashier denial, incorrect owner passwords, missing mail configuration and simultaneous token consumption on real PostgreSQL. Frontend tests cover repeat submissions, password confirmation and fragment removal. Email delivery to a real inbox still needs a configured provider and a manual check.
