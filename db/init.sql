CREATE DATABASE IF NOT EXISTS `PartNetMobility`;

use PartNetMobility;

CREATE TABLE IF NOT EXISTS `PartNetMobilityModel` (
  annoId           BIGINT NOT NULL PRIMARY KEY,
  modelId          CHAR(100) NOT NULL,
  modelCat         CHAR(50) NOT NULL,
  original         INT NULL,
  partnetVersion   CHAR(10) NULL
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `UserEntry` (
  email            VARCHAR(255) NOT NULL UNIQUE,
  password         VARCHAR(64) NOT NULL,
  firstName        VARCHAR(64) NOT NULL,
  middleName       VARCHAR(64) DEFAULT '',
  lastName         VARCHAR(64) NOT NULL,
  affiliation      VARCHAR(255) NOT NULL,
  purpose          TEXT,
  version          INT DEFAULT '0',
  privilege        INT DEFAULT '0',
  creationTime     DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `ShapeCategory` (
  name             CHAR(64) NOT NULL PRIMARY KEY,
  parent           CHAR(64) NULL,
  description      TEXT NULL
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `RawModel` (
  modelId          BINARY(16) NOT NULL PRIMARY KEY,
  checksum         VARCHAR(64) NOT NULL,
  nfaces           INT DEFAULT '0',
  modelFile        VARCHAR(2048) NOT NULL,
  creationTime     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updateTime       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  status           INT DEFAULT '0',

  INDEX (checksum),
  INDEX (creationTime)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `RawModelUser` (
  modelId          BINARY(16) NOT NULL,
  user             VARCHAR(255) NOT NULL,
  name             VARCHAR(255) DEFAULT '',
  source           VARCHAR(255) DEFAULT '',
  access           INT NOT NULL,

  FOREIGN KEY (modelId) REFERENCES RawModel(modelId),
  FOREIGN KEY (user) REFERENCES UserEntry(email),
  UNIQUE KEY (modelId, user)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `PartNetModel` (
  modelId              BINARY(16) NOT NULL PRIMARY KEY,
  rawModelId           BINARY(16) NULL,
  clonedFrom           BINARY(16) NULL,  -- annotation can be cloned
  category             CHAR(64) NULL,
  annotator            VARCHAR(255) NULL,
  creationTime         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updateTime           TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  status               INT DEFAULT '0',
  shapeAnnotated       BOOLEAN DEFAULT '0',
  partAnnotated        BOOLEAN DEFAULT '0',
  mobilityAnnotated    BOOLEAN DEFAULT '0',
  metadata             VARCHAR(255) NULL,

  FOREIGN KEY (rawModelId) REFERENCES RawModel(modelId),
  FOREIGN KEY (annotator) REFERENCES UserEntry(email),
  FOREIGN KEY (category) REFERENCES ShapeCategory(name),
  INDEX (creationTime)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS `PartNetModelUserAccess` (
  partNetModelId   BINARY(16) NOT NULL,
  user             VARCHAR(255) NOT NULL,
  updateTime       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  access           INT default '3',  -- 0 for no access, 1 for viewer, 2 for editor, 3 for manager

  FOREIGN KEY (partNetModelId) REFERENCES PartNetModel(modelId),
  FOREIGN KEY (user) REFERENCES UserEntry(email),
  UNIQUE KEY (partNetModelId, user),
  INDEX (updateTime)
) ENGINE = InnoDB;

REPLACE INTO UserEntry (email, password, firstName, middleName, lastName, affiliation, purpose, privilege) VALUES ("admin@only_for_testing.edu", "", "First", "", "Last", "UCSD", "Debug", "10");
REPLACE INTO UserEntry (email, password, firstName, middleName, lastName, affiliation, purpose, privilege) VALUES ("user@only_for_testing.edu", "", "Second", "", "Last", "UCSD", "Debug", "1");
REPLACE INTO UserEntry (email, password, firstName, middleName, lastName, affiliation, purpose, privilege) VALUES ("guest@only_for_testing.edu", "", "Third", "", "Last", "UCSD", "Debug", "0");
