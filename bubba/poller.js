"use strict";

let pool=require("./mysqlpool.js");
var Rx=require('rxjs');
let rxmysqlquery=Rx.Observable.bindNodeCallback(pool.query.bind(pool));//This shit

var request=require('request');
let rxrequest=Rx.Observable.bindNodeCallback(request);

let moment=require("moment");
let jssha=require("jssha");
let joi=require("joi");
let _=require("lodash");

let storedprocs={
	saveError:"CALL saveError(?,?,?,?);",
	saveFetchContent:"CALL saveFetchContent(?,?,?,?,?,?,?,?);",
	markTopicError: "CALL markTopicError(?);",
	getpolltopics: "CALL getPollTopics(?);",
	updateSubscriptionLastContentSent: "CALL updateSubscriptionLastContentSent(?,?)",
	getValidSubscribersAndLatestContent: "CALL getValidSubscribersAndLatestContent(?)",
	markSubscriptionSuspended:"CALL markSubscriptionSuspended(?)"
}

let globals={timeout:10000/* ms */,
			defaultrefetch:30/* min*/,
			minrefetch:5/*min*/,
			maxrefetch:8*60 /*min*/,
			backoff:2.0,/* multiplier */
			isoORhtmlformat:[moment.ISO_8601,"ddd, DD MMM YYYY H:mm:ss [GMT]"]
			};


let TOKEN=false;
Rx.Observable.interval(60*1000*1)
.startWith(-1)
.flatMap((i)=>{
	/**
		START OF ALL RUNS
		IMPORTANT! - This is the highest level of the 'run'. 
		It runs every minute, but if a 'run' is already in progress, skips till the old one completes
		Every VALID run takes the TOKEN and resets it in the 'subscribe/next' block which always executes
		(strong error handling)
	*/

	if(TOKEN===true){
		log("Run skipped",i)
		return Rx.Observable.empty();//Won't go to next block
	}else{
		let q="CALL getPollTopics(?)";
		return rxmysqlquery({
			sql:q,
			values:[new Date().toISOString()]
		});
	}
})
.flatMap(([[results,fields],wtf])=>{//Improve, how?
	log("Run started",results.length+" Topics")

	//TOKEN - validation
	if(TOKEN===true)
		throw Error("Bad TOKEN: Shouldn't have happened");

	if(!_.isEmpty(results))
		TOKEN=true;

	let startRun=moment();

	return Rx.Observable.from(results)
		.flatMap((r)=>{ 
			let headers=!_.isEmpty(r.t_lastmodified)?
						{"If-Modified-Since":moment(r.t_lastmodified,globals.isoORhtmlformat)
											.format("ddd, DD MMM YYYY H:mm:ss [GMT]")}
						:{};



			return rxrequest({	url:r.t_url, 
								method:"GET",
								headers:headers,
								timeout:globals.timeout
							})
					.flatMap(([response,body])=>{
						return saveFetchContent(response,r);
					},1)
					.do((d)=>{
						/*Side effect - send to subscribers*/

						switch(Math.floor(d.statusCode/100)){
							case 2: pushToSubscribers(r);break;
							case 3: break;
							default:throw Error("Bad Status Code on 2nd check: Shouldn't have happened")
						}
					})
					.catch(function (error) {

						let q="CALL markTopicError(?); CALL saveError(?,?,?,?)";

						let now=moment().toISOString();
						return rxmysqlquery({sql:q,
											values:[r.t_sha256,
													r.t_sha256,
													"exception-topic",
													JSON.stringify(error.message?error.message:error),
													now]
											}).map(d=>{return {status:"error",topic:r.t_url}});
	    			})
		},1)
		.reduce((aggregate,d)=>{
			    	/*
			    	d is from saveFetchContent or catch. Aggregate by Status and Topic
			    	Success means url was either 2XX or 3XX, had valid headers, and saved to DB successfully.
			    	Errors means something failed - either in request or in DB
			    	*/
			    	 _.isEqual(d.status,"success")?aggregate.success[d.topic]=d.statusCode:aggregate.errors.push(d.topic);
			    	 return aggregate;
			    },{startRun:startRun.toISOString(),endRun:"",success:{},errors:[]})
},1)
.subscribe((d)=>{
	/* End of a VALID run */
	TOKEN=false;
	d.endRun=moment().toISOString();
	log("Run Complete",d);
},e=>{
	log("Run Error - Polling Stopped ",e.message);
});

function getSHA256(str){
	let shaObj=new jssha("SHA-256", "TEXT");
	shaObj.update(str);
	return shaObj.getHash("HEX");
}

function expBackoff(useful,current,last,lowerMinLimit,upperMinLimit){
	let diff=current.diff(last,"minutes");
	let bo=globals.backoff;
	let diff2=useful?diff/bo:diff*bo;
	
	diff2=_.clamp(diff2,lowerMinLimit,upperMinLimit);

	return moment(current).add(diff2,"minutes");
}

function saveFetchContent(response,row){
	let now=moment();

	/* Fill most relevant dates available*/
	let reslastmod=!_.isEmpty(response.headers["last-modified"])?
				moment(response.headers["last-modified"],globals.isoORhtmlformat)
				:(!_.isEmpty(row.t_lastmodified)?
					moment(row.t_lastmodified,globals.isoORhtmlformat)
					:now);

	let resdate=!_.isEmpty(response.headers["date"])?
				moment(response.headers["last-modified"],globals.isoORhtmlformat)
				:now;

	let nextFetchDue;

	/****************** Next Fetch Due Calc 
		Figure out if response date makes sense as per GMT
			If not, mark warning, use defaultrefetch for nextfetchdue
			If yes, calculate exponential backoff						
	********************/
	if(resdate.isSameOrAfter(now) || reslastmod.isSameOrAfter(now)){
		//If the dates don't make sense - Guesstimate for whether server is reporting GMT
		rxmysqlquery({sql:"CALL saveError(?,?,?,?)",
						values:[row.t_sha256,
						"warning-topic",
						"Bad Dates in "+row.t_url,
						now.toISOString()]}).subscribe();//ignore retval - just a warning

		nextFetchDue=now.add(globals.defaultrefetch,"minutes");//Don't do BO calculations, hard code at 30 minutes.
	}else{
		//Dates are GMT - then do BO calculations.
		nextFetchDue=expBackoff(response.statusCode===304?false:true,now,reslastmod,globals.minrefetch,globals.maxrefetch);
	}
	/****************** Next Fetch Due Calc - END ********************/							

	/************* SAVE IN DB LOGIC **************/
	let restofresponse=_(response).pickBy((d)=>{return _.isNumber(d) || _.isString(d)}).omit("body").value();
	restofresponse.headers=response.headers;
	
	let c_sha256=getSHA256(row.t_sha256+response.body+JSON.stringify(response.headers)+response.statusCode);
	
	switch(Math.floor(response.statusCode/100)){
		case 3: 
		case 2:	return rxmysqlquery({sql:"CALL saveFetchContent(?,?,?,?,?,?,?,?)",
					values:[c_sha256,
							row.t_sha256,
							response.body,
							JSON.stringify(restofresponse),
							moment().toISOString(),
							reslastmod.toISOString(),
							nextFetchDue.toISOString(),
							response.statusCode]
					})
			.map(d=>{
				console.log("[poller] Save: ",d);
				return {status:"success",topic:row.t_url,statusCode:response.statusCode
			}})
				break;
		default: throw Error("Bad Status Code: "+response.statusCode);
	}

}

function pushToSubscribers(r){

	rxmysqlquery({
		sql:"CALL getValidSubscribersAndLatestContent(?)",
		values:[r.t_sha256]
	}).flatMap(([[subscriptions,[content]]])=>{//Improve, how?
		return Rx.Observable.from(subscriptions)
			.flatMap((sub)=>{
				let restofresponse=JSON.parse(content.c_restofresponse);
				let body=content.c_body;

				return rxrequest({url:sub.sub_callback,
									method:"POST",
									json:true,
									body:{fetch:Object.assign({},restofresponse,{body:body}),topic:r.t_url},
									timeout:10000
						})
						.flatMap(([response])=>{
							if(!(response.statusCode===200 && _.isEqual(response.body,r.t_url))) 
								throw Error("Validation failed - response from callback")

							let q="CALL updateSubscriptionLastContentSent(?,?)"
							return rxmysqlquery({
								sql:q,
								values:[sub.sub_sha256,content.c_sha256]
							}).map((d)=>({success:"Sent and saved",subcb:sub.sub_sha256,topic:r.t_url}))
						})
						.catch((err)=>{
							let q="CALL markSubscriptionSuspended(?)";

							return rxmysqlquery({
								sql:q,
								values:[sub.sub_sha256]
							}).map((d)=>({error:(err.message?err.message:err),subcb:sub.sub_sha256}))
						})
			})
	})				
	.subscribe((d)=>{console.log(d);},(err)=>{log("Push Error",err.message)});
}
function log(){
	/* Expect args[0] to be a string and args[1] to be an object */
	if(process.env.NODE_ENV==="development")
		console.log("[Poller]",arguments);

	rxmysqlquery({
		sql:"CALL saveLog(?,?,?,?)",/* time, instance, message, object */
		values:[moment().toISOString(),"BUBBA-Poller",arguments[0],JSON.stringify(arguments[1])]
	}).subscribe((d)=>{_.noop();},(err)=>{console.log("[Poller-LogNotSaved]",err.message,arguments)});
}
