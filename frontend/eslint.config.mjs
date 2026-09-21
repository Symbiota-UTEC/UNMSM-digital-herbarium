import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["build/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-useless-assignment": "warn",
      // Se irá endureciendo; hoy hay muchos `any` heredados.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Las llamadas HTTP viven en src/services/. AuthContext es la única excepción: define `apiFetch`.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/services/**", "src/contexts/AuthContext.tsx"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "No llames a fetch aquí: crea o reutiliza un método en src/services/." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='apiFetch']",
          message: "No llames a apiFetch aquí: usa un servicio de src/services/ (pásale apiFetch como argumento).",
        },
      ],
    },
  },
);
