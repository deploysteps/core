import { sshCopyFile } from "../utils/sshCopyFile.js";

export const copy = (source, destination, options) => ({
  name: 'Copy',
  handler: async (connection) => {
    return sshCopyFile(connection, source, destination, options);
  }
});

export default copy;
