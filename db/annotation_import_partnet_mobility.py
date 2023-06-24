import mysql.connector
import argparse
import os
import json
import uuid
import shutil

parser = argparse.ArgumentParser()
parser.add_argument("--host", type=str, required=True)
parser.add_argument("--port", type=str, required=True)
parser.add_argument("--user", type=str, required=True)
parser.add_argument("--password", type=str, required=True)
parser.add_argument(
    "--database",
    type=str,
    default="PartNetMobility",
    help="mysql database name [Default: PartNetMobility]",
)
parser.add_argument(
    "--partnet-dir",
    type=str,
    required=True,
    help="directory for PartNetMobility that contains v3 annotation",
)
parser.add_argument(
    "--target-dir",
    type=str,
    required=True,
    help="the target storage/model/partnet directory for the website",
)

args = parser.parse_args()

mydb = mysql.connector.connect(
    host=args.host,
    port=args.port,
    user=args.user,
    passwd=args.password,
    database=args.database,
    auth_plugin="mysql_native_password",
)

partnet_dir = args.partnet_dir
target_dir = args.target_dir
mycursor = mydb.cursor()

os.makedirs(target_dir, exist_ok=True)
for partnet_id in os.listdir(partnet_dir):
    with open(os.path.join(partnet_dir, partnet_id, "meta.json")) as f:
        meta = json.load(f)
    cat = meta["model_cat"]

    new_id = uuid.uuid4()
    sql = "INSERT INTO PartNetModel (modelId, category, shapeAnnotated, partAnnotated, mobilityAnnotated, metadata) VALUES (UUID_TO_BIN(%s), %s, %s, %s, %s, %s)"
    mycursor.execute(sql, (str(new_id), cat, "1", "1", "1", str(partnet_id)))
    mydb.commit()
    print("SUCCESS: inserting ", partnet_id)
    shutil.copytree(
        os.path.join(partnet_dir, partnet_id), os.path.join(target_dir, str(new_id))
    )
