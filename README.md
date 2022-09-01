## Reproduction of #14539

### Setup

- Set environment variables:

```bash
export DATABASE_MARIADB_STABLE_URL="mysql://root:root@localhost:4306/PRISMA_DB_NAME"
export DATABASE_MARIADB_BUGGED_URL="mysql://root:root@localhost:4307/PRISMA_DB_NAME"
```

- Spin up docker-compose: `docker-compose -f docker/docker-compose.yml up`

### Reproduction

- pnpm i
- pnpm prisma:db-push

- Test on bugged database:
  - export DATABASE_URL=$DATABASE_MARIADB_BUGGED_URL
  - export IS_DATABASE_BUGGED='1'
  - pnpm test
- Test on stable database:
  - export DATABASE_URL=$DATABASE_MARIADB_STABLE_URL
  - export IS_DATABASE_BUGGED='0'
  - pnpm test
