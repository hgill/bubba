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

Rx.Observable.interval(30*1000*1)
.startWith(1)
.flatMap(()=>{
	let q="CALL getpolltopics(?)";
	return rxmysqlquery({
		sql:q,
		values:[new Date().toISOString()]
	});
})
.flatMap(([[results,fields],wtf])=>{
	return Rx.Observable.from(results)
		.flatMap((r)=>{ //REQUEST/VALIDATION/ERRORS SEGMENT
			let isoORhtml=[moment.ISO_8601,"ddd, DD MMM YYYY H:mm:ss [GMT]"];
			let headers=r.t_lastmodified?{"If-Modified-Since":moment(r.t_lastmodified,isoORhtml).format("ddd, DD MMM YYYY H:mm:ss [GMT]")}:{};

			return rxrequest({	url:r.t_url, 
								method:"GET",
								headers:headers,
								timeout:10000
							})
					.map(([response,body])=>{
						//Validation should be done here

						//Handle Status Codes
						switch(Math.floor(response.statusCode/100)){
							case 3: 
							case 2: let resV=joi.validate(response,joi.object({
									headers:{"last-modified":joi.string().required()
											}})
											.required(),{abortEarly:false,allowUnknown:true});
									if(resV.error)
										//Save in errors
										throw Error(resV.error);
									
									return response;
									break;//normal
							default: throw Error("Bad Status Code: "+response.statusCode);
						}
						

					})
					.flatMap((d)=>{ //SAVE TO DB SEGMENT 
						//Should be unique because of Date field, so always save to DB.

						let t_sha256=r.t_sha256,response=d,statusCode=response.statusCode;

							let q="CALL saveFetchContent(?,?,?,?,?,?,?,?)";
			
							let isoresdate=moment(response.headers["date"],["ddd, DD MMM YYYY H:mm:ss [GMT]",moment.ISO_8601]).toISOString();
							let isomoddate=moment(response.headers["last-modified"],["ddd, DD MMM YYYY H:mm:ss [GMT]",moment.ISO_8601]).toISOString();
							
							if(statusCode!==304){
									//Do nothing for 304, for others propagate
							}
							
							let restofresponse=_(response).pickBy((d)=>{return _.isNumber(d) || _.isString(d)}).omit("body").value();
							restofresponse.headers=response.headers;

							return rxmysqlquery({sql:q,
												values:[getSHA256(t_sha256+response.body+JSON.stringify(response.headers)+response.statusCode),
														t_sha256,
														response.body,
														JSON.stringify(restofresponse),
														moment().toISOString(),
														isomoddate,
														isoresdate,
														response.statusCode]
												})

					
			},1).catch(function (error) {

				let q="CALL markTopicError(?,?,?)";

				let now=moment().toISOString();
				return rxmysqlquery({sql:q,
									values:[r.t_sha256,
											JSON.stringify(error.message?error.message:error),now]
									});
	    });

					
		},1)
		

		})
.subscribe((d)=>{
	console.log("Segment Resp: ",typeof d)
},e=>{
	console.log(e.message)
});

function getSHA256(str){
	let shaObj=new jssha("SHA-256", "TEXT");
	shaObj.update(str);
	return shaObj.getHash("HEX");
}

/* 
								IN t_sha VARCHAR(65535) ,
                                  IN c_sha VARCHAR(65535),
                                  IN body TEXT,
                                  IN restofresponse TEXT,
                                  IN now VARCHAR(65535)
                                  IN lastModified VARCHAR(65535),
                                  IN nextFetchDue VARCHAR(65535),
                                  IN statusCode INT
First check:
If any of these fails, mark feed as ERR, this will be resolved later

1. Body should be XML (content-type text/xml etc.)
2. last-modified should be set
3. Date should be in HTTP date format



*/