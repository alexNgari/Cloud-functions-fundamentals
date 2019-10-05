const exec = require('child_process').exec;
const path = require('path');
const os = require('os');
const fs = require('fs');

const { Datastore } = require('@google-cloud/datastore');
const { Storage } = require('@google-cloud/storage');
const vision = require('@google-cloud/vision');

const datastore = new Datastore();
const storage = new Storage();
const client = new vision.ImageAnnotatorClient();


exports.imageTagger = (data, context) => {
    return tagger(data, context);
}


exports.deleteTagger = (data, context) => {
    return tagger(data, context);
}


tagger = (data, context) => {
    const object = data;

    if (context.eventType === 'google.storage.object.delete') {
        object.resourceState = 'not_exists';
    } else {
        object.resourceState = 'exists';
    }

    const parsedPath = path.parse(object.name);

    if (parsedPath.dir !== 'uploads') {
        console.log('Only processing images from the upload folder');
        return Promise.resolve();
    } else if (!object.contentType.startsWith('image/')) {
        console.log('This is not an image');
        return Promise.resolve();
    }

    return processLabels(object);
}


const processLabels = (bucketObject) => {
    const storagePath = `gs://${bucketObject.bucket}/${bucketObject.name}`;
    const query = datastore.createQuery('Images').select('__key__').limit(1);
    query.filter('storagePath', '=', storagePath);

    return query.run()
        .then(data => {
            const objectExists = data[0].length > 0;
            const key = objectExists ? data[0][0][datastore.KEY] : datastore.key('Images');

            if (objectExists && bucketObject.resourceState == 'not_exists') {
                return datastore.delete(key).then(() => {
                    console.log('Successfully deleted entity.');
                });
            } else if (bucketObject.resourceState === 'not_exists') {
                return Promise.resolve();
            } else {
                const labelPromise = processImageLabels(storagePath, key);
                const thumbnailPromise = generateThumbnail(bucketObject);

                return Promise.all([thumbnailPromise, labelPromise])
                    .then((results) => {
                        console.log(results);

                        const entity = results[1];

                        const thumbnailName = results[0][0].name;
                        const thumbnailPath = `gs://${bucketObject.bucket}/${thumbnailName}`;
                        entity.data.thumbnailPath = thumbnailPath;
                        return datastore.save(entity);
                    })
            }

        })
        .catch(err => {
            console.error('Query run received an error', err);
        });
}


const processImageLabels = (storagePath, key) => {
    return client.labelDetection(storagePath)
        .then(([results]) => {
            console.log(results);

            const labels = results.labelAnnotations;
            const descriptions = labels.filter((label) => label.score >= 0.65)
                .map(label => label.description);

            return {
                key: key,
                data: {
                    storagePath: storagePath,
                    tags: descriptions
                }
            };
            // return datastore.save(entity);
        })
        .catch(err => {
            console.error('Vision api returned a failure:', err);
        })
}

//  Generates thumbnails
const generateThumbnail = (bucketObject) => {
    const filePath = bucketObject.name;
    const parsedPath = path.parse(bucketObject.name);
    const fileName = parsedPath.base;

    const bucket = storage.bucket(bucketObject.bucket);
    const file = bucket.file(bucketObject.name); // File to process

    const tempLocalDir = path.join(os.tmpdir(), parsedPath.dir);
    const tempLocalFile = path.join(tempLocalDir, fileName); // File to write to

    return mkDirAsync(tempLocalDir) // Download file
        .then(() => {
            return file.download({ destination: tempLocalFile });
        })
        .catch(err => {
            console.error('Failed to download file.', err);
            return Promise.reject(err);
        })
        .then(() => {
            console.log(`${file.name} successfully downoaded to ${tempLocalFile}`);

            return new Promise((resolve, reject) => { // Generate thumbnail
                const escapedFile = tempLocalFile.replace(/(\s+)/g, '\\$1');
                exec(`convert ${escapedFile} -thumbnail '200x200' ${escapedFile}`, { stdio: 'ignore' }, (err, stdout) => {
                    if (err) {
                        console.error('Failed to resize image!', err);
                        reject();
                    } else {
                        resolve(stdout);
                    }
                });
            });
        })
        .then(() => { // Upload thumbnail
            console.log(`Image ${fileName} successfully resized to 200x200`);
            const thumbnailFileName = path.join('thumbnails', fileName);

            return bucket.upload(tempLocalFile, { destination: thumbnailFileName })
                .catch((err) => {
                    console.error('Failed to upload thumbnail.', err);
                    return Promise.reject(err);
                });
        })
        .then((newFileObject) => {
            return new Promise((resolve, reject) => {
                console.log('Unlinking file');
                fs.unlink(tempLocalFile, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(newFileObject);
                    }
                })
            });
        });
}


//  Makes directory if it doesn't exist
const mkDirAsync = (dir) => {
    return new Promise((resolve, reject) => {
        fs.lstat(dir, (err, stats) => {
            if (err) { // Directory doesn't exist
                if (err.code === 'ENOENT') {
                    fs.mkdir(dir, (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            console.log('Created directory');
                            resolve();
                        }
                    })
                } else {
                    reject(err);
                }
            } else { // Directory exists
                if (stats.isDirectory()) {
                    console.log(`${dir} already exists!`);
                    resolve();
                } else {
                    reject(new Error('A directory was not passed to this function!'))
                }
            }
        })
    });
}