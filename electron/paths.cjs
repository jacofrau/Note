const os = require("os");
const path = require("path");

function getFallbackAppDataDir(platform = process.platform) {
  switch (platform) {
    case "darwin":
      return path.join(os.homedir(), "Library", "Application Support");
    case "win32":
      return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    default:
      return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  }
}

function getNamedAppDataDir(appName, platform = process.platform) {
  return path.join(getFallbackAppDataDir(platform), appName);
}

module.exports = {
  getFallbackAppDataDir,
  getNamedAppDataDir,
};
