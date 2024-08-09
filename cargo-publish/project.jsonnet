local npm = import 'npm.libsonnet';

{
    targets: npm.all('cargo-publish', {
        workspaceDependencies: ['node-executors-common']
    })
}