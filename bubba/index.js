'use strict'

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
let pool=require('mysql').createPool({
	connectionLimit:10,
	multipleStatements:true,
	host:process.env.MYSQL_HOST,
	port: process.env.MYSQL_PORT,
	user:process.env.MYSQL_USER,
	password:process.env.MYSQL_PASSWORD,
	database:process.env.MYSQL_DATABASE
});

let rxmysqlquery=Rx.Observable.bindNodeCallback(pool.query.bind(pool));//This shit


server.listen(process.env.NODE_PORT,function(){
	console.log("bubba live on "+process.env.NODE_PORT);
});


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

	//subscribe logic
	switch(safeBody["hub.mode"]){
		case "subscribe":
						Rx.Observable.of(safeBody)
						.flatMap(verifySubscriberRequest)
						.flatMap(saveSubscribe)
						.subscribe((d)=>{res.send(d)},(e)=>{res.send(e.message);});
						break;
		case "unsubscribe":
						Rx.Observable.of(safeBody)
						.flatMap(verifySubscriberRequest)
						.flatMap(saveUnsubscribe)
						.subscribe((d)=>{res.send(d)},(e)=>{res.send(e.message);});
						break;
		default:throw Error("Shouldn't have happened");
	}
});

app.get("/",function(req,res){
	res.sendFile(__dirname+"/landing.html")
})

function log(str){
	console.log(str);
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
	let q="DELETE FROM subscriptions WHERE sub_callback = ? AND sub_topic = ?;\
	UPDATE topics SET t_subscriber = t_subscriber - 1,t_updated = NOW() WHERE t_url = ?"
	return rxmysqlquery({
		sql:q,
		values:[obj["hub.callback"],obj["hub.topic"],obj["hub.topic"]]
	});
}

function saveSubscribe(obj){
	let q="SELECT sub_id FROM subscriptions WHERE sub_callback = ? AND sub_topic = ?";

	return rxmysqlquery({
				sql:q,
				values:[obj["hub.callback"],obj["hub.topic"]]
			})
			.flatMap(([rows,fields])=>{
				console.log("in saveSubscribe",rows,fields);
				if(rows.length===0){
					//new subscription
					let q2=
					"INSERT INTO subscriptions(sub_created, sub_updated, sub_callback,\
					 sub_topic, sub_secret, sub_lease_seconds, sub_lease_end)\
					 VALUES(?,?,?,?,?,?,?);\
					 UPDATE topics SET t_subscriber = t_subscriber + 1,t_updated = ? WHERE t_url = ?"
					let now=moment().toISOString();
					let leaseEnd=moment(now).add(obj["hub.lease_seconds"],'seconds').toISOString();
					console.log(now,leaseEnd);
					return rxmysqlquery({
					 	sql:q,
					 	values:[now,now,obj["hub.callback"],
					 			obj["hub.topic"],obj["hub.secret"],
					 			obj["hub.lease_seconds"],leaseEnd,
					 			now,obj["hub.topic"]]
					 })
				}else if(rows.length===1){
					//update subscription

				}else {
					throw Error("Logic error: Subscription - too many matches")
				}
				return rows;

			})
}

    
 /*
      if ($rowSub === false) {
            //new subscription
            $this->db->prepare(
                'INSERT INTO subscriptions'
                . '(sub_created, sub_updated, sub_callback, sub_topic, sub_secret'
                . ', sub_lease_seconds, sub_lease_end)'
                . ' VALUES(NOW(), NOW(), :callback, :topic, :secret'
                . ', :leaseSeconds, :leaseEnd)'
            )->execute(
                array(
                    ':callback' => $req->callback,
                    ':topic'    => $req->topic,
                    ':secret'   => $req->secret,
                    ':leaseSeconds' => $req->leaseSeconds,
                    ':leaseEnd' => date(
                        'Y-m-d H:i:s', time() + $req->leaseSeconds
                    )
                )
            );
            $this->db->prepare(
                'UPDATE topics SET t_subscriber = t_subscriber + 1'
                . ',t_updated = NOW()'
                . ' WHERE t_url = :topic'
            )->execute(array(':topic' => $req->topic));
            return;
        }
        //existing subscription
        $this->db->prepare(
            'UPDATE subscriptions SET'
            . ' sub_updated = NOW()'
            . ', sub_secret = :secret'
            . ', sub_lease_seconds = :leaseSeconds'
            . ', sub_lease_end = :leaseEnd'
            . ' WHERE sub_id = :id'
        )->execute(
            array(
                ':secret'       => $req->secret,
                ':leaseSeconds' => $req->leaseSeconds,
                ':leaseEnd'     => date(
                    'Y-m-d H:i:s', time() + $req->leaseSeconds
                ),
                ':id'           => $rowSub->sub_id
            )
        );

        */