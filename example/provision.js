import fs from 'fs';
import {
  createSshConnection,

  copy,
  enforceSshOtpAndPublicKeyOnly,
  syncUsers,
  updateDebian
} from '@deploysteps/core';


const users = [
  {
    username: 'user1',
    password: 'Password@12345',
    privateKey: fs.readFileSync('/Users/user1/.ssh/id_rsa', 'utf8'),
    publicKeys: [
      fs.readFileSync('/Users/user1/.ssh/id_rsa.pub', 'utf8')
    ],
    groups: ['sudo']
  }
];

const $ = await createSshConnection({
  host: '192.168.1.100',
  port: 22,
  username: users[0].username,
  password: users[0].password,
  otpSecret: users[0].otpSecret,
  privateKey: users[0].privateKey
});

await updateDebian($);
await syncUsers($, users);
await enforceSshOtpAndPublicKeyOnly($);
await copy($, './stacks', '/Users/user1/Documents/stacks', { clean: true });
await $.close();
