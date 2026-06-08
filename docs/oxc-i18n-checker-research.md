# Investigacion: checker i18n con Oxc

Fecha: 2026-06-07

## Resumen ejecutivo

Si, podemos construir algo parecido al proyecto de CSS Modules, con un motor
comun, API programatica y CLI, usando `oxc-parser` y `oxc-resolver`. Pero tras
revisar mejor el problema, no conviene que el core tenga una opcion tipo
`libraries: ["i18next", "formatjs", "lingui"]`. Eso mete demasiado acoplamiento
en el centro del sistema y obliga al usuario a configurar una realidad que casi
nunca ocurre: un proyecto usando varias librerias i18n a la vez.

La arquitectura recomendada cambia a:

- Un `core` o `kernel` interno y agnostico, sin conocimiento de librerias.
- Paquetes por libreria, cada uno exportando una clase especifica que implementa
  una interfaz comun del core:
  - `ReactI18nextChecker`
  - `I18nextChecker`
  - `FormatJsChecker`
  - `LinguiChecker`
  - `ParaglideChecker`
  - `IntlayerChecker`
- Un CLI comun con subcomandos por libreria:
  - `stale-i18n react-i18next`
  - `stale-i18n i18next`
  - `stale-i18n formatjs`
  - `stale-i18n lingui`
  - `stale-i18n paraglide`
  - `stale-i18n intlayer`
- Sin plugin ESLint/Oxlint en el scope inicial. Muchas reglas necesitan contexto
  completo de proyecto, y meter eso en lint archivo-a-archivo seria ruidoso,
  lento o fragil.
- Sin soporte multi-libreria dentro de un mismo proyecto en el MVP.
- Deteccion opcional de texto plano en TSX/JSX como regla separada y opt-in.

La idea central: el core debe ser una caja de herramientas compartida y un
contrato de ejecucion comun, no el orquestador de todas las librerias. Cada
paquete de libreria compone esas piezas como necesite.

## Hallazgos de los proyectos actuales

### `css-modules-class-checker`

Ruta analizada:

`C:\Users\Ivan\Desktop\Projects\css-modules-class-checker`

Arquitectura actual:

- Monorepo con `packages/core`, `packages/cli`, `packages/eslint-plugin` y
  paquete publico programatico `packages/css-modules-app`.
- El core expone:
  - `checkCssModules(options)`: analisis de proyecto/directorio.
  - `checkCssModuleSourceFile(options)`: analisis de un archivo.
  - `checkCssModuleSourceFileSync(options)`: entrada sincrona para integraciones
    de lint.
- El analisis JS/TS usa `oxc-parser` con `parseSync`.
- La resolucion de imports usa `oxc-resolver` con `ResolverFactory` y
  `tsconfig: "auto"`.
- Hay un resolver estatico propio para strings: literales, templates, constantes,
  enums, uniones de tipos, object maps y algunos patrones TS.
- Los diagnosticos son rule-style, con severidad `off`, `warning`, `error`.
- El plugin lint delega en el core y cachea por `sourceCode`.

Lectura critica:

- El proyecto demuestra que Oxc puede servir para analisis estatico de JS/TS,
  pero su diseno interno no deberia tomarse como plantilla.
- La reutilizacion no deberia consistir en copiar piezas concretas del checker
  CSS. Conviene redisenar las extensiones pensando desde el principio en
  librerias i18n, formatos de catalogo distintos y checkers por paquete.
- El core nuevo debe nacer con puntos de extension claros y pequenos, no como una
  acumulacion de utilidades ligadas a un caso anterior.
- No deberiamos asumir que ESLint/Oxlint es una superficie inicial obligatoria.
- No deberiamos crear un unico paquete publico generico donde el usuario active
  librerias por config.

### `react-i18next-translation-checker`

Ruta analizada:

`C:\Users\Ivan\Desktop\Projects\react-i18next-translation-checker`

Arquitectura actual:

- Proyecto lineal con `src/core` y `src/cli`.
- API publica centrada en `ReactI18nextLint`.
- CLI con `commander` y config JSON opcional.
- Lee ficheros de idioma JSON, aplana keys anidadas con `.` y conserva valores.
- Busca usos en vistas con regex generada desde las keys del catalogo.
- Reglas principales:
  - `zombieKeys`: keys definidas en idioma pero no encontradas en vistas.
  - `keysOnViews`: keys usadas en vistas pero ausentes en algun idioma.
  - `emptyKeys`: keys con valor vacio, `undefined` o `null`.
- Tiene opciones heredadas del enfoque regex como `ignoredKeys`,
  `customRegExpToFindKeys` y `deepSearch`.

Ventajas actuales:

- Sencillo y facil de entender.
- Buen punto de partida para reglas de catalogo.
- El modelo mental de resultado ya separa errores, warnings y exit code.

Problemas que Oxc resolveria:

- La regex principal solo detecta `t('key')` y patrones custom.
- No distingue si `t` viene de `react-i18next`, de otra libreria o de una funcion
  local.
- No entiende imports, aliases, wrappers, shadowing, JSX props, descriptors,
  namespaces o `keyPrefix`.
- Depende de conocer primero las keys del catalogo. Si una key usada no existe en
  ningun idioma, una regex construida desde catalogos puede no verla salvo que
  encaje con el patron principal.
- No puede resolver de forma segura constantes, enums, arrays de fallback,
  selector functions de i18next, `FormattedMessage`, `Trans`, macros de Lingui,
  funciones generadas de Paraglide o diccionarios de Intlayer.

Configuracion que no se debe arrastrar al nuevo diseno:

- `ignoredKeys`.
- `customRegExpToFindKeys`.
- `deepSearch`.

Estas opciones existen para compensar limites de una busqueda por regex. En el
nuevo checker no encajan: la deteccion debe salir del analisis de AST, imports,
catalogos y convenciones reales de cada libreria. Mantenerlas haria que el
paquete nuevo heredase los mismos problemas que precisamente intenta superar.

## Viabilidad con Oxc

Oxc encaja muy bien para el alcance inicial:

- `oxc-parser` parsea JS, JSX, TS y TSX.
- `oxc-resolver` permite resolver imports con semantica Node/webpack y soporte
  de `tsconfig`.
- Su uso en el checker CSS es una senal de viabilidad tecnica, no una
  recomendacion de arquitectura.

Lo que no hace Oxc por si solo:

- No infiere tipos TypeScript completos.
- No ejecuta macros ni transformaciones de build.
- No resuelve valores que dependen de runtime, async, props arbitrarias o datos
  de servidor.
- No da soporte directo a Svelte/Vue/templates no JSX, ni a otros lenguajes.

Conclusion: Oxc es una base solida para JS/TS/React. El sistema debe aceptar que
algunas keys dinamicas seran "unresolved" y reportarlas o ignorarlas segun
configuracion.

## Objetivo funcional

El checker deberia responder estas preguntas, por paquete de libreria:

1. Que mensajes existen en los catalogos o declaraciones de contenido.
2. Que mensajes se usan en el codigo fuente.
3. Que mensajes usados faltan en uno o varios idiomas/catalogos.
4. Que mensajes definidos ya no se usan.
5. Que mensajes tienen valor vacio.
6. Que usos dinamicos no se pudieron resolver estaticamente.
7. Opcionalmente, que textos planos aparecen en TSX/JSX sin pasar por la libreria
   i18n correspondiente.

No entran en scope inicial:

- Plugin ESLint/Oxlint.
- Soporte multi-libreria en un mismo proyecto.
- Validaciones de sintaxis ICU/Lingui/i18next.
- Validacion de placeholders entre idiomas.
- Reglas de namespace completo.
- Reglas de default message.
- Reglas de duplicados de catalogo.

## Modelo de dominio recomendado

El core no deberia modelar solo `key: string`, pero tampoco deberia incluir
`library` como propiedad obligatoria. El paquete especifico ya sabe si esta
analizando i18next, FormatJS, Lingui, Paraglide o Intlayer.

Modelo comun minimo:

```ts
type MessageId = {
  id: string;
  namespace?: string;
  keyPrefix?: string;
  catalog?: string;
  path?: string[];
};

type CatalogMessage = {
  message: MessageId;
  locale?: string;
  filePath: string;
  value: unknown;
  location?: SourceLocation;
  metadata?: Record<string, unknown>;
};

type SourceUsage =
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

type RawTextUsage = {
  value: string;
  filePath: string;
  location: SourceLocation;
  sourceKind: "jsx-text" | "jsx-attribute" | "string-prop";
  attributeName?: string;
};
```

No se usa un estado intermedio tipo `partially-resolved`: si el checker puede
enumerar una o varias keys concretas, emite usos `resolved`; si no puede,
emite un uso `unresolved` con razon. Esto mantiene las reglas y reportes mas
predecibles.

La interpretacion concreta vive en cada paquete:

- `@stale-i18n/react-i18next`: `namespace`, `keyPrefix`, `id`.
- `@stale-i18n/formatjs`: `id` de `MessageDescriptor`.
- `@stale-i18n/paraglide`: nombre de funcion compilada o key anidada.
- `@stale-i18n/intlayer`: key de diccionario + path de propiedad.

## Arquitectura propuesta

### Paquetes

Propuesta revisada a nivel de producto:

```text
packages/
  core/
  react-i18next/
  i18next/
  formatjs/
  lingui/
  paraglide/
  intlayer/
  cli/
```

Paquetes publicos posibles:

- `@stale-i18n/react-i18next`
- `@stale-i18n/i18next`
- `@stale-i18n/formatjs`
- `@stale-i18n/lingui`
- `@stale-i18n/paraglide`
- `@stale-i18n/intlayer`
- `@stale-i18n/cli`

`@stale-i18n/core` puede ser privado al principio. Si se publica, deberia ser
una API low-level para construir checkers, no una API que pida `libraries`.

### Flujo

```text
paquete especifico
  -> normaliza su config
  -> descubre source files y catalog/content files
  -> usa el contrato y servicios comunes del core
  -> aplica su analizador de libreria
  -> compara usos vs catalogos/declaraciones
  -> emite diagnosticos
```

### Contrato de checker

El core deberia exponer una interfaz comun para que todas las librerias tengan
la misma forma publica, sin que el core sepa cual libreria se esta usando:

```ts
export interface TranslationChecker<TOptions extends BaseCheckOptions = BaseCheckOptions> {
  readonly name: string;
  readonly options: Readonly<TOptions>;

  check(options?: Partial<TOptions>): Promise<CheckResult>;
  checkSync(options?: Partial<TOptions>): CheckResult;
}
```

Cada paquete implementa esa interfaz con su propia clase. El core no necesita
definir una clase base compartida en el diseno inicial.

Ejemplo de paquete:

```ts
export class ReactI18nextChecker
  implements TranslationChecker<ReactI18nextCheckOptions>
{
  readonly name = "react-i18next";
  readonly options: Readonly<ReactI18nextCheckOptions>;

  constructor(options: ReactI18nextCheckOptions) {
    this.options = options;
  }

  async check(options?: Partial<ReactI18nextCheckOptions>): Promise<CheckResult> {
    // implementacion propia del paquete
  }

  checkSync(options?: Partial<ReactI18nextCheckOptions>): CheckResult {
    // misma semantica, solo con lectores sync
  }
}
```

No se exportan funciones de chequeo. La clase concreta es la unica API
publica del paquete.

### Responsabilidades del core

El core no deberia fijar ahora una lista de piezas internas. Lo razonable es
definir sus responsabilidades y dejar que la implementacion encuentre las piezas
correctas:

- Ofrecer el contrato comun de ejecucion (`TranslationChecker`).
- Dar tipos compartidos para resultados, diagnosticos y severidades.
- Proveer servicios comunes solo cuando se repitan de forma clara entre varios
  paquetes.
- Mantenerse agnostico respecto a APIs de librerias y formatos de catalogo.
- Evitar que un paquete dependa de detalles privados pensados para otro paquete.

El detalle interno puede cambiar durante la implementacion. Lo importante es que
los paquetes de libreria no dependan de una marana de utilidades privadas acopladas
al primer caso de uso.

Asi no hay un `LibraryAdapter` que registrar en runtime ni una config global que
combine librerias.

## Paquetes por libreria

### i18next y react-i18next

Patrones de fuente a soportar en MVP:

- `import i18next from "i18next"; i18next.t("key")`
- `import { t } from "i18next"; t("key")`, si aplica en proyectos reales.
- `const t = i18next.getFixedT(null, "ns", "prefix"); t("key")`
- `const { t } = useTranslation()`
- `const { t } = useTranslation("ns")`
- `const { t } = useTranslation(["ns1", "ns2"])`
- `const { t } = useTranslation("ns", { keyPrefix: "a.b" })`
- `const [t] = useTranslation("ns")`
- `<Trans i18nKey="key" ns="ns" />`
- `<IcuTrans i18nKey="key" ns="ns" />`
- `<Translation ns="ns">{(t) => t("key")}</Translation>`

Patrones avanzados:

- Arrays de fallback: `t(["error.404", "error.unspecific"])`.
- Selector functions recientes: `t($ => $.user.profile.title)`.
- Namespace inline: `t("common:button.save")`.
- Opciones por llamada: `t("button.save", { ns: "common" })`.
- `keyPrefix` y overrides.
- Plurales/contexto solo como expansion de existencia, no como validacion de
  sintaxis.

Catalogos:

- JSON anidado i18next.
- JSON plano si `keySeparator: false`.
- Rutas con `{locale}` y `{namespace}`.

API:

```ts
import { ReactI18nextChecker } from "@stale-i18n/react-i18next";

const checker = new ReactI18nextChecker({
  target: "src",
  catalogs: "src/locales/{locale}/{namespace}.json",
  defaultNamespace: "translation",
  rules: {
    "missing-translation-key": "error",
    "unused-translation-key": "warning"
  }
});

const result = await checker.check();
```

### FormatJS / react-intl

FormatJS gira alrededor de `MessageDescriptor`:

- `intl.formatMessage({ id, defaultMessage, description }, values)`.
- `<FormattedMessage id="..." defaultMessage="..." />`.
- `defineMessage({ id, defaultMessage })`.
- `defineMessages({ foo: { id, defaultMessage } })`.

Implicaciones:

- Si el id es explicito, el checker puede comparar source vs catalogos.
- Si el id se genera por hash, lo mas seguro es leer la salida de
  `formatjs extract` o exigir `id` explicito en el MVP.
- FormatJS ya tiene tooling de extract/verify. El valor aqui seria una API y CLI
  con diagnosticos consistentes, no reemplazar todo su ecosistema.

Catalogos:

- FormatJS compiled JSON `{ "id": "message" }`.
- FormatJS extracted JSON `{ "id": { "defaultMessage": "..." } }`.

API:

```ts
import { FormatJsChecker } from "@stale-i18n/formatjs";

const checker = new FormatJsChecker({
  target: "src",
  catalogs: "lang/{locale}.json"
});

const result = await checker.check();
```

### Lingui

Lingui usa macros y descriptors:

- `t` macro desde `@lingui/core/macro`.
- `Trans` macro desde `@lingui/react/macro`.
- `defineMessage`/`msg` para traducciones lazy.
- Runtime directo: `i18n.t(...)` o `i18n._(...)`.

Complejidad:

- Los macros pueden generar IDs cortos automaticamente.
- Replicar el generador de IDs seria delicado.
- La extraccion oficial ya documenta que es estatica y que los patrones dinamicos
  no se extraen.

Decision recomendada:

- MVP Lingui: ids explicitos en `t({ id })`, `defineMessage({ id })`,
  `i18n.t("id")`, `i18n._("id")` y `<Trans id="..." />` runtime.
- Para macros con IDs generados, leer catalogos ya extraidos y no intentar
  clonar el macro compiler en primera version.

### Paraglide JS

Paraglide compila mensajes a funciones:

- `import { m } from "./paraglide/messages.js"; m.greeting()`
- Mensajes anidados pueden usarse como `m["user.profile.title"]()`.
- El compilador genera `messages.js`, `runtime.js` y modulos por mensaje.
- Los mensajes fuente viven en `messages/{locale}.json` por defecto, pero
  Paraglide/Inlang admite plugins y formatos como i18next o JSON simple.

Implicaciones:

- Para detectar uso, el patron es favorable: import de `messages.js` y llamada a
  propiedad.
- `m[dynamic]()` debe reportarse como dinamico o resolverse con el resolver
  estatico.
- Para catalogos, conviene leer JSON configurado o `project.inlang/settings.json`
  mas adelante.

API:

```ts
import { ParaglideChecker } from "@stale-i18n/paraglide";

const checker = new ParaglideChecker({
  target: "src",
  messagesModule: "src/paraglide/messages.js",
  catalogs: "messages/{locale}.json"
});

const result = await checker.check();
```

### Intlayer

Intlayer encaja muy bien en el modelo de paquete propio porque no se limita a
catalogos JSON tradicionales. Declara contenido cerca del componente, genera
diccionarios y genera tipos.

Patrones documentados:

- Content declaration files como `index.content.ts`, `*.content.tsx`,
  `*.content.js`, `*.content.mjs`, `*.content.cjs` o JSON.
- Declaraciones con `t(...)` desde `intlayer`.
- Uso en React con `useIntlayer("component-key")`.
- El hook devuelve un objeto tipado y se usan propiedades: `content.title`,
  `content.getStarted.main`, destructuring, etc.
- Intlayer genera diccionarios por defecto en `.intlayer/dictionaries` y tipos
  en `.intlayer/types`.

Reglas interesantes para Intlayer:

- `missing-translation-key`: contenido usado por `useIntlayer("x")` que no tiene
  declaracion de diccionario.
- `unused-translation-key`: diccionario declarado pero nunca usado por
  `useIntlayer`.
- `unused-content-property`: propiedad declarada dentro de un diccionario pero no
  usada en codigo, si podemos resolver accesos `content.foo.bar`.
- `empty-translation-value`: valor vacio en una declaracion.
- `unresolved-dynamic-key`: `useIntlayer(dynamicKey)` o acceso dinamico no
  resoluble.

Matiz importante:

En librerias TypeScript-first como Intlayer, Paraglide o sistemas con tipos
generados, los missing de uso suelen estar ya cubiertos por TypeScript. El checker
aporta mas valor en:

- unused dictionaries/content properties;
- valores vacios;
- deteccion de texto plano;
- comprobacion en CI de proyectos JS o TS con tipos incompletos;
- casos donde el contenido existe pero se ha quedado muerto.

API:

```ts
import { IntlayerChecker } from "@stale-i18n/intlayer";

const checker = new IntlayerChecker({
  target: "src",
  contentFiles: "src/**/*.content.{ts,tsx,js,mjs,cjs,json}",
  generatedDictionaries: ".intlayer/dictionaries",
  rules: {
    "unused-translation-key": "warning",
    "empty-translation-value": "warning",
    "raw-ui-text": "warning"
  }
});

const result = await checker.check();
```

## Deteccion de texto plano en TSX/JSX

Si, podemos detectar textos planos usados directamente en codigo fuente en vez
de utilizar las funciones o componentes de la libreria.

Patrones detectables con Oxc:

- `JSXText`: `<button>Save changes</button>`.
- Atributos JSX string: `<input placeholder="Search" />`.
- Props comunes: `title`, `aria-label`, `alt`, `placeholder`, `label`,
  `description`, `helperText`, `emptyText`.
- Literales pasados a props configuradas:
  `<Button label="Save" />`.
- Strings en expresiones JSX simples:
  `<span>{"Save changes"}</span>`.

Regla propuesta:

- `raw-ui-text`: texto plano visible o accesible que no pasa por i18n.

Debe ser opt-in porque puede producir ruido:

- textos tecnicos;
- nombres de producto;
- rutas;
- labels que no se traducen;
- datos de tests;
- icon labels internos;
- componentes que ya traducen internamente una prop.

Config recomendable:

```ts
rawText: {
  enabled: true,
  minLength: 3,
  ignore: ["OK", "ID", "API", /^[A-Z0-9_]+$/],
  attributes: ["title", "aria-label", "alt", "placeholder", "label"],
  components: {
    Button: ["label", "aria-label"],
    EmptyState: ["title", "description"]
  },
  ignoreFiles: ["**/*.test.tsx", "**/*.stories.tsx"]
}
```

No deberia bloquear el MVP de i18n keys, pero si merece entrar pronto porque
detecta una clase de problema que las librerias type-safe no cubren: texto
visible que nunca entro en el sistema de traduccion.

## Reglas recomendadas

Reglas base:

- `missing-translation-key`: key usada en source que no existe en el catalogo,
  diccionario o declaracion esperada.
- `missing-locale-key`: key que existe en algun idioma pero falta en otro.
- `unused-translation-key`: key, mensaje o diccionario definido pero no usado.
- `unused-content-property`: propiedad de contenido no usada, especialmente util
  en Intlayer y otros modelos TS/diccionario.
- `empty-translation-value`: valor vacio, `null` o `undefined`.
- `unresolved-dynamic-key`: uso dinamico que no se pudo resolver.
- `raw-ui-text`: texto plano en TSX/JSX sin i18n, opt-in.
- `source-parse-error`: error de parseo en fuente.
- `catalog-parse-error`: error de parseo en catalogo/declaracion.
- `catalog-file-not-found`: ruta de catalogo esperada no existe.

Reglas descartadas para este scope:

- `duplicate-translation-key`.
- `invalid-message-syntax`.
- `inconsistent-placeholders`.
- `unused-namespace`.
- `missing-default-message`.

## CLI

La CLI puede ser un unico paquete y un unico binario, pero con subcomandos por
libreria. Eso evita pedir `--library` y evita prometer soporte multi-libreria en
un mismo run.

Internamente, cada subcomando solo deberia instanciar la clase de su paquete:

```ts
const checker = new ReactI18nextChecker(options);
const result = await checker.check();
```

Ejemplos:

```bash
stale-i18n react-i18next src \
  --catalog "src/locales/{locale}/{namespace}.json" \
  --default-namespace translation \
  --rule unused-translation-key=warning

stale-i18n formatjs src \
  --catalog "lang/{locale}.json"

stale-i18n intlayer src \
  --content "src/**/*.content.{ts,tsx,js,mjs,cjs,json}" \
  --rule raw-ui-text=warning
```

Opciones comunes:

- `--config`.
- `--ignore`.
- `--rule code=level`.
- `--format text|json`.
- `--raw-text` o bloque equivalente en config, si se quiere detectar texto plano.

Exit codes:

- `0`: sin errores.
- `1`: uno o mas diagnosticos `error`.
- `2`: configuracion o argumentos invalidos.

El reporter de texto deberia agrupar por fichero:

```text
src/components/Login.tsx
  12:18  error    Missing translation key "auth.login.submit" in es/common.json  missing-translation-key
  20:9   warning  Raw UI text "Submit" should use react-i18next                  raw-ui-text

locales/en/common.json
  4:3    warning  Translation key "auth.login.oldTitle" is never used            unused-translation-key

Checked 142 source files and 8 catalog files. 1 error, 2 warnings.
```

## API programatica

API recomendada por paquete: una clase concreta que implementa
`TranslationChecker`.

```ts
import { ReactI18nextChecker } from "@stale-i18n/react-i18next";

const checker = new ReactI18nextChecker({
  target: "src",
  catalogs: "src/locales/{locale}/{namespace}.json"
});

const asyncResult = await checker.check();
const syncResult = checker.checkSync();
```

No exponer inicialmente una API publica:

```ts
checkTranslations({ libraries: [...] })
```

Eso empuja al usuario hacia una configuracion acoplada e innecesaria.

`checkSync` debe estar disponible para configuraciones locales y puramente
sincronas. Si una libreria/config necesita red, CMS remoto o lectores async, la
clase puede lanzar un error claro en `checkSync` indicando que se use `check`.

## ESLint/Oxlint

Fuera de scope inicial.

Motivos:

- `unused-translation-key`, `missing-locale-key`, `empty-translation-value` y
  buena parte de Intlayer/Paraglide requieren contexto de proyecto completo.
- ESLint normalmente reporta archivo a archivo.
- Un plugin que cargue todo el proyecto por cada archivo puede ser lento.
- Un plugin que cachee todo el proyecto puede ser complejo y fragil.
- Un plugin source-only tendria poco valor frente a TypeScript en librerias
  type-safe.

Podria reconsiderarse despues para reglas locales:

- `raw-ui-text`.
- `unresolved-dynamic-key`.
- algun `missing-translation-key` si se carga config de proyecto una vez.

Pero no debe condicionar el diseno inicial.

## Resolucion estatica de keys

Se puede adaptar el resolver estatico del checker CSS para:

- String literals: `t("a.b")`.
- Template sin expresiones: ``t(`a.b`)``.
- Constantes: `const key = "a.b"; t(key)`.
- Enums/string enums: `t(Keys.LoginTitle)`.
- Object maps: `messages.login`.
- Type unions: `variant: "save" | "cancel"`.
- Templates con dominio finito: ``t(`button.${variant}`)``.
- Arrays de fallback: `t(["specific", "fallback"])`.
- Selector functions i18next: `t($ => $.user.profile.title)`.
- Destructuring y aliases: `const { t: translate } = useTranslation()`.
- Diccionarios: `const content = useIntlayer("page"); content.header.title`.

Cuando no se pueda resolver:

- Emitir `unresolved-dynamic-key` con ubicacion.
- O marcar como "assume used" para evitar falsos positivos de unused, segun
  config.

Ejemplo:

```ts
dynamicKeyPolicy:
  | "report"
  | "ignore"
  | { assumeUsedPattern: "errors.*" }
```

## Catalogos, declaraciones y formatos

Catalogos iniciales:

- JSON anidado i18next.
- JSON plano `{ "key": "value" }`.
- JSON por namespace e idioma con placeholders `{locale}` y `{namespace}`.
- FormatJS compiled JSON `{ "id": "message" }`.
- FormatJS extracted JSON `{ "id": { "defaultMessage": "..."} }`.
- Intlayer content declaration files `*.content.{ts,tsx,js,mjs,cjs,json}`.

Catalogos posteriores:

- Lingui PO.
- Lingui JSON.
- Inlang/Paraglide `project.inlang/settings.json`.
- YAML.
- ResX, si se quiere rescatar soporte del checker actual.

Para librerias con declaraciones TypeScript:

- El lector debe poder parsear archivos TS/TSX con Oxc.
- Para contenido que ejecuta funciones helper, el MVP debe resolver solo formas
  estaticas obvias.
- Si la propia libreria genera diccionarios intermedios fiables, puede ser mejor
  leer esos outputs generados en vez de interpretar toda la DSL.

## Comparacion de opciones

### Opcion A: modernizar el checker actual con regex

Ventajas:

- Rapida.
- Menor cambio.

Inconvenientes:

- Seguiria teniendo falsos positivos/negativos con aliases, wrappers y dinamicos.
- No escala bien a Intlayer, FormatJS, Lingui o Paraglide.
- Acaba recreando un parser pobre dentro de regex.
- Mantiene configuraciones heredadas como `ignoredKeys`, `customRegExpToFindKeys`
  y `deepSearch`, que no encajan con el nuevo enfoque.

Uso recomendado:

- No recomendado para el producto nuevo. Puede quedarse como proyecto historico
  separado, pero no deberia condicionar la API ni la configuracion del nuevo
  checker.

### Opcion B: monorepo con core agnostico y paquetes por libreria

Ventajas:

- Arquitectura probada conceptualmente por el checker CSS.
- El core se mantiene pequeno y sin acoplamiento a APIs concretas.
- Cada paquete tiene API, config y defaults naturales para su libreria.
- No obliga a soportar multi-libreria en un proyecto.
- El CLI puede compartir reporter, exit codes y discovery sin mezclar reglas.

Inconvenientes:

- Mayor coste inicial que una regex.
- Hay que mantener varios paquetes publicos.
- Algunas librerias con macros o generacion de IDs requeriran integracion con
  outputs oficiales.

Uso recomendado:

- Es la opcion principal.

### Opcion C: usar extractores oficiales y construir solo comparador

Ventajas:

- Para FormatJS/Lingui reduce riesgo de replicar macros o auto-id.
- Aprovecha herramientas mantenidas por cada ecosistema.

Inconvenientes:

- Experiencia menos homogenea.
- Mas dependencias y configuraciones por libreria.
- No resuelve tan bien `raw-ui-text` ni usos custom sin extractor.

Uso recomendado:

- Buena para adaptadores avanzados de FormatJS/Lingui, no como unica base para
  i18next/react-i18next/Intlayer.

### Opcion D: core generico con frontends por lenguaje

Ventajas:

- Prepara soporte futuro a Python, Java, Kotlin, PHP, etc.
- Mantiene el comparador independiente del parser.

Inconvenientes:

- Mas abstraccion inicial.
- Cada lenguaje necesita parser, resolver de imports y convenciones propias.

Uso recomendado:

- Disenar el core para no bloquearlo, pero implementar solo JS/TS primero.

## Soporte futuro a otros lenguajes

Es viable si el core no depende directamente de Oxc. Oxc deberia ser el primer
frontend:

```ts
type SourceFrontend = {
  language: "javascript" | "typescript" | "python" | "java" | "custom";
  extensions: string[];
  analyze(file: SourceFile, config: unknown): SourceUsage[];
};
```

Para otros lenguajes:

- Usar parsers especificos o Tree-sitter.
- Detectar imports/usings para saber de donde viene la funcion de traduccion.
- Convertir todo a `SourceUsage`.
- Reutilizar comparador, reglas y reporters.

No conviene prometer soporte multi-lenguaje en el MVP. Si la interfaz queda bien
separada, se puede anadir despues sin reescribir el core.

## Roadmap recomendado

### Fase 0: RFC y core agnostico

Objetivo:

- Crear monorepo.
- Definir tipos `Diagnostic`, `CatalogMessage`, `SourceUsage`, `RawTextUsage`.
- Implementar parseo Oxc, AST walk, ubicaciones, resolver estatico, discovery y
  comparador.
- No incluir conocimiento de librerias en el core.

Entregable:

- `packages/core` con tests unitarios de parseo, resolver estatico, raw text y
  comparacion.

### Fase 1: paquete react-i18next

Objetivo:

- Detectar `t("key")`, `useTranslation`, namespace, `keyPrefix`, `Trans i18nKey`.
- Leer JSON i18next anidado.
- Emitir reglas base: missing, missing-locale, unused, empty, unresolved.

Entregable:

- `ReactI18nextChecker`.
- Fixtures reales con TS, TSX, aliases y shadowing.

### Fase 2: CLI con subcomando react-i18next

Objetivo:

- Comando CI-friendly con reporter texto y JSON.
- Config file.
- Exit codes estables.

Entregable:

- `@stale-i18n/cli`.
- `stale-i18n react-i18next`.

### Fase 3: raw UI text

Objetivo:

- Detectar `JSXText`, atributos JSX y props configuradas.
- Ignorar tests/stories y patrones configurados.
- Mantenerlo opt-in.

Entregable:

- Regla `raw-ui-text` disponible en CLI/API.

### Fase 4: i18next node/base y resolver avanzado

Objetivo:

- Soportar usos no React de i18next.
- Constantes, enums, templates con unions, arrays de fallback, selector
  functions.
- Politicas para dinamicos.

Entregable:

- `I18nextChecker`.

### Fase 5: Intlayer

Objetivo:

- Leer `*.content.{ts,tsx,js,mjs,cjs,json}` o outputs `.intlayer`.
- Detectar `useIntlayer("key")`.
- Resolver accesos a propiedades del diccionario cuando sea posible.

Entregable:

- `IntlayerChecker`.
- Reglas `unused-translation-key`, `unused-content-property`, `empty` y
  `raw-ui-text`.

### Fase 6: Paraglide

Objetivo:

- Detectar imports desde `paraglide/messages.js`.
- Resolver `m.foo()` y `m["foo"]()`.
- Leer JSON/Inlang basico.

Entregable:

- `ParaglideChecker`.

### Fase 7: FormatJS

Objetivo:

- `intl.formatMessage`, `<FormattedMessage>`, `defineMessage(s)`.
- Catalogos FormatJS JSON.
- IDs explicitos primero.

Entregable:

- `FormatJsChecker`.

### Fase 8: Lingui

Objetivo:

- IDs explicitos y runtime directo.
- Lectura de catalogos Lingui o salida oficial de extraccion.

Entregable:

- `LinguiChecker`.

## Riesgos y mitigaciones

Riesgo: falsos positivos con keys dinamicas.

Mitigacion: diagnostico `unresolved-dynamic-key`, politicas `assumeUsedPattern`,
ignores por key y reglas configurables.

Riesgo: auto IDs de FormatJS/Lingui.

Mitigacion: soportar ids explicitos primero; para auto IDs, leer outputs
oficiales o depender de toolchains oficiales.

Riesgo: interpretar DSLs TypeScript de contenido.

Mitigacion: resolver solo patrones estaticos; donde exista output generado
estable, leerlo preferentemente.

Riesgo: texto plano con mucho ruido.

Mitigacion: `raw-ui-text` opt-in, `minLength`, ignores, atributos configurables,
component props configurables y exclusion de tests/stories.

Riesgo: core acoplado.

Mitigacion: core como toolkit interno. Las decisiones de libreria viven en cada
paquete publico.

## Decision recomendada

Construir un nuevo checker i18n como monorepo con core agnostico y paquetes por
libreria. Cada paquete exporta una clase concreta que implementa la interfaz
comun del core (`check`/`checkSync`). No crear una API publica generica con
`libraries`. No meter ESLint en el scope inicial. No dar soporte multi-libreria
por proyecto en el MVP.

Primer producto recomendado:

1. `@stale-i18n/react-i18next`
2. `@stale-i18n/cli` con `stale-i18n react-i18next`
3. Regla opt-in `raw-ui-text`
4. `@stale-i18n/intlayer`, porque es relevante para librerias TypeScript-first y
   para unused content

Luego:

1. `@stale-i18n/paraglide`
2. `@stale-i18n/formatjs`
3. `@stale-i18n/lingui`

## Referencias

- Oxc parser: https://oxc.rs/docs/guide/usage/parser
- Oxc resolver: https://oxc.rs/docs/guide/usage/resolver
- i18next API: https://www.i18next.com/overview/api
- i18next configuration: https://www.i18next.com/overview/configuration-options
- i18next namespaces: https://www.i18next.com/principles/namespaces
- i18next translation essentials: https://www.i18next.com/translation-function/essentials
- i18next JSON format: https://www.i18next.com/misc/json-format
- react-i18next `useTranslation`: https://react.i18next.com/latest/usetranslation-hook
- react-i18next `Trans`: https://react.i18next.com/latest/trans-component
- FormatJS React Intl API: https://formatjs.github.io/docs/react-intl/api/
- FormatJS message declaration: https://formatjs.github.io/docs/getting-started/message-declaration/
- FormatJS CLI: https://formatjs.github.io/docs/tooling/cli/
- Lingui macros: https://lingui.dev/ref/macro
- Lingui message extraction: https://lingui.dev/guides/message-extraction
- Lingui React API: https://lingui.dev/ref/react
- Lingui configuration: https://lingui.dev/ref/conf
- Paraglide basics: https://inlang.com/m/gerre34r/library-inlang-paraglideJs/basics
- Paraglide compiling messages: https://paraglidejs.com/compiling-messages
- Paraglide file formats: https://paraglidejs.com/file-formats
- Intlayer documentation: https://intlayer.org/doc/get-started
- Intlayer how it works: https://intlayer.org/en-GB/doc/concept/how-works-intlayer
- Intlayer repository: https://github.com/aymericzip/intlayer
