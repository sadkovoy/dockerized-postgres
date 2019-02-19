// Example of using with Mocha and knex migrations

const knex = require('knex');
const DockerizedPostgres = require('dockerized-postgres');

let knexClient;

const dockerizedPostgres = new DockerizedPostgres({
  beforeHook: async (port) => {
    knexClient = knex({ connection: { host: '0.0.0.0', port }, client: 'pg' });
    await knexClient.migrate.latest();
  },
  afterHook: async () => {
    await knexClient.destroy();
  },
  tag: 'latest',
});

before(async () => {
  await dockerizedPostgres.start();
  // Now you can connect to postgres from your tests
});

after(async () => {
  await dockerizedPostgres.shutdown();
});
