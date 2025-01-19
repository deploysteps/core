import { Client, ClientChannel, SFTPWrapper, KeyboardInteractiveCallback, ConnectConfig, PseudoTtyOptions } from 'ssh2';
import otplib from 'otplib';
import kleur from 'kleur';

interface KeyboardInteractivePrompt {
  prompt: string;
  echo?: boolean;
}

type OnDataCallback = ((data: string) => void) | undefined;

interface WindowSize {
  rows: number;
  columns: number;
}

interface SshError extends Error {
  code?: number;
  signal?: string;
  output?: string;
}

type Config = ConnectConfig & {
  otpSecret?: string;
  password: string;
};

type ExecOptions = {
  env?: Record<string, string>;
};

const log = (prefix: string, line: string) => {
  const lines = line
    .toString()
    .split('\n')
    .filter((l) => l.trim() !== '');

  lines.forEach((l) => {
    console.log(prefix, l);
  });
};

function handleSudoPrompt(stream: ClientChannel, data: Buffer, config: Config): boolean {
  if (data.toString().trim() === `[sudo] password for ${config.username}:`) {
    stream.write(`${config.password}\n`);
    return true;
  }

  return false;
}

async function execRemote(
  conn: Client,
  command: string,
  onData: OnDataCallback,
  config: Config,
  silent = false
): Promise<string> {
  if (!silent) {
    log(kleur.cyan('inp:'), command.trim());
  }

  return new Promise((resolve, reject) => {
    conn.exec(command, { pty: true }, (err: Error | undefined, stream: ClientChannel) => {
      if (err) {
        reject(err);
        return;
      }

      let output = '';

      stream.on('data', (data: Buffer) => {
        if (!handleSudoPrompt(stream, data, config)) {
          const dataStr = data.toString();
          log(kleur.white('out:'), dataStr);
          output += dataStr;
        }
      });

      stream.stderr.on('data', (data: Buffer) => {
        log(kleur.white('err:'), data.toString());
        output += data.toString();
      });

      stream.on('exit', (code: number | null, signal: string | null) => {
        if (code !== 0) {
          const err = new Error(`stream ended with non-zero exit code: ${code}, signal: ${signal}`) as SshError;
          err.code = code ?? undefined;
          err.signal = signal ?? undefined;
          err.output = output;
          reject(err);
        } else {
          resolve(output);
        }
      });
    });
  });
}

export type Connection = {
  sftp: (callback: (err: Error | undefined, sftp: SFTPWrapper) => void) => void;
  conn: Client;
  interactive: (sudo: boolean) => void;
  script: (scriptContent: string, onData?: OnDataCallback) => Promise<string>;
  sudoScript: (scriptContent: string, onData?: OnDataCallback) => Promise<string>;
  exec: (
    command: string,
    optionsOrOnData?: ExecOptions | OnDataCallback,
    onData?: OnDataCallback
  ) => Promise<string>;
  close: () => Promise<void>;
};

export async function createSshConnection({
  host,
  username,
  port = 22,
  privateKey,
  otpSecret,
  password,
}: Config): Promise<Connection> {
  const config: Config = {
    host,
    port,
    username,
    password,
    privateKey,
    tryKeyboard: true,
  };

  const otp = otpSecret && otplib.authenticator.generate(otpSecret);
  const conn = new Client();
  const connectionPromise = new Promise<Client>((resolve, reject) => {
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
    .on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish: KeyboardInteractiveCallback) => {
      if (prompts.length > 0 && prompts[0].prompt.toLowerCase().includes('verification')) {
        console.log(kleur.yellow('otp: prompt received'));
        if (!otp) {
          console.error(kleur.red('otp: secret not provided'));
          finish([]);
          return;
        }
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

  const script = async (scriptContent: string, onData?: OnDataCallback, sudo?: boolean) => {
    const tempScriptFilename = `/tmp/script_${Date.now()}.sh`;
    const scriptRunner = `
      echo '${scriptContent.replace(/'/g, "'\\''")}' | sudo tee ${tempScriptFilename} > /dev/null &&
      sudo chmod +x ${tempScriptFilename} &&
      ${sudo ? 'sudo ' : ''}${tempScriptFilename} &&
      sudo rm ${tempScriptFilename}
    `;
    return execRemote(connObj, scriptRunner, onData, config, true);
  };

  const interactive = (sudo: boolean): void => {
    const rows = process.stdout.rows || 24;
    const cols = process.stdout.columns || 80;

    const shellOptions: PseudoTtyOptions = {
      term: 'xterm-256color',
      rows,
      cols
    };

    conn.shell(shellOptions, (err: Error | undefined, stream: ClientChannel) => {
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
        process.stdin.setRawMode(oldRawMode || false);
        process.stdin.pause();
      });

      // Handle window resizing
      process.stdout.on('resize', () => {
        const size: WindowSize = {
          rows: process.stdout.rows || 24,
          columns: process.stdout.columns || 80
        };
        // @ts-ignore
        stream.setWindow(size.rows, size.columns);
      });
    });
  };

  return {
    sftp: connObj.sftp.bind(connObj),
    conn: connObj,
    interactive,
    script: (scriptContent: string, onData?: OnDataCallback) => script(scriptContent, onData, false),
    sudoScript: (scriptContent: string, onData?: OnDataCallback) => script(scriptContent, onData, true),
    exec: (
      command: string,
      optionsOrOnData?: ExecOptions | OnDataCallback,
      onData?: OnDataCallback
    ) => {
      if (typeof optionsOrOnData === 'function') {
        onData = optionsOrOnData;
        optionsOrOnData = {};
      }

      let envString = '';
      if (optionsOrOnData && 'env' in optionsOrOnData) {
        for (const [key, value] of Object.entries(optionsOrOnData?.env || {})) {
          envString += `${key}='${value}' `;
        }
      }

      const fullCommand = `${envString}${command}`;

      return execRemote(connObj, fullCommand, onData, config);
    },
    close: () => {
      return new Promise<void>(resolve => {
        connObj.once('close', resolve);
        connObj.end();
      });
    },
  };
}

export default createSshConnection;
