/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("path");
const packageJson = require("./package.json");

function getEnv(name) {
  const value = process.env[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getNumericBuildVersion(version) {
  const [coreVersion] = String(version || "1.0.0").split("-", 1);
  const segments = coreVersion
    .split(".")
    .map((segment) => Number.parseInt(segment, 10))
    .map((segment) => (Number.isFinite(segment) ? segment : 0));

  while (segments.length < 4) {
    segments.push(0);
  }

  return segments.slice(0, 4).join(".");
}

function formatDisplayVersion(version) {
  return String(version || "1.0.0")
    .trim()
    .replace(/-beta(?:\.\d+)?$/i, "b");
}

function getAzureSignOptions() {
  const publisherName = getEnv("AZURE_TRUSTED_SIGNING_PUBLISHER_NAME");
  const endpoint = getEnv("AZURE_TRUSTED_SIGNING_ENDPOINT");
  const certificateProfileName = getEnv("AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME");
  const codeSigningAccountName = getEnv("AZURE_TRUSTED_SIGNING_ACCOUNT_NAME");

  if (!publisherName || !endpoint || !certificateProfileName || !codeSigningAccountName) {
    return null;
  }

  return {
    publisherName,
    endpoint,
    certificateProfileName,
    codeSigningAccountName,
  };
}

function hasWindowsSigningConfig() {
  return Boolean(
    getEnv("CSC_LINK") ||
      getEnv("WIN_CSC_LINK") ||
      getEnv("CSC_NAME") ||
      getEnv("WIN_CSC_KEY_PASSWORD") ||
      getEnv("CSC_KEY_PASSWORD")
  );
}

const baseBuild = packageJson.build || {};
const baseWin = baseBuild.win || {};
const baseMac = baseBuild.mac || {};
const azureSignOptions = getAzureSignOptions();
const hasWindowsSigning = hasWindowsSigningConfig() || Boolean(azureSignOptions);
const numericBuildVersion = getNumericBuildVersion(packageJson.version);
const displayVersion = formatDisplayVersion(packageJson.version);
const productName = String(baseBuild.productName || packageJson.productName || packageJson.name || "Note");

module.exports = {
  ...baseBuild,
  buildVersion: numericBuildVersion,
  win: {
    ...baseWin,
    artifactName: `${productName}-Setup-${displayVersion}-\${arch}.\${ext}`,
    ...(azureSignOptions
      ? { azureSignOptions }
      : hasWindowsSigning
        ? {}
        : {
            signtoolOptions: {
              sign: path.join(__dirname, "scripts", "windows-noop-sign.cjs"),
            },
          }),
  },
  mac: {
    ...baseMac,
    artifactName: `${productName}-${displayVersion}-mac-\${arch}.\${ext}`,
  },
};
