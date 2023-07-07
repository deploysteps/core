export const createDirectory = async (connection, name, options) => {
  options = {
    sudo: false,
    ...options
  };

  await connection.exec(`${options.sudo && 'sudo '}mkdir -p ${name}`);
}

export default createDirectory;
