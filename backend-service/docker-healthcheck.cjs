'use strict';

const http = require('node:http');

const defaultPorts = Object.freeze({
  'auth-service': 3001,
  'account-service': 3002,
  'transaction-service': 3003,
  'payment-service': 3004,
  'notification-service': 3005,
});

const serviceName = process.env.SERVICE_NAME ?? '';
const configuredPort =
  process.env.PORT ?? defaultPorts[serviceName];

const port = Number(configuredPort);

if (
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535
) {
  process.exit(1);
}

let completed = false;

function finish(exitCode) {
  if (completed) {
    return;
  }

  completed = true;
  process.exit(exitCode);
}

const request = http.get(
  {
    hostname: '127.0.0.1',
    port,
    path: '/v1/health',
    timeout: 4000,
  },
  (response) => {
    const successful =
      response.statusCode >= 200 &&
      response.statusCode < 400;

    response.resume();
    response.on('end', () => {
      finish(successful ? 0 : 1);
    });
  },
);

request.on('error', () => {
  finish(1);
});

request.on('timeout', () => {
  request.destroy();
  finish(1);
});
