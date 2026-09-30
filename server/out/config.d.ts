import { z } from 'zod';
export declare const ShfmtConfigSchema: z.ZodObject<{
    path: z.ZodDefault<z.ZodString>;
    additionalArguments: z.ZodDefault<z.ZodPreprocess<z.ZodArray<z.ZodString>, unknown>>;
    ignoreEditorconfig: z.ZodDefault<z.ZodBoolean>;
    languageDialect: z.ZodDefault<z.ZodEnum<{
        auto: "auto";
        bash: "bash";
        posix: "posix";
        mksh: "mksh";
        bats: "bats";
    }>>;
    binaryNextLine: z.ZodDefault<z.ZodBoolean>;
    caseIndent: z.ZodDefault<z.ZodBoolean>;
    funcNextLine: z.ZodDefault<z.ZodBoolean>;
    keepPadding: z.ZodDefault<z.ZodBoolean>;
    simplifyCode: z.ZodDefault<z.ZodBoolean>;
    spaceRedirects: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export declare const ConfigSchema: z.ZodObject<{
    backgroundAnalysisMaxFiles: z.ZodDefault<z.ZodNumber>;
    backgroundAnalysisIgnore: z.ZodDefault<z.ZodArray<z.ZodString>>;
    enableSourceErrorDiagnostics: z.ZodDefault<z.ZodBoolean>;
    globPattern: z.ZodDefault<z.ZodString>;
    explainshellEndpoint: z.ZodDefault<z.ZodString>;
    logLevel: z.ZodDefault<z.ZodEnum<{
        debug: "debug";
        info: "info";
        warning: "warning";
        error: "error";
    }>>;
    includeAllWorkspaceSymbols: z.ZodDefault<z.ZodBoolean>;
    shellcheckExternalSources: z.ZodDefault<z.ZodBoolean>;
    shellcheckArguments: z.ZodDefault<z.ZodPreprocess<z.ZodArray<z.ZodString>, unknown>>;
    shellcheckPath: z.ZodDefault<z.ZodString>;
    shfmt: z.ZodPrefault<z.ZodObject<{
        path: z.ZodDefault<z.ZodString>;
        additionalArguments: z.ZodDefault<z.ZodPreprocess<z.ZodArray<z.ZodString>, unknown>>;
        ignoreEditorconfig: z.ZodDefault<z.ZodBoolean>;
        languageDialect: z.ZodDefault<z.ZodEnum<{
            auto: "auto";
            bash: "bash";
            posix: "posix";
            mksh: "mksh";
            bats: "bats";
        }>>;
        binaryNextLine: z.ZodDefault<z.ZodBoolean>;
        caseIndent: z.ZodDefault<z.ZodBoolean>;
        funcNextLine: z.ZodDefault<z.ZodBoolean>;
        keepPadding: z.ZodDefault<z.ZodBoolean>;
        simplifyCode: z.ZodDefault<z.ZodBoolean>;
        spaceRedirects: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const InitializationOptionsSchema: z.ZodObject<{
    backgroundAnalysisMaxFiles: z.ZodOptional<z.ZodNumber>;
    backgroundAnalysisIgnore: z.ZodOptional<z.ZodArray<z.ZodString>>;
    enableSourceErrorDiagnostics: z.ZodOptional<z.ZodBoolean>;
    globPattern: z.ZodOptional<z.ZodString>;
    explainshellEndpoint: z.ZodOptional<z.ZodString>;
    logLevel: z.ZodOptional<z.ZodEnum<{
        debug: "debug";
        info: "info";
        warning: "warning";
        error: "error";
    }>>;
    includeAllWorkspaceSymbols: z.ZodOptional<z.ZodBoolean>;
    shellcheckExternalSources: z.ZodOptional<z.ZodBoolean>;
    shellcheckArguments: z.ZodOptional<z.ZodPreprocess<z.ZodArray<z.ZodString>, unknown>>;
    shellcheckPath: z.ZodOptional<z.ZodString>;
    shfmt: z.ZodOptional<z.ZodObject<{
        path: z.ZodOptional<z.ZodString>;
        additionalArguments: z.ZodOptional<z.ZodPreprocess<z.ZodArray<z.ZodString>, unknown>>;
        ignoreEditorconfig: z.ZodOptional<z.ZodBoolean>;
        languageDialect: z.ZodOptional<z.ZodEnum<{
            auto: "auto";
            bash: "bash";
            posix: "posix";
            mksh: "mksh";
            bats: "bats";
        }>>;
        binaryNextLine: z.ZodOptional<z.ZodBoolean>;
        caseIndent: z.ZodOptional<z.ZodBoolean>;
        funcNextLine: z.ZodOptional<z.ZodBoolean>;
        keepPadding: z.ZodOptional<z.ZodBoolean>;
        simplifyCode: z.ZodOptional<z.ZodBoolean>;
        spaceRedirects: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ShfmtConfig = z.infer<typeof ShfmtConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;
export declare function getConfigFromEnvironmentVariables(): {
    config: Config;
    environmentVariablesUsed: string[];
};
export declare function getDefaultConfiguration(): Config;
