import { Connection } from '../utils/createSshConnection.js';
import { CopyOptions, sshCopyFile } from '../utils/sshCopyFile.js';

export const copy = async (connection: Connection, source: string, destination: string, options?: CopyOptions) => {
  await sshCopyFile(connection, source, destination, options);
};

export default copy;
