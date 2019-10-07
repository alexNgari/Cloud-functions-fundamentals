const { Datastore } = require('@google-cloud/datastore');

const datastore = new Datastore();

exports.purchasePackage = (data, context) => {
    console.log(` ${context.eventId}.`);

    const pubSubMessage = data;
    const dataString = Buffer.from(pubSubMessage.data, 'base64').toString();
    const stringData = JSON.parse(dataString);

    const keyPath = [
        'Project',
        datastore.int(stringData.projectId),
        'Package',
        datastore.int(stringData.packageId)
    ];
    console.log(keyPath);
    const packageKey = datastore.key(keyPath);
    // console.log(`packageKey: ${packageKey}`);


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