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
        let code;
        let signal;

        stream
          .on('data', (data) => {
            if (data.toString().trim() === `[sudo] password for ${config.username}:`) {
              stream.write(`${config.password}\n`);
              return;
            }

            log(kleur.white('out:'), data.toString());
            output += data.toString() || '';
          })

        stream.on('exit', (nCode, nSignal) => {
          stream.end(); // Close the stream on exit
          code = nCode;
          signal = nSignal;
        });

        stream.on('end', () => {
          if (code !== 0) {
            const error = Object.assign(
              new Error('stream ended with none 0 exit code'),
              { code, signal, output }
            );
            reject(error);
            return;
          }
          resolve(output);
        });

        stream.stderr.on('data', function(data) {
          log(kleur.white('err:'), data.toString());
          output += data || '';
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

  const script = (scriptContent, onData, sudo) => {
    const tempScriptFilename = `/tmp/script_${Date.now()}.sh`;
    const scriptRunner = `
      echo '${scriptContent.replace(/'/g, "'\\''")}' | sudo tee ${tempScriptFilename} > /dev/null &&
      sudo chmod +x ${tempScriptFilename} &&
      ${sudo ? 'sudo ' : ''}${tempScriptFilename} &&
      sudo rm ${tempScriptFilename}
    `;
    return execRemote(conn, scriptRunner, onData, config, true);
  };

  return {
    sftp: conn.sftp.bind(conn),
    script: (scriptContent, onData) => script(scriptContent, onData, false),
    sudoScript: (scriptContent, onData) => script(scriptContent, onData, true),
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
