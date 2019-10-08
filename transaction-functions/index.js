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