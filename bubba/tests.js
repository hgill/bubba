'use strict';

let request=require("request");
let test=require("tape");
let _=require("lodash");
let process=require("process");

let bubbahost=process.env.BUBBAADDRESS;
let me=process.env.TESTADDRESS;
var express=require('express');
var app = express();

var server = require('http').Server(app);



let topicKeys=["t_sha256","t_url","t_subscriptions","t_lastmodified","t_nextupdate","t_type","t_added"];
let subKeys=["sub_sha256","sub_created","sub_updated","sub_callback","sub_topic","sub_lease_seconds","sub_lease_end","sub_secret","sub_ping_ok","sub_ping_error"];


app.get("/childcb",function(req,res){
	log("cb GET verification run");
	res.status(200).send(req.query["hub.challenge"]);
});
app.get("/",function(req,res){
	res.status(200).send("HELLO!!!!")
})
server.listen(5012,function(){
	console.log(me+" Open");
	test("Unsafe Requests - Validation check",t=>{
		t.end();
	})
	test("Safe Requests - Should subscribe and unsubscribe properly",t=>{
		let subs={"hub.callback":me+"/childcb",
					"hub.topic": "http://www.reuters.com",
					"hub.mode": "subscribe"
					}
			t.ok(true,"NEXT TEST: GET REQUEST to "+bubbahost);

		Promise.resolve(rp({url:bubbahost,method:"GET"}))
		.then(res=>{

			t.assert(res.statusCode===200," - Status code 200");
			t.assert(_.toLower(res.headers["content-type"])==="text/html; charset=utf-8"," - content-type text/html");
			
			t.ok(true,"NEXT TEST: POST REQUEST SUBSCRIBE");
			return rp({url:bubbahost,method:"POST",
				form:`hub.callback=${me}/childcb&hub.topic=http://www.reuters.com&hub.mode=subscribe`,
				timout:10000});
		}).then((res)=>{

			t.assert(res.statusCode===200," - Status code 200");

			t.assert(_.toLower(res.headers["content-type"])==="application/json; charset=utf-8"," - content-type application/json");
			
			let body=JSON.parse(res.body);
			t.assert(body.length===3," - array of 3 elements");

			t.assert(body[0].length===1," -- First query result(subscription) 1 row");
			t.assert(_.isEmpty(_.difference(subKeys,_.keys(body[0][0])))," --- Sub keys match");
			t.assert(body[1].length===1," -- Second query result(topic) 1 row");

			t.assert(_.isEmpty(_.difference(topicKeys,_.keys(body[1][0])))," --- Topic keys match");
			

			t.ok(true,"NEXT TEST: POST REQUEST UNSUBSCRIBE");
			return rp({url:bubbahost,method:"POST",
					form:`hub.callback=${me}/childcb&hub.topic=http://www.reuters.com&hub.mode=unsubscribe`})
		}).then((res)=>{
			t.assert(res.statusCode===200," - Status code 200");

			
			if(_.toLower(res.headers["content-type"])==="application/json; charset=utf-8")
				t.assert(_.toLower(res.headers["content-type"])==="application/json; charset=utf-8"," - content-type application/json");
			else 
				t.fail(res.body);

			let body=JSON.parse(res.body);
			t.assert(body.length===3," - array of 3 elements");

			t.assert(body[0].length===0," -- First query result(subscription) empty");
			t.assert(body[1].length===1," -- Second query result(topic) 1 row");
			t.assert(_.isEmpty(_.difference(topicKeys,_.keys(body[1][0])))," --- Topic keys match");

			t.end();
			server.close(function(){
				console.log(me+" Closed")
			});
		}).catch((e)=>{
			log(e.message);
			t.end();
			server.close(function(){
				console.log(me+" Closed after error")
			});
		})
		

	});


});

function rp(obj){
	return new Promise((resolve,reject)=>{
		request(obj,function(err,res,body){
			if(err)
				reject(err);

			resolve(res);
		});
	})
}

function log(){
	console.log("[child]",...arguments);
}