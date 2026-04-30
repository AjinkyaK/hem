export default {
  preset: "ts-jest/presets/default-esm",
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
  // Allow Jest to transform ESM-only packages pulled in by jsdom
  transformIgnorePatterns: ["node_modules/(?!(@csstools|nwsapi|parse5)/)"],
  extensionsToTreatAsEsm: [".ts"],
  setupFiles: ["dotenv/config"],
  passWithNoTests: true,
  testTimeout: 20_000,
};
