type ShellOptions = {
    cwd?: string;
    shell?: boolean;
    input?: string;
};
type Outputs = {
    stdout: string;
    stderr: string;
};
export declare function shell(program: string, args: string[], options?: ShellOptions): Promise<Outputs>;
export declare function wait(ms: number): Promise<void>;
export {};
