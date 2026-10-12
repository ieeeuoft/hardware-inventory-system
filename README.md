# Hardware Inventory System

## Prerequisites

- [Node.js](https://nodejs.org/) installed
- [pnpm](https://pnpm.io/installation) 11 or later installed for the frontend
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

Start the backend on port any port othet than `3000` e.g., `3001`:

```bash
node index.js 3001
```

The backend will be available at [http://localhost:3001](http://localhost:3001).

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

The current backend starter does not require environment variables or database setup to run.
