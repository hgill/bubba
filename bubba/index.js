'use strict';

let childProcess=require("child_process");
(function() {
    var oldSpawn = childProcess.spawn;
    function mySpawn() {
        log('spawn called');
        log(arguments);
        var result = oldSpawn.apply(this, arguments);
        return result;
    }
    childProcess.spawn = mySpawn;
})();

var express=require('express');
var app = express();
var server = require('http').Server(app);
var reqfeed=require("./reqfeed");
var process=require("process");
var bodyParser = require('body-parser');
let uuid=require("node-uuid");
let moment=require("moment");
var Rx=require('rxjs');
var request=require('request');
let rxrequest=Rx.Observable.bindNodeCallback(request);
let cheerio=require("cheerio");
var _=require('lodash');
let joi=require("joi");
let pool=require("./mysqlpool.js");

let rxmysqlquery=Rx.Observable.bindNodeCallback(pool.query.bind(pool));//This shit
let jssha=require("jssha");


 
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

app.post("/",function(req,res){
	//only subscribe and unsubscribe
	let {body,headers}=req;
	
	let headersSchema=joi.object({
		"content-type":joi.string().valid("application/x-www-form-urlencoded").required()
	}).required();

	let headersV=joi.validate(headers,headersSchema,{allowUnknown:true});
	
	let bodySchema=joi.object({
		"hub.callback":joi.string().uri().required(),
		"hub.mode":joi.string().valid(["subscribe","unsubscribe","reconcile"]).required(),
		"hub.topic":joi.string().uri().required(),
		"hub.lease_seconds":joi.number().optional().default(7 * 86400 + 3600),
		"hub.secret":joi.string().optional(),
		"hub.startFrom":joi.date().iso().optional()
	}).required();

	let bodyV=joi.validate(body,bodySchema,{abortEarly:false});
	if(headersV.error){
		res.send(headersV.error);
		return;
	}

	if(bodyV.error){
		res.send(bodyV.error);
		return;
	}

	//safe Objects = 

	let safeBody=bodyV.value;

	//Remove trailing slashes for uniqueness***
	safeBody["hub.topic"].replace(/\/+$/, "");
	safeBody["hub.callback"].replace(/\/+$/, "");

	//subscribe logic
	switch(safeBody["hub.mode"]){
		case "subscribe":
						Rx.Observable.of(safeBody)
						.flatMap(verifySubscriberRequest)
						.flatMap(saveSubscribe)
						.subscribe(([results,fields])=>{res.send(results)},(e)=>{res.send(e.message);});
						break;
		case "unsubscribe":
						Rx.Observable.of(safeBody)
						.flatMap(verifySubscriberRequest)
						.flatMap(saveUnsubscribe)
						.subscribe(([results,fields])=>{res.send(results)},(e)=>{res.send(e.message);});
						break;
		case "reconcile":
						
						

						Rx.Observable.of(safeBody)
						.flatMap(getAllSuspendedByCallback)
						.do((rows)=>{
							safeBody.toBeReconciled={count:rows.length,topics:"Cant disclose topics :|"};//count should help backoff
							res.status(200).send(safeBody);	
						})
						.flatMap(reconcileSubscriptionsSequentially,1)
						.subscribe((d)=>{log("Recon End: ",d)},(err)=>{log("Recon Err: ",err.message)});
						break;
		default:throw Error("Shouldn't have happened");
	}
});

app.get("/",function(req,res){
	res.sendFile(__dirname+"/landing.html")
})

function log(){
	console.log("[bubbamain]\n",...arguments);
}

function verifySubscriberRequest(bod){
	let cb=bod["hub.callback"];
	let sep = _.includes(cb, '?') === false ? '?' : '&';
	let challenge=uuid.v1();
	let cburl=`${cb+sep}hub.mode=${encodeURIComponent(bod["hub.mode"])}&hub.topic=${encodeURIComponent(bod["hub.topic"])}&hub.challenge=${encodeURIComponent(challenge)}&hub.lease_seconds=${encodeURIComponent(bod["hub.lease_seconds"])}`;

	return rxrequest({method:"GET",url:cburl,timeout:10000})
			.map(([res,body])=>{//arr output is Rx bug # 2094
				let verified,failure_rationale;
				if(res.statusCode<300 && res.statusCode>=200){
					verified=_.isEqual(decodeURIComponent(res.body),challenge);
					if(!verified)
						failure_rationale="Challenge did not match"
				}else{
					verified=false;
					failure_rationale="Status code should be 2**"	
				} 
				return Object.assign({},bod,{"verified":verified,"failure_rationale":failure_rationale});
			})
}

function saveUnsubscribe(obj){

	let now=moment().toISOString();
	let subSha=getSHA256(obj["hub.callback"]+obj["hub.topic"]);
	let topicSha=getSHA256(obj["hub.topic"]);
 
	let q="	CALL unsubscribe(?,?,?)"
	return rxmysqlquery({
		sql:q,
		values:[subSha,topicSha,now]
	});
}

function saveSubscribe(obj){

	let now=moment().toISOString();
	let subSha=getSHA256(obj["hub.callback"]+obj["hub.topic"]);
	let topicSha=getSHA256(obj["hub.topic"]);
	let leaseEnd=moment(now).add(obj["hub.lease_seconds"],'seconds').toISOString();
 
	let q="	CALL subscribe(?,?,?,?,?,?,?,?)"
	return rxmysqlquery({
		sql:q,
		values:[subSha,topicSha,now,
				obj["hub.callback"],
				obj["hub.topic"],
				obj["hub.secret"],
				obj["hub.lease_seconds"],
				leaseEnd]
	});
}

function getSHA256(str){
	let shaObj=new jssha("SHA-256", "TEXT");
	shaObj.update(str);
	return shaObj.getHash("HEX");
}

function getAllSuspendedByCallback(obj){

	let cb=obj["hub.callback"];
	
	let q="	CALL getAllSuspendedByCallback(?)"
	return rxmysqlquery({
		sql:q,
		values:[cb]
	}).map(([[rows,fields]])=>{//screwed up return cuz of multiple queries - fix in future v
		return rows;
	});
}

function reconcileSubscriptionsSequentially(subRows){

	return Rx.Observable.from(subRows)
			.flatMap((subRow)=>{
				let q="CALL reconcileSubscription(?)";

				return rxmysqlquery({sql:q, values:[subRow.sub_sha256]})
						.flatMap(([[cRows,fields]])=>{//screwed up return cuz of multiple queries - fix in future v
							return Rx.Observable.from(cRows)
									.flatMap((cRow)=>{
										/*
											cRow is {'scb','tsha','url','c_sha256','ref_t_sha256','c_added','c_body','c_restofresponse','c_statusCode' }
										*/

										return rxrequest({url:cRow.scb,
															method:"POST",
															json:true,
															body:{
																fetch:Object.assign({},
																	cRow.c_restofresponse,
																	{body:cRow.c_body}),
																topic:cRow.url,
																reconciling:true},
															timeout:10000
														})
												.flatMap(([response])=>{
														if(!(response.statusCode===200 && _.isEqual(response.body,cRow.url))) 
															throw Error("Validation failed - response from callback")

														let q="CALL updateSubscriptionLastContentSent(?,?)"
														return rxmysqlquery({
															sql:q,
															values:[subRow.sub_sha256,cRow.c_sha256]
														}).map((d)=>({success:"Sent and saved",subcb:subRow.sub_sha256,topic:cRow.url}))
												})
												.catch((err)=>{
													let q="CALL markSubscriptionSuspended(?)";

													return rxmysqlquery({
														sql:q,
														values:[subRow.sub_sha256]
													}).map((d)=>({error:(err.message?err.message:err),reconTopic:cRow.url,subcb:subRow.sub_sha256}))
												})
												
									})
						},1)
						.reduce((aggregate,nth)=>{nth.error?aggregate.reconErr++:aggregate.reconCount++;return aggregate},
							{reconCount:0,reconErr:0,subRow:subRow})
						.do((d)=>{
							if(d.reconErr===0){//remove suspension
								rxmysqlquery({sql:"CALL removeSubscriptionSuspended(?)",values:[subRow.sub_sha256]})
								.subscribe((d)=>{log("Suspension was removed: ",subRow.sub_sha256)},err=>{log("Suspension was not removed: ",subRow.sub_sha256)})
							}
						})
			},1)
}

let poller,tests;
server.listen(process.env.NODE_PORT,function(){
	log("bubba live on "+process.env.NODE_PORT);
	const spawn = childProcess.spawn;
	
	tests = spawn("node",["./tests.js"]);

	tests.stdout.on('data', (data) => {
	  console.log(`[tests]:\n ${data}`);
	});

	tests.stderr.on('data', (data) => {
	  console.log(`[tests]:\n ${data}`);
	});

	tests.on('close', (code) => {
	  console.log(`[tests]: exited with code ${code}`);
	  //This must move out in production
	  	poller = spawn("node",["./poller.js"]);

		poller.stdout.on('data', (data) => {
		  console.log(`[poller]:\n ${data}`);
		});

		poller.stderr.on('data', (data) => {
		  console.log(`[poller]:\n ${data}`);
		});

		poller.on('close', (code) => {
		  console.log(`[poller]:\n exited with code ${code}`);
		});


	});



});


/********* This will work after changing CMD exec to ["node", "index.js"] ***********/
process.on("SIGINT",gracefulExit);
process.on("SIGTERM",gracefulExit);

process.on("exit",gracefulExit);

function gracefulExit(){
	log("Shutting down");
	poller.kill("SIGTERM");
	tests.kill("SIGTERM");
	process.exit(0);
	 server.close(function () {
    process.exit(0);
  });

}