import fs from 'fs';
import {
  createSshConnection,

  copy,
  enforceSshPublicKeyOnly,
  syncUsers,
  updateDebian
} from '@deploysteps/core';

const users = [
  {
    username: 'user1',
    password: 'Password@12345',
    publicKeys: [
      fs.readFileSync('/Users/user1/.ssh/id_rsa.pub', 'utf8')
    ],
    groups: ['sudo']
  }
];

const servers = [
  {
    host: '192.168.1.100',
    port: 22,
    username: 'myAccount',
    password: 'Password@12345',
    privateKey: fs.readFileSync('/Users/user1/.ssh/id_rsa', 'utf8'),
    tasks: [
      updateDebian(),
      syncUsers(users),
      enforceSshPublicKeyOnly(),
      copy('./stacks/example-voting-app', '/Users/myAccount/Documents/example-voting-app', { clean: true }),
    ]
  }
];

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
    await task(connection);
  }

  connection.close();
}
