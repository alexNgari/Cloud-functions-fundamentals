const request = require('request-promise');
const moment = require('moment');
const { Logging } = require('@google-cloud/logging');
const { BigQuery } = require('@google-cloud/bigquery');
const Mailgun = require('mailgun-js');

const logging = new Logging();
const bigQuery = new BigQuery();

const mailGunDomain = 'sandboxa1126e93215643e88c7854dbf21e2f0f.mailgun.org';
const secret = require('./mailgunKey.json').apiKey;

const mailgun = Mailgun({ apiKey: secret, domain: mailGunDomain });


exports.logSummary = (req, res) => {
    const yesterday = moment().subtract(1, 'day');
    const yesterdayTitle = yesterday.format('ddd, MMMM Do YYYY');

    const query = `SELECT COUNT(resource.labels.function_name) as invocation_total,
        resource.labels.function_name,
        resource.labels.region
        FROM \`cloud-functions-fundamentals.function_invocations.cloudfunctions_googleapis_com_cloud_functions\`
        WHERE CAST(timestamp as DATE) = DATE_ADD(CAST(CURRENT_TIMESTAMP() as DATE), INTERVAL -1 DAY)
        GROUP BY resource.labels.region, resource.labels.function_name`;

    const options = {
        query: query,
        location: "US",
        useLegacySql: false
    }

    bigQuery.query(options).then(results => {
        const rows = results[0];

        let text = `Here is the Cloud Functions log report for ${yesterdayTitle}. \n\n`;

        if (rows.length === 0) {
            text += "No functions were invoked yesterday. Keep building and dploying!";
        } else {
            rows.forEach(row => {
                const total = row['invocation_total'];
                const functionName = row['function_name'];
                const region = row['region'];

                text += `${functionName} ran ${total} times in region ${region}. \n`;
            });
        }

        console.log(text);

        const data = {
            from: 'no-reply@alex_testing.com',
            to: 'alex.ngari03@gmail.com',
            subject: `Serverless Report ${yesterdayTitle}`,
            text: text
        }

        console.log(secret);

        mailgun.messages().send(data, (error, body) => {
            if (error) {
                console.error('Email sending failed', error);
                res.status(500).send('Error sending email.');
            } else {
                console.log(body);
                res.status(200).send('Email sent!');
            }
        });
    })
}