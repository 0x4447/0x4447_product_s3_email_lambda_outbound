let AWS = require('aws-sdk');
let MailComposer = require('nodemailer/lib/mail-composer');

//
//	Initialize S3.
//
let s3 = new AWS.S3({
	apiVersion: '2006-03-01'
});

//
//	Initialize SES.
//
let ses = new AWS.SES({
	apiVersion: '2010-12-01'
});

//
//	This lambda will read outgoing emails send them using SES, and store it
//	in S3 under the same path as the incoming email, but the difference is
//	that the file is saved in the Sent folder.
//
exports.handler = (event) => {

	//
	//	1.	This JS object will contain all the data within the chain.
	//
	let container = {
		bucket: event.Records[0].s3.bucket.name,
		key: event.Records[0].s3.object.key,
		email: {
			json: {},
			raw: ""
		}
	}

	console.log(container);

	//
	//	->	Start the chain.
	//
	load_the_email(container)
		.then(function(container) {

			return extract_data(container);

		}).then(function(container) {

			return generate_the_raw_email(container);

		}).then(function(container) {

			return send_email(container);

		}).then(function(container) {

			return save_the_email(container);

		}).then(function(container) {

			return true;

		}).catch(function(error) {

			console.error(error);

			return false;

		});

};

//	 _____    _____     ____    __  __   _____    _____   ______    _____
//	|  __ \  |  __ \   / __ \  |  \/  | |_   _|  / ____| |  ____|  / ____|
//	| |__) | | |__) | | |  | | | \  / |   | |   | (___   | |__    | (___
//	|  ___/  |  _  /  | |  | | | |\/| |   | |    \___ \  |  __|    \___ \
//	| |      | | \ \  | |__| | | |  | |  _| |_   ____) | | |____   ____) |
//	|_|      |_|  \_\  \____/  |_|  |_| |_____| |_____/  |______| |_____/
//
//
//	Load the email from S3.
//
function load_the_email(container)
{
	return new Promise(function(resolve, reject) {

		console.info("load_the_email");

		//
		//	1.	Set the query.
		//
		let params = {
			Bucket: container.bucket,
			Key: container.key
		};

		console.log(params)

		//
		//	->	Execute the query.
		//
		s3.getObject(params, function(error, data) {

			//
			//	1.	Check for internal errors.
			//
			if(error)
			{
				return reject(error);
			}

			//
			//	2.	Save the email for the next promise
			//
			container.email.json = JSON.parse(data.Body)

			//
			//	->	Move to the next chain.
			//
			return resolve(container);

		});

	});
}

//
//	Extract all the data necessary to organize the incoming emails.
//
function extract_data(container)
{
	return new Promise(function(resolve, reject) {

		console.info("extract_data");

		//
		//	1.	Extract all the information
		//
		let tmp_to = 	container.email.json
						.to
						.match(/[a-z0-9-]{1,30}@[a-z0-9-]{1,65}.[a-z]{1,}/gm)[0]
						.split('@');

		let tmp_from = 	container.email.json
						.from
						.match(/[a-z0-9-]{1,30}@[a-z0-9-]{1,65}.[a-z]{1,}/gm)[0]
						.split('@');

		//
		//	2.	Get the domain name of the receiving end, so we can group
		//		emails by all the domain that were added to SES.
		//
		let to_domain = tmp_to[1];

		//
		//	3.	Get the email name where the email is directed to.
		//
		let user_name = tmp_to[0];

		//
		//	4.	Based on the email name, we replace all the + characters, that
		//		can be used to organize ones on-line accounts in to /, this way
		//		we can build a S3 patch which will automatically organize
		//		all the email in structured folder.
		//
		let to_path = user_name.replace(/\+/g, "/");

		//
		//	5.	Get the domain name of the email which in our case will
		//		become the company name.
		//
		let company_name = tmp_from[1];

		//
		//	6.	Get the name of who sent us the email.
		//
		let company_account = tmp_from[0];

		//
		//	7.	Create the path where the email needs to be moved
		//		so it is properly organized.
		//
		let path = 	"Sent/"
					+ to_domain
					+ "/"
					+ company_name
					+ "/"
					+ to_path
					+ "/"
					+ company_account
					+ "/"
					+ container.date
					+ " - "
					+ container.subject
					+ "/"
					+ "email";

		//
		//	8.	Save the path for the next promise.
		//
		container.path = path;

		//
		//	->	Move to the next chain.
		//
		return resolve(container);

	});
}

//
//	Save the text version of the email
//
function generate_the_raw_email(container, callback)
{
	return new Promise(function(resolve, reject) {

		//
		//	1.	Crete the email based on the message object which holds all the
		//		necessary information.
		//
		let mail = new MailComposer(container.email.json);

		//
		//	2.	Take the email and compile it down to its text form for storage.
		//
		mail.compile().build(function(error, raw_message) {

			//
			//	1.	Check if there was an error
			//
			if(error)
			{
				return reject(error);
			}

			//
			//	2.	Save the raw email so we can save it as is in to S3.
			//
			container.email.raw = raw_message;

			//
			//	->	Move to the next promise
			//
            return resolve(container);
		});
	});
}

//
//
//
function send_email(container)
{
    return new Promise(function(resolve, reject) {

        //
        //	1.	Create the message
        //
        let params = {
            RawMessage:{
                Data: container.raw_email
            }
        };

        //
        //	-> Send the email out
        //
        ses.sendRawEmail(params,function(error, data) {

            //
            //	1.	Check if there was an error
            //
            if(error)
            {
                return reject(error);
            }

            //
            //	->	Move to the next chain
            //
            return resolve(container);

        });

    });
}

//
//	Save the text version of the email
//
function save_the_email(container)
{
	return new Promise(function(resolve, reject) {

		console.info("save_the_email");

		//
		//	1.	Set the query.
		//
		let params = {
			Bucket: process.env.BUCKET,
			Key: container.path,
			Body: container.email.raw
		};

		console.log(params);

		//
		//	->	Execute the query.
		//
		s3.putObject(params, function(error, data) {

			//
			//	1.	Check for internal errors.
			//
			if(error)
			{
				return reject(error);
			}

			//
			//	->	Move to the next chain.
			//
			return resolve(container);

		});

	});
}