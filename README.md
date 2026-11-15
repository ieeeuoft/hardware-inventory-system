# Hardware Inventory System

## Prerequisites

- [Node.js](https://nodejs.org/) installed
- [pnpm](https://pnpm.io/installation) 11 or later installed for the frontend
- [PostgreSQL](https://www.postgresql.org/download/) running locally (or via Docker, see below)
- Git installed

## Setup

Clone the repository and move into the project directory:

```bash
git clone https://github.com/ieeeuoft/hardware-inventory-system.git
cd hardware-inventory-system
```

### Backend

Install the backend dependencies:

```bash
cd backend
npm install
```

#### Database

The backend stores inventory in PostgreSQL. If you don't have Postgres installed, you can start one with Docker:

```bash
docker run -d --name inventory-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=inventory -p 5432:5432 postgres:16
```

Create a `backend/.env` file with your database connection string (this file is gitignored):

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/inventory"
```

Apply the database migrations (run this again whenever you pull new migrations):

```bash
npx prisma migrate dev
```

#### Run

Start the backend on any port other than `3000`, e.g. `3001`:

```bash
node index.js 3001
```

The backend will be available at [http://localhost:3001](http://localhost:3001), with the inventory API under `/api/items`.

#### Tests

```bash
npm test
```

The database integration test is skipped by default. To run it against your local database (it creates and deletes its own test item):

```bash
RUN_DATABASE_TESTS=1 npm test
```

On Windows PowerShell, use `$env:RUN_DATABASE_TESTS=1; npm test`.

### Frontend

Open a second terminal, go to the frontend directory, and install the dependencies:

```bash
cd hardware-inventory-system/frontend
pnpm install
```

Start the Next.js development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The frontend forwards `/api/items` requests to the backend at `http://127.0.0.1:3001` by default. If your backend runs somewhere else, set `BACKEND_URL` before starting the frontend, e.g. `BACKEND_URL=http://127.0.0.1:4000 pnpm dev`.
