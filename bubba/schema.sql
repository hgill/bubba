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

-- SET NAMES `utf8mb4`;
-- CREATE DATABASE BUBBA CHARACTER SET utf8mb4;

USE BUBBA;
SET NAMES utf8mb4;

--
-- Table structure for table `subscriptions`
--

DROP TABLE IF EXISTS `subscriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `subscriptions` (
  `sub_sha256` varchar(64) NOT NULL,
  `sub_created` varchar(24) NOT NULL,
  `sub_updated` varchar(24) NOT NULL,
  `sub_callback` text NOT NULL,
  `ref_t_sha256` varchar(64) NOT NULL,
  `sub_lease_seconds` int(11) NOT NULL,
  `sub_lease_end` varchar(24) NOT NULL,
  `sub_secret` varchar(64),
  `ref_last_c_sha256` varchar(64),
  `sub_suspended` BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (`sub_sha256`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Subscription requests';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `topics`
--

DROP TABLE IF EXISTS `topics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `topics` (
  `t_sha256` varchar(64) NOT NULL,
  `t_url` text NOT NULL,
  `t_added` varchar(24) NOT NULL,
  `t_subscriptions` int(11) NOT NULL DEFAULT 1,
  `t_type` VARCHAR(4) NOT NULL DEFAULT "POLL", -- assigned POLL initially, can be changed to PUSH later
  `t_lastmodified` varchar(40), -- updated at every fetch - http date from fetch
  `t_nextFetchDue` varchar(40), -- updated at every fetch - ISO date 
  PRIMARY KEY (`t_sha256`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

--
-- Table structure for table `content`
--

DROP TABLE IF EXISTS `content`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `content` (
  `c_sha256` varchar(64) NOT NULL,
  `ref_t_sha256` varchar(64) NOT NULL,
  `c_added` varchar(24) NOT NULL,
  `c_body` text,
  `c_restofresponse` text, -- assigned POLL initially, can be changed to PUSH later
  `c_statusCode` INT,
  PRIMARY KEY (`c_sha256`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

DROP TABLE IF EXISTS `errors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `errors` (
  `ref_X_sha256` varchar(64) NOT NULL,
  `e_reftype` VARCHAR(20) NOT NULL,
  `e_content` text NOT NULL,
  `e_added` varchar(24) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

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
  SELECT * FROM topics WHERE (t_type="POLL" OR t_type="ERR") AND ((STRCMP(t_nextFetchDue,isonow)=-1) OR (t_nextFetchDue IS NULL) OR (t_nextFetchDue=''));
END//

DROP PROCEDURE IF EXISTS `saveFetchContent`;//
CREATE PROCEDURE saveFetchContent(IN c_sha TEXT,
                                  IN t_sha TEXT,                                  
                                  IN body TEXT,
                                  IN restofresponse TEXT,
                                  IN now TEXT,
                                  IN lastModified TEXT,
                                  IN nextFetchDue TEXT,
                                  IN statusCode INT
                                  )
BEGIN
  UPDATE topics SET t_lastmodified=lastModified, t_nextFetchDue=nextFetchDue,t_type="POLL" WHERE t_sha256=t_sha;
  INSERT INTO content(ref_t_sha256,c_sha256,c_body,c_restofresponse,c_added,c_statusCode) VALUES(t_sha,c_sha,body,restofresponse,now,statusCode);
END//

DROP PROCEDURE IF EXISTS `markTopicError`;//
CREATE PROCEDURE markTopicError(IN t_sha TEXT)
BEGIN
  UPDATE topics SET t_lastmodified=NULL, t_nextFetchDue=NULL,t_type="ERR" WHERE t_sha256=t_sha;
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
CREATE PROCEDURE markCallbackSuspended(IN subSha TEXT)
BEGIN
  UPDATE subscriptions SET sub_suspended=true WHERE sub_sha256=subSha;
END//

DROP PROCEDURE IF EXISTS `removeSubscriptionSuspended`;//
CREATE PROCEDURE removeCallbackSuspended(IN subSha TEXT)
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

DELIMITER ;


/*******WIP
Just input sub_sha as input - get all content after stored 

--Add IF subscriptions.ref_last_c_sha256 null clause as a higher level JS check;

select sub_sha256,sub_callback,ref_last_c_sha256,subscriptions.ref_t_sha256,c_added,t_url from subscriptions left join content on subscriptions.ref_last_c_sha256=content.c_sha256 left join topics on subscriptions.ref_t_sha256=topics.t_sha256 where subscriptions.sub_sha256="06cbbcb7f8c3b7b675cfc017b8cd841d5837335d26672a453343f185af101710" into @ssha,@scb,@clastsha,@tsha,@after,@url;


select @ssha,@scb,@clastsha,@tsha,@after,@url,c1.* from content c1 where c1.c_statusCode!=304 AND c1.c_added>=@after and c1.ref_t_sha256=@tsha order by c1.c_added asc;





************/