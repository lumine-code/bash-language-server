/**
 * Provides information based on the programs on your PATH
 */
export default class Executables {
    private executables;
    private constructor();
    /**
     * @param pathValue is expected to use the platform PATH delimiter.
     */
    static fromPath(pathValue: string): Promise<Executables>;
    /**
     * Find all programs in your PATH
     */
    list(): string[];
    /**
     * Check if the the given {{executable}} exists on the PATH
     */
    isExecutableOnPATH(executable: string): boolean;
}
