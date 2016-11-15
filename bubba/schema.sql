-- MySQL dump 10.13  Distrib 5.5.41, for debian-linux-gnu (x86_64)
--
-- Host: 127.0.0.1    Database: phubb
-- ------------------------------------------------------
-- Server version 5.5.41-0ubuntu0.14.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS BUBBA CHARACTER SET utf8mb4;

USE BUBBA;

--
-- Table structure for table `subscriptions`
--

CREATE TABLE IF NOT EXISTS `subscriptions` (
  `sub_sha256` varchar(64) NOT NULL,
  `sub_created` varchar(24) NOT NULL,
  `sub_updated` varchar(24) NOT NULL,
  `sub_callback` text NOT NULL,
  `ref_t_sha256` varchar(64) NOT NULL,
  `sub_lease_seconds` int NOT NULL,
  `sub_lease_end` varchar(24) NOT NULL,
  `sub_secret` varchar(64),
  `ref_last_c_sha256` varchar(64),
  `sub_suspended` BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (`sub_sha256`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Subscription requests';

--
-- Table structure for table `topics`
--

CREATE TABLE IF NOT EXISTS `topics` (
  `t_sha256` varchar(64) NOT NULL,
  `t_url` text NOT NULL,
  `t_added` varchar(24) NOT NULL,
  `t_subscriptions` int NOT NULL DEFAULT 1,
  `t_type` VARCHAR(4) NOT NULL DEFAULT "POLL", -- assigned POLL initially, can be changed to PUSH later
  `t_lastModified` varchar(40), -- updated at every fetch - http date from fetch
  `t_nextFetchDue` varchar(40), -- updated at every fetch - ISO date 
  PRIMARY KEY (`t_sha256`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Table structure for table `content`
--
CREATE TABLE IF NOT EXISTS `content` (
  `c_sha256` varchar(64) NOT NULL,
  `ref_t_sha256` varchar(64) NOT NULL,
  `c_added` varchar(24) NOT NULL,
  `c_body` mediumtext,
  `c_restofresponse` text, -- assigned POLL initially, can be changed to PUSH later
  `c_statusCode` INT,
  PRIMARY KEY (`c_sha256`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `serverlog` (
  `l_added` varchar(24),
  `l_instance` text,
  `l_message` text,
  `l_arguments` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `errors` (
  `ref_X_sha256` varchar(64) NOT NULL,
  `e_reftype` VARCHAR(20) NOT NULL,
  `e_content` text NOT NULL,
  `e_added` varchar(24) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


DELIMITER //
DROP PROCEDURE IF EXISTS `unsubscribe`;//
CREATE PROCEDURE unsubscribe(IN subSha TEXT,
                              IN topicSha TEXT,
                              IN isodate TEXT)
BEGIN
  DECLARE deletable INT DEFAULT 0;

  SELECT COUNT(*) FROM subscriptions WHERE sub_sha256=subSha INTO deletable;
  IF deletable =  1 THEN
    UPDATE topics SET t_subscriptions=t_subscriptions-1 WHERE t_sha256=topicSha;
    DELETE FROM subscriptions WHERE sub_sha256=subSha;
  END IF;
  SELECT * FROM subscriptions WHERE sub_sha256=subSha;
  SELECT * FROM topics WHERE t_sha256=topicSha;  
END//

DROP PROCEDURE IF EXISTS `subscribe`;//
CREATE PROCEDURE subscribe(IN subSha TEXT,
                              IN topicSha TEXT,
                              IN isodate TEXT, 
                              IN hubCallback TEXT, 
                              IN hubTopic TEXT, 
                              IN hubSecret TEXT, 
                              IN hubLeaseSeconds INT, 
                              IN leaseEnd TEXT )
BEGIN
  DECLARE topicexists INT DEFAULT 0;
  DECLARE subscriptionexists INT DEFAULT 0;
  
  SELECT count(*) FROM subscriptions WHERE sub_sha256=subSha INTO subscriptionexists;
  SELECT count(*) FROM topics WHERE t_sha256=topicSha INTO topicexists;  

  IF subscriptionexists=1 AND topicexists=1 THEN
    UPDATE subscriptions SET sub_updated = isodate, sub_lease_seconds = hubLeaseSeconds, sub_lease_end = leaseEnd WHERE sub_sha256=subSha;
  ELSEIF subscriptionexists=0 AND topicexists=1 THEN
  INSERT INTO subscriptions(sub_sha256, sub_created, sub_updated, sub_callback, ref_t_sha256, sub_secret, sub_lease_seconds, sub_lease_end) VALUES(subSha,isodate,isodate,hubCallback,topicSha,hubSecret,hubLeaseSeconds,leaseEnd) ;
  UPDATE topics SET t_subscriptions = t_subscriptions + 1 WHERE t_sha256=topicSha;
  ELSEIF subscriptionexists=0 AND topicexists=0 THEN
      INSERT INTO subscriptions(sub_sha256, sub_created, sub_updated, sub_callback, ref_t_sha256, sub_secret, sub_lease_seconds, sub_lease_end) VALUES(subSha,isodate,isodate,hubCallback,topicSha,hubSecret,hubLeaseSeconds,leaseEnd);
      INSERT INTO topics (t_sha256, t_added, t_url) VALUES (topicSha, isodate, hubTopic);        
##  ELSEIF subscriptionexists=1 AND topicexists=0 THEN
  
  END IF;
  SELECT * FROM subscriptions WHERE sub_sha256=subSha;
  SELECT * FROM topics WHERE t_sha256=topicSha;  

END//

DROP PROCEDURE IF EXISTS `getPollTopics`;//
CREATE PROCEDURE getPollTopics(IN isonow VARCHAR(24))
BEGIN
  SELECT * FROM topics WHERE (t_type="POLL" OR t_type="ERR") AND t_subscriptions>0 AND((STRCMP(t_nextFetchDue,isonow)=-1) OR (t_nextFetchDue IS NULL) OR (t_nextFetchDue=''));
END//

DROP PROCEDURE IF EXISTS `saveFetchContent`;//
CREATE PROCEDURE saveFetchContent(IN c_sha TEXT,
                                  IN t_sha TEXT,                                  
                                  IN body mediumtext,
                                  IN restofresponse TEXT,
                                  IN now TEXT,
                                  IN statusCode INT)
BEGIN
    DECLARE dup INT DEFAULT 0;
    DECLARE retval text;

    select count(*) from content where c_sha256=c_sha into dup;

    if dup=1 then
        set retval="CONTENT_DUPLICATE";
    else 
      INSERT INTO content(ref_t_sha256,c_sha256,c_body,c_restofresponse,c_added,c_statusCode) 
        VALUES(t_sha,c_sha,body,restofresponse,now,statusCode);
        set retval="CONTENT_INSERTED";
    end if;
    select retval;
END//

DROP PROCEDURE IF EXISTS `updateTopicDates`;//
CREATE PROCEDURE updateTopicDates(IN t_sha TEXT,
                                  IN lastmodified text,
                                  in nextfetchdue text)
BEGIN
    UPDATE topics set t_lastModified=lastmodified,t_nextFetchDue=nextfetchdue where t_sha256=t_sha;
END//

DROP PROCEDURE IF EXISTS `markTopicError`;//
CREATE PROCEDURE markTopicError(IN t_sha TEXT)
BEGIN
  UPDATE topics SET t_lastModified=NULL, t_nextFetchDue=NULL,t_type="ERR" 
    WHERE t_sha256=t_sha;
END//

DROP PROCEDURE IF EXISTS `saveError`;//
CREATE PROCEDURE saveError(IN refsha TEXT,
                                IN type TEXT,
                                IN content TEXT,
                                IN added TEXT
                                )
BEGIN
  INSERT INTO errors(ref_X_sha256,e_reftype,e_content,e_added) VALUES(refsha,type,content,added);
END//

DROP PROCEDURE IF EXISTS `getValidSubscribersAndLatestContent`;//
CREATE PROCEDURE getValidSubscribersAndLatestContent(IN trefSha TEXT)
BEGIN
  select * from subscriptions where ref_t_sha256=trefSha and sub_suspended != TRUE;
  select * from content where ref_t_sha256=trefsha and c_statusCode != 304 order by c_added desc LIMIT 1;   
END//

DROP PROCEDURE IF EXISTS `markSubscriptionSuspended`;//
CREATE PROCEDURE markSubscriptionSuspended(IN subSha TEXT)
BEGIN
  UPDATE subscriptions SET sub_suspended=true WHERE sub_sha256=subSha;
END//

DROP PROCEDURE IF EXISTS `removeSubscriptionSuspended`;//
CREATE PROCEDURE removeSubscriptionSuspended(IN subSha TEXT)
BEGIN
  UPDATE subscriptions SET sub_suspended=false WHERE sub_sha256=subSha;
END//

DROP PROCEDURE IF EXISTS `updateSubscriptionLastContentSent`;//
CREATE PROCEDURE updateSubscriptionLastContentSent(IN subSha TEXT,
                                            IN lastcsha TEXT
                                            )
BEGIN
  UPDATE subscriptions SET ref_last_c_sha256=lastcsha WHERE sub_sha256=subSha;
END//

DROP PROCEDURE IF EXISTS `getAllSuspendedByCallback`;//
CREATE PROCEDURE getAllSuspendedByCallback(IN callback TEXT)
BEGIN
  select * from subscriptions where sub_callback=callback and sub_suspended=true;
END//


DROP PROCEDURE IF EXISTS `reconcileSubscription`;//
CREATE PROCEDURE reconcileSubscription(IN subSha TEXT)
BEGIN
DECLARE ssha TEXT;
DECLARE scb TEXT;
DECLARE clastsha TEXT;
DECLARE tsha TEXT;
DECLARE after TEXT;
DECLARE url TEXT;

select sub_sha256,sub_callback,ref_last_c_sha256,subscriptions.ref_t_sha256,c_added,t_url from subscriptions left join content on subscriptions.ref_last_c_sha256=content.c_sha256 left join topics on subscriptions.ref_t_sha256=topics.t_sha256 where subscriptions.sub_sha256=subSha into ssha,scb,clastsha,tsha,after,url;

if clastsha is null THEN
  select ssha,scb,tsha,url,c1.* from content c1 where c1.c_statusCode!=304 AND c1.ref_t_sha256=tsha order by c1.c_added asc;
else 
  select ssha,scb,tsha,url,c1.* from content c1 where c1.c_statusCode!=304 AND c1.c_added>=after and c1.ref_t_sha256=tsha order by c1.c_added asc;
end if;

END//


DROP PROCEDURE IF EXISTS `saveLog`;//
CREATE PROCEDURE saveLog(IN added TEXT,
                          IN instance TEXT,
                          IN message TEXT,
                          IN arguments TEXT)
BEGIN
  INSERT INTO serverlog(l_added,l_instance,l_message,l_arguments) VALUES(added,instance,message,arguments);
END//

DELIMITER ;
