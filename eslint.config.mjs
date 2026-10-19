import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/**", "functions/node_modules/**", "functions/lib/**", "web/dist/**", "dist/**"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
