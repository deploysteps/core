import kleur from "kleur";

export const updateDebian = () => async (connection) => {
  console.log(kleur.magenta('tsk:'), 'updateDebian');
  await connection.exec(`
    sudo apt-get -qy update
    sudo apt-get -qy upgrade
    sudo apt-get -qy autoremove
  `);
};

export default updateDebian;
