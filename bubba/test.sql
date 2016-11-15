-- Data Quality/Integrity tests
-- 1. Get all topics where content IS NOT repeated
set sql_mode='';
select * from (select ref_t_sha256,c_body,count(*) c from content where c_statusCode!=304 group by c_body having c=1 order by c desc) c2 left join topics on c2.ref_t_sha256=topics.t_sha256

-- 2. Get all topics where content IS repeated
set sql_mode='';
select * from (select ref_t_sha256,c_body,count(*) c from content where c_statusCode!=304 group by c_body having c>1 order by c desc) c2 left join topics on c2.ref_t_sha256=topics.t_sha256

-- 3. Get all topics where etag and rel="hub" exists
SELECT distinct topics.t_url FROM content left join topics on content.ref_t_sha256=topics.t_sha256 WHERE c_restofresponse LIKE "%etag%";
SELECT distinct topics.t_url FROM content left join topics on content.ref_t_sha256=topics.t_sha256 WHERE c_body LIKE "%rel=\"hub\"%";

-- 4. Statuses - aggregated
set sql_mode='';

select distinct e_content from errors;
select count(*),errors.*,topics.* from errors left join topics on ref_X_sha256=t_sha256 where t_type="ERR" group by t_sha256,e_content order by t_sha256;
select e_reftype,e_content,count(distinct t_url) from errors left join topics on ref_X_sha256=t_sha256 group by e_content order by e_content;
select * from serverlog order by l_added desc limit 20;
select * from topics where t_type!="ERR";
select * from content order by c_added desc limit 20;
select errors.*,topics.t_url from errors left join topics on ref_X_sha256=t_sha256 order by e_added desc limit 20;

-- 5. Debug feed errors

select count(e_content) ct,errors.*,topics.* from errors left join topics on ref_X_sha256=t_sha256 where e_content not like "%TIMEDOUT%" and e_content not like "%EAI_AGAIN%" and e_reftype not like "warning%" and t_url in ("ARRAY OF STRINGS HERE") group by t_url,e_content order by t_url,ct;

-- 6. Reset content without removing topics or subscriptions
update topics set t_nextFetchDue=NULL, t_lastModified=null where 1=1;
delete from content;
delete from errors;
delete from serverlog;

