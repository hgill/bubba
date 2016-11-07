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
let stream=require("stream");
let fs=require("fs");

let storedprocs={
	saveError:"CALL saveError(?,?,?,?);",
	saveFetchContent:"CALL saveFetchContent(?,?,?,?,?,?,?,?);",
	markTopicError: "CALL markTopicError(?);",
	getpolltopics: "CALL getPollTopics(?);",
	getValidSubscribers: "",
	getLastTwo: ""
}

let globals={timeout:10000/* ms */,
			defaultrefetch:30/* min*/,
			minrefetch:3/*min*/,
			maxrefetch:6*60 /*min*/,
			isoORhtmlformat:[moment.ISO_8601,"ddd, DD MMM YYYY H:mm:ss [GMT]"]
			};

Rx.Observable.interval(60*1000*1)
.startWith(1)
.flatMap(()=>{
	let q="CALL getPollTopics(?)";
	return rxmysqlquery({
		sql:q,
		values:[new Date().toISOString()]
	});
})
.flatMap(([[results,fields],wtf])=>{
	let startRun=moment();
	return Rx.Observable.from(results)
		.flatMap((r)=>{ //REQUEST/VALIDATION/ERRORS SEGMENT
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
					.flatMap((d)=>{
						let {status,topic,statusCode}=d;
						//Send to all subscribers

						switch(Math.floor(statusCode/100)){//only 2 and 3 pass through
							case 2:
									rxmysqlquery({
										sql:"CALL getValidSubscribersAndLatestContent(?)",
										values:[r.t_sha256]
									}).flatMap(([[subscriptions,[content]]])=>{//screwed up return cuz of multiple queries - fix in future v
										return Rx.Observable.from(subscriptions)
													.flatMap((sub)=>{
														let restofresponse=JSON.parse(content.c_restofresponse);
														let body=content.c_body;

														return rxrequest({url:sub.sub_callback,
																			method:"POST",
																			json:true,
																			body:{restofresponse:restofresponse,body:body,topic:r.t_url},
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
														//If no response(catch), mark sub as error here
													})
												})
												
									.subscribe((d)=>{console.log("Push: ",d)},(err)=>{console.log("Push error: ",err.message)});
							case 3:break;
							default:throw Error("shouldn't have happened")
						}

						return Rx.Observable.of(d);// Failed sending should not suspend polling
					},1)
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
		

		})
.reduce((aggregate,d)=>{
	    	//d is status/topic. Aggregate by Status and Topic
	    	//Success means url was either 2XX or 3XX, had valid headers, and saved to DB successfully.
	    	//Errors means something failed - either in request or in DB
	    	 _.isEqual(d.status,"success")?aggregate.success[d.topic]=d.statusCode:aggregate.errors.push(d.topic);
	    	 return aggregate;
	    },{startRun:startRun,success:{},errors:[]})
},1)
.subscribe((d)=>{
	let endRun=moment(),startRun=d.startRun;
	console.log("Poll Run Completed: ",startRun.format("H:mm:ss"),endRun.format("H:mm:ss"),endRun.diff(startRun,"seconds"),_.omit(d,"startRun"))
},e=>{
	console.log("Poll Run Error:",e.message)
});

function getSHA256(str){
	let shaObj=new jssha("SHA-256", "TEXT");
	shaObj.update(str);
	return shaObj.getHash("HEX");
}

function expBackoff(useful,current,last,lowerMinLimit,upperMinLimit){
	let diff=current.diff(last,"minutes");
	let bo=1.2;
	let diff2=useful?diff/bo:diff*bo;
	
	diff2=_.clamp(diff2,lowerMinLimit,upperMinLimit);

	return moment(current).add(diff2,"minutes");
}

function saveFetchContent(response,row){
 //SAVE TO DB SEGMENT 
	let now=moment();

	//Empty or not empty handling
	let reslastmod=!_.isEmpty(response.headers["last-modified"])?
				moment(response.headers["last-modified"],globals.isoORhtmlformat)
				:(!_.isEmpty(row.t_lastmodified)?
					moment(row.t_lastmodified,globals.isoORhtmlformat)
					:now);//get from response, or get from DB, or take now

	let resdate=!_.isEmpty(response.headers["date"])?
				moment(response.headers["last-modified"],globals.isoORhtmlformat)
				:now;//get from headers or take now

	let nextFetchDue;
	/****************** Next Fetch Due Calc 
		Figure out if response date makes sense as per GMT
			If not, mark warning, use defaultrefetch for nextfetchdue
			If yes, calculate exponential backoff						


	********************
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
	nextFetchDue=now.add(45,"seconds");

	switch(Math.floor(response.statusCode/100)){
		//last-mod & date mandatory for 2XX, not for 3XX
		case 3: //save, don't send
				break;//normal
		case 2: //save and send
				break;//normal
		default: throw Error("Bad Status Code: "+response.statusCode);
	}

	/************* SAVE IN DB LOGIC **************/
	let restofresponse=_(response).pickBy((d)=>{return _.isNumber(d) || _.isString(d)}).omit("body").value();
	restofresponse.headers=response.headers;
	
	let c_sha256=getSHA256(row.t_sha256+response.body+JSON.stringify(response.headers)+response.statusCode);
	
	switch(Math.floor(response.statusCode/100)){
		case 3: 
		case 2: //save
				return rxmysqlquery({sql:"CALL saveFetchContent(?,?,?,?,?,?,?,?)",
						values:[c_sha256,
								row.t_sha256,
								response.body,
								JSON.stringify(restofresponse),
								moment().toISOString(),//now
								reslastmod.toISOString(),//last-modified
								nextFetchDue.toISOString(),//nextFetchDue
								response.statusCode]
						})
			.map(d=>{return {status:"success",topic:row.t_url,statusCode:response.statusCode}})
				break;//normal
		default: throw Error("Bad Status Code: "+response.statusCode);
	}

}


