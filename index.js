const fs = require('fs');
const uuid4 = require('uuid/v4');
const { Docker } = require('node-docker-api');
const { Client } = require('pg');


class DockerizedPostgres {
  constructor({ beforeHook, afterHook, tag = 'latest', connectionTimeout, logger }) {
    this.beforeHook = beforeHook;
    this.afterHook = afterHook;
    this.tag = tag;

    this.port = null;
    this.containerName = `postgres-${uuid4()}`;
    this.connectionTimeout = 20000;

    this.log = logger || console.log.bind(console);
  }

  async start() {
    const docker = new Docker(this._getDockerConnectionOptions());

    const pullStream = await docker.image.create({}, { fromImage: 'postgres', tag: this.tag });
    await this._promisifyStream(pullStream);

    this.postgresContainer = await docker.container.create({
      Image: `postgres:${this.tag}`,
      name: this.containerName,
      HostConfig: {
        PublishAllPorts: false,
        PortBindings: {
          [`5432/tcp`]: [
            {
              HostIp: '',
              HostPort: ''
            }
          ]
        },
      }
    });

    try {
      await this.postgresContainer.start();
      this.log(`\nStarted postgres instance on port: ${this.port}.`);
    } catch (e) {
      this.log(`Failed to start postgres instance: ${e}.`);
    }

    await this.waitForConnection();

    try {
      this.log('Going to call beforeHook');
      await this.beforeHook(this.port);
      this.log('Called beforeHook');
    } catch (e) {
      this.log(`Failed to execute beforeHook: ${e}`);
    }
  }

  async shutdown() {
    try {
      this.log('Going to call afterHook');
      await this.afterHook(this.port);
      this.log('Called afterHook');
    } catch (e) {
      this.log(`Failed to execute afterHook: ${e}`);
    }

    await this.postgresContainer.stop();
    await this.postgresContainer.delete();

    this.log(`Stopped postgres instance on port: ${this.port}.`);
  }

  async waitForConnection() {
    let client;
    let sleepTime = 1000;
    let waitTime = 0;

    while (waitTime < this.connectionTimeout) {
      waitTime = waitTime + sleepTime;
      try {
        client = new Client({
          host: 'localhost',
          port: this.port,
          user: 'postgres',
          password: 'postgres',
          database: 'postgres',
        });
        await client.connect();
        await client.query('SELECT 1;');
        await client.end();

        return;

      } catch (_) {
        this.log('Connection failed, going to retry.');
        await this._sleep(sleepTime);
      }
    }

    throw new Error('Failed to connect.');
  }

  _sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  _promisifyStream(stream) {
    return new Promise((resolve, reject) => {
      stream.on('data', (row) => this.log(row.toString()));
      stream.on('end', resolve);
      stream.on('error', reject);
    });
  }

  _getDockerConnectionOptions(env = process.env) {
    const opts = {};

    if (!env.DOCKER_HOST) {
      opts.socketPath = '/var/run/docker.sock';
      opts.host = 'localhost';
    } else if (env.DOCKER_HOST.indexOf('unix://') === 0) {
      opts.socketPath = env.DOCKER_HOST.substring(7) || '/var/run/docker.sock';
    } else {
      const split = /(?:tcp:\/\/)?(.*?):([0-9]+)/g.exec(env.DOCKER_HOST);

      if (!split || split.length !== 3) {
        throw new Error('DOCKER_HOST env variable should be something like tcp://localhost:1234');
      }

      opts.host = split[1];
      opts.port = split[2];
      opts.protocol = 'http';

      if (env.DOCKER_USE_HTTPS) {
        if (!env.DOCKER_CERT_PATH) {
          throw new Error('DOCKER_CERT_PATH environment variable is not set.');
        }

        opts.protocol = 'https';
        try {
          opts.ca = fs.readFileSync(env.DOCKER_CERT_PATH + '/ca.pem');
          opts.cert = fs.readFileSync(env.DOCKER_CERT_PATH + '/cert.pem');
          opts.key = fs.readFileSync(env.DOCKER_CERT_PATH + '/key.pem');
        } catch (e) {
          throw new Error(`Unable to read docker certificates. ${e}`);
        }
      }
    }
    return opts;
  }
}


module.exports = DockerizedPostgres;
