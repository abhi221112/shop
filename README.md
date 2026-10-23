# My Vegetable Shop

Online shop for a single vegetable store, built from the *Vegetable Shop Screens* design.

| Part | Tech | Who uses it |
|---|---|---|
| `frontend/` | React + Vite, one codebase | **Customers** (website + Android app), **you** at `/admin`, **delivery staff** at `/delivery` |
| `frontend/android/` | Capacitor | The same app packaged as an Android APK |
| `backend/` | Python FastAPI + PostgreSQL | API for all three |
| `docker-compose.yml` | Docker | Runs database, API and website together |

The website looks like the desktop design on a computer and like the mobile-app design on a phone. The APK is the same app, so a change to the frontend updates both.

## Run it

Requires Docker Desktop.

```bash
cp .env.example .env      # then edit: SHOP_NAME, ADMIN_PHONE, JWT_SECRET …
docker compose up -d --build
```

- Shop: http://localhost:8080
- Admin panel: http://localhost:8080/admin, logging in with the `ADMIN_PHONE` number
- Delivery app: http://localhost:8080/delivery. Demo delivery person **Ravi** is `8888888888`; add your own staff under Admin › Delivery staff.
- API docs: http://localhost:8080/api/docs

**Login** uses mobile number + 4-digit code. While `OTP_DEV_MODE=true` the code is shown on screen (and in `docker compose logs api`), so no SMS account is needed to try it.

**Payments**: with no Razorpay keys, "Pay with UPI" runs a test payment. Add `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` to `.env` for real UPI.

Open the shop on your phone: find your PC's Wi-Fi IP (`ipconfig` → IPv4, e.g. `192.168.1.20`) and visit `http://192.168.1.20:8080`. Chrome's *Add to Home screen* installs it like an app.

## Daily use

1. **Morning**: Admin › Prices & stock. Type today's prices and stock, then **Save & publish**. The old price becomes "Yesterday".
2. **Orders**: Admin › Today's orders. Confirm → Mark packed → assign a delivery person → Send out. *Print packing list* totals what to weigh out.
3. **Delivery**: staff open `/delivery` (or the app). They see only their orders and can call, open maps, and mark them delivered or not available.
4. Customers track every step live on their order page.

5. **Offers**: Admin › Offers switches each promotion on or off and sets its amounts: free delivery above ₹X, a free gift (e.g. dhaniya) above ₹Y, first-order discount, refer-a-friend wallet credit, "today's best prices" badges, "only a few left", order-again, a freshness promise and your own announcement. Build bundles under Admin › Combo packs.

Rules: the delivery fee (`DELIVERY_FEE`), the order cutoff before a slot (`SLOT_CUTOFF_HOURS`) and pincodes (`SERVICE_PINCODES`, empty = all) are set in `.env`; everything promotional lives in Admin › Offers. Edit slots and capacity under Admin › Delivery slots. Unpaid UPI orders are cancelled after 30 minutes, and their stock and any wallet credit go back.

## Build the Android APK

One-time setup: install [Android Studio](https://developer.android.com/studio). It includes Java and the Android SDK.

1. Tell the app where the API is. Create `frontend/.env`:
   ```
   VITE_API_URL=http://192.168.1.20:8000     # your PC on the same Wi-Fi (testing)
   # VITE_API_URL=https://shop.example.com   # your live server
   ```
2. Build and open:
   ```bash
   cd frontend
   npm install
   npm run android:sync     # builds the web app and copies it into android/
   npm run android:open     # opens Android Studio
   ```
3. In Android Studio: **Build › Build App Bundle(s) / APK(s) › Build APK(s)**. The APK is at `frontend/android/app/build/outputs/apk/debug/app-debug.apk`. Copy it to a phone and install it.

   Or from the command line once Android Studio is installed: `npm run android:apk`.

For the Play Store, use **Build › Generate Signed App Bundle**. Before release, point `VITE_API_URL` to an `https://` address and remove `android:usesCleartextTraffic="true"` from `android/app/src/main/AndroidManifest.xml`.

App name and id: `frontend/capacitor.config.json` (`appName`, `appId`). Change them before the first release.

## Develop without Docker

```bash
# database only
docker compose up -d db

# API (Python 3.11+)
cd backend
python -m venv .venv && .venv\Scripts\activate      # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
set DATABASE_URL=postgresql://shop:shop@localhost:5432/shop   # db port must be published, see below
uvicorn app.main:app --reload

# frontend (proxies /api to :8000)
cd frontend && npm install && npm run dev            # http://localhost:5173
```

The compose file doesn't publish the database port. For local API development, add `ports: ["5432:5432"]` under `db`.

## Going live checklist

- [ ] `.env`: strong `JWT_SECRET` and `POSTGRES_PASSWORD`, `ENV=production`
- [ ] Connect SMS for login codes: implement `send()` in `backend/app/services/notify.py` (MSG91, Twilio, WhatsApp Cloud API…), then set `OTP_DEV_MODE=false`. The same function sends order updates.
- [ ] Razorpay keys for UPI
- [ ] Put the site behind HTTPS (e.g. Caddy or Nginx with Let's Encrypt in front of port 8080)
- [ ] Back up the `db-data` and `uploads` Docker volumes
