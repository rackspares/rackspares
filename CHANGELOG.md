# Changelog

All notable changes to RackSpares will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-03-26

### Added
- **Item type** — `asset` or `consumable` field on every inventory item; shown as a colour-coded badge in the inventory table; filterable in the inventory list
- **Minimum stock & lead time** — `minimum_stock` and `lead_time_days` fields on consumable items; reorder flag (!) shown inline when stock is below threshold
- **Reorder alerts page** — lists all consumables below their minimum stock; urgency badges (Critical = zero stock, Warning = low stock); accessible to Manager and Admin
- **BOM (Bill of Materials) workflow** — full shopping-cart style procurement tracking: create draft BOMs, add/remove/update inventory line items, submit for review, mark fulfilled; per-item computed fields: in-stock quantity and quantity-to-order
- **CSV export** — download any BOM as a CSV file with columns: Item, Category, Type, In Stock, Needed, To Order
- **Configurable category system** — `Category` model with self-referential `parent_id` (max 3 levels); replaces the hardcoded category string; Admin-only CRUD management page with expandable tree view; inventory form uses cascading dropdown
- **Audit log coverage** — BOM and category actions now appear in the audit log alongside inventory events
- `Category` database table: id, name, parent_id (self-referential FK), created_by, created_at
- `BOM` and `BOMItem` database tables with status enum (draft/submitted/fulfilled) and cascade delete
- `item_type`, `minimum_stock`, `lead_time_days`, `category_id` columns on `inventory_items`; old text `category` column migrated to FK references and dropped
- New API routes: `/api/categories/`, `/api/boms/`, `/api/inventory/reorder`
- Default category seed data (8 top-level categories) on first startup

### Changed
- Inventory `category` text field replaced by `category_id` FK to the categories table; existing category strings are migrated to category rows automatically
- Inventory list category filter now matches item and all descendants (hierarchical)
- Navbar updated: Reorder, BOMs, and Categories links added; version tag updated to v0.3.0

### Migration note
> v0.3.0 changes the database schema (new tables and columns). The startup migration is **idempotent** — simply rebuild and restart:
> ```
> docker compose up --build -d
> ```

## [0.2.0] - 2026-03-26

### Added
- **Role-based access control** — three roles: Admin (full access), Manager (inventory CRUD, no user management), Viewer (read-only)
- **User management page** (Admin only) — create users, change roles, reset passwords, enable/disable accounts; admin cannot disable their own account
- **Audit log** — every inventory create, update, and delete is recorded with the acting user, entity, and a JSON diff of changed fields; audit log page with filters by username, action type, and date range (Admin and Manager)
- **Stale date tracking** — `last_verified` field on inventory items; "Verify Stock" button updates timestamp to now; amber warning at 30+ days, red warning at 90+ days; stale filter in inventory list; stale count stat card
- **Password change** — any logged-in user can change their own password (requires current password)
- `AuditLog` database table: id, user_id, username (denormalised), action, entity_type, entity_id, entity_name, changes (JSON diff), timestamp
- `role` and `is_active` fields on the User model (replaces `is_admin` boolean)
- `last_verified` field on InventoryItem

### Changed
- `User.is_admin` replaced by `User.role` enum (`admin` | `manager` | `viewer`) and `User.is_active` boolean
- Inventory create/update/delete now require Manager or Admin role; read-only endpoints remain accessible to Viewer
- Navbar shows nav links (Inventory, Audit Log, Users) based on role; version tag updated to v0.2.0
- Login page rejects disabled accounts with a clear error message

### Migration note
> v0.2.0 changes the database schema (new columns, new table). If upgrading an existing v0.1.0 installation, recreate the database volume:
> ```
> docker compose down -v && docker compose up -d
> ```

## [0.1.0] - 2026-03-25

### Added
- Initial MVP release
- User authentication with JWT tokens and admin seeding
- Inventory item CRUD (name, category, quantity, location, status, description, date_added, last_updated)
- Real-time search by name, description, and location
- Filter inventory by category and status
- Summary stats dashboard (total items, total quantity, available, faulty counts)
- Status badges: Available, In Use, Faulty, Retired
- Clean, responsive UI with dark navbar
- FastAPI backend with PostgreSQL via SQLAlchemy
- React frontend served via Nginx
- Full Docker Compose stack (`docker-compose up` to run)
- Apache 2.0 license
