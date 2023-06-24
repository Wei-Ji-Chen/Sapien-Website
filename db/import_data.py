#!/usr/bin/python3

import argparse
import mysql.connector
import pandas as pd

parser = argparse.ArgumentParser()
parser.add_argument('--host', type=str, required=True)
parser.add_argument('--port', type=str, required=True)
parser.add_argument('--user', type=str, required=True)
parser.add_argument('--password', type=str, required=True)
parser.add_argument('--database',
                    type=str,
                    default='PartNetMobility',
                    help='mysql database name [Default: PartNetMobility]')
parser.add_argument('--source', type=str, required=True, help='csv metadata')
args = parser.parse_args()

mydb = mysql.connector.connect(host=args.host,
                               port=args.port,
                               user=args.user,
                               passwd=args.password,
                               database=args.database,
                               auth_plugin='mysql_native_password')

# read the db to get the existing records
mycursor = mydb.cursor()
mycursor.execute("SELECT annoId FROM PartNetMobilityModel")
existing_records_in_db = [str(item[0]) for item in mycursor.fetchall()]

# then, we import the non-existing records into the db
sql1 = "INSERT INTO PartNetMobilityModel (annoId, modelId, modelCat, original, partnetVersion) VALUES (%s, %s, %s, %s, %s)"

df = pd.read_csv(args.source)

for row in df.to_numpy():
    annoId = row[0]
    modelId = row[1]
    modelCat = row[2]
    original = row[3]
    partnetVersion = row[4]

    try:
        val = (annoId, modelId, modelCat, original, partnetVersion)
        mycursor.execute(sql1, val)
        mydb.commit()
        print('SUCCESS: inserting ', val)
    except:
        print('ERROR: inserting ', val)
