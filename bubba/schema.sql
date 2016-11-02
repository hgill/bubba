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
--
-- Table structure for table `pingrequests`
--

DROP TABLE IF EXISTS `pingrequests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `pingrequests` (
  `pr_id` int(11) NOT NULL AUTO_INCREMENT,
  `pr_created` varchar(24) NOT NULL,
  `pr_updated` varchar(24) NOT NULL,
  `pr_url` text NOT NULL,
  `pr_subscribers` int(11) NOT NULL,
  `pr_ping_ok` int(11) NOT NULL,
  `pr_ping_reping` int(11) NOT NULL,
  `pr_ping_error` int(11) NOT NULL,
  PRIMARY KEY (`pr_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `repings`
--

DROP TABLE IF EXISTS `repings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `repings` (
  `rp_id` int(11) NOT NULL AUTO_INCREMENT,
  `rp_pr_id` int(11) NOT NULL,
  `rp_sub_id` int(11) NOT NULL,
  `rp_created` varchar(24) NOT NULL,
  `rp_updated` varchar(24) NOT NULL,
  `rp_iteration` int(11) NOT NULL DEFAULT '0',
  `rp_scheduled` int(11) NOT NULL,
  `rp_next_try` varchar(24) NOT NULL,
  `rp_last_error` varchar(256) NOT NULL,
  PRIMARY KEY (`rp_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

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
  `sub_topic` text NOT NULL,
  `sub_lease_seconds` int(11) NOT NULL,
  `sub_lease_end` varchar(24) NOT NULL,
  `sub_secret` varchar(64),
  `sub_ping_ok` int(11),
  `sub_ping_error` int(11),
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
  `t_sha256` varchar(64) NOT NULL,
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
  `e_refsha256` varchar(64) NOT NULL,
  `e_content` text NOT NULL,
  `e_added` varchar(24) NOT NULL,
  `e_type` VARCHAR(10) NOT NULL
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
CREATE PROCEDURE unsubscribe(IN subSha VARCHAR(64),
                              IN topicSha VARCHAR(64),
                              IN isodate VARCHAR(24))
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
CREATE PROCEDURE subscribe(IN subSha VARCHAR(65535),
                              IN topicSha VARCHAR(65535),
                              IN isodate VARCHAR(65535), 
                              IN hubCallback VARCHAR(65535), 
                              IN hubTopic VARCHAR(65535), 
                              IN hubSecret VARCHAR(65535), 
                              IN hubLeaseSeconds INT, 
                              IN leaseEnd VARCHAR(65535) )
BEGIN
  DECLARE topicexists INT DEFAULT 0;
  DECLARE subscriptionexists INT DEFAULT 0;
  
  SELECT count(*) FROM subscriptions WHERE sub_sha256=subSha INTO subscriptionexists;
  SELECT count(*) FROM topics WHERE t_sha256=topicSha INTO topicexists;  

  IF subscriptionexists=1 AND topicexists=1 THEN
    UPDATE subscriptions SET sub_updated = isodate, sub_lease_seconds = hubLeaseSeconds, sub_lease_end = leaseEnd WHERE sub_sha256=subSha;
  ELSEIF subscriptionexists=0 AND topicexists=1 THEN
  INSERT INTO subscriptions(sub_sha256, sub_created, sub_updated, sub_callback, sub_topic, sub_secret, sub_lease_seconds, sub_lease_end) VALUES(subSha,isodate,isodate,hubCallback,hubTopic,hubSecret,hubLeaseSeconds,leaseEnd) ;
  UPDATE topics SET t_subscriptions = t_subscriptions + 1 WHERE t_sha256=topicSha;
  ELSEIF subscriptionexists=0 AND topicexists=0 THEN
      INSERT INTO subscriptions(sub_sha256, sub_created, sub_updated, sub_callback, sub_topic, sub_secret, sub_lease_seconds, sub_lease_end) VALUES(subSha,isodate,isodate,hubCallback,hubTopic,hubSecret,hubLeaseSeconds,leaseEnd);
      INSERT INTO topics (t_sha256, t_added, t_url) VALUES (topicSha, isodate, hubTopic);        
##  ELSEIF subscriptionexists=1 AND topicexists=0 THEN
  
  END IF;
  SELECT * FROM subscriptions WHERE sub_sha256=subSha;
  SELECT * FROM topics WHERE t_sha256=topicSha;  

END//

DROP PROCEDURE IF EXISTS `getpolltopics`;//
CREATE PROCEDURE getpolltopics(IN isonow VARCHAR(24))
BEGIN
  SELECT * FROM topics WHERE (t_type="POLL" OR t_type="ERR") AND ((STRCMP(t_nextFetchDue,isonow)=-1) OR (t_nextFetchDue IS NULL) OR (t_nextFetchDue=''));
END//

DROP PROCEDURE IF EXISTS `saveFetchContent`;//
CREATE PROCEDURE saveFetchContent(IN c_sha VARCHAR(65535),
                                  IN t_sha VARCHAR(65535),                                  
                                  IN body TEXT,
                                  IN restofresponse TEXT,
                                  IN now VARCHAR(65535),
                                  IN lastModified VARCHAR(65535),
                                  IN nextFetchDue VARCHAR(65535),
                                  IN statusCode INT
                                  )
BEGIN
  UPDATE topics SET t_lastmodified=lastModified, t_nextFetchDue=nextFetchDue,t_type="POLL" WHERE t_sha256=t_sha;
  INSERT INTO content(t_sha256,c_sha256,c_body,c_restofresponse,c_added,c_statusCode) VALUES(t_sha,c_sha,body,restofresponse,now,statusCode);
END//

DROP PROCEDURE IF EXISTS `markTopicError`;//
CREATE PROCEDURE markTopicError(IN t_sha VARCHAR(65535),
                                IN content TEXT,
                                IN added VARCHAR(65535)
                                )
BEGIN
  UPDATE topics SET t_lastmodified=NULL, t_nextFetchDue=NULL,t_type="ERR" WHERE t_sha256=t_sha;
  INSERT INTO errors(e_refsha256,e_content,e_type,e_added) VALUES(t_sha,content,"topic",added);
END//

DELIMITER ;