"use strict";
let process=require("process");

let pool=require('mysql').createPool({
	connectionLimit:10,
	multipleStatements:true,
	host:process.env.MYSQL_HOST,
	port: process.env.MYSQL_PORT,
	user:process.env.MYSQL_USER,
	password:process.env.MYSQL_PASSWORD,
	database:process.env.MYSQL_DATABASE
});

module.exports=pool;