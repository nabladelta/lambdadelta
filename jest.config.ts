export default {
    moduleFileExtensions: ["ts", "tsx", "js"],
    transform: {},
    testMatch: [
      "**/tests/**/*.spec.ts",
      "**/tests/**/*.test.ts",
    ],
    testEnvironment: "node",
    setupFiles: ['dotenv/config'],
}