"use strict";

let pool=require("./mysqlpool.js");
var Rx=require('rxjs');
let rxmysqlquery=Rx.Observable.bindNodeCallback(pool.query.bind(pool));//This shit

Rx.Observable.interval(60*1000*1)
.startWith(1)
.flatMap(()=>{
	let q="CALL getpolltopics(?)";
	return rxmysqlquery({
		sql:q,
		values:[new Date().toISOString()]
	});
}).subscribe(d=>console.log(JSON.stringify(d,null," ")),console.log);