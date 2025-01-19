import fs, { Stats } from 'fs';
import kleur from 'kleur';
import path from 'path';
import { SFTPWrapper } from 'ssh2';
import { Connection } from './createSshConnection.js';

export interface CopyOptions {
  clean?: boolean;
  sudo?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

export async function sshCopyFile(
  connection: Connection,
  source: string,
  destination: string,
  options?: Partial<CopyOptions>
): Promise<void> {
  const defaultOptions: CopyOptions = {
    clean: false,
    sudo: false,
    maxRetries: 3,
    retryDelay: 1000,
    ...options
  };

  if (!connection || !source || !destination) {
    throw new Error('Invalid arguments');
  }

  let sftp: SFTPWrapper;
  try {
    sftp = await new Promise((resolve, reject) => {
      connection.sftp((err, sftp) => {
        if (err) reject(err);
        else resolve(sftp);
      });
    });
  } catch (error) {
    throw new Error(`Failed to create SFTP session: ${(error as Error).message}`);
  }

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const getAllDirectories = (srcPath: string, dirs: string[] = []): string[] => {
    const files = fs.readdirSync(srcPath);
    for (const file of files) {
      const fullPath = path.join(srcPath, file);
      if (fs.lstatSync(fullPath).isDirectory()) {
        dirs.push(fullPath);
        getAllDirectories(fullPath, dirs);
      }
    }
    return dirs;
  };

  const isDeepest = (dir: string, dirs: string[]): boolean => {
    return dirs.every((otherDir) => !otherDir.startsWith(dir) || otherDir === dir);
  };

  const uploadFile = async (sourceFile: string, destinationFile: string): Promise<string> => {
    if (defaultOptions.sudo) {
      return uploadFileWithSudo(sourceFile, destinationFile);
    } else {
      console.log(kleur.cyan('upl:'), sourceFile, '->', destinationFile);
      return uploadFileDirectly(sourceFile, destinationFile);
    }
  };

  const uploadFileDirectly = async (
    sourceFile: string,
    destinationFile: string,
    retryCount = 0
  ): Promise<string> => {
    try {
      return await new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(sourceFile);
        const writeStream = sftp.createWriteStream(destinationFile);

        readStream.on('error', (err: Error) => {
          reject(new Error(`Error reading local file: ${err.message}`));
        });

        writeStream.on('error', (err: Error) => {
          reject(new Error(`Error writing remote file: ${err.message}`));
        });

        writeStream.on('close', () => {
          const sourceFileMode = fs.statSync(sourceFile).mode;
          sftp.chmod(destinationFile, sourceFileMode, (err) => {
            if (err) {
              reject(new Error(`Error setting file permissions: ${err.message}`));
            } else {
              resolve(`Uploaded: ${sourceFile} -> ${destinationFile}`);
            }
          });
        });

        readStream.pipe(writeStream);
      });
    } catch (error) {
      if (retryCount < defaultOptions.maxRetries!) {
        console.log(kleur.yellow(`Retrying upload (${retryCount + 1}/${defaultOptions.maxRetries}): ${sourceFile}`));
        await sleep(defaultOptions.retryDelay!);
        return uploadFileDirectly(sourceFile, destinationFile, retryCount + 1);
      }
      throw error;
    }
  };

  const uploadFileWithSudo = async (sourceFile: string, destinationFile: string): Promise<string> => {
    const tempPath = `/tmp/${path.basename(sourceFile)}_${Date.now()}`;
    console.log(kleur.cyan('upl:'), sourceFile, '->', tempPath, '->', destinationFile);
    try {
      await uploadFileDirectly(sourceFile, tempPath);
      await connection.exec(`sudo mv ${tempPath} ${destinationFile}`);
      return `Uploaded: ${sourceFile} -> ${destinationFile}`;
    } catch (error) {
      console.error(kleur.red(`Error uploading file with sudo: ${(error as Error).message}`));
      throw error;
    }
  };

  const uploadDirectory = async (sourceDir: string, destinationDir: string): Promise<void> => {
    const directories = getAllDirectories(sourceDir);
    const deepestDirectories = directories.filter((dir) => isDeepest(dir, directories));
    const remoteDirectories = deepestDirectories.map((dir) =>
      path.join(destination, path.relative(source, dir))
    );

    try {
      if (remoteDirectories.length === 0) {
        await connection.exec(`${defaultOptions.sudo ? 'sudo ' : ''}mkdir -p ${destinationDir}`);
      } else {
        await connection.exec(`${defaultOptions.sudo ? 'sudo ' : ''}mkdir -p ${remoteDirectories.join(' ')}`);
      }

      const files = fs.readdirSync(sourceDir);
      const uploadPromises = files.map(async (file) => {
        const srcPath = path.join(sourceDir, file);
        const destPath = `${destinationDir}/${file}`;

        if (fs.lstatSync(srcPath).isDirectory()) {
          return uploadDirectory(srcPath, destPath);
        } else {
          return uploadFile(srcPath, destPath);
        }
      });

      await Promise.all(uploadPromises);
    } catch (error) {
      console.error(kleur.red(`Error uploading directory: ${(error as Error).message}`));
      throw error;
    }
  };

  try {
    if (fs.lstatSync(source).isDirectory()) {
      if (defaultOptions.clean) {
        await connection.exec(`${defaultOptions.sudo ? 'sudo ' : ''}rm -rf ${destination}`);
      }
      await uploadDirectory(source, destination);
    } else {
      await connection.exec(`${defaultOptions.sudo ? 'sudo ' : ''}mkdir -p ${path.dirname(destination)}`);
      await uploadFile(source, destination);
    }
  } catch (error) {
    console.error(kleur.red(`Error in sshCopyFile: ${(error as Error).message}`));
    throw error;
  } finally {
    if (sftp) {
      (sftp as SFTPWrapper).end();
    }
  }
}
