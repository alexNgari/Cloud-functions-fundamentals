const chalk = require('chalk');
const Datastore = require('@google-cloud/datastore');
const Storage = require('@google-cloud/storage');
const testData = require('./testData.json');

const projectId = process.env.GCLOUD_PROJECT_ID;
const bucketName = process.env.BUCKET_NAME;
const datastore = new Datastore({
    projectId: projectId
});

const storage = new Storage({
    projectId: projectId
});

const fetchPromises = [];
testData.forEach(entity => {
    const projectKey = entity.projectId;

    entity.packages.forEach((packageData) => {
        const packageKey = packageData.id;
        const keyPath = datastore.key([
            'Project',
            datastore.int(projectKey),
            'Package',
            datastore.int(packageKey)
        ]);

        fetchPromise = datastore.get(keyPath);
        fetchPromises.push(fetchPromise);
    });

});

Promise.all(fetchPromises).then((results) => {
    const entities = results.map(result => {
        const entity = result[0];
        const key = entity[datastore.KEY];

        entity.totalReceived = 0;
        entity.pledges = 0;

        return entity;
    });

    return datastore.update(entities).then(() => {
        console.log(chalk.green('Updated entities!'));
    });
});

const bucket = storage.bucket(bucketName);
bucket.getFiles().then(files => {
    const fileCount = files[0].length;
    console.log(`Preparing to delete ${fileCount} files.`);

    const deletionPromises = files[0].map(file => file.delete());
    Promise.all(deletionPromises).then(() => {
        console.log(chalk.green(`Processed and deleted ${fileCount} file(s), all is right in the world`));
    }).catch(err => {
        console.error(chalk.red('There was an issue deleting files.', err));
    });
});