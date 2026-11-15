'use strict';

const path = require('node:path');

// The Prisma CLI reads backend/.env on its own, but the Prisma client does not,
// so load it before creating a PrismaClient. A missing file is fine: in that
// case DATABASE_URL is expected to come from the real environment.
function loadEnv() {
    try {
        process.loadEnvFile(path.join(__dirname, '..', '.env'));
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }
}

module.exports = { loadEnv };
