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

        const logData = {};

        if (rows.length === 0) {
            text += "No functions were invoked yesterday. Keep building and dploying!";
        } else {
            rows.forEach(row => {
                const total = row['invocation_total'];
                const functionName = row['function_name'];
                const region = row['region'];

                text += `${functionName} ran ${total} times in region ${region}. \n`;

                if (region in logData) {
                    data[region][functionName] = {
                        count: total
                    }
                } else {
                    data[region] = {};
                    data[region][functionName] = {
                        count: total
                    }
                }
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
            } else {
                console.log(body);
            }
        })

        const loggingPromise = customLog(data)
            .then(() => {
                console.log('successful log');
            })
            .catch(err => {
                console.error(err);
            });

        Promise.all([loggingPromise])
            .then(() => {
                res.status(200).send('Logging successful. Email sent!.');
            })
            .catch(err => {
                res.status(500).send('An error occured when trying to send the report.');
            })
    });
}


const customLog = (logData) => {
    const log = logging.log('analytics-log');

    console.log(process.env);

    const resource = {
        type: 'cloud_function',
        labels: {
            function_name: process.env.FUNCTION_NAME,
            region: process.env.FUNCTION_REGION
        }
    }

    const entry = log.entry({
            resource: resource,
            labels: {
                category: 'cron-job'
            },
            severity: 'DEBUG'
        },
        logData
    )

    return log.write(entry);
}