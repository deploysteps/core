import kleur from "kleur";
import { sshCopyFile } from "../utils/sshCopyFile.js";

export const copy = (source, destination, options) => async (connection) => {
  console.log(kleur.magenta('tsk:'), 'copy');
  return sshCopyFile(connection, source, destination, options);
};

export default copy;
