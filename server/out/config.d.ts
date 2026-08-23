import { z } from 'zod';
export declare const ConfigSchema: z.ZodObject<{
    backgroundAnalysisMaxFiles: z.ZodDefault<z.ZodNumber>;
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
    shellcheckArguments: z.ZodDefault<z.ZodPreprocess<z.ZodArray<z.ZodString>>>;
    shellcheckPath: z.ZodDefault<z.ZodString>;
    shfmt: z.ZodPrefault<z.ZodObject<{
        path: z.ZodDefault<z.ZodString>;
        ignoreEditorconfig: z.ZodDefault<z.ZodBoolean>;
        languageDialect: z.ZodDefault<z.ZodEnum<{
            bash: "bash";
            auto: "auto";
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
export type Config = z.infer<typeof ConfigSchema>;
export declare function getConfigFromEnvironmentVariables(): {
    config: Config;
    environmentVariablesUsed: string[];
};
export declare function getDefaultConfiguration(): Config;
