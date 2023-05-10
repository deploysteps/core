import kleur from "kleur";

const syncPublicKeys = async (connection, username, publicKeys) => {
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
    `).catch(error => {
      return false;
    });

    // If the public key doesn't exist, append it to the authorized_keys file
    if (!keyExists) {
      await connection.exec(`
        echo '${publicKey}' | sudo tee -a /home/${username}/.ssh/authorized_keys
      `);
    }
  }

  // Set correct permissions for the authorized_keys file
  await connection.exec(`
    sudo chown ${username}:${username} /home/${username}/.ssh/authorized_keys
    sudo chmod 600 /home/${username}/.ssh/authorized_keys
  `);
};

export const syncUsers = (users) => async (connection) => {
  console.log(kleur.magenta('tsk:'), 'syncUsers');
  for (const user of users) {
    const userExists = await connection.exec(`
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

    const groupsString = user.groups.join(',');
    await connection.exec(`
      sudo usermod -aG ${groupsString} ${user.username}
    `);

    if (user.publicKeys) {
      await syncPublicKeys(connection, user.username, user.publicKeys);
    }
  }
};

export default syncUsers;
