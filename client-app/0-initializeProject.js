const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const { Datastore } = require('@google-cloud/datastore');
const { PubSub } = require('@google-cloud/pubsub');
const { Storage } = require('@google-cloud/storage');
const projectData = require('./projects.json');

const projectId = process.env.GCLOUD_PROJECT_ID;
const bucketName = process.env.BUCKET_NAME;
const topicName = process.env.TOPIC_NAME;

const datastore = new Datastore({
    projectId: projectId
});

const pubsub = new PubSub({
    projectId: projectId
});

const storage = new Storage({
    projectId: projectId
});


function addProject(project, key) {
    const data = {
        title: project.title,
        description: project.description
    };

    const entity = {
        key: key,
        data: data
    }

    return datastore.insert(entity).then(() => {
        console.log(chalk.green(`Created project ${project.title}`));
        return addPackage(project.packages, key);
    });
}


function addPackage(packagesData, projectKey) {
    const entities = packagesData.map(data => {
        console.log(chalk.green(`Creating package ${data.title}`));
        const key = datastore.key(['Project', datastore.int(projectKey.id), 'Package']);
        return {
            key: key,
            data: data
        }
    });

    return datastore.upsert(entities).then(() => {
        const packages = entities.map(entity => {
            return {
                id: entity.key.id,
                value: entity.data.minimumCost
            };
        });

        const json = {
            projectId: projectKey.id,
            packages: packages
        }

        return json;
    }).catch((err) => {
        console.error(chalk.red('An error occurred'), err);
    });
}

// Creating the topic if it doesn't exist
pubsub.getTopics().then((topics) => {
    const topicExists = topics[0]
        .filter(topic => topic.name === `projects/${projectId}/topics/${topicName}`)
        .length > 0;

    if (!topicExists) {
        pubsub.createTopic(topicName).then(results => {
                const topic = results[0];
                console.log(chalk.green(`Topic ${topic.name} created.`));
            })
            .catch(err => {
                console.error(chalk.red(`There was an issue creating the topic.  Just go and manually create it!`), err);
            });
    } else {
        console.log(chalk.yellow(`The topic "${topicName}" already exists`));
    }
});

// Creating a unique bucket using our project id
const bucket = storage.bucket(bucketName);
bucket.exists().then(exists => {
    if (!exists[0]) {
        bucket.create().then(() => {
                console.log(chalk.green(`${bucketName} was created in your project`));
            })
            .catch(err => {
                console.error(chalk.red(`There was an issue creating the bucket.  Just go and manually create it!`), err);
            });
    } else {
        console.log(chalk.yellow(`The bucket ${bucketName} already exists`));
    }
});

// Uploading data if it doesn't exist in the datastore database
const query = datastore.createQuery('Project').select('__key__').limit(1);
query.filter('title', '=', 'Waking Up! Episode 1');
query.run().then(data => {
    const projectExists = data[0].length > 0;

    if (!projectExists) {
        const projectPromises = projectData.map((project) => {
            const projectKey = datastore.key('Project');
            return addProject(project, projectKey);
        });

        Promise.all(projectPromises).then((json) => {
            const jsonFormatted = JSON.stringify(json);
            const filePath = path.join(__dirname, 'testData.json');
            return new Promise((resolve, reject) => {
                fs.writeFile(filePath, jsonFormatted, (err) => {
                    if (err) {
                        console.log(chalk.red(err));
                        reject();
                    } else {
                        console.log(chalk.blue(`Data generated at ${filePath}`));
                        resolve();
                    }
                });
            });
        });

    } else {
        console.log(chalk.yellow('Data is already uploaded to Cloud Datastore'));
    }
});