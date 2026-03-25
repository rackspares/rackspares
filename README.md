# RackSpares

**RackSpares - Open source data center warehouse management**

RackSpares is a self-hosted inventory management tool built for data center and IT infrastructure teams. Track your spare servers, networking gear, cables, and other hardware with a clean, fast web interface.

---

## Features

- **Inventory CRUD** — Add, edit, and delete items with fields for name, category, quantity, location, status, and description
- **Search & Filter** — Real-time search across name, description, and location; filter by category and status
- **Status Tracking** — Mark items as Available, In Use, Faulty, or Retired
- **Dashboard Stats** — At-a-glance totals for inventory counts, quantities, and fault status
- **Authentication** — JWT-based login with a seeded admin account
- **Fully Containerized** — Postgres + FastAPI + React, all wired up with Docker Compose

---

## Quick Start

**Prerequisites:** Docker and Docker Compose

```bash
git clone https://github.com/yourorg/rackspares.git
cd rackspares
docker-compose up
```

Then open [http://localhost:3000](http://localhost:3000) and log in:

| Field    | Default |
|----------|---------|
| Username | `admin` |
| Password | `admin` |

> **Note:** Change the default credentials and `SECRET_KEY` in `docker-compose.yml` before exposing to a network.

### Environment Variables

| Variable         | Default                                              | Description                |
|------------------|------------------------------------------------------|----------------------------|
| `DATABASE_URL`   | `postgresql://rackspares:rackspares@db/rackspares`   | Postgres connection string |
| `SECRET_KEY`     | `changeme-in-production`                             | JWT signing secret         |
| `ADMIN_USERNAME` | `admin`                                              | Seeded admin username      |
| `ADMIN_PASSWORD` | `admin`                                              | Seeded admin password      |

---

## Project Structure

```
rackspares/
├── backend/          # FastAPI application
│   ├── main.py       # App entry point, startup seeding
│   ├── models.py     # SQLAlchemy ORM models
│   ├── schemas.py    # Pydantic request/response schemas
│   ├── database.py   # DB session and engine
│   └── routers/      # Auth and inventory route handlers
├── frontend/         # React application
│   └── src/
│       ├── pages/    # Login and Inventory pages
│       └── components/ # Navbar, form, status badge
├── docker-compose.yml
└── VERSION
```

---

## Roadmap

Planned features for future releases:

- **BOM Management** — Build bills of materials with a shopping cart workflow for procurement
- **Barcode Scanning** — Scan barcodes and QR codes via browser camera for fast check-in/out
- **NetBox Integration** — Sync devices and racks from a NetBox instance
- **Consumable Inventory** — Track consumables (e.g. thermal paste, screws) with low-stock reorder alerts
- **Role-Based Permissions** — Granular read/write roles beyond admin/user
- **Serial Number Tracking** — Per-unit serial tracking with full history
- **Audit Logs** — Immutable log of all inventory changes with timestamps and user attribution
- **Paperless-ngx Integration** — Link datasheets and invoices from a Paperless-ngx instance
- **N8n / Node-RED Integration** — Trigger automation workflows on inventory events
- **Local LLM Support** — Natural language search and anomaly detection via a local LLM (Ollama)

---

## License

Apache 2.0 — see [LICENSE](LICENSE)
