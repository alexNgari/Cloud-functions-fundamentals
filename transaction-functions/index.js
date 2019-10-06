const { Datastore } = require('@google-cloud/datastore');

const datastore = new Datastore();

exports.purchasePackage = (data, context) => {
    console.log(` ${context.eventId}.`);

    const pubSubMessage = data;
    const stringData = Buffer.from(pubSubMessage.data, 'base64').toString();
    const data = JSON.parse(stringData);

    const keyPath = [
        'Project',
        datastore.int(data.projectId),
        'Package',
        datastore.int(data.packageId)
    ];
    console.log(keyPath);
    const packageKey = datastore.int(keyPath);

    return datastore.get(packageKey).then(results => {
        const entity = results[0];
        const contribution = data.value || entity.minimumCost;
        entity.totalReceived += contribution;
        entity.pledges += 1;

        return datastore.update(entity).then(() => {
            console.log('Updated entity!');
        });
    });
}