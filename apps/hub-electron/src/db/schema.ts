export const migrations = [
  {
    id: "001_initial_pos_hub",
    sql: `
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pos_days (
        id TEXT PRIMARY KEY,
        outlet_id TEXT NOT NULL,
        business_date TEXT NOT NULL,
        status TEXT NOT NULL,
        opening_cash_paise INTEGER NOT NULL,
        closing_cash_paise INTEGER,
        opened_by TEXT NOT NULL,
        closed_by TEXT,
        opened_at TEXT NOT NULL,
        closed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS floors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS restaurant_tables (
        id TEXT PRIMARY KEY,
        floor_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        current_order_id TEXT,
        occupied_at TEXT,
        FOREIGN KEY (floor_id) REFERENCES floors(id)
      );

      CREATE TABLE IF NOT EXISTS production_units (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        printer_host TEXT NOT NULL,
        printer_port INTEGER NOT NULL,
        kds_enabled INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS menu_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price_paise INTEGER NOT NULL,
        production_unit_id TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (production_unit_id) REFERENCES production_units(id)
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        table_id TEXT NOT NULL,
        pos_day_id TEXT NOT NULL,
        order_type TEXT NOT NULL,
        status TEXT NOT NULL,
        pax INTEGER NOT NULL,
        captain_id TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (table_id) REFERENCES restaurant_tables(id),
        FOREIGN KEY (pos_day_id) REFERENCES pos_days(id)
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        menu_item_id TEXT NOT NULL,
        name_snapshot TEXT NOT NULL,
        unit_price_paise INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        production_unit_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
        FOREIGN KEY (production_unit_id) REFERENCES production_units(id)
      );

      CREATE TABLE IF NOT EXISTS kots (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        production_unit_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (production_unit_id) REFERENCES production_units(id)
      );

      CREATE TABLE IF NOT EXISTS kot_items (
        id TEXT PRIMARY KEY,
        kot_id TEXT NOT NULL,
        order_item_id TEXT,
        menu_item_id TEXT NOT NULL,
        name_snapshot TEXT NOT NULL,
        quantity_delta INTEGER NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (kot_id) REFERENCES kots(id)
      );

      CREATE TABLE IF NOT EXISTS bills (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        status TEXT NOT NULL,
        subtotal_paise INTEGER NOT NULL,
        tax_paise INTEGER NOT NULL,
        total_paise INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        settled_at TEXT,
        FOREIGN KEY (order_id) REFERENCES orders(id)
      );

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        bill_id TEXT NOT NULL,
        method TEXT NOT NULL,
        amount_paise INTEGER NOT NULL,
        received_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (bill_id) REFERENCES bills(id)
      );

      CREATE TABLE IF NOT EXISTS print_jobs (
        id TEXT PRIMARY KEY,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        production_unit_id TEXT,
        printer_host TEXT,
        printer_port INTEGER,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        payload TEXT NOT NULL,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS event_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        aggregate_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (event_id) REFERENCES event_log(event_id)
      );

      CREATE INDEX IF NOT EXISTS idx_orders_table_status ON orders(table_id, status);
      CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
      CREATE INDEX IF NOT EXISTS idx_kots_unit_status ON kots(production_unit_id, status);
      CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON print_jobs(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON sync_outbox(status, created_at);
    `
  },
  {
    id: "002_local_auth_and_settings",
    sql: `
      CREATE TABLE IF NOT EXISTS hub_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS local_devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT,
        revoked_at TEXT
      );

      CREATE TABLE IF NOT EXISTS pairing_codes (
        id TEXT PRIMARY KEY,
        code_hash TEXT NOT NULL UNIQUE,
        device_name TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        used_at TEXT,
        used_device_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_local_devices_hash ON local_devices(token_hash);
      CREATE INDEX IF NOT EXISTS idx_pairing_codes_status ON pairing_codes(status, expires_at);
    `
  },
  {
    id: "003_idempotency_records",
    sql: `
      CREATE TABLE IF NOT EXISTS idempotency_records (
        key TEXT NOT NULL,
        route TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (key, route)
      );
    `
  },
  {
    id: "004_system_printer_targets",
    sql: `
      ALTER TABLE production_units ADD COLUMN printer_mode TEXT NOT NULL DEFAULT 'network';
      ALTER TABLE production_units ADD COLUMN printer_name TEXT;
      ALTER TABLE print_jobs ADD COLUMN printer_name TEXT;
    `
  }
] as const;
