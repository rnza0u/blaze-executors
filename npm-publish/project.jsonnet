local npm = import 'npm.libsonnet';

{
    targets: npm.all('npm-publish', {
        workspaceDependencies: ['node-executors-common']
    })
}