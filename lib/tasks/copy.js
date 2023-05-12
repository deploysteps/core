import { sshCopyFile } from '../utils/sshCopyFile.js';

export const copy = async (connection, source, destination, options) => {
  await sshCopyFile(connection, source, destination, options);
};

export default copy;
