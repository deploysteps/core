import createSshConnection from './utils/createSshConnection.js';

export { copy } from './tasks/copy.js';
export { enforceSshPublicKeyOnly } from './tasks/enforceSshPublicKeyOnly.js';
export { syncUsers } from './tasks/syncUsers.js';
export { updateDebian } from './tasks/updateDebian.js';

export { createSshConnection } from './utils/createSshConnection.js';

export async function run (servers) {
  for (const server of servers) {
    const connection = await createSshConnection({
      ip: server.host,
      username: server.username,
      password: server.password,
      port: server.port,
      otpSecret: server.otpSecret,
      privateKey: server.privateKey
    });

    for (const task of server.tasks) {
      await task.handler(connection);
    }

    connection.close();
  }
}
