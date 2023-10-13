export const updateDebian = async (connection) => {
  await connection.exec([
    'DEBIAN_FRONTEND=noninteractive sudo apt-get -qy update',
    'DEBIAN_FRONTEND=noninteractive sudo apt-get -qy upgrade',
    'DEBIAN_FRONTEND=noninteractive sudo apt-get -qy autoremove'
  ].join('\n'));
};

export default updateDebian;
