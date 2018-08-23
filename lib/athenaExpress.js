"use strict";

const COST_PER_MB = 0.000004768, //Based on $5/TB
	BYTES_IN_MB = 1048576,
	COST_FOR_10MB = COST_PER_MB * 10;

module.exports = class AthenaExpress {
	constructor(init) {
		validateConstructor(init);
		this.config = {
			athena: new init.aws.Athena({ apiVersion: "2017-05-18" }),
			s3:
				init.s3 ||
				`s3://athena-express-${init.aws.config.credentials.accessKeyId
					.substring(0, 10)
					.toLowerCase()}-${new Date().getFullYear()}`,
			db: init.db || "default",
			retry: Number(init.retry) || 200,
			formatJson: init.formatJson === false ? false : true,
			getStats: init.getStats
		};
	}

	async query(query) {
		let results = {};

		if (!this.config)
			throw new TypeError("Config object not present in the constructor");

		if (!query) throw new TypeError("SQL query is missing");

		try {
			const queryExecutionId = await startQueryExecution(
				query,
				this.config
			);
			const stats = await checkIfExecutionCompleted(
				queryExecutionId,
				this.config
			);
			const queryResults = await getQueryResults(
				queryExecutionId,
				this.config
			);

			results.Items = this.config.formatJson
				? cleanUpResults(queryResults)
				: queryResults;

			if (this.config.getStats) {
				const dataInMb = Math.round(
					stats.QueryExecution.Statistics.DataScannedInBytes /
						BYTES_IN_MB
				);

				results.DataScannedInMB = dataInMb;
				results.QueryCostInUSD =
					dataInMb > 10 ? dataInMb * COST_PER_MB : COST_FOR_10MB;
				results.EngineExecutionTimeInMillis =
					stats.QueryExecution.Statistics.EngineExecutionTimeInMillis;
				results.Count = results.Items.length;
			}

			return results;
		} catch (error) {
			throw new Error(error);
		}
	}
};

async function startQueryExecution(query, config) {
	const params = {
		QueryString: query.sql || query,
		ResultConfiguration: {
			OutputLocation: config.s3
		},
		QueryExecutionContext: {
			Database: query.db || config.db
		}
	};
	return new Promise(function(resolve, reject) {
		let startQueryExecutionRecursively = async function() {
			try {
				let data = await config.athena
					.startQueryExecution(params)
					.promise();
				resolve(data.QueryExecutionId);
			} catch (err) {
				commonAthenaErrors(err)
					? setTimeout(() => {
							startQueryExecutionRecursively();
					  }, 2000)
					: reject(err);
			}
		};
		startQueryExecutionRecursively();
	});
}

async function checkIfExecutionCompleted(QueryExecutionId, config) {
	let retry = config.retry;
	return new Promise(function(resolve, reject) {
		let keepCheckingRecursively = async function() {
			try {
				let data = await config.athena
					.getQueryExecution({ QueryExecutionId })
					.promise();
				if (data.QueryExecution.Status.State === "SUCCEEDED") {
					retry = config.retry;
					resolve(data);
				} else if (data.QueryExecution.Status.State === "FAILED") {
					reject(data.QueryExecution.Status.StateChangeReason);
				} else {
					setTimeout(() => {
						keepCheckingRecursively();
					}, retry);
				}
			} catch (err) {
				if (commonAthenaErrors(err)) {
					retry = 2000;
					setTimeout(() => {
						keepCheckingRecursively();
					}, retry);
				} else reject(err);
			}
		};
		keepCheckingRecursively();
	});
}

async function getQueryResults(QueryExecutionId, config) {
	return new Promise(function(resolve, reject) {
		let gettingQueryResultsRecursively = async function() {
			try {
				let queryResults = await config.athena
					.getQueryResults({ QueryExecutionId })
					.promise();
				resolve(queryResults.ResultSet.Rows);
			} catch (err) {
				commonAthenaErrors(err)
					? setTimeout(() => {
							gettingQueryResultsRecursively();
					  }, 2000)
					: reject(err);
			}
		};
		gettingQueryResultsRecursively();
	});
}

function cleanUpResults(results) {
	if (!results.length) return results;

	let rowIterator = 1,
		columnIterator = 0,
		cleanedUpObject = {},
		cleanedUpResults = [];

	const rowCount = results.length,
		fieldNames = results[0].Data,
		columnCount = fieldNames.length;

	for (; rowIterator < rowCount; rowIterator++) {
		for (; columnIterator < columnCount; columnIterator++) {
			cleanedUpObject[
				Object.values(fieldNames[columnIterator])[0]
			] = Object.values(results[rowIterator].Data[columnIterator])[0];
		}
		cleanedUpResults.push(cleanedUpObject);
		cleanedUpObject = {};
		columnIterator = 0;
	}

	return cleanedUpResults;
}

function validateConstructor(init) {
	if (!init)
		throw new TypeError("Config object not present in the constructor");

	try {
		let aws = init.s3 ? init.s3 : init.aws.config.credentials.accessKeyId;
		let athena = new init.aws.Athena({ apiVersion: "2017-05-18" });
	} catch (e) {
		throw new TypeError(
			"AWS object not present or incorrect in the constructor"
		);
	}
}

function commonAthenaErrors(err) {
	return err.code === "TooManyRequestsException" ||
		err.code === "ThrottlingException" ||
		err.code === "NetworkingError"
		? true
		: false;
}
