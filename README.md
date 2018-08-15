# Athena-Express: Simplify SQL queries on Amazon Athena

[![NPM](https://nodei.co/npm/athena-express.png?compact=true)](https://nodei.co/npm/athena-express/)

[![Build Status](https://travis-ci.org/ghdna/athena-express.svg?branch=master)](https://travis-ci.org/ghdna/athena-express)
[![Code Climate](https://codeclimate.com/github/ghdna/athena-express/badges/gpa.svg)](https://codeclimate.com/github/ghdna/athena-express/)
[![Coverage Status](https://coveralls.io/repos/github/ghdna/athena-express/badge.svg?branch=master)](https://coveralls.io/github/ghdna/athena-express?branch=master)

## Synopsis

athena-express makes it easier to execute SQL queries on Amazon Athena by chaining together a bunch of methods in the AWS SDK. This allows you to execute SQL queries **AND** fetch JSON results in the same synchronous call - well suited for web applications. 


It's lightweight (~4KB uncompressed) and has zero dependencies.

##### Example:
![athena-express example](https://pbs.twimg.com/media/Dkne8s0U0AA4xwd.png)

## Motivation

[Amazon Athena](https://aws.amazon.com/athena/), launched at AWS re:Invent 2016, made it easier to analyze data in Amazon S3 using standard SQL. Under the covers, it uses [Presto](https://prestodb.io/), which is an opensource SQL engine developed by Facebook in 2012 to query their 300 Petabyte data warehouse. It's incredibly powerful!

**Good News** is that Amazon Athena combines the colossal strength of Presto with serverless & self-managed capabilities of AWS

**Not So Good News** is that using Amazon Athena via the AWS' SDK requires too many moving parts to setup including the manual error handling.

**Enter athena-express!**

athena-express essentially bundles following steps as listed on the official [AWS Documentation](https://docs.aws.amazon.com/athena/latest/APIReference/Welcome.html):

- Start a query execution
- Keep checking until the said query has finished executing
- Fetch the results of said query execution from Amazon S3

And as an added bonus

- Format the results into a clean, friendly JSON array
- Handle Athena errors by recursively retrying for `ThrottlingException`, `NetworkingError`, and `TooManyRequestsException`

## Prerequisites

-   You will need an `IAM Role` (if executing from `AWS Lambda`) **OR** an `IAM User` with `accessKeyId` and `secretAccessKey`
-   This IAM role/user must have at least `AmazonAthenaFullAccess` and `AmazonS3FullAccess` policies attached to its permissions
    -   As an alternative to granting `AmazonS3FullAccess` you could granularize the policy to a specific bucket that you must specify during athena-express initialization

## Configuration & Initialization options

#### Zero config mode:

In zero config mode, AthenaExpress creates a new `S3 bucket` in your AWS account for Amazon Athena to store the query results in.

```javascript
const AthenaExpress = require("athena-express"),
	aws = require("aws-sdk"),
	awsCredentials = {
		/* required */
		region: "STRING_VALUE",
		accessKeyId: "STRING_VALUE",
		secretAccessKey: "STRING_VALUE"
	};

aws.config.update(awsCredentials);

//Initializing AthenaExpress with zero configuration
const athenaExpress = new AthenaExpress({ aws });
```

#### Minimal config mode: (recommended)

In minimal config mode, you specify an `S3 bucket` in your AWS account for Amazon Athena to store the query results in.

```javascript
const AthenaExpress = require("athena-express"),
	aws = require("aws-sdk"),
	awsCredentials = {
		/* required */
		region: "STRING_VALUE",
		accessKeyId: "STRING_VALUE",
		secretAccessKey: "STRING_VALUE"
	};

aws.config.update(awsCredentials);

//AthenaExpress config object
const athenaExpressConfig = {
	aws /* required */,
	s3: "STRING_VALUE"
};

//Initializing AthenaExpress with minimal configuration
const athenaExpress = new AthenaExpress(athenaExpressConfig);
```

Minimum Config Parameters:

-   `s3` - (String) S3 bucket name/prefix you want created in your AWS account. e.g. `s3://my-bucket-us-east-1`

#### Advance config mode:

All config options

```javascript
//AthenaExpress config object
const athenaExpressConfig = {
	aws /* required */,
	s3: "STRING_VALUE",
	formatJson: BOOLEAN,
	retry: Integer,
	db: "STRING_VALUE"
};

//Initializing AthenaExpress with all configuration options
const athenaExpress = new AthenaExpress(athenaExpressConfig);
```

Advance Config Parameters:

-   `s3` - (String) S3 bucket name/prefix you want created in your AWS account
-   `formatJson` - (Boolean) default value is true. Override as false if you rather get the raw unformatted JSON from Athena
-   `retry` - (Integer) default value is 200 (milliseconds) of interval to keep checking if the specific Athena query has finished executing
-   `db` - (String) Set the Athena database name here to execute athena queries without needing to specify a `db` everytime during execution.

    ```javascript
    //So you can execute Athena queries simply by passing the SQL statement
    athenaExpress.query("SELECT * FROM movies LIMIT 3");

    //Instead of SQL & DB object
    athenaExpress.query({
    	sql: "SELECT * FROM movies LIMIT 3",
    	db: "moviedb"
    });
    ```

## Usage

###### Using Promises:

```javascript
let query = {
	sql: "SELECT elb_name, request_port, request_ip FROM elb_logs LIMIT 3" /* required */,
	db: "sampledb" /* assumes 'default' database if not specified here  */
};

athenaExpress
	.query(query)
	.then(results => {
		console.log(results);
	})
	.catch(error => {
		console.log(error);
	});
```

###### Using Async/Await:

```javascript
(async () => {
	let query = {
		sql: "SELECT elb_name, request_port, request_ip FROM elb_logs LIMIT 3" /* required */,
		db: "sampledb" /* assumes 'default' database if not specified here  */
	};

	try {
		let results = await athenaExpress.query(query);
		console.log(results);
	} catch (error) {
		console.log(error);
	}
})();
```

## Full Example

###### Using standard NodeJS application

```javascript
"use strict";

const AthenaExpress = require("athena-express"),
	aws = require("aws-sdk"),
	awsCredentials = {
		region: "us-east-1",
		accessKeyId: "AKIAIHV5B6DGMEXVCXGA",
		secretAccessKey: "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"
	};

aws.config.update(awsCredentials);

const athenaExpressConfig = {
	aws,
	s3: "s3://my-bucket-for-storing-athena-results-us-east-1"
};

//Initializing AthenaExpress with minimal configuration
const athenaExpress = new AthenaExpress(athenaExpressConfig);

//Invoking a query on Amazon Athena
(async () => {
	let query = {
		sql: "SELECT elb_name, request_port, request_ip FROM elb_logs LIMIT 3",
		db: "sampledb"
	};

	try {
		let results = await athenaExpress.query(query);
		console.log(results);
	} catch (error) {
		console.log(error);
	}
})();
```

###### Using AWS Lambda

```javascript
"use strict";

const AthenaExpress = require("athena-express"),
	aws = require("aws-sdk");

/* AWS Credentials are not required here 
    /* but the IAM Role assumed by this Lambda 
    /* must have the necessary permission to execute Athena queries 
    /* and store the result in Amazon S3 bucket */

const athenaExpressConfig = {
	aws,
	s3: "s3://my-bucket-for-storing-athena-results-us-east-1"
};

//Initializing AthenaExpress with minimal configuration
const athenaExpress = new AthenaExpress(athenaExpressConfig);

exports.handler = async (event, context, callback) => {
	let query = {
		sql: "SELECT elb_name, request_port, request_ip FROM elb_logs LIMIT 3",
		db: "sampledb"
	};

	try {
		let results = await athenaExpress.query(query);
		callback(null, results);
	} catch (error) {
		callback(error, null);
	}
};
```

###### Results:

```javascript
[{
	elb_name: "elb_demo_005",
	request_port: "8222",
	request_ip: "245.85.197.169"
},
{
	elb_name: "elb_demo_003",
	request_port: "24615",
	request_ip: "251.165.102.100"
},
{
	elb_name: "elb_demo_007",
	request_port: "24251",
	request_ip: "250.120.176.53"
}]
```

## Contributors

[Gary Arora](https://twitter.com/AroraGary)

## License

MIT
