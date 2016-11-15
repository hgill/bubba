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
			minrefetchOnUseful:5/*min*/,
			minrefetchOnNotUseful:15/*min*/,
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
			let headers=!_.isEmpty(r.t_lastModified)?
						{"If-Modified-Since":moment(r.t_lastModified,globals.isoORhtmlformat)
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
						switch(d.status){
							case "CONTENT_INSERTED": pushToSubscribers(r);break;
							default: _.noop();
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
			    	if(!_.has(aggregate,d.status))
			    		aggregate[d.status]={};

			    	 aggregate[d.status][d.topic]=`[${d.statusCode},${d.fromNow}]`;
			    	 return aggregate;
			    },{startRun:startRun.toISOString(),endRun:""})
},1)
.subscribe((d)=>{
	/* End of a VALID run */
	TOKEN=false;
	d.endRun=moment().toISOString();
	log("Run Complete",d);
},e=>{
	log("Run Error - POLLING STOPPED: ",e.message);
});

function getSHA256(str){
	let shaObj=new jssha("SHA-256", "TEXT");
	shaObj.update(str);
	return shaObj.getHash("HEX");
}

function expBackoff(useful,current,last){
	//expects moment dates
	let diff=current.diff(last,"minutes");
	let bo=globals.backoff;
	let diff2=useful?diff/bo:diff*bo;

	if(useful)
		diff2=_.clamp(diff2,globals.minrefetchOnUseful,globals.maxrefetch);
	else
		diff2=_.clamp(diff2,globals.minrefetchOnNotUseful,globals.maxrefetch);

	return moment(current).add(diff2,"minutes");
}

function saveFetchContent(response,row){
	let now=moment();// to get correct delays in moment.diff

	/************* SAVE IN DB LOGIC **************/
	let restofresponse=_(response).pickBy((d)=>{return _.isNumber(d) || _.isString(d)}).omit("body").value();
	restofresponse.headers=response.headers;
	
	let c_sha256=getSHA256(row.t_url+","+response.body);
	
	switch(Math.floor(response.statusCode/100)){
		case 2:	return rxmysqlquery({sql:`CALL saveFetchContent(?,?,?,?,?,?);`,
					values:[c_sha256,
							row.t_sha256,
							response.body,
							JSON.stringify(restofresponse),
							moment().toISOString(),
							response.statusCode,
							]
					})
			.flatMap(([[[d]]])=>{//Fuck I hate SQL
				let newDates;
				switch(d.retval){
					case "CONTENT_DUPLICATE": newDates=getNewDates(response,row,false);break;
					case "CONTENT_INSERTED": newDates=getNewDates(response,row,true);break;
					default:throw Error("Shouldn't have happened");
				}
				let {newLastModified,nextFetchDue}=newDates;

				return rxmysqlquery({sql:`CALL updateTopicDates(?,?,?)`,
					values:[row.t_sha256,
							newLastModified,
							nextFetchDue
							]
					}).map((d2)=>{
						return {status:d.retval,topic:row.t_url,statusCode:response.statusCode,fromNow:moment(nextFetchDue).diff(now,"minutes")}
					})
			});break;
		case 3: 									
				let {newLastModified,nextFetchDue}=getNewDates(response,row,false);
					return rxmysqlquery({sql:`CALL updateTopicDates(?,?,?)`,
							values:[row.t_sha256,
									newLastModified,
									nextFetchDue
									]
					}).map((d2)=>{
						return {status:"NOCHANGE_304",topic:row.t_url,statusCode:response.statusCode,fromNow:moment(nextFetchDue).diff(now,"minutes")}
					});break;
		default: return Rx.Observable.of({status:"error",topic:row.t_url,statusCode:response.statusCode})
	}

}
function getNewDates(response,row,useful){
	let now=moment();
	let hlastmod=response.headers["last-modified"];
	let rlastmod=row.t_lastmodified;
	let hdate=response.headers["date"];
	/* Fill most relevant dates available*/
	let reslastmod=!_.isEmpty(hlastmod)?
				moment(hlastmod,globals.isoORhtmlformat)
				:(!_.isEmpty(rlastmod)?
					moment(rlastmod,globals.isoORhtmlformat)
					:now);

	let resdate=!_.isEmpty(hdate)?
				moment(hdate,globals.isoORhtmlformat)
				:now;

	let nextFetchDue;

	/****************** Next Fetch Due Calc 
		Figure out if response date makes sense as per GMT
			If not, mark warning, use defaultrefetch for nextfetchdue
			If yes, calculate exponential backoff						
	********************/
	if(response.statusCode!==304 && (resdate.isSameOrAfter(now) || reslastmod.isSameOrAfter(now))){
		//If the dates don't make sense - Guesstimate for whether server is reporting GMT
		rxmysqlquery({sql:"CALL saveError(?,?,?,?)",
						values:[row.t_sha256,
						"warning-topic",
						"Bad Dates in "+row.t_url,
						now.toISOString()]}).subscribe();//ignore retval - just a warning

		nextFetchDue=now.add(globals.defaultrefetch,"minutes");//Don't do BO calculations, hard code at 30 minutes.
	}else{
		//Dates are GMT - then do BO calculations.
		if(useful)
			nextFetchDue=expBackoff(useful,now,reslastmod);
		else if(!useful)
			nextFetchDue=expBackoff(useful,now,moment(rlastmod));
	}
	
	/****************** Next Fetch Due Calc - END ********************/	
	if(useful)
		return {newLastModified:reslastmod.toISOString(),nextFetchDue:nextFetchDue.toISOString()}
	else return {newLastModified:moment(rlastmod).toISOString(),nextFetchDue:nextFetchDue.toISOString()}

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
							}).map((d)=>({success:"Pushed",subcb:sub.sub_sha256,topic:r.t_url}))
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
	.subscribe((d)=>{
		if(d.error)
			log(d);
		else _.noop();
	},(err)=>{log("Push Error",err.message)});
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
