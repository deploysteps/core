import fs from 'fs';
import kleur from 'kleur';
import path from 'path';

export async function sshCopyFile(connection, source, destination, options) {
  options = {
    clean: false,
    sudo: false,
    ...options
  };

  if (!connection || !source || !destination) {
    throw new Error('Invalid arguments');
  }

  const getAllDirectories = (srcPath, dirs = []) => {
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

  const isDeepest = (dir, dirs) => {
    return dirs.every((otherDir) => !otherDir.startsWith(dir) || otherDir === dir);
  };

  const uploadFile = async (sourceFile, destinationFile) => {
    console.log(kleur.cyan('upl:'), sourceFile, '->', destinationFile);

    if (options.sudo) {
      return uploadFileWithSudo(sourceFile, destinationFile);
    } else {
      return uploadFileDirectly(sourceFile, destinationFile);
    }
  };

  const uploadFileDirectly = async (sourceFile, destinationFile) => {
    return new Promise((resolve, reject) => {
      connection.sftp((err, sftp) => {
        if (err) {
          return reject(`Error, problem starting SFTP: ${err.message}`);
        }

        const readStream = fs.createReadStream(sourceFile);
        const writeStream = sftp.createWriteStream(destinationFile);

        readStream.on('error', (err) => {
          reject(`Error reading local file: ${err.message}`);
        });

        writeStream.on('error', (err) => {
          reject(Object.assign(new Error(`Error writing remote file`), {
            cause: err,
            sourceFile,
            destinationFile
          }));
        });

        writeStream.on('close', () => {
          const sourceFileMode = fs.statSync(sourceFile).mode;
          sftp.chmod(destinationFile, sourceFileMode, (err) => {
            sftp.end();
            if (err) {
              reject(`Error setting file permissions: ${err.message}`);
            } else {
              resolve(`Uploaded: ${sourceFile} -> ${destinationFile}`);
            }
          });
        });

        readStream.pipe(writeStream);
      });
    });
  };

  const uploadFileWithSudo = async (sourceFile, destinationFile) => {
    const tempPath = `/tmp/${path.basename(sourceFile)}_${Date.now()}`;

    try {
      await uploadFileDirectly(sourceFile, tempPath);
      console.log(kleur.green(`Temporary file created: ${tempPath}`));

      await connection.exec(`sudo mv ${tempPath} ${destinationFile}`);

      return `Uploaded: ${sourceFile} -> ${destinationFile}`;
    } catch (error) {
      console.error(kleur.red(`Error uploading file with sudo: ${error.message}`));
      throw error;
    }
  };

  const uploadDirectory = async (sourceDir, destinationDir) => {
    const directories = getAllDirectories(sourceDir);

    const deepestDirectories = directories.filter((dir) => isDeepest(dir, directories));
    const remoteDirectories = deepestDirectories.map((dir) =>
      path.join(destination, path.relative(source, dir))
    );

    try {
      if (remoteDirectories.length === 0) {
        await connection.exec(`${options.sudo ? 'sudo ' : ''}mkdir -p ${destinationDir}`);
      } else {
        await connection.exec(`${options.sudo ? 'sudo ' : ''}mkdir -p ${remoteDirectories.join(' ')}`);
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
      console.error(kleur.red(`Error uploading directory: ${error.message}`));
      throw error;
    }
  };

  try {
    if (fs.lstatSync(source).isDirectory()) {
      if (options.clean) {
        await connection.exec(`${options.sudo ? 'sudo ' : ''}rm -rf ${destination}`);
      }
      await uploadDirectory(source, destination);
    } else {
      await connection.exec(`${options.sudo ? 'sudo ' : ''}mkdir -p ${path.dirname(destination)}`);
      await uploadFile(source, destination);
    }
    console.log(kleur.green(`Successfully copied ${source} to ${destination}`));
  } catch (error) {
    console.error(kleur.red(`Error in sshCopyFile: ${error.message}`));
    throw error;
  }
}
