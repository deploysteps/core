export const updateDebian = async (connection) => {
  await connection.exec([
    'sudo apt-get -qy update',
    'sudo apt-get -qy upgrade',
    'sudo apt-get -qy autoremove'
  ].join('\n'));
};

export default updateDebian;
