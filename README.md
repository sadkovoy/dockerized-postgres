### Simple package for starting and shutting down dockerized postgres instance (mainly for tests purposes)


Usage example:

```
const DockerizedPostgres = require('dockerized-postgres');

const postgres = new DockerizedPostgres({
  beforeHook: (port) => {}, // will be called before container start
  afterHook: (port) => {}, // will be called right after container shutdown,
  tag: '11', // image tag
});

await postgres.start();
await postgres.stop();
```
