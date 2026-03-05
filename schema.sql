CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(100) NOT NULL,
  email           VARCHAR(150) UNIQUE NOT NULL,
  phone           VARCHAR(25)  UNIQUE NOT NULL,
  password_hash   TEXT         NOT NULL,
  kyc_status      VARCHAR(20)  DEFAULT 'pending'
                  CHECK (kyc_status IN ('pending','approved','rejected')),
  status          VARCHAR(20)  DEFAULT 'active'
                  CHECK (status IN ('active','suspended','closed')),
  role            VARCHAR(20)  DEFAULT 'user'
                  CHECK (role IN ('user','admin','superadmin')),
  failed_attempts INTEGER      DEFAULT 0,
  last_login      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE wallets (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance     DECIMAL(18,2) DEFAULT 0.00 CHECK (balance >= 0),
  currency    VARCHAR(5)    DEFAULT 'USD',
  pin_hash    TEXT,
  status      VARCHAR(20)   DEFAULT 'active'
              CHECK (status IN ('active','frozen','closed')),
  created_at  TIMESTAMPTZ   DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   DEFAULT NOW()
);

CREATE TABLE transactions (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_wallet   UUID          NOT NULL REFERENCES wallets(id),
  receiver_wallet UUID          NOT NULL REFERENCES wallets(id),
  amount          DECIMAL(18,2) NOT NULL CHECK (amount > 0),
  fee             DECIMAL(10,4) DEFAULT 0.0000,
  net_amount      DECIMAL(18,2),
  status          VARCHAR(20)
                  CHECK (status IN ('initiated','processing','completed','failed','reversed','disputed')),
  note            TEXT,
  dispute_reason  TEXT,
  hash            VARCHAR(64)   UNIQUE NOT NULL,
  previous_hash   VARCHAR(64)   NOT NULL,
  block_number    BIGINT        UNIQUE NOT NULL,
  initiated_at    TIMESTAMPTZ   DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE TABLE kyc_documents (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_type      VARCHAR(30)
                CHECK (doc_type IN ('passport','national_id','drivers_license','utility_bill')),
  file_url      TEXT        NOT NULL,
  status        VARCHAR(20) DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected')),
  reviewed_by   UUID        REFERENCES users(id),
  reject_reason TEXT,
  submitted_at  TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at   TIMESTAMPTZ
);

CREATE TABLE audit_log (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        REFERENCES users(id),
  action      VARCHAR(100) NOT NULL,
  ip_address  VARCHAR(50),
  user_agent  TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notifications (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID        REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(50),
  title      VARCHAR(200),
  message    TEXT,
  is_read    BOOLEAN     DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wallets_user         ON wallets(user_id);
CREATE INDEX idx_txn_sender           ON transactions(sender_wallet);
CREATE INDEX idx_txn_receiver         ON transactions(receiver_wallet);
CREATE INDEX idx_txn_hash             ON transactions(hash);
CREATE INDEX idx_txn_block            ON transactions(block_number);
CREATE INDEX idx_txn_status           ON transactions(status);
CREATE INDEX idx_txn_date             ON transactions(initiated_at DESC);
CREATE INDEX idx_audit_user           ON audit_log(user_id);
CREATE INDEX idx_notifications_user   ON notifications(user_id);