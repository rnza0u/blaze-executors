local npm = import 'npm.libsonnet';

{
    targets: npm.all('cargo-version-check', {
        workspaceDependencies: ['node-executors-common']
    })
}