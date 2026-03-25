exports.default = async function windowsNoopSign(context) {
  const targetPath = context && typeof context.path === "string" ? context.path : "unknown";
  console.log(`windows signing skipped for ${targetPath}`);
};
