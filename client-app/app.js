const path = require('path');
const chalk = require('chalk');

const projectId = 'cloud-functions-fundamentals';

process.env.GCLOUD_PROJECT_ID = projectId;
process.env.BUCKET_NAME = `${projectId}-packaging-data`;
process.env.TOPIC_NAME = `packageTransaction`;
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, 'cloud-functions-fundamentals-b1befc6372c2.json');

if (process.argv.length <= 2) {
    console.log(chalk.red(`Please include one parameter: 0, 1, or 2.  Type --help for more information.`));
    process.exit(0)
}

let arg = process.argv[2];
switch (arg) {
    case "0":
        const script0 = require('./0-initializeProject');
        break;
    case "1":
        const script1 = require('./1-triggerPubSub');
        break;
    case "2":
        const script2 = require('./2-resetProject');
        break
    case "help":
    case "-h":
    case "--help":
        console.log(chalk.yellow('Pass one of the numbers listed below as the first parameter \"node app 0\"'));
        console.log(chalk.blue('0 - will initialize cloud datastore with the data, create a new bucket, and new pubsub topic'));
        console.log(chalk.blue('1 - this will trigger the pubsub function by publishing data to your topic'));
        console.log(chalk.blue('2 - it will reset values in the datastore and delete files any files in the bucket.'));
        break;
    default:
        console.log(chalk.red('Invalid option'));
}