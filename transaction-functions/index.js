const fs = require('fs');
const os = require('os');
const path = require('path');
const { Datastore } = require('@google-cloud/datastore');
const { Storage } = require('@google-cloud/storage');

const datastore = new Datastore();
const storage = new Storage();

const BUCKET_NAME = 'cloud-functions-fundamentals-packaging-data'


exports.purchasePackage = (data, context) => {
    console.log(` ${context.eventId}.`);

    const pubSubMessage = data;
    const dataString = Buffer.from(pubSubMessage.data, 'base64').toString();

    const bucket = storage.bucket(BUCKET_NAME);
    const fileName = `${context.eventId}.json`;
    const tmpFilePath = path.join(os.tmpdir(), fileName);

    return new Promise((resolve, reject) => {
            fs.writeFile(tmpFilePath, dataString, (err) => {
                if (err) {
                    console.error('Failed to write to the tmp dir', err);
                    reject(err);
                } else {
                    console.log(`Temp file created for ${tmpFilePath}.`);
                    resolve();
                }
            });
        })
        .then(() => {
            console.log(`Uploading ${fileName} to ${BUCKET_NAME}.`);
            return bucket.upload(tmpFilePath, { destination: fileName })
                .catch((err) => {
                    console.error('Failed to upload file', err);
                    return Promise.reject(err);
                });
        })
        .then(() => {
            return new Promise((resolve, reject) => {
                console.log(`Unlinking file ${tmpFilePath}`);
                fs.unlink(tmpFilePath, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                })
            })
        });
}


// Collects data from files dumped by purchasePackage in cloud storage and updates datastore
exports.batchProcess = (req, res) => {
    const bucket = storage.bucket(BUCKET_NAME);
    console.log(process.memoryUsage()); // We're expecting issues...haha

    bucket.getFiles()
        .then(files => {
            const downloadPromises = files[0].map(file => file.download());
            console.log(files);
            console.log(process.memoryUsage());

            Promise.all(downloadPromises)
                .then(downloadedFiles => {
                    console.log(process.memoryUsage());

                    const jsonData = downloadedFiles.reduce(reduceMessages, {});
                    console.log(jsonData);
                    console.log(process.memoryUsage());

                    fetchAndUpdateEntities(jsonData)
                        .then(() => {
                            const fileCount = files[0].length;
                            console.log(`Preparing to delete ${fileCount} files.`);

                            const deletionPromises = files[0].map(file => file.delete());

                            Promise.all(deletionPromises)
                                .then(() => {
                                    console.log(`Processed and deleted ${fileCount} files.`);
                                    res.status(200).send(`Processed ${fileCount} files`);
                                })
                                .catch(err => {
                                    console.error('There was an issue deleting files.', err);
                                    res.status(500).send('Ka-boom when deleting files from Cloud Storage.')
                                })
                        })
                        .catch((err) => {
                            console.error('Fetching and updating datastore failed.', err);
                            res.status(500).send('Ka-boom on fetching and updating datastore');
                        })
                });
        });
}


const reduceMessages = (previous, current) => {
    const data = JSON.parse(current[0]);

    const projectId = data.projectId;
    const packageId = data.packageId;

    if (projectId in previous) {
        if (packageId in previous[projectId]) {
            const packageData = previous[projectId][packageId];
            packageData.totalReceived += data.value;
            packageData.pledges += 1;
        } else {
            previous[projectId][packageId] = {
                totalReceived: data.value,
                pledges: 1
            }
        }
    } else {
        previous[projectId] = {};
        previous[projectId][packageId] = {
            totalReceived: data.value,
            pledges: 1
        }
    }

    return previous;
}


const fetchAndUpdateEntities = (data) => {
    const queryPromises = [];

    for (const projectKey of Object.keys(data)) {
        const projectData = data[projectKey];

        for (const packageKey of Object.keys(projectData)) {
            const keyPath = datastore.key([
                'Project',
                datastore.int(projectKey),
                'Package',
                datastore.int(packageKey)
            ]);

            const queryPromise = datastore.get(keyPath);
            queryPromises.push(queryPromise);
        }
    }

    return Promise.all(queryPromises)
        .then(results => {
            console.log('Received all queries');
            console.log(results);

            const entities = results.map(result => {
                const entity = result[0];
                const key = entity[datastore.KEY];

                const projectId = key.parent.id;
                const packageId = key.id;

                entity.totalReceived += data[projectId][packageId].totalReceived;
                entity.pledges += data[projectId][packageId].pledges;

                return entity;
            });

            return datastore.update(entities)
                .then(() => {
                    console.log('Updated entities!');
                });
        })
        .catch(err => {
            console.error('An error occurred.', err);
            return Promise.reject(err);
        });
}