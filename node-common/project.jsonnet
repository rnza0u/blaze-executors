local npm = import 'npm.libsonnet';

{
    targets: npm.all('executors-common')
}