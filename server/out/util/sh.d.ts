/**
 * Execute the following sh program.
 */
export declare function execShellScript(body: string, cmd?: string): Promise<string>;
/**
 * Get documentation for the given word by using help and man.
 */
export declare function getShellDocumentationWithoutCache({ word, }: {
    word: string;
}): Promise<string | null>;
export declare function formatManOutput(manOutput: string): string;
/**
 * Only works for one-parameter (serializable) functions.
 */
export declare function memorize<TArgument, TResult>(func: (argument: TArgument) => Promise<TResult>): (argument: TArgument) => Promise<TResult>;
export declare const getShellDocumentation: (argument: {
    word: string;
}) => Promise<string | null>;
