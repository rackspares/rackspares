# Changelog

All notable changes to RackSpares will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
