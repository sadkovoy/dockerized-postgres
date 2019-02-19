const uuid4 = require('uuid/v4');
const getPort = require('get-port');
const { Docker } = require('node-docker-api');


class DockerizedPostgres {
  constructor({ beforeHook, afterHook, tag = 'latest', logger }) {
    this.beforeHook = beforeHook;
    this.afterHook = afterHook;
    this.tag = tag;

    this.port = null;
    this.containerName = `postgres-${uuid4()}`;

    this.log = logger || console.log.bind(console);
  }

  async start() {
    const docker = new Docker({ socketPath: '/var/run/docker.sock' });
    this.port = await getPort({ port: 5432 });

    const pullStream = await docker.image.create({}, { fromImage: 'postgres', tag: this.tag });
    await this._promisifyStream(pullStream);

    this.postgresContainer = await docker.container.create({
      Image: `postgres:${this.tag}`,
      name: this.containerName,
      ExposedPorts: {
        [`${this.port}/tcp`]: {},
      },
      HostConfig: {
        PortBindings: { [`${this.port}/tcp`]: [{ HostPort: `${this.port}` }] },
      },
    });

    try {
      await this.postgresContainer.start();
      this.log(`Started postgres instance on port: ${this.port}.`);
    } catch (e) {
      this.log(`Failed to start postgres instance: ${e}.`);
    }

    await this._sleep(5000);

    try {
      await this.beforeHook(this.port);
      this.log('Called beforeHook');
    } catch (e) {
      this.log(`Failed to execute beforeHook: ${e}`);
    }
  }

  async shutdown() {
    try {
      await this.afterHook(this.port);
      this.log('Called afterHook');
    } catch (e) {
      this.log(`Failed to execute afterHook: ${e}`);
    }

    await this.postgresContainer.stop();
    await this.postgresContainer.delete();

    this.log(`Stopped postgres instance on port: ${this.port}.`);
  }

  _sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  _promisifyStream (stream) {
    return new Promise((resolve, reject) => {
      stream.on('data', (row) => this.log(row.toString()));
      stream.on('end', resolve);
      stream.on('error', reject);
    })
  }
}


exports = DockerizedPostgres;
