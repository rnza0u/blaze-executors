import { spawn } from 'child_process';
export function shell(program, args, options = {}) {
    return new Promise((resolve, reject) => {
        console.log(`+ ${program} ${args.join(' ')}`);
        const child = spawn(program, args, {
            cwd: options.cwd,
            shell: options.shell
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', data => stdout += data);
        child.stderr.on('data', data => stderr += data);
        child.stdout.pipe(process.stdout);
        child.stderr.pipe(process.stderr);
        child.once('exit', code => {
            if (code === 0) {
                resolve({
                    stdout,
                    stderr
                });
                return;
            }
            reject(Error(`process returned non zero exit code ${code}`));
        });
        child.once('error', err => reject(err));
        if (typeof options.input === 'string')
            child.stdin.end(options.input);
    });
}
export function wait(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
}
