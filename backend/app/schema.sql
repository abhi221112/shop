CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  phone       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'delivery')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS otp_codes (
  phone       TEXT PRIMARY KEY,
  code        TEXT NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS addresses (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       TEXT NOT NULL DEFAULT 'Home',
  line        TEXT NOT NULL,
  landmark    TEXT NOT NULL DEFAULT '',
  pincode     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  local_name       TEXT NOT NULL DEFAULT '',
  category         TEXT NOT NULL,
  unit             TEXT NOT NULL CHECK (unit IN ('kg', 'bunch', 'piece')),
  step             NUMERIC(6, 3) NOT NULL DEFAULT 1 CHECK (step > 0),
  price            NUMERIC(8, 2) NOT NULL CHECK (price >= 0),
  yesterday_price  NUMERIC(8, 2),
  price_date       DATE,
  stock            NUMERIC(9, 3) NOT NULL DEFAULT 0,
  low_stock_at     NUMERIC(9, 3) NOT NULL DEFAULT 5,
  active           BOOLEAN NOT NULL DEFAULT true,
  image_url        TEXT,
  tint             TEXT NOT NULL DEFAULT '#E4EED5',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slots (
  id          SERIAL PRIMARY KEY,
  label       TEXT NOT NULL,
  start_hour  INT NOT NULL CHECK (start_hour BETWEEN 0 AND 23),
  end_hour    INT NOT NULL CHECK (end_hour BETWEEN 1 AND 24),
  capacity    INT NOT NULL DEFAULT 20 CHECK (capacity >= 0),
  active      BOOLEAN NOT NULL DEFAULT true
);

CREATE SEQUENCE IF NOT EXISTS order_code_seq START 1001;

CREATE TABLE IF NOT EXISTS orders (
  id                SERIAL PRIMARY KEY,
  code              TEXT UNIQUE NOT NULL,
  user_id           INT NOT NULL REFERENCES users(id),
  customer_name     TEXT NOT NULL,
  customer_phone    TEXT NOT NULL,
  address           TEXT NOT NULL,
  pincode           TEXT NOT NULL,
  slot_id           INT NOT NULL REFERENCES slots(id),
  slot_date         DATE NOT NULL,
  payment_method    TEXT NOT NULL CHECK (payment_method IN ('upi', 'cod')),
  payment_status    TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  gateway_order_id  TEXT,
  gateway_payment_id TEXT,
  status            TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'confirmed', 'packed', 'out', 'delivered', 'not_available', 'cancelled')),
  subtotal          NUMERIC(10, 2) NOT NULL,
  delivery_fee      NUMERIC(10, 2) NOT NULL,
  total             NUMERIC(10, 2) NOT NULL,
  delivery_user_id  INT REFERENCES users(id),
  history           JSONB NOT NULL DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_slot_idx ON orders (slot_date, slot_id);
CREATE INDEX IF NOT EXISTS orders_user_idx ON orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_delivery_idx ON orders (delivery_user_id, slot_date);

CREATE TABLE IF NOT EXISTS order_items (
  id          SERIAL PRIMARY KEY,
  order_id    INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  INT REFERENCES products(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  unit        TEXT NOT NULL,
  qty         NUMERIC(9, 3) NOT NULL,
  price       NUMERIC(8, 2) NOT NULL,
  line_total  NUMERIC(10, 2) NOT NULL
);

CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);

-- Proof of delivery (added after first release; safe to re-run).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_code TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS code_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_verified BOOLEAN;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_lat DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_lng DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS issue TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS issue_at TIMESTAMPTZ;
UPDATE orders SET delivery_code = (floor(random() * 9000) + 1000)::int::text
  WHERE status = 'out' AND delivery_code IS NULL;

-- Express delivery (e.g. within 30 minutes) alongside scheduled slots.
ALTER TABLE slots ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'scheduled';
ALTER TABLE slots ADD COLUMN IF NOT EXISTS minutes INT;
ALTER TABLE slots ADD COLUMN IF NOT EXISTS fee NUMERIC(8, 2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;

-- Slot times to the quarter hour (5.5 = 5:30 AM, 24 = midnight).
ALTER TABLE slots DROP CONSTRAINT IF EXISTS slots_start_hour_check;
ALTER TABLE slots DROP CONSTRAINT IF EXISTS slots_end_hour_check;
ALTER TABLE slots ALTER COLUMN start_hour TYPE NUMERIC(5, 2);
ALTER TABLE slots ALTER COLUMN end_hour TYPE NUMERIC(5, 2);

-- "end": an anytime window (e.g. 5 AM – 9 PM) that takes orders until the cutoff before it ENDS.
ALTER TABLE slots ADD COLUMN IF NOT EXISTS book_until TEXT NOT NULL DEFAULT 'start';

-- Offers & promotions -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS combos (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  price        NUMERIC(8, 2) NOT NULL CHECK (price >= 0),
  active       BOOLEAN NOT NULL DEFAULT true,
  tint         TEXT NOT NULL DEFAULT '#FBEBC0',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS combo_items (
  combo_id    INT NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
  product_id  INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty         NUMERIC(9, 3) NOT NULL CHECK (qty > 0),
  PRIMARY KEY (combo_id, product_id)
);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS combo_id INT REFERENCES combos(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS combo_name TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS combo_count INT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_lines JSONB NOT NULL DEFAULT '[]';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wallet_used NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift TEXT;

-- Referral wallet
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_rewarded BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS wallet_txns (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      NUMERIC(10, 2) NOT NULL,
  reason      TEXT NOT NULL,
  order_id    INT REFERENCES orders(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_txns_user_idx ON wallet_txns (user_id, created_at DESC);

-- Wallet credits: each credit remembers what's left and how much of it one order may use.
CREATE TABLE IF NOT EXISTS wallet_credits (
  id             SERIAL PRIMARY KEY,
  user_id        INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL DEFAULT 'other',           -- refund | referral | other
  amount         NUMERIC(10, 2) NOT NULL,
  remaining      NUMERIC(10, 2) NOT NULL,
  per_order_cap  NUMERIC(10, 2),                          -- NULL = no limit per order
  reason         TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_credits_user_idx ON wallet_credits (user_id) WHERE remaining > 0;

CREATE TABLE IF NOT EXISTS wallet_usage (
  order_id   INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  credit_id  INT NOT NULL REFERENCES wallet_credits(id) ON DELETE CASCADE,
  amount     NUMERIC(10, 2) NOT NULL,
  PRIMARY KEY (order_id, credit_id)
);

-- Balances from before per-credit tracking become one unrestricted credit.
INSERT INTO wallet_credits (user_id, kind, amount, remaining, reason)
SELECT u.id, 'other', u.wallet, u.wallet, 'Earlier wallet balance' FROM users u
WHERE u.wallet > 0 AND NOT EXISTS (SELECT 1 FROM wallet_credits w WHERE w.user_id = u.id);

-- Bad-item reports with photos, checked by the shop.
CREATE TABLE IF NOT EXISTS complaints (
  id             SERIAL PRIMARY KEY,
  order_id       INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id        INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  items          JSONB NOT NULL DEFAULT '[]',
  text           TEXT NOT NULL,
  photos         JSONB NOT NULL DEFAULT '[]',
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  refund_amount  NUMERIC(10, 2),
  spread_orders  INT,
  admin_note     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS complaints_order_uidx ON complaints (order_id);
CREATE INDEX IF NOT EXISTS complaints_status_idx ON complaints (status, created_at DESC);
