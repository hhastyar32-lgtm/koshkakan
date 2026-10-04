# کۆشکەکان

پلاتفۆرمی حجزکردنی کۆشک و شوێنی پشوودان.

## Run locally
```bash
npm install
npm start
```
Then open `http://localhost:3000`.

## Render
This project uses Docker and reads `PORT` from Render.

Required environment variables:
- `SESSION_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

`render.yaml` is configured for the free web plan. SQLite on a free ephemeral service is suitable for testing/demo, not permanent production data. For real production, use a persistent disk or an external database.

## Main fixes in this version
- Owner registration is available from the registration form.
- Better input validation.
- Booking capacity validation.
- Prevents overlapping bookings.
- Secure session cookie in production.
- Admin dashboard for approving properties and changing customer/owner roles.
- Image URL field for properties.
- Server listens on `0.0.0.0` and respects Render's `PORT`.
