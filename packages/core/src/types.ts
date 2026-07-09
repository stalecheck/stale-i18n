export type CheckStatus = "SUCCESS" | "FAIL";
export const RULE_LEVEL = {
  off: true,
  warning: true,
  error: true
} as const;
export type RULE_LEVEL = keyof typeof RULE_LEVEL;

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

export type SourceLocation = {
  index: number;
  line: number;
  column: number;
};

export type AnyNode = Record<string, unknown> & {
  type?: string;
  start?: number;
  end?: number;
};

export type Diagnostic = {
  code: RuleCode;
  severity: Exclude<RULE_LEVEL, "off">;
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

export type RuleOverrides = Partial<Record<RuleCode, RULE_LEVEL>>;

export type BaseCheckOptions = {
  target?: string;
  ignore?: string[];
  rules?: RuleOverrides;
};

export interface TranslationChecker<TOptions extends BaseCheckOptions = BaseCheckOptions> {
  readonly name: string;
  readonly options: Readonly<TOptions>;

  check(options?: Partial<TOptions>): Promise<CheckResult>;
  checkSync(options?: Partial<TOptions>): CheckResult;
}

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
