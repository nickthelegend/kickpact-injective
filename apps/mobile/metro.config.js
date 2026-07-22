// Metro config — standalone Expo app (own flat node_modules).
const { getDefaultConfig } = require("expo/metro-config")

const config = getDefaultConfig(__dirname)

// Metro resolves package `exports` maps with the conditions
// ["require", "import", "react-native"] — no "browser". Libraries that ship a
// node build *and* a browser build (jose, pulled in by @privy-io/js-sdk-core)
// therefore land on the node one and try to `require("crypto")`, which doesn't
// exist on Hermes. Adding "browser" hands us the build that's actually
// shippable on a phone. Key order inside each package's own exports map still
// decides the winner, so "react-native" keeps precedence wherever a package
// offers both.
config.resolver.unstable_conditionNames = ["require", "import", "react-native", "browser"]

module.exports = config
