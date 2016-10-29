"use strict";
let request=require("request"),
	fplib=require("feedparser");

module.exports=function(){

	

	this.run=function(){
		let promiseBus=[];
		return new Promise((resolve,reject)=>{
			let fp=new fplib();

			let url=this.url(),
				articleCB=this.articleCB(),
				metaCB=this.metaCB();

			fp.on('readable', function(e,d) {
					var stream = this
					    , item;
					  while (item = stream.read()) {
					  	promiseBus.push(articleCB(item));
					  }
				})
				.on("end",function(e,d){
					Promise.all(promiseBus).then(()=>{
						metaCB(this.meta);
						resolve(this);						
					})
				});		

			request.get(url)
				.on("end",function(d){
					//what to do here
					console.log("FEEDRETURNED",d,"FEEDRETURNED END");
				})
				.pipe(fp);
		})
	}

	this.url=function(){
           if(arguments.length){
              let url=arguments[0];
              this.__url__=url;               
              return this;
            }else return this.__url__;
	}

	this.articleCB=function(){
           if(arguments.length){
              let articleCB=arguments[0];
              this.__articleCB__=articleCB;               
              return this;
            }else return this.__articleCB__;
	}

	this.metaCB=function(){
           if(arguments.length){
              let metaCB=arguments[0];
              this.__metaCB__=metaCB;               
              return this;
            }else return this.__metaCB__;
	}

	return this;
}