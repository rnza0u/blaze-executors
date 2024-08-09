local npm = import 'npm.libsonnet';

{
    targets: npm.all('npm-version-check', {
        workspaceDependencies: ['node-executors-common']
    })
}