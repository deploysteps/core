import { Connection } from "../utils/createSshConnection.js";

export const createDirectory = async (connection: Connection, name: string, options: { sudo: Boolean }) => {
  options = {
    ...{ sudo: false },
    ...options
  };

  await connection.exec(`${options.sudo ? 'sudo ' : ''}mkdir -p ${name}`);
}

export default createDirectory;
