# Changelog

All notable changes to RackSpares will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
