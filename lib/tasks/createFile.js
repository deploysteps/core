import path from 'path';
import kleur from 'kleur'

export const createFile = async (connection, destination, data, options) => {
  options = {
    ...options
  }

  console.log(kleur.cyan('wrt:'), data.slice(0, 10) + '...', '->', destination);
  await connection.exec(`mkdir -p ${path.dirname(destination)}`);

  return new Promise((resolve, reject) => {
    connection.sftp((err, sftp) => {
      if (err) {
        return reject(`Error, problem starting SFTP: ${err.message}`);
      }

      const writeStream = sftp.createWriteStream(destination);

      writeStream.on('error', (err) => {
        reject(Object.assign(new Error(`Error writing remote file`), {
          cause: err,
          destination
        }))
      });

      writeStream.on('close', () => {
        if (!options.chmod) {
          sftp.end();
          resolve(`Uploaded: ${destination}`);
          return;
        }

        sftp.chmod(destination, options.chmod.toString(), (err) => {
          sftp.end();
          if (err) {
            reject(`Error setting file permissions: ${err.message}`);
          } else {
            resolve(`Uploaded: ${destination}`);
          }
        });
      });

      writeStream.write(data);
      writeStream.end();
    });
  });
};

export default createFile;
