# Especificacion: i18n checker con Oxc

Fecha: 2026-06-07

## Proposito

Construir un checker de traducciones para proyectos JS/TS usando Oxc como base
de analisis estatico. El producto debe superar el enfoque regex del checker
actual y organizarse como monorepo con un core agnostico, paquetes especificos
por libreria y un CLI comun con subcomandos.

Esta especificacion debe guiar la implementacion. Si una decision no esta aqui,
la IA debe actualizar la spec antes de implementar.

## Principios obligatorios

- SDD obligatorio: cada cambio funcional debe estar descrito en esta spec o en
  una spec derivada antes de tocar codigo.
- TDD obligatorio: toda funcionalidad nueva debe empezar con tests que fallen.
- No se acepta codigo sin tests correspondientes.
- Todo bug corregido debe anadir primero un test de regresion.
- La implementacion debe ser conservadora: si una key no se puede resolver con
  seguridad, debe reportarse como unresolved o ignorarse segun regla explicita,
  nunca adivinarse.
- No copiar arquitectura interna del checker CSS Modules. Ese proyecto solo
  sirve como referencia de tooling y como senal de viabilidad tecnica de Oxc.
- No arrastrar configuraciones del checker regex anterior.

## Non-goals iniciales

No implementar en el scope inicial:

- Plugin ESLint/Oxlint.
- Soporte multi-libreria en un mismo proyecto/run.
- API publica generica con `libraries`.
- Funciones publicas tipo `checkI18nextTranslations`.
- Wrappers publicos de conveniencia sobre las clases.
- `ignoredKeys`.
- `customRegExpToFindKeys`.
- `deepSearch`.
- Reglas de sintaxis ICU/Lingui/i18next.
- Validacion de placeholders entre idiomas.
- `duplicate-translation-key`.
- `invalid-message-syntax`.
- `inconsistent-placeholders`.
- `unused-namespace`.
- `missing-default-message`.

## Paquete tecnologico

Lenguaje y runtime:

- TypeScript.
- ESM.
- Node.js >= 22.12.0, alineado con el proyecto CSS Modules.

Workspace y build:

- pnpm workspace.
- tsup para build ESM y `.d.ts`.
- tsconfig compartido para paquetes.

Analisis:

- `oxc-parser` para JS/JSX/TS/TSX.
- `oxc-resolver` cuando un paquete necesite resolver imports reales.
- No usar regex como motor principal de deteccion de usos.

Calidad:

- Vitest para tests.
- Coverage con provider `v8`.
- oxlint para lint.
- oxfmt para formato.

## Monorepo y pnpm workspaces

El proyecto debe ser un monorepo gestionado con pnpm workspaces. Un monorepo
permite publicar y testear varios paquetes relacionados desde un unico repo,
compartiendo tooling, TypeScript config, Vitest config, lockfile y scripts.

La raiz del repo debe contener:

```text
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
tsconfig.base.json
tsconfig.json
vitest.config.ts
oxlint.config.ts
oxfmt.config.ts
packages/
```

### `pnpm-workspace.yaml`

La configuracion debe declarar cada paquete explicitamente. No usar un glob
amplio tipo `packages/*` en la spec inicial, para que anadir un paquete sea una
decision consciente.

Configuracion base:

```yaml
packages:
  - packages/core
  - packages/i18next
  - packages/intlayer
  - packages/paraglide
  - packages/formatjs
  - packages/lingui
  - packages/cli

catalog:
  oxc-parser: ^0.134.0
  oxc-resolver: ^11.20.0

savePrefix: ''
engineStrict: true
pmOnFail: error
strictPeerDependencies: true
minimumReleaseAge: 4320
minimumReleaseAgeStrict: true
minimumReleaseAgeIgnoreMissingTime: false
trustPolicy: no-downgrade
trustPolicyIgnoreAfter: 43200
blockExoticSubdeps: true
ignoreScripts: true
strictDepBuilds: true
sideEffectsCache: false
enablePrePostScripts: false

allowBuilds:
  esbuild: true
```

Notas:

- Mantener `oxc-parser` y `oxc-resolver` en `catalog` para que todos los
  paquetes usen la misma version.
- Anadir otras dependencias compartidas al `catalog` solo cuando varios paquetes
  las usen.
- Mantener `ignoreScripts: true` por defecto.
- Mantener `engineStrict: true`.

### `package.json` raiz

La raiz debe ser privada y definir el package manager:

```json
{
  "name": "@stale-i18n/monorepo",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.4.0",
  "workspaces": [
    "packages/core",
    "packages/i18next",
    "packages/intlayer",
    "packages/paraglide",
    "packages/formatjs",
    "packages/lingui",
    "packages/cli"
  ],
  "scripts": {
    "build": "pnpm -r build",
    "format": "pnpm -r format",
    "format:check": "pnpm -r format:check",
    "lint": "pnpm -r lint",
    "lint:fix": "pnpm -r lint:fix",
    "test": "vitest run --coverage",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "@types/node": "24.12.4",
    "@vitest/coverage-v8": "4.1.7",
    "oxfmt": "0.53.0",
    "oxlint": "1.68.0",
    "oxlint-tsgolint": "0.23.0",
    "tsup": "8.5.1",
    "typescript": "6.0.3",
    "vitest": "4.1.7"
  },
  "engines": {
    "node": ">=22.12.0"
  }
}
```

Versiones exactas pueden actualizarse durante implementacion si la spec se
actualiza antes. No cambiar Node major, package manager ni runner de tests sin
actualizar la spec.

### Paquete interno

Cada paquete debe tener su propio `package.json`, `tsconfig.json`,
`tsup.config.ts`, `src/` y `tests/`.

Reglas de estructura:

- `src/index.ts` debe ser la superficie publica del paquete y reexportar desde
  ficheros internos. No concentrar toda la implementacion en `index.ts`.
- `src/index.ts` no debe usar `export *` en paquetes publicos. Debe listar de
  forma explicita los tipos, constantes y funciones que forman la API publica.
- Los demas paquetes del monorepo solo pueden importar desde el entrypoint
  publico del paquete, por ejemplo `@stale-i18n/core`. No deben importar desde
  `@stale-i18n/core/*`, `packages/core/src/*` ni rutas relativas hacia otro
  paquete.
- La API publica debe ser pequena, legible y estable: contratos, tipos de
  diagnostico, reglas tipadas y helpers compartidos justificados. Las utilidades
  internas de implementacion no deben escaparse por `index.ts`.
- Separar por funcionalidad: tipos, reglas, diagnosticos, parser/AST, catalogos,
  comparacion, checker, CLI parser y reporters deben vivir en ficheros propios
  cuando existan.
- Cada paquete debe tener `tests/unit/` y `tests/uses/`.
- `tests/unit/` contiene tests unitarios pequenos de funciones o modulos
  internos.
- `tests/uses/` contiene tests de uso final del programa desde la API publica
  del paquete. En paquetes de libreria deben simular proyectos reales pequenos
  con ficheros TS/TSX/JS y catalogos JSON/declaraciones de traduccion.
- Los tests de `uses` deben instanciar solo APIs publicas del paquete, por
  ejemplo `new I18nextChecker(...)`, y no importar modulos internos.
- `tests/uses/` no debe tener una carpeta intermedia llamada `fixtures`.
- Cada carpeta dentro de `tests/uses/` debe ser un caso de uso final completo
  con codigo fuente real en disco, catalogos/declaraciones reales y, cuando
  ayude, `expected.json`.
- Cada caso de uso debe tener un `expected.json` en su raiz. El test runner debe
  poder iterar las carpetas de `tests/uses` de arriba a abajo y ejecutar cada
  caso sin codificar expectativas en el propio test.
- `expected.json` puede declarar:
  - `options`: overrides relativos al directorio del caso (`target`,
    `catalogs`, `rules`, etc.).
  - `result`: expectativas de `status`, `filesChecked`, `catalogsChecked` y
    diagnosticos esperados.
  - `api`: `sync` por defecto o `async` para ejecutar `check()` y probar la API
    publica asincrona.
  - `ruleLevels`: cuando el caso existe para probar una regla en `off`,
    `warning` y `error`.
- Los tests de `uses` no deben construir el codigo fuente principal con strings
  inline en el test ni escribir proyectos temporales para los casos nominales.
  Pueden crear temporales solo cuando el comportamiento a probar sea
  especificamente de filesystem o configuracion dinamica.
- Todos los nombres de ficheros deben usar kebab-case, sin excepcion para
  componentes React. Ejemplos validos: `app.tsx`, `source-analysis.ts`,
  `i18next-api.test.ts`, `raw-ui-text.test.ts`. Ejemplos no validos: `App.tsx`,
  `ReactI18nextChecker.ts`, `sourceAnalysis.ts`.

Ejemplo para `packages/core/package.json`:

```json
{
  "name": "@stale-i18n/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "files": ["dist"],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsup --config ./tsup.config.ts",
    "format": "oxfmt .",
    "format:check": "oxfmt --check .",
    "lint": "oxlint .",
    "lint:fix": "oxlint --fix .",
    "test": "vitest run --root ../.. --project core",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "oxc-parser": "catalog:",
    "oxc-resolver": "catalog:"
  },
  "engines": {
    "node": ">=22.12.0"
  }
}
```

Paquetes publicos de libreria deben depender de `@stale-i18n/core` con
`workspace:*`. Ejemplo:

```json
{
  "dependencies": {
    "@stale-i18n/core": "workspace:*"
  }
}
```

### Configuracion `tsup`

Cada paquete debe usar ESM, dts y plataforma Node:

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "./src/index.ts"
  },
  outDir: "dist",
  format: ["esm"],
  dts: true,
  clean: true,
  platform: "node",
  target: "es2022",
  skipNodeModulesBundle: true,
  tsconfig: "tsconfig.json"
});
```

### Configuracion `oxlint`

La raiz debe tener `oxlint.config.ts`. Tomar como referencia el proyecto CSS
Modules, pero adaptar ignores al nuevo monorepo.

Configuracion base:

```ts
import { defineConfig } from "oxlint";

export default defineConfig({
  categories: {
    correctness: "error",
    suspicious: "error"
  },
  env: {
    builtin: true,
    node: true,
    vitest: true
  },
  ignorePatterns: [
    "dist",
    "node_modules",
    "coverage",
    "**/dist/**",
    "**/tests/uses/**/invalid-source/**",
    "**/tests/uses/**/invalid-catalog/**"
  ],
  options: {
    typeAware: true
  },
  plugins: ["eslint", "typescript", "oxc", "import", "node", "vitest"],
  rules: {
    "typescript/no-unsafe-type-assertion": "off"
  },
  overrides: [
    {
      files: ["**/*.test.ts", "**/tests/**/*.ts"],
      rules: {
        "typescript/no-unsafe-type-assertion": "off"
      }
    }
  ]
});
```

Reglas:

- Mantener `correctness` y `suspicious` como `error`.
- Mantener `typeAware: true`.
- No ignorar `src/`.
- Solo ignorar casos de uso intencionadamente invalidos cuando sean necesarios
  para probar parse errors.
- Si se anade un ignore nuevo, debe estar justificado por un test fixture o por
  output generado.

### Configuracion `oxfmt`

La raiz debe tener `oxfmt.config.ts`.

Configuracion base:

```ts
import { defineConfig } from "oxfmt";

export default defineConfig({
  ignorePatterns: [
    "dist",
    "node_modules",
    "coverage",
    "**/dist/**",
    "**/tests/uses/**/invalid-source/**",
    "**/tests/uses/**/invalid-catalog/**"
  ],
  printWidth: 100,
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: "none"
});
```

Reglas:

- Usar comillas dobles.
- Usar punto y coma.
- `printWidth: 100`.
- `tabWidth: 2`.
- `trailingComma: "none"`.
- No formatear casos invalidos que existan precisamente para probar errores de
  parseo.

## Referencia de Vitest

Tomar como referencia la configuracion del proyecto
`C:\Users\Ivan\Desktop\Projects\css-modules-class-checker\vitest.config.ts`.

El nuevo repo debe usar un patron equivalente:

- `defineConfig` desde `vitest/config`.
- `resolve.alias` apuntando a `packages/*/src/index.ts` para testear fuente, no
  builds antiguos.
- `test.projects` con un proyecto por paquete.
- `exclude: ["**/*.d.ts"]`.
- `coverage.provider: "v8"`.
- `coverage.include: ["packages/*/src/**/*.ts"]`.
- `coverage.exclude: ["**/*.d.ts", "**/dist/**", "**/*.config.ts"]`.
- `coverage.reportsDirectory: "coverage"`.
- `coverage.reporter: ["text", "json", "lcovonly", "html"]`.

Ejemplo orientativo:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@stale-i18n/core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url)
      ),
      "@stale-i18n/i18next": fileURLToPath(
        new URL("./packages/i18next/src/index.ts", import.meta.url)
      ),
      "@stale-i18n/cli": fileURLToPath(
        new URL("./packages/cli/src/index.ts", import.meta.url)
      )
    }
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "core",
          include: [
            "packages/core/tests/unit/**/*.test.ts",
            "packages/core/tests/uses/**/*.test.ts"
          ]
        }
      },
      {
        extends: true,
        test: {
          name: "i18next",
          include: [
            "packages/i18next/tests/unit/**/*.test.ts",
            "packages/i18next/tests/uses/**/*.test.ts"
          ]
        }
      },
      {
        extends: true,
        test: {
          name: "cli",
          include: [
            "packages/cli/tests/unit/**/*.test.ts",
            "packages/cli/tests/uses/**/*.test.ts"
          ]
        }
      }
    ],
    exclude: ["**/*.d.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["**/*.d.ts", "**/dist/**", "**/*.config.ts"],
      reportsDirectory: "coverage",
      reporter: ["text", "json", "lcovonly", "html"]
    }
  }
});
```

## Arquitectura

### Monorepo

Estructura de producto:

```text
packages/
  core/
  i18next/
  intlayer/
  paraglide/
  formatjs/
  lingui/
  cli/
```

Fase inicial obligatoria:

- `core`
- `i18next`
- `cli`

Fases posteriores:

- `intlayer`
- `paraglide`
- `formatjs`
- `lingui`

### Core

El core es agnostico de librerias. No debe conocer i18next, Intlayer,
Paraglide, FormatJS ni Lingui.

Responsabilidades del core:

- Definir contratos publicos compartidos.
- Definir tipos de resultados, diagnosticos, severidades y ubicaciones.
- Proveer servicios comunes solo cuando esten justificados por reutilizacion real
  entre varios paquetes.
- Mantenerse desacoplado de APIs concretas de librerias.

El core no debe:

- Exportar una API `checkTranslations`.
- Aceptar una opcion `libraries`.
- Registrar adaptadores de libreria en runtime.
- Definir una clase base obligatoria.
- Forzar un formato de catalogo unico.

### Reglas en core

El core debe declarar las reglas conocidas en un objeto tipado y exportado. Ese
objeto es la fuente unica para:

- codigos validos de reglas;
- nivel por defecto;
- descripcion breve de cada regla;
- validacion y merge de overrides `off`, `warning`, `error`;
- normalizacion de diagnosticos.

Tipo requerido:

```ts
export type RuleCode =
  | "missing-translation-key"
  | "missing-locale-key"
  | "unused-translation-key"
  | "empty-translation-value"
  | "unresolved-dynamic-key"
  | "raw-ui-text"
  | "source-parse-error"
  | "catalog-parse-error"
  | "catalog-file-not-found";

export type RuleDefinition = {
  code: RuleCode;
  defaultLevel: RuleLevel;
  description: string;
};

export const RULE_DEFINITIONS: Readonly<Record<RuleCode, RuleDefinition>>;
```

`BaseCheckOptions.rules` debe tiparse como `Partial<Record<RuleCode, RuleLevel>>`.
Los paquetes no deben mantener mapas privados duplicados de niveles por defecto.
Al crear diagnosticos deben consumir `RULE_DEFINITIONS` o helpers derivados del
core.

API publica inicial de `@stale-i18n/core`:

- Tipos: `BaseCheckOptions`, `CheckResult`, `CheckStatus`,
  `CreateDiagnosticInput`, `Diagnostic`, `AnyNode`, `MessageId`,
  `ParseSourceResult`, `RuleCode`, `RuleDefinition`, `RuleLevel`,
  `RuleOverrides`, `SourceLocation`, `SourceUsage`, `StaticStringContext`,
  `TranslationChecker`.
- Constantes: `RULE_DEFINITIONS`.
- Helpers: `arrayOf`, `bindingNames`, `collectStaticStringBinding`,
  `collectStaticStringEnum`, `createDiagnostic`, `createResult`,
  `createStaticStringContext`, `discoverSourceFiles`, `getRuleLevel`,
  `identifierName`, `isNode`, `jsxName`, `literalValue`, `locationFromIndex`,
  `parseSource`, `resolveStaticStrings`, `stringLiteral`, `walk`.

Nada mas debe exportarse desde core sin actualizar esta lista en la spec.

### Contrato publico

El core debe exportar una interfaz:

```ts
export type CheckStatus = "SUCCESS" | "FAIL";
export type RuleLevel = "off" | "warning" | "error";

export type SourceLocation = {
  index: number;
  line: number;
  column: number;
};

export type Diagnostic = {
  code: string;
  severity: "warning" | "error";
  message: string;
  filePath: string;
  line: number;
  column: number;
  key?: string;
  locale?: string;
  catalogPath?: string;
};

export type CheckResult = {
  status: CheckStatus;
  diagnostics: Diagnostic[];
  filesChecked: number;
  catalogsChecked: number;
};

export type BaseCheckOptions = {
  target?: string;
  ignore?: string[];
  rules?: Partial<Record<RuleCode, RuleLevel>>;
};

export interface TranslationChecker<TOptions extends BaseCheckOptions = BaseCheckOptions> {
  readonly name: string;
  readonly options: Readonly<TOptions>;

  check(options?: Partial<TOptions>): Promise<CheckResult>;
  checkSync(options?: Partial<TOptions>): CheckResult;
}
```

Cada paquete de libreria debe exportar una clase que implemente
`TranslationChecker`.

Ejemplo:

```ts
export class I18nextChecker
  implements TranslationChecker<I18nextCheckOptions>
{
  readonly name = "i18next";
  readonly options: Readonly<I18nextCheckOptions>;

  constructor(options: I18nextCheckOptions) {
    this.options = options;
  }

  check(options?: Partial<I18nextCheckOptions>): Promise<CheckResult> {
    // implementacion del paquete
  }

  checkSync(options?: Partial<I18nextCheckOptions>): CheckResult {
    // implementacion sync del paquete
  }
}
```

No debe existir ningun wrapper publico de funcion.

## Modelo de usos

Representar usos resueltos y no resueltos como union discriminada.

```ts
export type MessageId = {
  id: string;
  namespace?: string;
  keyPrefix?: string;
  catalog?: string;
  path?: string[];
};

export type SourceUsage =
  | {
      kind: "resolved";
      message: MessageId;
      filePath: string;
      location: SourceLocation;
      sourceKind:
        | "call"
        | "jsx-component"
        | "tagged-template"
        | "message-descriptor"
        | "generated-message-function"
        | "dictionary-access";
    }
  | {
      kind: "unresolved";
      raw?: string;
      reason: "dynamic-key" | "unsupported-pattern";
      filePath: string;
      location: SourceLocation;
      sourceKind:
        | "call"
        | "jsx-component"
        | "tagged-template"
        | "message-descriptor"
        | "generated-message-function"
        | "dictionary-access";
    };
```

No usar `confidence`.
No usar `partially-resolved`.

Regla:

- Si se pueden enumerar keys concretas, crear uno o mas usos `resolved`.
- Si no se puede enumerar ninguna key concreta con seguridad, crear un uso
  `unresolved`.

## Reglas base

Reglas iniciales:

- `missing-translation-key`: key usada pero ausente en catalogo/declaracion.
- `missing-locale-key`: key existente en algun locale pero ausente en otro.
- `unused-translation-key`: key o diccionario definido pero no usado.
- `empty-translation-value`: valor vacio, `null` o `undefined`.
- `unresolved-dynamic-key`: uso dinamico no resoluble.
- `raw-ui-text`: texto plano visible/accesible en TSX/JSX, opt-in.
- `source-parse-error`: error de parseo de fuente.
- `catalog-parse-error`: error de parseo de catalogo/declaracion.
- `catalog-file-not-found`: catalogo configurado no encontrado.

Todas las reglas deben soportar `off`, `warning` y `error`.

Los niveles por defecto iniciales son:

- `missing-translation-key`: `error`.
- `missing-locale-key`: `error`.
- `unused-translation-key`: `error`.
- `empty-translation-value`: `error`.
- `unresolved-dynamic-key`: `error`.
- `raw-ui-text`: `off`.
- `source-parse-error`: `error`.
- `catalog-parse-error`: `error`.
- `catalog-file-not-found`: `error`.

`CheckResult.status` debe ser:

- `FAIL` si existe al menos un diagnostico con `severity: "error"`.
- `SUCCESS` en caso contrario.

## Paquete `@stale-i18n/i18next`

Clase publica:

```ts
export class I18nextChecker
  implements TranslationChecker<I18nextCheckOptions>
```

Opciones iniciales:

```ts
export type I18nextCheckOptions = BaseCheckOptions & {
  catalogs: string | string[];
  mode?: "jsx";
  defaultNamespace?: string;
  keySeparator?: string | false;
  namespaceSeparator?: string | false;
};
```

`mode` indica el tipo de aplicativo a analizar. El valor por defecto es `jsx`
y por ahora es el unico valor soportado.

`react-i18next` no debe existir como paquete separado. Es la integracion React
de i18next y debe vivir dentro de `@stale-i18n/i18next`. El paquete i18next debe
soportar los patrones React del MVP (`useTranslation`, `<Trans />`) junto con
los patrones runtime/base de i18next cuando se implementen, manteniendo una API
publica unica y coherente.

No incluir:

- `ignoredKeys`.
- `customRegExpToFindKeys`.
- `deepSearch`.

Patrones MVP:

- `import i18next from "i18next"; i18next.t("key")`
- `import { t } from "i18next"; t("key")`
- Casos vanilla i18next en ficheros `.ts` sin React/TSX, usando catalogos JSON
  y TS cuando aplique.
- `const { t } = useTranslation()`
- `const { t } = useTranslation("ns")`
- `const { t } = useTranslation(["ns1", "ns2"])`
- `const { t } = useTranslation("ns", { keyPrefix: "a.b" })`
- `const [t] = useTranslation("ns")`
- `t("key")`
- `t("ns:key")`
- `t("key", { ns: "ns" })`
- `t(["specific", "fallback"])`
- `const key = "key"; t(key)` debe resolverse cuando la constante local es un
  literal string.
- `const key = `key`; t(key)` debe resolverse cuando el template no contiene
  partes dinamicas.
- `const key = condition ? "a" : "b"; t(key)` debe crear usos resueltos para
  ambas ramas si todas las ramas son strings resolubles.
- `const section = condition ? "ready" : "pending"; t(`status.${section}`)`
  debe crear usos resueltos para todas las combinaciones enumerables.
- `enum Keys { Title = "title" }; t(Keys.Title)` debe resolverse cuando el enum
  usa inicializadores string literales.
- `const key = "key"; <Trans i18nKey={key} />` debe resolverse igual que
  `i18nKey="key"`.
- Si una key depende de una variable, template o enum no enumerable con
  seguridad, debe reportarse como `unresolved-dynamic-key`.
- `<Trans i18nKey="key" />`
- `<Trans i18nKey="key" ns="ns" />`
- aliases locales simples: `const { t: translate } = useTranslation()`
- shadowing: si `t` es redefinida localmente, no debe contarse como uso i18n.

Patrones posteriores:

- `getFixedT`.
- selector functions de i18next.
- templates con dominio finito.
- enums y constantes avanzadas.

Catalogos MVP:

- JSON anidado i18next.
- JSON plano cuando `keySeparator: false`.
- TypeScript/JavaScript estatico con `export default { ... }` o
  `export const <name> = { ... }`. El checker debe evaluar solo literales
  estaticos (`string`, `number`, `boolean`, `null`, arrays y objetos). Si el
  catalogo TS/JS usa expresiones dinamicas, debe emitir `catalog-parse-error` o
  ignorar el valor dinamico segun regla explicita futura; en el MVP debe fallar
  de forma conservadora.
- Rutas con placeholders `{locale}` y `{namespace}`.

Reglas de namespace MVP:

- `useTranslation("ns")` aplica `ns` como namespace por defecto del `t` local.
- `useTranslation(["ns1", "ns2"])` aplica el primer namespace como namespace por
  defecto, pero permite resolver `t("key", { ns: "ns2" })`.
- `t("ns:key")` siempre gana sobre el namespace del binding.
- `t("key", { ns: "ns" })` gana sobre el namespace del binding.
- Si `ns` no es literal estatico, el uso debe reportarse como
  `unresolved-dynamic-key`.

## Paquete `@stale-i18n/formatjs`

FormatJS / React Intl es la segunda libreria a implementar para observar
duplicacion real antes de extraer helpers comunes al core.

Clase publica:

```ts
export class FormatjsChecker
  implements TranslationChecker<FormatjsCheckOptions>
```

Opciones iniciales:

```ts
export type FormatjsCheckOptions = BaseCheckOptions & {
  catalogs: string | string[];
};
```

Patrones MVP:

- `const intl = useIntl(); intl.formatMessage({ id: "key" })`
- `intl.formatMessage({ id: key })` cuando `key` es una expresion string
  resoluble de forma conservadora.
- `const descriptor = { id: "key" }; intl.formatMessage(descriptor)`
- `intl.formatMessage({ id: condition ? "a" : "b" })` debe resolver ambas
  ramas cuando son strings enumerables.
- `intl.formatMessage({ id: `status.${state}` })` debe resolver todas las
  combinaciones enumerables si `state` tambien es enumerable.
- `enum Messages { Title = "title" }; intl.formatMessage({ id: Messages.Title })`
  debe resolverse cuando el enum usa inicializadores string literales.
- `<FormattedMessage id="key" />`
- `<FormattedMessage id={key} />` cuando `key` es una expresion string
  resoluble.
- `<FormattedMessage id={condition ? "a" : "b"} />` debe resolver ambas ramas
  cuando son strings enumerables.
- Si el `id` depende de una variable, template o descriptor no enumerable con
  seguridad, debe reportarse como `unresolved-dynamic-key`.

No incluir inicialmente:

- extraccion de `defaultMessage`;
- validacion ICU;
- placeholders;
- `defineMessages` anidado o importado desde otros ficheros;
- `FormattedHTMLMessage`;
- macros/Babel transforms.

Catalogos MVP:

- JSON plano con forma `{ "message.id": "Message" }`.
- Rutas con placeholder `{locale}`.
- Multiples catalogos explicitos con `catalogs: string[]`.
- JSON invalido emite `catalog-parse-error`.
- Catalogo inexistente emite `catalog-file-not-found`.

Las reglas base (`missing-translation-key`, `missing-locale-key`,
`unused-translation-key`, `empty-translation-value`, `unresolved-dynamic-key`,
`source-parse-error`, `catalog-parse-error`, `catalog-file-not-found`) deben
aplicarse igual que en i18next, sin namespaces.

Los `uses` de FormatJS deben seguir el runner basado en `expected.json` y
probar cada regla aplicable en `off`, `warning` y `error` desde casos reales.
`raw-ui-text` queda fuera de FormatJS hasta que exista implementacion en su
analizador.

## Paquete `@stale-i18n/paraglide`

Paraglide JS v2 compila mensajes a funciones ESM tipadas. El checker debe
analizar el codigo de aplicacion que importa el objeto de mensajes generado y
compararlo contra los archivos de mensajes fuente.

Clase publica:

```ts
export class ParaglideChecker
  implements TranslationChecker<ParaglideCheckOptions>
```

Opciones iniciales:

```ts
export type ParaglideCheckOptions = BaseCheckOptions & {
  catalogs: string | string[];
};
```

Patrones MVP:

- `import { m } from "./paraglide/messages.js"; m.greeting()`
- alias de import: `import { m as messages } from "./paraglide/messages.js";
  messages.greeting()`
- llamada con key computada resoluble:
  `messages[condition ? "save" : "cancel"]()`
- llamada con key computada dinamica no resoluble reporta
  `unresolved-dynamic-key`.

Reglas:

- La fuente se identifica por imports cuyo `source` termina en
  `/paraglide/messages`, `/paraglide/messages.js`, `/paraglide/messages.ts` o
  `paraglide/messages`.
- Solo se consideran llamadas a propiedades del binding importado. Leer
  `m.key` sin llamada no cuenta como uso en el MVP.
- Si el binding importado queda sombreado por parametros de funciones internas,
  no debe contarse como uso.

Catalogos MVP:

- JSON plano con forma `{ "message.id": "Message" }`.
- Rutas con placeholder `{locale}`.
- Multiples catalogos explicitos con `catalogs: string[]`.
- JSON invalido emite `catalog-parse-error`.
- Catalogo inexistente emite `catalog-file-not-found`.

Las reglas base (`missing-translation-key`, `missing-locale-key`,
`unused-translation-key`, `empty-translation-value`, `unresolved-dynamic-key`,
`source-parse-error`, `catalog-parse-error`, `catalog-file-not-found`) deben
aplicarse igual que en FormatJS, sin namespaces.

Quedan fuera del MVP:

- inferir `catalogs` desde `project.inlang/settings.json`;
- plugins de formatos inlang distintos de JSON plano;
- validar placeholders o parametros de las funciones generadas;
- analizar el codigo generado dentro de `./paraglide/messages.js`.

## CLI

El CLI es un paquete comun, pero no ejecuta multilibreria en un mismo comando.

Subcomandos:

```bash
stale-i18n i18next <target>
stale-i18n intlayer <target>
stale-i18n paraglide <target>
stale-i18n formatjs <target>
stale-i18n lingui <target>
```

Fase inicial:

```bash
stale-i18n i18next src \
  --catalog "src/locales/{locale}/{namespace}.json" \
  --mode jsx \
  --default-namespace translation \
  --rule unused-translation-key=warning
```

Opciones comunes:

- `--config`
- `--ignore`
- `--mode jsx`
- `--rule code=level`
- `--format text|json`

Opciones prohibidas:

- `--library`
- `--ignored-keys`
- `--custom-regexp-to-find-keys`
- `--deep-search`

Exit codes:

- `0`: sin diagnosticos error.
- `1`: uno o mas diagnosticos error.
- `2`: configuracion o argumentos invalidos.

El CLI debe instanciar la clase correspondiente al subcomando:

```ts
const checker = new I18nextChecker(options);
const result = await checker.check();
```

## Raw UI text

`raw-ui-text` es opt-in, se activa exclusivamente mediante `rules` y por ahora
solo aplica en `mode: "jsx"`.

Debe detectar:

- `JSXText`: `<button>Save</button>`.
- Atributos JSX string: `<input placeholder="Search" />`.

Debe ignorar por defecto:

- strings vacios;
- strings solo numericos;
- strings sin letras;
- archivos excluidos por la opcion global `ignore`.

## TDD obligatorio

La IA debe trabajar siempre con este ciclo:

1. Leer esta spec.
2. Identificar comportamiento exacto a implementar.
3. Escribir test(s) fallidos.
4. Ejecutar tests y confirmar fallo esperado.
5. Implementar la minima logica.
6. Ejecutar tests y confirmar exito.
7. Refactorizar si hace falta.
8. Ejecutar tests de nuevo.
9. Actualizar spec si el comportamiento cambio.

No se permite:

- Implementar primero y testear despues.
- Dejar tests pendientes sin razon documentada.
- Marcar un comportamiento como terminado sin test.
- Cambiar la API publica sin actualizar esta spec.

## Matriz minima de tests

### Core

Debe tener tests para:

- `CheckResult.status` con errores y solo warnings.
- Merge de reglas `off`, `warning`, `error`.
- Ubicaciones `line` y `column`.
- Representacion `SourceUsage` resolved/unresolved.
- Normalizacion de diagnosticos.
- Parse errors convertidos en diagnosticos.
- AST utils compartidos usados por paquetes de libreria.
- Evaluacion estatica conservadora de strings: literales, arrays, ternarios,
  templates enumerables, constantes locales y enums string.
- Discovery de ficheros fuente con target fichero/directorio e ignores.

### i18next

Debe tener tests para:

- uso vanilla en `.ts` con `i18next.t("key")` y catalogos JSON.
- uso vanilla en `.ts` con `import { t } from "i18next"` y catalogos JSON.
- `t("key")` detectado desde `useTranslation`.
- `t("missing")` reporta `missing-translation-key`.
- key usada en un locale pero ausente en otro reporta `missing-locale-key`.
- key definida y no usada reporta `unused-translation-key`.
- valor vacio reporta `empty-translation-value`.
- `useTranslation("common")` aplica namespace.
- `keyPrefix` aplica prefijo.
- `t("common:key")` aplica namespace inline.
- `t(["specific", "fallback"])` crea usos resueltos para ambas keys.
- alias `t: translate` funciona.
- shadowing de `t` no cuenta como uso.
- `<Trans />` debe probarse tambien en casos combinados con multiples
  namespaces y catalogos TypeScript/JavaScript para evitar que solo quede
  cubierto con JSON.
- uso dinamico no resoluble reporta `unresolved-dynamic-key`.
- regla `off` no emite diagnostico.
- severidad `warning` no hace `FAIL`.
- severidad `error` hace `FAIL`.

### FormatJS

Debe tener tests para:

- `useIntl().formatMessage({ id: "key" })`.
- `<FormattedMessage id="key" />`.
- descriptores locales `const descriptor = { id: "key" }`.
- `id` desde constante string resoluble.
- `id` desde ternario resoluble.
- `id` desde template literal resoluble.
- `id` desde enum string resoluble.
- `id` dinamico no resoluble reporta `unresolved-dynamic-key`.
- key usada pero ausente reporta `missing-translation-key`.
- key presente en un locale pero ausente en otro reporta `missing-locale-key`.
- key definida y no usada reporta `unused-translation-key`.
- valor vacio reporta `empty-translation-value`.
- catatalogos JSON planos con placeholder `{locale}`.
- multiples catalogos explicitos con `catalogs: string[]`.
- cada regla aplicable de FormatJS en `off`, `warning` y `error`.

### Paraglide

Debe tener tests para:

- `import { m } from "./paraglide/messages.js"; m.key()`.
- alias `import { m as messages } ...`.
- key computada resoluble desde expresion estatica.
- key computada dinamica no resoluble reporta `unresolved-dynamic-key`.
- key usada pero ausente reporta `missing-translation-key`.
- key presente en un locale pero ausente en otro reporta `missing-locale-key`.
- key definida y no usada reporta `unused-translation-key`.
- valor vacio reporta `empty-translation-value`.
- catalogos JSON planos con placeholder `{locale}`.
- multiples catalogos explicitos con `catalogs: string[]`.

### Catalogos

Debe tener tests para:

- JSON anidado.
- JSON plano con `keySeparator: false`.
- ruta con `{locale}`.
- ruta con `{namespace}`.
- JSON invalido emite `catalog-parse-error`.
- catalogo inexistente emite `catalog-file-not-found`.

### Raw UI text

Debe tener tests para:

- JSX text visible.
- atributo `placeholder`.
- atributo `aria-label`.
- regla en `off` no emite diagnosticos.
- regla en `warning` emite warning.
- regla en `error` emite error.

### CLI

Debe tener tests para:

- subcomando `i18next` instancia `I18nextChecker`.
- `--rule code=level`.
- `--format json`.
- reporter text agrupa por fichero.
- exit code `0`.
- exit code `1`.
- exit code `2` en argumentos invalidos.
- rechazo de opciones prohibidas.

## Layout de tests y casos de uso

Cada paquete debe usar dos carpetas obligatorias:

```text
packages/<package>/tests/
  unit/
  uses/
```

`unit`:

- tests pequenos de helpers, reglas, parser, catalogos o reporters;
- puede importar modulos internos cuando el paquete los exporte solo para tests
  mediante rutas relativas;
- no debe requerir proyectos completos si un fixture minimo basta.

`uses`:

- tests de comportamiento externo desde la API publica;
- debe crear o usar proyectos de ejemplo completos con ficheros fuente y
  catalogos;
- debe cubrir el flujo que tendria un usuario real: crear checker, ejecutar
  `check`/`checkSync` o CLI, y validar resultado;
- no debe importar funciones internas.
- debe probar cada regla publica en los tres niveles `off`, `warning` y `error`
  al menos una vez desde casos reales de uso final.

Ejemplo de `uses` para `i18next` con patrones React:

```text
packages/i18next/tests/uses/
  i18next-api.test.ts
  valid-basic/
    src/app.tsx
    locales/en/translation.json
    locales/es/translation.json
    expected.json
  missing-key/
  unused-key/
  key-prefix/
  raw-ui-text/
```

Cada paquete debe usar casos de uso pequenos y legibles.

Estructura recomendada:

```text
packages/i18next/tests/uses/
  valid-basic/
    src/app.tsx
    locales/en/translation.json
    locales/es/translation.json
    expected.json
  missing-key/
  unused-key/
  key-prefix/
  raw-ui-text/
```

Cada caso de uso debe incluir:

- fuente minima;
- catalogos minimos;
- `expected.json`;
- nombre claro del caso.

## Definition of Done

Una feature esta terminada solo si:

- La spec cubre el comportamiento.
- Hay tests unitarios o de fixture.
- Los tests fallaron antes de implementar.
- Todos los tests del paquete pasan.
- Typecheck pasa.
- Lint pasa.
- La API publica no contradice esta spec.
- No se introducen opciones prohibidas.
- No se introduce soporte multilibreria accidental.

## Roadmap inicial

1. Crear monorepo y tooling.
2. Crear `packages/core` con tipos, resultado, reglas y contrato.
3. Crear tests de core.
4. Crear `packages/i18next` con `I18nextChecker`.
5. Implementar catalogos JSON i18next.
6. Implementar deteccion MVP de `useTranslation`, `t`, `Trans`.
7. Implementar reglas base.
8. Crear `packages/cli` con subcomando `i18next`.
9. Implementar `raw-ui-text` opt-in.
10. Solo despues evaluar `i18next`, `intlayer`, `paraglide`, `formatjs`,
    `lingui`.
