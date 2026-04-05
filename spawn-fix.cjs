const childProcess = require("node:child_process");

const originalSpawn = childProcess.spawn;

childProcess.spawn = function patchedSpawn(command, args, options = {}) {
  return originalSpawn(command, args, {
    ...options,
    windowsHide: false,
  });
};
