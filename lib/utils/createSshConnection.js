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

function handleSudoPrompt(stream, data, config) {
  if (data.toString().trim() === `[sudo] password for ${config.username}:`) {
    stream.write(`${config.password}\n`);
    return true;
  }

  return false;
}

async function execRemote(conn, command, onData, config, silent = false) {
  if (!silent) {
    log(kleur.cyan('inp:'), command.trim());
  }

  return new Promise((resolve, reject) => {
    conn.exec(command, { pty: true }, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }

      let output = '';
      let exitCode;

      stream.on('data', (data) => {
        if (!handleSudoPrompt(stream, data, config)) {
          const dataStr = data.toString();
          log(kleur.white('out:'), dataStr);
          output += dataStr;
        }
      });

      stream.stderr.on('data', (data) => {
        log(kleur.white('err:'), data.toString());
        output += data.toString();
      });

      stream.on('exit', (code, signal) => {
        if (code !== 0) {
          const err = new Error(`stream ended with non-zero exit code: ${code}, signal: ${signal}`);
          err.code = code;
          err.signal = signal;
          err.output = output;
          reject(err);
        } else {
          resolve(output);
        }
      });
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
      resolve(conn);
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

  const connObj = await connectionPromise;

  const script = async (scriptContent, onData, sudo) => {
    const tempScriptFilename = `/tmp/script_${Date.now()}.sh`;
    const scriptRunner = `
      echo '${scriptContent.replace(/'/g, "'\\''")}' | sudo tee ${tempScriptFilename} > /dev/null &&
      sudo chmod +x ${tempScriptFilename} &&
      ${sudo ? 'sudo ' : ''}${tempScriptFilename} &&
      sudo rm ${tempScriptFilename}
    `;
    return execRemote(connObj, scriptRunner, onData, config, true);
  };

  const interactive = (sudo) => {
    const rows = process.stdout.rows;
    const cols = process.stdout.columns;

    conn.shell({ term: 'xterm-256color', rows, cols }, (err, stream) => {
      if (err) throw err;

      stream.on('close', () => {
        conn.end();
      });

      if (sudo) {
        stream.write('sudo echo "Entering sudo password"\n');
        stream.write(password + '\n');
      }

      stream.pipe(process.stdout);

      const oldRawMode = process.stdin.isRaw;
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.pipe(stream);

      stream.on('end', () => {
        process.stdin.setRawMode(oldRawMode);
        process.stdin.pause();
      });

      // Handle window resizing
      process.stdout.on('resize', () => {
        stream.setWindow(process.stdout.rows, process.stdout.columns);
      });
    });
  };

  return {
    sftp: connObj.sftp.bind(connObj),
    conn: connObj,
    interactive,
    script: (scriptContent, onData) => script(scriptContent, onData, false),
    sudoScript: (scriptContent, onData) => script(scriptContent, onData, true),
    exec: (command, optionsOrOnData, onData) => {
      if (typeof optionsOrOnData === 'function') {
        onData = optionsOrOnData;
        optionsOrOnData = {};
      }

      let envString = '';
      if (optionsOrOnData?.env) {
        for (const [key, value] of Object.entries(optionsOrOnData.env)) {
          envString += `${key}='${value}' `;
        }
      }

      const fullCommand = `${envString}${command}`;

      return execRemote(connObj, fullCommand, onData, config);
    },
    close: () => {
      return new Promise(resolve => {
        connObj.once('close', resolve);
        connObj.end();
      });
    },
  };
}

export default createSshConnection;
