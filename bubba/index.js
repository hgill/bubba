'use strict';

let childProcess=require("child_process");
(function() {
    var oldSpawn = childProcess.spawn;
    function mySpawn() {
        console.log('spawn called');
        console.log(arguments);
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
		"hub.mode":joi.string().valid(["subscribe","unsubscribe"]).required(),
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
		default:throw Error("Shouldn't have happened");
	}
});

app.get("/",function(req,res){
	res.sendFile(__dirname+"/landing.html")
})

function log(){
	console.log("[bubbamain]",...arguments);
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


let poller,tests;
server.listen(process.env.NODE_PORT,function(){
	console.log("bubba live on "+process.env.NODE_PORT);
	const spawn = childProcess.spawn;
	
	tests = spawn("node",["./tests.js"]);

	tests.stdout.on('data', (data) => {
	  console.log(`[tests]: ${data}`);
	});

	tests.stderr.on('data', (data) => {
	  console.log(`[tests]: ${data}`);
	});

	tests.on('close', (code) => {
	  console.log(`Tests exited with code ${code}`);
	  //This must move out in production
	  	poller = spawn("node",["./poller.js"]);

		poller.stdout.on('data', (data) => {
		  console.log(`[poller]: ${data}`);
		});

		poller.stderr.on('data', (data) => {
		  console.log(`[poller]: ${data}`);
		});

		poller.on('close', (code) => {
		  console.log(`[poller]: exited with code ${code}`);
		});


	});



});

process.on("SIGINT",gracefulExit);
process.on("SIGTERM",gracefulExit);

function gracefulExit(){
	console.log("Shutting down");
	poller.kill("SIGTERM");
	tests.kill("SIGTERM");
	 server.close(function () {
    process.exit(0);
  });

}