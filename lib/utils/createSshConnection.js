import { Client } from 'ssh2';
import otplib from 'otplib';
import kleur from 'kleur';

const log = (prefix, line) => {
  const lines = line
    .toString()
    .split('\n')
    .filter((l) => l.trim() !== '');

  lines.forEach((l) => {
    console.log(prefix, l);
  });
};

function execRemote(conn, command, onData, config, silent) {
  if (!silent) {
    log(kleur.cyan('inp:'), command.trim());
  }
  return new Promise((resolve, reject) => {
    conn.exec(command, { pty: true }, (err, stream) => {
      if (err) {
        reject(err);
      } else {
        let output = '';

        stream
          .on('data', (data) => {
            if (data.toString().trim() === `[sudo] password for ${config.username}:`) {
              stream.write(`${config.password}\n`);
              return;
            }

            // if (!silent) {
              log(kleur.white('out:'), data.toString());
            // }
            output += data || '';
          })

        stream.on('exit', (code, signal) => {
          if (code !== 0) {
            reject({ code, signal, output });
            return;
          }

          resolve(output);
        });
      }
    });
  });
}

export async function createSshConnection({ host, username, port = 22, privateKey, otpSecret, password }) {
  const config = {
    host,
    port,
    username,
    password,
    privateKey,
    tryKeyboard: true,
  };

  const otp = otpSecret && otplib.authenticator.generate(otpSecret);

  const conn = new Client();

  const connectionPromise = new Promise((resolve, reject) => {
    conn.on('ready', () => {
      console.log(kleur.green('con: ready'), `${username}@${config.host}:${port}`);
      resolve();
    })
    .on('error', (err) => {
      console.error(kleur.red(`con: error: ${err}`));
      reject(err);
    })
    .on('close', () => {
      console.log(kleur.green('con: closed'));
    })
    .on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
      if (prompts.length > 0 && prompts[0].prompt.toLowerCase().includes('verification')) {
        console.log(kleur.yellow('otp: prompt received'));
        finish([otp]);
      } else if (prompts.length > 0 && prompts[0].prompt.toLowerCase().includes('password')) {
        console.log(kleur.yellow('sudo: password prompt received'));
        finish([config.password]);
      } else {
        finish([]);
      }
    })
    .connect(config);
  });

  await connectionPromise;

  return {
    sftp: conn.sftp.bind(conn),
    script: (scriptContent, onData) => {
      const tempScriptFilename = `/tmp/script_${Date.now()}.sh`;
      const scriptRunner = `
        echo '${scriptContent.replace(/'/g, "'\\''")}' | sudo tee ${tempScriptFilename} > /dev/null &&
        sudo chmod +x ${tempScriptFilename} &&
        ${tempScriptFilename} &&
        sudo rm ${tempScriptFilename}
      `;
      return execRemote(conn, scriptRunner, onData, config, true);
    },
    exec: (command, onData) => execRemote(conn, command, onData, config),
    close: () => {
      return new Promise(resolve => {
        conn.once('close', resolve);
        conn.end()
      });
    }
  };
}

export default createSshConnection;
