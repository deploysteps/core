import { Connection } from "../utils/createSshConnection.js";

interface User {
  username: string;
  password: string;
  groups: string[];
  publicKeys?: string[];
  otpSecret?: string;
}

const syncPublicKeys = async (
  connection: Connection,
  username: string,
  publicKeys: string[],
  otpSecret?: string
): Promise<void> => {
  if (!publicKeys || publicKeys.length === 0) {
    return;
  }

  // Ensure the .ssh directory exists and has correct permissions
  await connection.exec(`
    sudo mkdir -p /home/${username}/.ssh
    sudo chown ${username}:${username} /home/${username}/.ssh
    sudo chmod 700 /home/${username}/.ssh
  `);

  for (const publicKey of publicKeys) {
    // Check if the public key already exists in the authorized_keys file
    const keyExists = await connection.exec(`
      sudo grep -qF '${publicKey}' /home/${username}/.ssh/authorized_keys
    `).catch((error: Error) => {
      return false;
    });

    // If the public key doesn't exist, append it to the authorized_keys file
    if (!keyExists) {
      await connection.exec(`
        echo '${publicKey}' | sudo tee -a /home/${username}/.ssh/authorized_keys
      `);
    }
  }

  // Set up Google Authenticator for the user
  if (otpSecret) {
    await connection.exec(`
      echo "${otpSecret}" | sudo -u ${username} google-authenticator -d -t -f -r 3 -R 30 -W
    `);
  }

  // Set correct permissions for the authorized_keys file
  await connection.exec(`
    sudo chown ${username}:${username} /home/${username}/.ssh/authorized_keys
    sudo chmod 600 /home/${username}/.ssh/authorized_keys
  `);
};

const setupAuthenticator = async (
  connection: Connection,
  username: string,
  otpSecret: string
): Promise<void> => {
  if (!otpSecret) {
    return;
  }

  // Define the google_authenticator configuration
  const googleAuthenticatorConfig: string = `
${otpSecret}
" RATE_LIMIT 3 30
" WINDOW_SIZE 3
" DISALLOW_REUSE
" TOTP_AUTH
  `.trim();

  // Write the .google_authenticator file in the user's home directory
  await connection.exec(`
    sudo apt-get install -y libpam-google-authenticator
    sudo rm -f /home/${username}/.google_authenticator
    echo '${googleAuthenticatorConfig}' | sudo -u ${username} tee /home/${username}/.google_authenticator > /dev/null
    sudo chown ${username}:${username} /home/${username}/.google_authenticator
    sudo chmod 600 /home/${username}/.google_authenticator
  `);
};

export const syncUsers = async (
  connection: Connection,
  users: User[]
): Promise<void> => {
  for (const user of users) {
    const userExists: string = await connection.exec(`
      id -u ${user.username} >/dev/null 2>&1; echo $?
    `);

    if (userExists.trim() === '1') {
      await connection.exec(`
        sudo useradd -m -p "$(openssl passwd -1 '${user.password}')" ${user.username}
      `);
    } else {
      await connection.exec(`
        echo '${user.username}:${user.password}' | sudo chpasswd
      `);
    }

    const groupsString: string = user.groups.join(',');
    await connection.exec(`
      sudo usermod -aG ${groupsString} ${user.username}
    `);

    await connection.exec(`
      sudo chsh -s /bin/bash ${user.username}
    `);

    if (user.publicKeys) {
      await syncPublicKeys(connection, user.username, user.publicKeys);
    }

    if (user.otpSecret) {
      await setupAuthenticator(connection, user.username, user.otpSecret);
    }
  }
};

export default syncUsers;
