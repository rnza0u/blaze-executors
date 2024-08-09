local npm = import 'npm.libsonnet';

local npmTargets = npm.all('blaze-deploy', {
    workspaceDependencies: ['node-executors-common']
});

{
    targets: npmTargets + {
        ci: {
            dependencies: ['lint', 'build']
        }
    }
}