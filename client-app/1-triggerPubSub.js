const path = require('path');
const chalk = require('chalk');
const { PubSub } = require('@google-cloud/pubsub');
const testData = require('./testData.json');

const projectId = process.env.GCLOUD_PROJECT_ID;
const pubsub = new PubSub({
    projectId: projectId
});

// const topic = pubsub.topic(process.env.TOPIC_NAME);

const maxMessages = 100;
const maxMilliseconds = 10000;
const publisher = pubsub.topic(process.env.TOPIC_NAME, {
    batching: {
        maxMessages: maxMessages,
        maxMilliseconds: maxMilliseconds,
    },
});

const invocations = [5, 4, 3, 2, 1].map(x => x * 1);

let promises = [];

for (data of testData) {
    for (let index = 0; index < invocations.length; index++) {
        const totalInvocations = invocations[index];
        const package = data.packages[index];

        const pubData = {
            projectId: data.projectId,
            packageId: package.id,
            value: package.value
        }

        const dataBuffer = Buffer.from(JSON.stringify(pubData));
        for (let invocation = 0; invocation < totalInvocations; invocation++) {
            const promise = publisher.publish(dataBuffer).then(message => {
                console.log(chalk.blue(`Message was sent ${message}`));
            });
            promises.push(promise);
        }
    }
}

Promise.all(promises);