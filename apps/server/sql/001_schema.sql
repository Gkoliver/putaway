-- Putaway MySQL schema v1

SET NAMES utf8mb4;

CREATE TABLE users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY users_email_unique (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY sessions_token_unique (token),
  KEY sessions_user_id_idx (user_id),
  CONSTRAINT sessions_user_id_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE magic_link_tokens (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  UNIQUE KEY magic_link_tokens_token_unique (token),
  KEY magic_link_tokens_email_idx (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE households (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE household_members (
  household_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  role ENUM('owner', 'member') NOT NULL,
  PRIMARY KEY (household_id, user_id),
  CONSTRAINT household_members_household_id_fk FOREIGN KEY (household_id) REFERENCES households (id),
  CONSTRAINT household_members_user_id_fk FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE invites (
  id CHAR(36) NOT NULL PRIMARY KEY,
  household_id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role ENUM('owner', 'member') NOT NULL,
  token VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  accepted_at DATETIME NULL,
  CONSTRAINT invites_household_id_fk FOREIGN KEY (household_id) REFERENCES households (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE locations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  household_id CHAR(36) NOT NULL,
  parent_id CHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  archived_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  active_sibling_key VARCHAR(512) AS (
    IF(
      archived_at IS NULL,
      CONCAT(COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'), ':', LOWER(name)),
      NULL
    )
  ) STORED,
  CONSTRAINT locations_household_id_fk FOREIGN KEY (household_id) REFERENCES households (id),
  CONSTRAINT locations_parent_id_fk FOREIGN KEY (parent_id) REFERENCES locations (id),
  UNIQUE KEY locations_sibling_name (household_id, active_sibling_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  household_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  name_lower VARCHAR(255) AS (LOWER(name)) STORED,
  CONSTRAINT items_household_id_fk FOREIGN KEY (household_id) REFERENCES households (id),
  UNIQUE KEY items_household_name (household_id, name_lower)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stock_lots (
  id CHAR(36) NOT NULL PRIMARY KEY,
  household_id CHAR(36) NOT NULL,
  item_id CHAR(36) NOT NULL,
  location_id CHAR(36) NOT NULL,
  quantity INT NOT NULL,
  put_away_count INT NOT NULL,
  last_activity_at DATETIME NOT NULL,
  CONSTRAINT stock_lots_household_id_fk FOREIGN KEY (household_id) REFERENCES households (id),
  CONSTRAINT stock_lots_item_id_fk FOREIGN KEY (item_id) REFERENCES items (id),
  CONSTRAINT stock_lots_location_id_fk FOREIGN KEY (location_id) REFERENCES locations (id),
  UNIQUE KEY stock_lots_unique (household_id, item_id, location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE command_receipts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  household_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  client_command_id VARCHAR(255) NOT NULL,
  result_json TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT command_receipts_household_id_fk FOREIGN KEY (household_id) REFERENCES households (id),
  UNIQUE KEY command_receipts_unique (household_id, user_id, client_command_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
