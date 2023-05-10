import kleur from "kleur";

const ensureSettingValue = (file, key, value) => async (connection) => {
  await connection.script(`
    #!/bin/bash

    # Check if the line exists in the file
    grep -q '^${key}[[:space:]]*${value}[[:space:]]*$' ${file}

    # If line doesn't exist, update the configuration
    if [ $? -eq 1 ]; then
      echo 'setting ${file} > ${key} to ${value}'

      # Remove all existing lines
      sudo sed -i '/^${key}/d' ${file}
      # Append line to the file
      echo '${key} ${value}' | sudo tee -a ${file} > /dev/null 2>&1
    fi

    sudo systemctl restart sshd
  `);
};

export const enforceSshPublicKeyOnly = () => async (connection) => {
  console.log(kleur.magenta('tsk:'), 'enforceSshPublicKeyOnly');

  await ensureSettingValue('/etc/ssh/sshd_config', 'PasswordAuthentication', 'no')(connection);
  await ensureSettingValue('/etc/ssh/sshd_config', 'ChallengeResponseAuthentication', 'no')(connection);
  await ensureSettingValue('/etc/ssh/sshd_config', 'PubkeyAuthentication', 'yes')(connection);
}

export default enforceSshPublicKeyOnly;
